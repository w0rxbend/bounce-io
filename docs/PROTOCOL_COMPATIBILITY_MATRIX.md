# Protocol Compatibility Matrix

This document compares three contracts:

- **Node backend**: `apps/server/src/index.ts` plus `packages/shared/src/protocol.ts`.
- **PixiJS client**: `apps/client/src/main.ts`, especially `connectRoom`, `sendWsMessage`, and the `isServerMessage` gate.
- **Go backend**: `apps/server-go/internal/game`.

The current migration strategy is **backend compatibility layer only**. The PixiJS client already has prediction, reconciliation, interpolation, chunk rendering, reconnect, ping/pong, pickups, jump pads, kicks, enemy hit effects, and death/respawn effects. Rewriting that client networking layer is not needed yet.

## Timing Contract

| Flow | Timing |
|---|---|
| `hello` / `welcome` | One-shot after WebSocket open. |
| `chunk` | One-shot on join for chunk `0`; repeated on `requestChunk`; late-join active rooms may receive multiple chunks. |
| `playerJoined` / `playerLeft` | One-shot room membership events. |
| `input` | Client sends during local prediction at fixed physics cadence, currently up to 60 Hz. |
| `snapshot` | Server sends sequenced authoritative snapshots at `SNAPSHOT_RATE`, currently 20 Hz. |
| `ping` / `pong` | Client sends about every 1 second; server replies immediately. |
| `matchPhase` | One-shot on countdown/start/finish transitions. |
| `events[]` inside `snapshot` | Tick-batched authoritative gameplay events. |
| `resumed` | One-shot reconnect response when token is still valid. |

## Exact JSON Shapes

### Client -> Server

#### `hello`

```json
{
  "type": "hello",
  "protocol": 2,
  "version": "0.1.0",
  "name": "Explorer",
  "token": "optional-session-token"
}
```

Required: `type`, `protocol`, `version`, `name`.
Optional: `token`.
Defaults: server sanitizes `name` to `"Explorer"` if empty/invalid.

#### `input`

```json
{
  "type": "input",
  "playerId": "server-player-id",
  "input": {
    "left": false,
    "right": true,
    "jumpPressed": false,
    "jumpHeld": false,
    "drop": false,
    "kick": false,
    "sequence": 42
  }
}
```

Required: every field shown above.
Timing: sent repeatedly during local prediction, normally at physics cadence.
Validation: stale, duplicate, out-of-order, over-rate, and wrong-player inputs are ignored.

#### `requestChunk`

```json
{ "type": "requestChunk", "chunkY": 3 }
```

Required: integer `chunkY`.
Node behavior: rejects too-far-ahead chunks with `CHUNK_TOO_FAR`.
Go behavior: bounds-checks chunk range and sends a compatible `chunk`.

#### `ping`

```json
{ "type": "ping", "clientTime": 1710000000000 }
```

Required: numeric `clientTime`; echoed in `pong`.

### Server -> Client

#### `welcome`

```json
{
  "type": "welcome",
  "playerId": "server-player-id",
  "sessionToken": "reconnect-token",
  "serverTime": 1710000000100,
  "tickRate": 60,
  "matchPhase": "waiting",
  "seed": 123,
  "name": "Explorer"
}
```

Client dependency: `playerId`, `sessionToken`, `serverTime`, `tickRate`, `matchPhase`, `seed`, and `name`.

#### `resumed`

```json
{
  "type": "resumed",
  "playerId": "server-player-id",
  "serverTime": 1710000000100,
  "matchPhase": "playing",
  "playerState": {}
}
```

`playerState` must satisfy the full shared `PlayerState` validator.

#### `chunk`

```json
{
  "type": "chunk",
  "chunk": {
    "seed": 123,
    "chunkY": 0,
    "width": 24,
    "height": 18,
    "worldTileY": 0,
    "tiles": ["empty"],
    "platforms": [{ "x": 0, "y": 16, "width": 24 }],
    "entry": { "x": 0, "y": 16, "width": 24 },
    "exit": { "x": 8, "y": 1, "width": 8 },
    "relics": [{ "id": "relic:0:0", "x": 12, "y": 9 }],
    "enemies": [{ "id": "enemy:1:0", "kind": "goblin", "x": 12, "y": 6 }],
    "jumpPads": [{ "id": "jumpPad:1:0", "x": 12, "y": 9, "multiplier": 2.2 }],
    "windZones": []
  }
}
```

