# Current State Report

Generated: 2026-05-24

## Current behavior
- Typecheck, build, and the existing test suite pass.
- Client renders a PixiJS game with layered sky, procedural platform art, portals, coins, HUD, prediction, reconciliation, and remote interpolation.
- Server starts as a Hono WebSocket service on port `8787`, creates rooms, simulates players, broadcasts snapshots at 20 Hz, and collects coins authoritatively.
- World generation creates reachable routes inside each chunk, but upper chunks currently include a full-width solid floor at their bottom row.

## Expected behavior
- App starts cleanly, two clients can play in the same room, chunks remain passable upward forever, and visuals/collision match server state.

## Root cause
- The largest current blocker is cross-chunk generation: every upper chunk's bottom floor becomes a ceiling over the previous chunk.
- Multiplayer stability issues remain around duplicate `hello`, single-slot input buffering, and reconnect payload completeness.
- Client-side provisional chunks can remain after receiving the authoritative server seed.

## Affected files/functions
- `packages/shared/src/generation.ts`: `generateVerticalChunk`, `createMultiChunkTileMap`
- `packages/shared/src/physics.ts`: `resolveVertical`, `stepPlayer`
- `apps/server/src/index.ts`: WebSocket `onMessage`, `tickRoom`, `checkRelicCollection`
- `apps/client/src/main.ts`: `loadChunk`, `renderChunk`, `connectRoom`, `reconcileLocalPlayer`

## Proposed fix
- Fix cross-chunk blockers first.
- Tighten one-way collision to previous-bottom crossing semantics.
- Guard duplicate joins and preserve input edges.
- Fully clear/replace client chunk-derived visuals when server chunks arrive.

## Risk level
High for generation/physics changes; medium for networking; low for report and validation changes.

## Verification method
- Add cross-chunk generation regression tests.
- Add physics tests for previous-bottom one-way behavior.
- Run `npm run typecheck`, `npm run build`, `npm test`.
- Verify HTTP server and Vite dev server respond.
