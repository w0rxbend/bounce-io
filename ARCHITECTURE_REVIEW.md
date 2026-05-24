# Architecture Review

Generated: 2026-05-24

## Current behavior
- npm workspaces: `apps/client`, `apps/server`, `packages/shared`.
- Client uses TypeScript, PixiJS 8, Vite, and imports shared physics/generation/protocol.
- Server uses Hono plus `@hono/node-ws`, imports shared physics/generation/protocol, and owns simulation, rooms, chunks, relics, and snapshots.
- Shared code is still flat (`constants.ts`, `protocol.ts`, `types.ts`) rather than the requested split folders.

## Expected behavior
- Shared constants, protocol, schemas, and types should be the single contract for client and server.
- Server remains authoritative for movement, deaths, coins, room lifecycle, and match outcome.
- Client predicts only local movement and reconciles against authoritative snapshots.

## Root cause
- The current architecture is already partially integrated, but contracts drift in runtime validation and some logic is duplicated in tests/client helpers.
- Client bootstraps local chunks before receiving the server seed and does not fully invalidate derived visuals.
- Room/input internals are still prototype-like in several places.

## Affected files/functions
- `packages/shared/src/constants.ts`
- `packages/shared/src/protocol.ts`
- `packages/shared/src/types.ts`
- `packages/shared/src/validation.ts`
- `apps/server/src/index.ts`
- `apps/client/src/main.ts`
- `tests/server/multiplayer.test.ts`
- `tests/shared/generation.test.ts`
- `tests/shared/physics.test.ts`

## Proposed fix
- Keep the current incremental shared-module architecture; do not rewrite.
- Add compatibility exports/files only when needed by imports/tests.
- Fix drift first: schema validation, shared constants use, server/client spawn and coin coordinate helpers.
- Refactor server construction later so live WebSocket integration tests can run on ephemeral ports.

## Risk level
Medium. The project is small, but client prediction, server simulation, chunk generation, and rendering all share state assumptions.

## Verification method
- `npm install`
- `npm run typecheck`
- `npm run build`
- `npm test`
- Dev server HTTP/WebSocket startup checks
