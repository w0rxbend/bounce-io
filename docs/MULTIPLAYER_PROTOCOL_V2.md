# Multiplayer Protocol v2

Transport: WebSocket. Reliable/control messages use text frames containing JSON. Clients that advertise `binarySnapshots: true` during join receive replaceable high-frequency snapshots as binary frames; clients that omit the flag continue receiving JSON snapshots.

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
  "clientTime": 1710000000000,
  "binarySnapshots": true
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

### Binary Snapshot

When `binarySnapshots` is enabled, the hot state snapshot is sent as a WebSocket binary frame:

```text
uint8  messageType = 1
uint32 serverTick
uint32 baselineTick
uint32 snapshotSeq
int32  ackInputSeq
uint64 serverTimeMs
uint16 entityCount
repeated entity:
  uint32 entityIdHash
  uint8  entityType
  int32  quantizedX      // position * 100
  int32  quantizedY      // position * 100
  int16  quantizedVx     // velocity * 100
  int16  quantizedVy     // velocity * 100
  int16  rotation        // currently facing/sign
  uint16 stateFlags
uint16 removedCount
repeated uint32 removedEntityIdHash
```

The hash is FNV-1a over the server string ID. JSON `welcome`, `playerJoined`, `chunk`, and reliable event messages provide the ID dictionary during rollout. `baselineTick` and `removedEntityIdHash` let the client treat the frame as AOI enter/update/leave state while still dropping stale frames by `serverTick`/`snapshotSeq`.

### `pong`

```json
{ "type": "pong", "clientTime": 1710000000000, "serverTime": 1710000000100 }
```

### Other Messages

The server also sends `chunk`, `playerJoined`, `playerLeft`, `matchPhase`, `resumed`, and `error` messages in the existing TypeScript-compatible shape.
