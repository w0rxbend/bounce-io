# Optimization Playbook

## Priority Order

1. Keep WebSocket as the production default.
2. Reduce visible world size and clamp zoom-out.
3. Bind server AOI to camera viewport AABB plus margin.
4. Replace full hot state with scoped snapshots, then binary deltas.
5. Add spatial partitioning and per-client subscriptions.
6. Improve client prediction, reconciliation, interpolation, and stale packet rejection.
7. Document WebTransport as a later upgrade.

## WebSocket Defaults

- Keep `/ws` as the main transport.
- Send reliable control/events as JSON unless a measured bottleneck says otherwise.
- Treat movement snapshots as logically replaceable even over reliable TCP.
- Use a latest-snapshot slot per client; never allow old movement snapshots to back up behind reliable/control messages.

## Architecture Findings Template

Use this report shape:

```text
Findings:
- Server authority:
- Tick/snapshot rates:
- Current viewport and AOI:
- Snapshot size and frequency:
- Stale queue/backpressure behavior:
- Client prediction/interpolation:
- Rendering/culling:

Implemented:
- ...

Remaining:
- binary deltas:
- spatial partitioning:
- WebTransport later:
```

## Local Network Testing

Use Linux `tc netem` for quick artificial latency:

```bash
sudo tc qdisc add dev lo root netem delay 80ms 25ms distribution normal
sudo tc qdisc change dev lo root netem delay 120ms 40ms loss 1%
sudo tc qdisc del dev lo root
```

Record:

- F1 overlay: FPS, visible world size, visible chunks, loaded chunks, rendered entities, snapshot age/jitter, stale drops.
- Server `/metrics`: tick duration, snapshot size, AOI counts, queue depth, dropped outbound, heap/GC.

## WebTransport Later

Only revisit after WebSocket+AOI+binary deltas are measured.

Future mapping:

- Unreliable datagrams: movement snapshots, projectile transforms, temporary state.
- Reliable streams: auth/session, inventory, pickup/combat confirmations, chunk metadata, chat/system messages.
- Fallback: WebSocket remains required for unsupported browsers and blocked QUIC/UDP paths.