All array fields must be present. `tiles.length` must equal `width * height`.

#### `snapshot`

```json
{
  "type": "snapshot",
  "tick": 180,
  "snapshotSeq": 60,
  "serverTime": 1710000000150,
  "matchPhase": "playing",
  "players": [],
  "enemies": [],
  "collectedRelics": [],
  "events": [],
  "lastProcessedSeq": {
    "server-player-id": 42
  }
}
```

Required by client validator: `tick`, `snapshotSeq`, `serverTime`, `matchPhase`, `players`, `collectedRelics`, `events`, `lastProcessedSeq`.
Optional in old protocol: `enemies`.
Go extra fields: `serverTick`, `ackInputSeq`, `entities`; these are currently safe because the client validator permits extra fields.

#### `EnemyState`

```json
{
  "id": "enemy:1:0",
  "kind": "goblin",
  "position": { "x": 180, "y": -120 },
  "velocity": { "x": 22, "y": 0 },
  "facing": 1,
  "health": 2,
  "maxHealth": 2,
  "chunkY": 1,
  "patrolMinX": 128,
  "patrolMaxX": 224,
  "platformY": -96,
  "attackCooldown": 0.5,
  "hurtCooldown": 0
}
```

Every field above is required when `snapshot.enemies` is present.

#### Top-Level Room Events

```json
{ "type": "matchPhase", "phase": "countdown", "countdownMs": 3000 }
{ "type": "playerJoined", "player": {}, "name": "Explorer" }
{ "type": "playerLeft", "playerId": "server-player-id" }
{ "type": "pong", "clientTime": 1710000000000, "serverTime": 1710000000100 }
{ "type": "error", "code": "UNKNOWN_TYPE", "message": "unknown or malformed message" }
```

`player` must satisfy the full shared `PlayerState` validator.

## Flow Summary

### Join / Room Creation

1. Client opens `GET /ws?room=<roomId>`.
2. Client sends `hello`.
3. Server creates the room if missing. Default room is `demo`.
4. Server sends `welcome`.
5. Server sends chunk `0`.
6. Server sends `playerJoined` for existing connected players to the new client.
7. Server broadcasts `playerJoined` for the new player to other clients.
8. If phase is `waiting`, server starts countdown and sends `matchPhase`.

### Game Loop

1. Client predicts locally and sends `input`.
2. Server validates player id, sequence ordering, rate, and queue size.
3. Server consumes input in the authoritative fixed tick loop.
4. Server sends `snapshot` every configured snapshot interval.
5. Client rejects stale snapshots, reconciles local state, and interpolates remotes.

### Chunk Streaming

1. Client calculates its chunk window from local player/camera.
2. Client sends `requestChunk` for missing chunks.
3. Server sends authoritative `chunk`.
4. Client replaces local deterministic chunk visuals with server chunk data.

### Reconnect / Disconnect

1. Normal disconnect marks the session disconnected and broadcasts top-level `playerLeft`.
2. Session token remains valid during reconnect grace.
3. Reconnecting client sends `hello` with `token`.
4. Server replies with `resumed` and keeps `lastProcessedSeq`.
5. Expired disconnected sessions are removed and emit `PLAYER_LEFT`.

### Death / Respawn

Death and respawn are not top-level socket messages. They are batched snapshot events:

```json
{ "type": "PLAYER_DIED", "playerId": "..." }
{ "type": "PLAYER_RESPAWNED", "playerId": "..." }
```

### Unsupported Features

There are no current WebSocket messages for chat, lobby listing, explicit score updates, or scoreboard deltas. Score/progression is represented inside `PlayerState` fields such as `coins`, `relics`, `crystals`, and `level`.

## Error Codes

