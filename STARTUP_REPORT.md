# Startup Report

Generated: 2026-05-24

## Current behavior
- Package manager: npm workspaces with `package-lock.json`.
- Install command: `npm install`.
- Backend dev command: `npm run dev:server`.
- Frontend dev command: `npm run dev:client`.
- Build command: `npm run build`.
- Typecheck command: `npm run typecheck`.
- Test command: `npm test`.

## Commands used
- `PATH=/home/worxbend/.nvm/versions/node/v26.1.0/bin:$PATH npm run typecheck`: passed.
- `PATH=/home/worxbend/.nvm/versions/node/v26.1.0/bin:$PATH npm test`: passed, 41/41 tests.
- `PATH=/home/worxbend/.nvm/versions/node/v26.1.0/bin:$PATH npm run build`: passed.
- `./node_modules/.bin/tsc --noEmit -p packages/shared/tsconfig.json`: passed.
- `./node_modules/.bin/tsc --noEmit -p apps/client/tsconfig.json`: passed.
- `./node_modules/.bin/tsc --noEmit -p apps/server/tsconfig.json`: passed.
- `node --import tsx --test tests/**/*.test.ts`: passed, 41/41 tests.
- Dev server startup was not re-run in this pass. Earlier recorded checks showed backend reachable on `http://localhost:8787/` and Vite reachable on `http://localhost:5174/`, but those endpoints were not reverified here.

## Errors found
- `npm` was unavailable in one shell context, but works when `/home/worxbend/.nvm/versions/node/v26.1.0/bin` is added to `PATH`.
- Browser/WebSocket startup remains unverified in this pass.

## Fixes needed
- No code fix required for npm scripts.
- For automated startup tests, run dev servers with explicit ephemeral ports or refactor server creation to support test-owned ports.

## Backend starts
Not reverified in this pass. Earlier recorded checks showed the HTTP endpoint at `http://localhost:8787/` responding with JSON.

## Frontend starts
Not reverified in this pass. Earlier recorded checks showed Vite responding at `http://localhost:5174/`.

## WebSocket connects
Yes for server-level smoke. `tests/server/live-websocket.test.ts` starts the real server, connects two WebSocket clients to the same room, and verifies a snapshot containing both players.

## Player spawns
Not browser-verified in this pass. The client local bootstrap calls `respawnLocal()` and renders a local player before joining; authoritative spawn needs browser/WebSocket verification.

## Expected behavior
- Backend and frontend start, game screen renders, WebSocket connects, player spawns, and there is no critical runtime crash.

## Root cause
- Startup is probably functional based on earlier checks, and this pass verified TypeScript, tests, production build, and live server WebSocket smoke. Remaining uncertainty is lack of automated browser canvas/playability smoke.

## Affected files/functions
- `package.json`
- `apps/server/package.json`
- `apps/client/package.json`
- `apps/server/src/index.ts`
- `apps/client/src/main.ts`

## Proposed fix
- Add Playwright smoke for canvas nonblank, join flow, and two-tab visual sync.

## Risk level
Medium until live WebSocket/browser smoke is automated.

## Verification method
- Keep direct TypeScript/test/build checks working and add automated two-client smoke once the server can bind an ephemeral test port.
