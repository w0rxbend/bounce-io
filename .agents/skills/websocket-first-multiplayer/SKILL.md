---
name: websocket-first-multiplayer
description: WebSocket-first browser multiplayer optimization for authoritative client-server games. Use when diagnosing or improving lag, transport choices, stale snapshot queues, prediction/reconciliation, interpolation, AOI, WebSocket vs WebTransport decisions, or multiplayer architecture in PixiJS/browser games with Go or similar servers.
---

# WebSocket-First Multiplayer

Use this skill to keep transport decisions grounded: WebSocket remains the production default until viewport size, AOI, payload shape, snapshot queueing, spatial indexing, and client smoothing have been measured and improved.

## Workflow

1. Inspect before proposing transport changes.
   - Find WebSocket read/write loops, room tick loop, snapshot schema, client snapshot intake, prediction, and interpolation code.
   - Check whether the server is authoritative and whether clients send input commands instead of final positions.
   - Read existing networking/performance docs before adding new architecture.

2. Rank lag causes in this order.
   - Excessive visible viewport or zoom-out.
   - Oversized server AOI.
   - Full-state or verbose hot snapshots.
   - Missing spatial partitioning or subscription state.
   - Stale snapshot queue buildup.
   - Weak prediction/reconciliation/interpolation.
   - Transport limitations.

3. Keep WebSocket as default.
   - Do not migrate to WebTransport as a first fix.
   - Use latest-snapshot replacement for high-frequency state.
   - Keep reliable/control messages separate from replaceable state.
   - Add WebTransport only later, behind feature detection and WebSocket fallback.

4. Prefer incremental, compatible patches.
   - Preserve existing JSON control messages while adding optimized hot paths.
   - Add metrics before and after each change.
   - Keep server authoritative and keep client stale-packet rejection.

## Checks

- Client sends `input` with sequence/client time, not `x/y` authority.
- Server returns `serverTick`, `snapshotSeq`, and `lastProcessedInputSeq`/ack.
- Client drops snapshots with old tick/sequence.
- Server write path drops or replaces obsolete snapshots instead of queueing stale state.
- Debug overlay shows FPS, frame time, RTT/jitter, snapshot age, pending snapshots, bytes/sec, visible world size, visible chunks, loaded chunks, and rendered entities.
- `/metrics` exposes tick duration, snapshot bytes, AOI entity counts, queue depth, drops, heap, and GC.

## References

- For implementation priority, binary snapshot shape, test commands, and WebTransport upgrade notes, read [references/optimization-playbook.md](references/optimization-playbook.md).
