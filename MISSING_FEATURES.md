# Missing Features

Generated: 2026-05-24

## Current behavior
- Portals are rendered but decorative.
- Hazard tiles render but have no authoritative damage/respawn behavior.
- Moving, crumbling, bounce, and checkpoint platform types are not implemented.
- Debug overlay has only partial required metrics and hotkeys.
- Live WebSocket integration tests are not present.

## Expected behavior
- Portals affect world flow.
- Hazards are server-authoritative or visually de-emphasized as decorative.
- Debug tools expose network, prediction, collision, chunk, route, and particle state.
- Automated tests cover live room lifecycle and reconnect behavior.

## Root cause
- Current implementation prioritized core climb, coins, rooms, prediction, and procedural visuals.
- Some art language is ahead of gameplay systems.

## Affected files/functions
- `apps/server/src/index.ts`: portal/hazard handling
- `packages/shared/src/types.ts`: tile/platform/event types
- `packages/shared/src/generation.ts`: platform variety
- `apps/client/src/main.ts`: debug overlay, portal/hazard affordance
- `tests/server/multiplayer.test.ts`: live integration coverage

## Proposed fix
- Stabilize current movement/multiplayer first.
- Decide whether hazards are gameplay this milestone; if yes, add shared `isHazard`.
- Add debug metrics after core fixes.

## Risk level
Medium. These are feature additions; they should not block critical stability fixes.

## Verification method
- Focused unit tests for each new authoritative system.
- Manual two-tab checklist after each feature lands.
