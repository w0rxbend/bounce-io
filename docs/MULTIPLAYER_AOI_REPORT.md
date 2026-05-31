# Multiplayer AOI Optimization Report

Date: 2026-05-31

## Findings

- The server is authoritative and already uses fixed ticks, input sequence acks, compact player frames, snapshot replacement for slow clients, event IDs, pprof, and runtime metrics.
- The remaining high-impact gap was interest management. Every connected client still received every live player frame, enemy, and dynamic collectible in each hot snapshot.
- Static terrain is deterministic from seed and chunk coordinates. The client already streams and prunes deterministic chunks locally, so repeatedly sending terrain in snapshots is not necessary.
- Chunk requests were accepted for any chunk in the hard-coded debug range, which allowed clients to ask for world data far outside the playable viewport.

## Implemented

- Added per-client vertical Area of Interest based on the player's current chunk.
- Filtered high-frequency snapshots by AOI:
  - player frames,
  - enemies,
  - dynamic collectibles.
- Cached encoded snapshots by AOI window so players in the same area share one encoded payload.
- Added server-side chunk request gating using the same AOI with a small slack margin.
- Added a lightweight client `viewport` message so the server AOI follows the current camera zoom and visible world size, then clamps that request around the authoritative player position.
- Raised the default camera zoom to 1.5 with a 1.25-2.0 clamp, reducing the visible world on screen.
- Included the world-space viewport AABB (`x1/y1/x2/y2`) in the `viewport` message and applied it to server-side player/enemy/collectible filtering.
- Added per-client AOI metrics in `/metrics`:
  - last snapshot bytes,
  - AOI chunk min/max,
  - AOI player/enemy/collectible counts.
- Added client F1 overlay counters for last snapshot bytes and received player/enemy/item counts.
- Added client F1 overlay counters for visible world size, visible chunks, loaded chunks, and rendered entities.
- Added Go unit coverage for AOI filtering and chunk request gating.

## Remaining Risks

- Reliable event batches are still room-wide. That is safer for correctness, but long matches with many distant combat/pickup events may need event AOI filtering or targeted reliable delivery.
- Snapshots are still JSON. The payload is now more scoped; binary encoding should wait until metrics show JSON parse/encode is still a bottleneck.
- The next server-side step is a persistent spatial index plus AOI subscription hysteresis, so snapshots do not scan all dynamic maps as rooms grow.

## Local Latency/Jitter Checks

Use Linux `tc netem` while running the client and Go server locally:

```bash
sudo tc qdisc add dev lo root netem delay 80ms 25ms distribution normal
sudo tc qdisc change dev lo root netem delay 120ms 40ms loss 1%
sudo tc qdisc del dev lo root
```

Watch F1 overlay values for snapshot age/jitter, stale drops, visible world size, visible chunks, loaded chunks, and rendered entities. Compare with server `/metrics` for per-client AOI counts, snapshot bytes, queue depth, and dropped outbound messages.
