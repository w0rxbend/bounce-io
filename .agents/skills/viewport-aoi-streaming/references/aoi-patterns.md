# AOI Patterns

## Camera-Derived AOI

```ts
const visibleWorldWidth = screenWidth / cameraZoom;
const visibleWorldHeight = screenHeight / cameraZoom;
const margin = Math.max(visibleWorldWidth, visibleWorldHeight) * 0.35;

const interestAABB = {
  x1: cameraX - margin,
  y1: cameraY - margin,
  x2: cameraX + visibleWorldWidth + margin,
  y2: cameraY + visibleWorldHeight + margin,
};
```

Convert vertical AABB to chunk range:

```ts
minChunkY = chunkYForWorldY(interestAABB.y2);
maxChunkY = chunkYForWorldY(interestAABB.y1);
```

## Server Clamping

- Clamp requested AOI around authoritative player chunk.
- Clamp horizontal bounds to world width when applicable.
- Ensure the player rect remains inside the final AOI.
- Reject chunk requests outside `AOI + slack`.

## Hysteresis

Use three zones:

- Render zone: actual viewport plus small render margin.
- Network AOI: viewport plus preload margin.
- Retain/cooling zone: AOI plus extra margin or short timeout.

Leave/destroy only after an entity or chunk exits the retain zone or stays outside AOI for a cooling interval.

## Spatial Hash

Start with fixed cells:

```text
cellWidth = chunkPixelWidth
cellHeight = chunkPixelHeight
cellKey = floor(x / cellWidth) + ":" + chunkYForWorldY(y)
```

Per tick:

1. Update cells for moved dynamic entities.
2. For each client, compute AOI cells.
3. Diff previous subscribed entity IDs against current IDs.
4. Send enter/update/leave.

## Debug Metrics

Client overlay:

- visible world width/height,
- visible chunks,
- loaded chunks,
- rendered entities,
- pending chunk requests,
- snapshot bytes/entities received.

Server metrics:

- AOI min/max chunks,
- AOI entity counts,
- last snapshot bytes,
- chunk request rejects,
- subscription enters/leaves,
- stale/dropped snapshots.
