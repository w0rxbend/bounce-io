# UI Visual Plan

Generated: 2026-05-24

## Current behavior
- Client already has procedural pixel-art sky, clouds, floating islands, mossy platform tiles, portals, coins, particles, HUD panels, and scoreboard.
- Rendering is Pixi Graphics-based rather than sprite-sheet based.
- Pixel scale can be fractional, which may shimmer.
- Scoreboard currently uses HTML `innerHTML`.

## Expected behavior
- Pixel rendering remains crisp and readable.
- UI uses fantasy stone/vine styling without sacrificing multiplayer readability.
- Names render as text, not markup.
- Visuals reflect authoritative chunks after joining a server.

## Root cause
- Procedural rendering is centralized in one large file and not all derived visual maps invalidate together.
- DOM scoreboard string interpolation is convenient but unsafe.
- Fractional world scale can distort pixel geometry.

## Affected files/functions
- `apps/client/src/main.ts`: Pixi setup, `getScale`, `renderChunk`, `buildSkyStatic`, `updateHud`
- `apps/client/src/styles.css`

## Proposed fix
- First fix chunk visual invalidation and scoreboard text rendering.
- Later split rendering into layer/component modules and quantize scale or render to fixed resolution.
- Add render/debug overlays for chunk bounds, coin centers, portal anchors, and particle counts.

## Risk level
Low for scoreboard/chunk invalidation; medium for renderer refactor or scale changes.

## Verification method
- Typecheck/build.
- Browser startup at Vite URL.
- Manual screenshots at common desktop/mobile widths.
