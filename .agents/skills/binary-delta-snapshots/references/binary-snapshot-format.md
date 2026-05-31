# Binary Snapshot Format

## Message Types

```text
1 = server snapshot delta
2 = client input batch (optional future)
3 = ping/pong binary telemetry (optional future)
```

Keep reliable gameplay events as JSON during the first rollout.

## Quantization

Suggested defaults:

- Position: pixels * 100 into `int32`.
- Velocity: pixels/sec * 10 into `int16`, clamped.
- Rotation: radians mapped to `int16`, or zero for platformers without rotation.

Use helpers with clear names:

```ts
quantizePosition(valuePx): int32
dequantizePosition(value): number
quantizeVelocity(valuePxPerSec): int16
```

## State Flags

Example `uint16` bit layout:

```text
bit 0 grounded
bit 1 facingRight
bit 2 kickActive
bit 3 invulnerable
bit 4 stunned
bit 5 hasShield
bits 6-15 reserved
```

## Baseline Rules

- `serverTick` is the tick represented by this delta.
- `baselineTick` is the snapshot baseline needed to apply this delta.
- If the client lacks `baselineTick`, request/resync or wait for a full binary keyframe/JSON fallback.
- If `serverTick <= lastAppliedServerTick`, ignore the packet.

## Removed IDs

Use removed IDs for:

- entity despawn,
- entity leaving client AOI,
- collectible pickup/removal,
- projectile expiration.

The client should remove render objects or mark them cooling based on entity type and local visual policy.

## WebSocket Rollout

1. Add client capability flag in join/hello.
2. Server records capability per client.
3. Server sends binary WebSocket frames for hot snapshots only to capable clients.
4. Keep JSON snapshots for fallback clients and debugging.
5. Add F1/server metrics for binary bytes/sec and decode time.
6. Only then consider WebTransport datagrams.
