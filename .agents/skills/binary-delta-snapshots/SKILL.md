---
name: binary-delta-snapshots
description: Compact binary delta snapshot design and implementation for realtime multiplayer hot paths. Use when replacing JSON/full-state snapshots, adding quantized entity deltas, baseline ticks, removed IDs, binary WebSocket frames, stale snapshot rejection, or preserving JSON reliable event fallback.
---

# Binary Delta Snapshots

Use this skill to move high-frequency multiplayer state from verbose JSON/full snapshots to compact binary deltas while keeping reliable JSON control/events during rollout.

## Workflow

1. Keep compatibility first.
   - Retain JSON welcome, events, errors, chunks, skill/offers, and fallback snapshots.
   - Add opt-in capability negotiation, e.g. `binarySnapshots: true`.
   - Server sends binary frames only to clients that advertise support.

2. Define hot binary format.
   - Include `messageType`, `serverTick`, `baselineTick`, entity deltas, and removed IDs.
   - Quantize positions/velocities.
   - Bit-pack common booleans/state flags.
   - Use little-endian consistently unless project conventions say otherwise.

3. Add baselines and AOI leaves.
   - Track last sent entity IDs per client.
   - Current AOI minus previous AOI gives enters/updates.
   - Previous AOI minus current AOI gives removed IDs.
   - Include `baselineTick` so client can reject unusable deltas.

4. Client intake.
   - Parse `ArrayBuffer` binary messages separately from JSON.
   - Reject stale `serverTick <= lastServerTick`.
   - Apply newest useful delta only.
   - Feed remote entities into interpolation buffers.
   - Reconcile local player with `lastProcessedInputSeq`.

5. Verify under degraded network.
   - Artificial RTT/jitter/loss.
   - Slow reader/backpressure tests.
   - Compare bytes/sec, snapshot age, stale drops, correction distance, and frame time.

## Snapshot Shape

Use this baseline unless the codebase already has a stronger local convention:

```text
uint8  messageType
uint32 serverTick
uint32 baselineTick
uint32 lastProcessedInputSeq
uint16 entityCount
repeat entityCount:
  uint32 entityId
  uint8  entityType
  int32  quantizedX
  int32  quantizedY
  int16  quantizedVx
  int16  quantizedVy
  int16  rotation
  uint16 stateFlags
uint16 removedCount
repeat removedCount:
  uint32 entityId
```

## References

- For flags, quantization, and rollout checklist, read [references/binary-snapshot-format.md](references/binary-snapshot-format.md).
