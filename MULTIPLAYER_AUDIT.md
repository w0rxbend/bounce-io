# Multiplayer Audit

Generated: 2026-05-24

## Current behavior
- Server owns movement simulation, rooms, snapshots, reconnect tokens, and coin collection.
- Snapshots include `lastProcessedSeq`.
- Disconnected players are filtered from snapshots.
- Existing tests mostly mirror helper logic rather than exercising live WebSocket behavior.

## Expected behavior
- One active session per socket/player.
- Input sequence handling is monotonic and preserves jump/kick edges.
- Countdown does not allow unfair gameplay movement unless explicitly designed.
- Reconnect restores deterministic seed/chunks/collected state quickly.
- Chunk requests cannot force excessive generation.

## Root cause
- WebSocket message handling is implemented inline in `apps/server/src/index.ts`.
- The server stores one pending input slot and tracks only processed sequence.
- Reconnect and chunk request paths are minimal.

## Affected files/functions
- `apps/server/src/index.ts`: `onMessage`, `tickRoom`, `ensureChunksLoaded`, reconnect path
- `packages/shared/src/protocol.ts`
- `packages/shared/src/validation.ts`
- `tests/server/multiplayer.test.ts`

## Proposed fix
- Add duplicate-hello guard.
- Add `lastReceivedSeq` plus pending input aggregation or queue.
- Restrict far chunk requests relative to player position.
- Expand reconnect payload in a later protocol revision.
- Refactor server factory for live WebSocket tests.

## Risk level
Medium. Protocol and session changes can affect reconnect/client startup.

## Verification method
- Existing tests plus new pure tests where possible.
- Later live tests using ephemeral port and real WebSocket clients.
