# Bug Report

Generated: 2026-05-24

## Current behavior
- Upper chunks create full-width solid rows that block upward movement.
- One-way platforms can snap a player that is already below/inside the platform because landing does not check previous bottom.
- Client prediction runs with render-frame `dt`, while server simulation runs fixed 60 Hz.
- Server input handling stores one pending input, so same-tick jump/kick edge inputs can be overwritten.
- Duplicate `hello` messages on one WebSocket can create ghost sessions.
- Server coin events use tile origin while client renders coins at tile center.
- Client authoritative chunk replacement only destroys terrain graphics, leaving stale coin/portal animations.

## Expected behavior
- No full-width blockers above chunk 0.
- One-way landing only happens when crossing the platform top from above.
- Client/server prediction steps are deterministic.
- Inputs preserve monotonic sequence and edge presses.
- One socket maps to one active session.
- Coin collision/event coordinates match rendered coin centers.
- Replacing a chunk replaces terrain, coin, and portal visuals.

## Root cause
- Chunk generator writes a solid bottom floor for every chunk.
- `resolveVertical` only checks current bottom tile and velocity.
- Client simulation is coupled to Pixi ticker frame time.
- Server uses a single `pendingInput` slot and no `lastReceivedSeq`.
- WebSocket `hello` path lacks a joined-session guard.
- Coin coordinate helper is duplicated and inconsistent.
- Client visual maps are invalidated independently.

## Affected files/functions
- `packages/shared/src/generation.ts`: `generateVerticalChunk`
- `packages/shared/src/physics.ts`: `resolveVertical`, `stepPlayer`
- `apps/server/src/index.ts`: `onMessage`, `tickRoom`, `checkRelicCollection`
- `apps/client/src/main.ts`: ticker loop, `connectRoom`, `renderChunk`, `chunk` handler

## Proposed fix
- Make only chunk 0 create a solid floor.
- Pass previous bottom to vertical resolution and gate one-way landing on `previousBottom <= platformTop`.
- Add a client fixed-step accumulator in a follow-up.
- Aggregate server pending inputs with edge OR and latest held state.
- Reject duplicate `hello` after a session exists.
- Use tile centers for server coin checks/events.
- Add per-chunk visual invalidation for terrain/relics/portals.

## Risk level
High: chunk and physics fixes change core gameplay.

## Verification method
- Unit tests for cross-chunk blocker absence, one-way below/inside behavior, duplicate hello/input aggregation where possible.
- Existing full suite: `npm test`.
