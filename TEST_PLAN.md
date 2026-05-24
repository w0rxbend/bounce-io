# Test Plan

Generated: 2026-05-24

## Current behavior
- Tests use Node's built-in test runner through `node --import tsx --test tests/**/*.test.ts`.
- Existing coverage includes shared physics, generation, protocol validation, and server-like pure helper tests.

## Expected behavior
- Tests cover root gameplay, generation, multiplayer protocol, room lifecycle, coin authority, and startup/build gates.

## Root cause
- Live server/client verification is manual and not yet automated.
- Some tests mirror old helper logic instead of importing production helpers.

## Affected files/functions
- `tests/shared/physics.test.ts`
- `tests/shared/generation.test.ts`
- `tests/server/multiplayer.test.ts`
- Future: server factory test harness

## Proposed fix
- Add focused tests with each bug fix.
- Add cross-chunk generation validation now.
- Add one-way crossing regression now.
- Add input aggregation/duplicate hello tests after server logic is factored enough for pure or live tests.
- Later add Playwright/browser smoke tests and live WebSocket integration tests.

## Risk level
Low. Tests should pin existing intended behavior and catch regressions.

## Verification method
- `npm test`
- `npm run typecheck`
- `npm run build`
