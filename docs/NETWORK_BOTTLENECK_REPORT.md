# Multiplayer Network Bottleneck Report

Date: 2026-05-30

## Summary

This pass focused on measuring before replacing JSON. The current architecture already has the main correctness shape: clients send inputs, the room owns authoritative state, snapshots include ticks/sequences/acknowledged inputs, and the client uses prediction/reconciliation plus remote interpolation.

The highest-confidence issues found were observability gaps, slow-client snapshot handling, and repeated per-client snapshot encoding. JSON as a format is still acceptable after reshaping the hot payload, but the old per-recipient full-state JSON snapshots did not scale cleanly to 50 clients.

## Evidence

Initial local Go load tests against `PORT=18787`:

| Scenario | Result |
| --- | --- |
| 2 clients, 6s | 0 errors, 0 out-of-order snapshots, snapshot age p95 about 2 ms |
| 25 requested clients, 50 ms latency + 20 ms jitter, 6s | only 8 connected because default room max is 8; 0 errors for admitted clients, RTT p95 about 69 ms |
| 8 clients, 2 slow readers, 6s | 0 errors, 0 out-of-order snapshots, snapshot age p95 about 4 ms |

Server `/metrics` after these runs:

| Metric | Observed |
| --- | --- |
| tick overruns | 0 in tested rooms |
| tick max | about 3.36 ms |
| snapshot JSON encode avg | about 0.01-0.02 ms |
| snapshot JSON encode max | about 0.20 ms |
| snapshot avg size | about 1.2 KB |
| snapshot max size | about 7.9 KB |
| dropped outbound | 0 |
| backpressure disconnects | 0 |
| allocation rate | about 21.9 MB/s in the short run |
| last GC pause | about 0.039 ms |

Follow-up load tests with `MAX_PLAYERS=64`:

| Scenario | Before latest fixes | After latest fixes |
| --- | --- | --- |
| 25 clients, 50 ms latency + 20 ms jitter, 8s | admitted 25, 0 errors, p95 snapshot age about 12 ms, about 76 MB server-to-client bytes | 0 errors, p95 snapshot age about 13 ms, about 23 MB server-to-client bytes |
| 50 clients, 100 ms latency + 50 ms jitter, 5 slow readers, 8s | 0 errors after compact entities, p95 snapshot age about 31-40 ms, per-client snapshot max about 10-16 KB, repeated encode still caused overruns | 0 errors, 0 out-of-order snapshots, p95 snapshot age about 20 ms, JSON encode avg about 0.017 ms, encode max about 0.338 ms, snapshot max about 9.9 KB |

The clean 50-client run still recorded 35 tick overruns and a 19.1 ms tick max. That is much better than the repeated per-client encoding path, but it means the remaining bottleneck is broader allocation/load pressure rather than JSON encode time alone.

## Ranked Root Causes

1. Missing runtime visibility made glitches hard to attribute.
   Client parse time, WebSocket buffered bytes, interpolation buffer size, prediction rollback count, pending input count, correction distance, and backend read/write/decode latency were not visible together.

2. Disposable snapshots used the same bounded queue behavior as other outbound messages.
   The queue was bounded, which is good, but slow clients could still accumulate stale snapshots instead of always receiving the newest available snapshot.

3. Repeated per-client snapshot encoding was a real bottleneck at 50 clients.
   Encoding the room snapshot once and letting clients read their ack from `lastProcessedSeq` cut JSON encode time sharply.

4. Static/semi-static payload separation is incomplete.
   Chunks are already requested separately, and collected relic state now syncs separately. The next payload target is enemies and event batching under long matches.

5. JSON format itself is not the first encoding migration target.
   Full verbose JSON was too large, but compact/shared hot JSON is currently good enough to keep measuring before MessagePack/Protobuf.

## Implemented Fixes

- Added client netgraph metrics for FPS/frame time, ping, jitter, interpolation delay, snapshot age/jitter, messages/sec, bytes/sec, WebSocket buffered bytes, parse time, interpolation buffer size, stale snapshot drops, correction distance, rollback count, and pending inputs.
- Added backend metrics for active connections, read latency, write latency, JSON decode time, JSON encode time, snapshot byte averages/max, heap allocation rate, GC pause, and pprof endpoints.
- Moved high-frequency snapshots to a latest-snapshot replacement path per client.
- Split critical gameplay events into a reliable `events` message.
- Split collected relic sync into `relicState` so snapshots no longer resend the full collected set.
- Made `MAX_PLAYERS` configurable for real 25/50-client load tests.
- Changed hot snapshots to shared room snapshots encoded once per tick, with compact quantized player entity frames and local ack read from `lastProcessedSeq`.
- Kept reliable/control messages on the existing bounded queue.
- Tightened shared snapshot validation so accepted snapshots must include `serverTick` and `ackInputSeq`.

## 2026-05-30 Latency/Stability Follow-up

- Server WebSocket writer now prioritizes the latest pending snapshot instead of draining the reliable/control queue before gameplay state. This reduces the chance that chunk/control traffic creates stale-state latency.
- Server event batches now enrich events with `eventId`, `serverTick`, and `snapshotSeq` before broadcast, giving clients enough metadata to dedupe late/replayed events.
- Shared snapshots explicitly use `ackInputSeq: -1`; clients read the real local acknowledgement from `lastProcessedSeq[localPlayerId]`.
- Client snapshot intake now drops old pending snapshots aggressively when a frame spike or network backlog appears. The interpolation history still keeps smooth remote motion, but the apply queue no longer tries to catch up through stale snapshots.
- Client outbound policy now watches `WebSocket.bufferedAmount`: low-priority chunk requests and heartbeat pings are skipped under backlog, and severe input backlog closes the socket to force reconnect/resync instead of growing latency.
- Client `requestChunk` only marks a chunk as pending after the request is actually sent, so backpressure skips do not strand chunks forever.
- Client event handling now deduplicates `eventId`s with a small LRU window and ignores very stale event batches.

## Remaining Risks

- 50-client load still has occasional tick overruns. Next target: allocation profiling with `/debug/pprof/heap` and CPU profiling during active load.
- Slow clients now drop/replace snapshots as intended, but dropped snapshot metrics should be separated from reliable-queue drops for clearer dashboards.
- Payload optimization should next target enemy state and delta suppression for unchanged entities before any binary encoding migration.
- Browser-side parse and frame impact need a real multi-browser run with the new netgraph.

## Encoding Recommendation

Keep JSON for now. Optimize JSON shape and payload classification first. Revisit MessagePack or Protobuf only after recorded snapshot streams show JSON parse/encode or payload size is a measured hot path.
