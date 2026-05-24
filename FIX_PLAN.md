# Fix Plan

Generated: 2026-05-24

## Current behavior
- Build/test baseline is green, but core gameplay has known correctness gaps.

## Expected behavior
- Fix root causes in a safe order without regenerating the project.

## Root cause
- The blocking issues cross shared physics, generation, server, and client rendering.

## Affected files/functions
- Shared: `constants.ts`, `physics.ts`, `generation.ts`, `validation.ts`
- Server: `apps/server/src/index.ts`
- Client: `apps/client/src/main.ts`
- Tests: `tests/shared/*.test.ts`, `tests/server/*.test.ts`

## Proposed fix
1. Fix endless-world blockers: remove solid floors from upper chunks and add regression tests.
2. Fix one-way platform crossing semantics.
3. Tighten server protocol handling: duplicate `hello`, pending input edge preservation, coin centers.
4. Fix client authoritative chunk replacement and unsafe scoreboard rendering.
5. Re-run typecheck, build, tests, backend/frontend startup.
6. Continue in later passes with fixed-step client prediction, reconnect payloads, checkpoints, hazards, and richer debug tools.

## Risk level
Medium-high. The first two steps change collision and world traversal.

## Verification method
- Each phase ends with tests.
- Startup report records commands and remaining manual checks.
