# Multiplayer Protocol v2

Transport: WebSocket text frames containing JSON.

The Go server accepts the current PixiJS client protocol and the clearer `join` / flat-input shape below. Existing `hello`, nested `input`, `requestChunk`, and `ping` messages remain supported during migration.

## Client To Server

### `join`

```json
{
  "type": "join",
  "protocol": 2,
  "version": "0.1.0",
  "name": "Explorer",
  "token": "optional-reconnect-token",
  "clientId": "optional-client-generated-id",
  "clientTime": 1710000000000
}
```

Compatibility alias: `hello`.

### `input`

Preferred shape:

```json
{
  "type": "input",
  "clientId": "optional-client-id",
  "playerId": "authoritative-player-id",
  "inputSeq": 42,
  "clientTime": 1710000000000,
  "movement": {
    "left": false,
    "right": true,
    "jumpPressed": false,
    "jumpHeld": false,
    "drop": false
  },
  "aim": { "x": 0, "y": 0 },
  "action": { "kick": false }
}
```

Current PixiJS-compatible shape:

```json
{
  "type": "input",
  "playerId": "authoritative-player-id",
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

The server discards stale or duplicate input (`inputSeq` / `input.sequence`) and never accepts client positions.

### `ping`

```json
{ "type": "ping", "clientTime": 1710000000000 }
```

### `requestChunk`

```json
{ "type": "requestChunk", "chunkY": 3 }
```

### `leave`

```json
{ "type": "leave", "playerId": "authoritative-player-id" }
```

## Server To Client

### `welcome`

```json
{
  "type": "welcome",
  "playerId": "server-player-id",
  "sessionToken": "reconnect-token",
  "serverTime": 1710000000100,
  "tickRate": 60,
  "matchPhase": "countdown",
  "seed": 123,
  "name": "Explorer"
}
```

### `snapshot`

```json
{
  "type": "snapshot",
  "tick": 180,
  "serverTick": 180,
  "snapshotSeq": 60,
  "serverTime": 1710000000150,
  "matchPhase": "playing",
  "ackInputSeq": 42,
  "players": [],
  "entities": [],
  "enemies": [],
  "collectedRelics": [],
  "events": [],
  "lastProcessedSeq": {
    "server-player-id": 42
  }
}
```

`tick`, `snapshotSeq`, and `serverTime` are monotonic for stale-snapshot rejection and interpolation. `ackInputSeq` is per-recipient and mirrors `lastProcessedSeq[playerId]`; the map is retained for the existing client reconciliation path.

### `pong`

```json
{ "type": "pong", "clientTime": 1710000000000, "serverTime": 1710000000100 }
```

### Other Messages

The server also sends `chunk`, `playerJoined`, `playerLeft`, `matchPhase`, `resumed`, and `error` messages in the existing TypeScript-compatible shape.

