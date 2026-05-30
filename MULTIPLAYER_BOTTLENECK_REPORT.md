# Multiplayer Bottleneck Report

Generated: 2026-05-30

## Bottleneck Report

The current evidence does not justify a Go rewrite. The server already uses an authoritative fixed 60 Hz simulation and 20 Hz snapshots. The biggest confirmed gaps were observability and stale snapshot handling, not raw Node.js throughput.

Post-change smoke test with two local WebSocket clients on port 18888:

- Room tick interval avg: 16.10 ms, max: 18 ms.
- Server tick duration avg: 0.10 ms, max: 0.49 ms.
- Tick overruns: 0.
- Broadcast duration avg: 0.19 ms, max: 0.42 ms.
- JSON serialization avg: 0.018 ms, max: 0.047 ms.
- Socket send avg: 0.062 ms, max: 0.438 ms.
- Snapshot payload: 1,475 bytes.
- Event-loop p99 over 20 ms monitor resolution: 0.55 ms.
- Backpressure skips: 0.
- Active clients: 2.

Before this change, the project had no comparable runtime counters for tick duration, broadcast cost, event-loop delay, or client snapshot delay, so a true before/after latency comparison was not measurable. The immediate improvement is that the next test or production run can now produce those numbers.

## Network Model Diagnosis

- Movement authority: server-authoritative for player physics, combat, pickups, deaths, respawn anchors, rooms, and snapshots.
- Client authority: sends input commands only. It does not send direct position authority.
- Client prediction: local player is predicted with shared `stepPlayer`, then reconciled against `lastProcessedSeq`.
- Remote players: rendered from buffered snapshots using interpolation, with brief extrapolation when snapshots are late.
- Existing risks found: stale snapshots were not rejected globally before state application, per-remote state insertion did not check snapshot order, and remote extrapolation reused snapshot state objects before simulating forward.

## Ranked Movement Hypotheses

1. Stale or out-of-order snapshots cause visible position jumps.
   Evidence: snapshots had `tick` but no monotonic snapshot sequence, and the client accepted every valid snapshot.

2. Extrapolation could mutate or reuse authoritative remote snapshot objects.
   Evidence: remote extrapolation started from `last.state`; it now clones before stepping.

3. Network jitter causes the client to render too close to the newest snapshot.
   Evidence: interpolation delay exists and adapts to RTT/jitter, but there was no snapshot delay metric to validate tuning.

4. Backend bottleneck is possible but unproven.
   Evidence: no previous event-loop, broadcast, serialization, or backpressure metrics existed. Local smoke data shows large headroom.

## Metrics Added

Client debug overlay now includes FPS, frame time, ping, jitter, snapshot delay, snapshot jitter, dropped/out-of-order snapshots, WebSocket messages/sec, and bytes/sec.

Server `/metrics` now exposes active clients, tick duration, tick interval stability, broadcast duration, serialization cost, socket send cost, payload bytes, event-loop delay, CPU, memory, message/byte rates, and per-client queued input/backpressure counters.

## Code Changes

- Added `snapshotSeq` to snapshot protocol and validation.
- Added server-side monotonic snapshot sequence numbers.
- Added stale snapshot rejection on the client.
- Added ordered remote snapshot insertion by server tick.
- Cloned remote snapshot state before extrapolation.
- Added WebSocket send/receive byte and message counters.
- Added server tick, broadcast, serialization, socket send, event-loop, CPU, and memory instrumentation.
- Added basic backpressure protection by skipping sends to sockets above a buffered-byte threshold.

## Recommendation

Keep Node.js and optimize with metrics first. A Go migration is not justified until measurements show sustained event-loop lag over the monitor resolution, tick overruns under expected load, serialization/broadcast cost dominating CPU, GC pauses destabilizing ticks, or backpressure behavior that cannot be corrected in the current architecture.

If Go is later justified, keep the PixiJS client protocol-compatible, define the protocol contract first, implement the Go server with the same fixed tick and snapshot interpolation model, then load test Node and Go under identical scenarios before migrating.
