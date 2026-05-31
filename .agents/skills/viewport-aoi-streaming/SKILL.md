---
name: viewport-aoi-streaming
description: Camera viewport, server AOI, interest management, spatial partitioning, chunk streaming, hysteresis, and render culling for large or infinite browser multiplayer worlds. Use when reducing visible world size, tying network AOI to camera zoom/viewport, preventing offscreen entity/chunk updates, or optimizing PixiJS world streaming.
---

# Viewport AOI Streaming

Use this skill when the lag source is too much world: the client sees too much, the server sends too much, or chunks/entities churn near viewport edges.

## Workflow

1. Measure the viewport.
   - Compute `visibleWorldWidth = screenWidth / cameraZoom`.
   - Compute `visibleWorldHeight = screenHeight / cameraZoom`.
   - Add debug overlay metrics for visible world size, visible chunks, loaded chunks, and rendered entities.

2. Reduce default visible area.
   - Increase default camera zoom for gameplay.
   - Clamp max zoom-out so the player cannot reveal too many chunks/entities.
   - Keep HUD/UI scale independent from world zoom.

3. Bind AOI to camera viewport.
   - Client sends world-space AABB plus chunk range.
   - Server clamps requested AOI around authoritative player state.
   - Server sends no dynamic entities outside the clamped AOI.
   - Keep static terrain deterministic from seed/chunk when possible.

4. Add hysteresis.
   - Use a larger retain/cooling area than render area.
   - Avoid unload/reload loops near edges.
   - Keep entities/chunks briefly after leaving AOI before emitting leave/removal.

5. Add spatial partitioning.
   - Use fixed grid/chunk cells first.
   - Index dynamic players, enemies, collectibles, projectiles by cell.
   - Query only cells intersecting the clamped AOI.
   - Maintain per-client subscriptions for enter/update/leave deltas.

## Implementation Notes

- Treat the client viewport as a request, not authority.
- Always include the authoritative player chunk in the server AOI.
- Clamp horizontal AOI to world bounds when the world has a fixed width.
- Prefer AABB filtering after cell/chunk filtering.
- Do not stream static terrain repeatedly if the client can generate it deterministically.

## References

- For formulas, hysteresis patterns, and server filtering details, read [references/aoi-patterns.md](references/aoi-patterns.md).