| Code | Node.js | Go | Notes |
|---|---:|---:|---|
| `TOO_LARGE` | Yes | Yes | Text frame exceeds server limit. |
| `PARSE_ERROR` | Yes | Yes | Invalid JSON or invalid typed payload. |
| `UNKNOWN_TYPE` | Yes | Yes | Unknown or malformed message type. |
| `ALREADY_JOINED` | Yes | Yes | Client tries to join twice on one socket. |
| `ALREADY_CONNECTED` | Yes | Yes | Token belongs to an active session. |
| `ROOM_FULL` | Yes | Yes | Room capacity reached. |
| `NOT_JOINED` | Yes | Yes | Input before successful join. |
| `MATCH_OVER` | Yes | Not currently | Go rooms do not yet close finished matches like Node. |
| `CHUNK_TOO_FAR` | Yes | Not currently | Go bounds-checks but does not enforce current-chunk distance yet. |
| `VERSION_MISMATCH` | No | Yes | Go-specific clearer version/protocol rejection. |
| `BINARY_UNSUPPORTED` | No | Yes | Go-specific text-frame enforcement. |

## Message Matrix

| Message | Direction | Node.js Payload | PixiJS Client Contract | Go Current Payload | Status | Required Fix |
|---|---|---|---|---|---|---|
| `hello` | Client -> Server | `{ type, protocol, version, name, token? }` | Sends this on `open`; `protocol` must equal shared `PROTOCOL_VERSION`; `version` equals `GAME_VERSION`. | Accepts `hello`; also accepts `join` alias. | Compatible | Keep `hello` as primary client path. |
| `join` | Client -> Server | Not supported. | Not sent. | Supported alias with optional `clientId`, `clientTime`. | Missing in client, harmless | Keep as backward-compatible future alias; do not require it. |
| `welcome` | Server -> Client | `{ type, playerId, sessionToken, serverTime, tickRate, matchPhase, seed, name }` | Requires `playerId`, `sessionToken`, `serverTime`, `tickRate`, `matchPhase`, `seed`; uses `name` for scoreboard. | Same old fields. | Compatible | Keep exact old field names. |
| `resumed` | Server -> Client | `{ type, playerId, serverTime, matchPhase, playerState }` | Restores local player from `playerState`; resets snapshot ordering. | Same shape. | Compatible | Preserve token reconnect window. |
| `input` | Client -> Server | `{ type, playerId, input }`; `input = { left, right, jumpPressed, jumpHeld, drop, kick, sequence }` | Sends nested old shape from `sendInput`. | Accepts nested old shape and flat Go shape. | Compatible | Validate malformed input and stale sequences. |
| `requestChunk` | Client -> Server | `{ type, chunkY }` | Sent for missing chunks in current window. | Same shape. | Compatible | Keep bounds checks and return old `chunk` shape. |
| `chunk` | Server -> Client | `{ type, chunk }`; chunk has `seed, chunkY, width, height, worldTileY, tiles, platforms, entry, exit, relics, enemies, jumpPads, windZones`. | Replaces local generated chunk; validator requires all arrays and valid spawn shapes. | Same shape; `enemies` now uses `EnemySpawn`; `jumpPads` uses `JumpPadSpawn`. | Compatible | Keep all arrays present, even empty. |
| `ping` | Client -> Server | `{ type, clientTime }` | Sent immediately after open and every ~1s. | Same shape. | Compatible | Reply with old `pong`. |
| `pong` | Server -> Client | `{ type, clientTime, serverTime }` | Uses RTT and server clock offset. | Same shape. | Compatible | None. |
| `snapshot` | Server -> Client | `{ type, tick, snapshotSeq, serverTime, matchPhase, players, enemies?, collectedRelics, events, lastProcessedSeq }` | Rejects stale `snapshotSeq`/`tick`; reconciles local using `lastProcessedSeq[localPlayerId]`; interpolates remote players; updates enemies and events. | Includes old fields plus extra `serverTick`, `ackInputSeq`, `entities`. `enemies` now uses old `EnemyState`. | Compatible with extras | Do not remove old fields. Extras are allowed by current validator. |
| `matchPhase` | Server -> Client | `{ type, phase, countdownMs? }` | Updates HUD notifications for countdown/playing. | Same shape. | Compatible | None. |
| `playerJoined` | Server -> Client | `{ type, player, name }` | Adds remote entry/name. | Same shape. | Compatible | None. |
| `playerLeft` | Server -> Client | `{ type, playerId }` | Removes remote entry/name. | Same shape. | Compatible | None. |
| `leave` | Client -> Server | Not in old shared validator; socket close is normal path. | Not sent by current client. | Supported explicit close message. | Missing in client, harmless | Keep optional only. |
| `error` | Server -> Client | `{ type, code, message }` | Validator accepts but client has no switch branch beyond gate; safe to ignore visually. | Same shape. | Compatible | Continue explicit errors for malformed/unsupported messages. |
| Chat / score / lobby list | N/A | Not implemented as WebSocket protocol. | Not used. | Not implemented. | Not applicable | Avoid inventing until product needs it. |

## Snapshot Event Matrix

| Event | Node.js Meaning | Client Uses It? | Go Status | Required Fix |
|---|---|---:|---|---|
| `PLAYER_JOINED` | Batched join event. | No direct visual branch. | Present. | None. |
| `PLAYER_LEFT` | Batched final removal. | No direct visual branch; top-level `playerLeft` handles removal. | Present on reconnect expiry. | None. |
| `PLAYER_DISCONNECTED` | Temporary disconnect. | No direct visual branch. | Present. | None. |
| `PLAYER_RECONNECTED` | Token resume. | No direct visual branch. | Present. | None. |
| `MATCH_COUNTDOWN_STARTED` | Countdown start. | No direct visual branch; top-level `matchPhase` handles UI. | Present. | None. |
| `MATCH_STARTED` | Match start. | No direct visual branch; top-level `matchPhase` handles UI. | Present. | None. |
| `MATCH_ENDED` | Match end. | No direct visual branch. | Not fully used. | Low priority. |
| `CHECKPOINT_REACHED` | Respawn anchor update. | Yes, checkpoint ceremony for local player. | Present. | None. |
| `COIN_COLLECTED` | Pickup collection. | Yes, pickup burst and notification. | Present. | None. |
| `JUMP_PAD_TRIGGERED` | Jump pad launch. | Yes, jump pad feedback. | Present. | None. |
| `PLAYER_KICK_STARTED` | Kick windup. | No direct branch. | Present. | None. |
| `PLAYER_KICK_HIT` | Player hit player. | Yes, damage feedback and notifications. | Present. | None. |
| `ENEMY_HIT` | Player hit enemy. | Yes, damage feedback. | Present. | None. |
| `ENEMY_KILLED` | Enemy killed and drops spawned. | Yes, burst/drop animation. | Present. | Dynamic drop persistence still partial. |
| `PLAYER_DIED` | Player death. | Yes, screen flash for local player. | Present. | None. |
| `PLAYER_RESPAWNED` | Player respawn. | Yes, respawn ring/floating text. | Present. | None. |

## Known Semantic Gaps

| Area | Node.js Behavior | Go Compatibility Status |
|---|---|---|
| Full physics parity | Node imports shared TypeScript physics and tile generation. | Go has compatible fields and core mechanics, but not a full line-for-line physics/generation port. |
| Enemy variety | Node hydrates many enemy kinds with stats and chunk-based defeated tracking. | Go currently emits simple `goblin` enemies with compatible `EnemyState`. |
| Enemy drops | Node mutates chunk relics so drops can later be collected. | Go emits `ENEMY_KILLED.drops` for client animation; persistent collectible drops are not fully implemented yet. |
| Hazards/wind/collectible progression | Node uses shared helpers. | Go implements core pickups and jump pads; detailed hazard/wind parity remains partial. |
| Socket close semantics | Node broadcasts `playerLeft` immediately on close and keeps session for reconnect. | Go does the same high-level behavior. |

## Recommendation

Use **backend compatibility layer only** for now.

Reasons:

- The PixiJS client already has the right netcode concepts: input commands, prediction, reconciliation, snapshot ordering, interpolation, ping/pong clock sync, reconnect token usage, and chunk streaming.
- The old shared validator is strict enough to protect the client from malformed server data.
- The Go backend can preserve old field names while keeping new server architecture and extra metadata.
- A client adapter rewrite would add risk without solving the current main issue, which is backend gameplay/protocol parity.

Next best step after this pass: port shared physics/generation behavior more faithfully into Go or extract a deterministic shared simulation contract, then compare Node and Go snapshots from the same recorded input stream.
