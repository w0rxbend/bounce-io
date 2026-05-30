# Go Multiplayer Backend

This backend is a plain Go authoritative WebSocket service for the existing PixiJS client. It intentionally avoids Nakama/Pitaya for the first migration step so timing, protocol, and bottlenecks stay easy to measure.

## Library Decision

Chosen: `github.com/coder/websocket`.

Why:

- Small API and strong `context.Context` support fit one read goroutine and one write goroutine per client.
- Current maintenance is active, with v1.8.14 published in 2025.
- It supports concurrent writes and ping/pong APIs, while keeping dependencies low.
- It lets this project keep a normal HTTP/WebSocket service instead of adopting a game platform before measurements justify that.

Rejected for now:

- `gobwas/ws`: excellent low-level performance knobs, but the API is intentionally lower-level. It is better if profiling proves WebSocket framing/allocations dominate.
- `gorilla/websocket`: mature and stable, but `coder/websocket` is a better fit for context-driven handlers and lower ceremony in new Go code.
- Nakama: strong authoritative multiplayer platform, but brings accounts, storage, match handlers, and platform runtime decisions that are too much for this repo's first migration.
- Pitaya: useful for clustered multiplayer services, but the current need is one measurable authoritative game-loop service.

## Architecture

- HTTP endpoints:
  - `/` service info
  - `/ws` WebSocket transport
  - `/metrics` JSON process/network/room metrics
  - `/metrics/prometheus` Prometheus-style counters/gauges
  - `/debug/pprof/*` Go pprof
- One read loop per client.
- One write loop per client.
- One room goroutine per room.
- Room state is private to the room goroutine.
- Client goroutines submit `join`, `input`, `leave`, and `requestChunk` commands through channels.
- Outbound queues are bounded. Slow clients accumulate dropped outbound messages and are disconnected after the configured threshold.

## Tick Model

Defaults:

- `TICK_RATE=60`
- `SNAPSHOT_RATE=20`
- `OUTBOUND_QUEUE_SIZE=32`
- `MAX_OUTBOUND_DROPS=64`

The room uses a fixed ticker. Each tick:

1. Drains queued commands.
2. Resets per-tick input counters.
3. Removes reconnect-expired sessions.
4. Advances phase state.
5. Consumes validated input commands.
6. Mutates authoritative player state.
7. Broadcasts sequenced snapshots at `SNAPSHOT_RATE`.
8. Records tick duration, interval drift, and overruns.

## Current Scope

This is the Go service foundation. It is protocol-compatible with the PixiJS client and implements authoritative player movement, snapshot sequencing, reconciliation acknowledgements, metrics, backpressure handling, pprof, and a load client.

The full TypeScript physics/generation model is not fully ported yet. For production parity, the next migration step is to port `packages/shared/src/physics.ts` and `packages/shared/src/generation.ts` into a shared Go game module, then compare Go and Node snapshots on identical input recordings.

## Run

```bash
cd apps/server-go
go run ./cmd/server
```

With Docker:

```bash
docker compose up --build backend frontend
```

Useful env vars:

```bash
HOST=0.0.0.0
PORT=8787
TICK_RATE=60
SNAPSHOT_RATE=20
MAX_MESSAGE_BYTES=2048
OUTBOUND_QUEUE_SIZE=32
MAX_OUTBOUND_DROPS=64
```

## Load Test

```bash
cd apps/server-go
go run ./cmd/loadtest -url ws://127.0.0.1:8787/ws?room=load -clients 10 -duration 30s
go run ./cmd/loadtest -url ws://127.0.0.1:8787/ws?room=load -clients 25 -duration 30s -latency 40ms -jitter 20ms
go run ./cmd/loadtest -url ws://127.0.0.1:8787/ws?room=load -clients 50 -duration 45s -burst-every 3s
go run ./cmd/loadtest -url ws://127.0.0.1:8787/ws?room=load -clients 100 -duration 60s -slow-clients 5
```

Measure before/after with:

```bash
curl http://127.0.0.1:8787/metrics
curl http://127.0.0.1:8787/metrics/prometheus
go tool pprof http://127.0.0.1:8787/debug/pprof/profile?seconds=30
```

## Client Integration Notes

The current PixiJS client already:

- sends input commands rather than final positions,
- rejects stale snapshots by `snapshotSeq` and `tick`,
- estimates server clock from ping/pong,
- interpolates remote players,
- predicts local movement,
- reconciles using `lastProcessedSeq`.

Recommended client cleanup:

- Prefer the new flat `inputSeq`, `clientTime`, `movement`, `aim`, and `action` input shape.
- Read `ackInputSeq` directly for the local player while keeping `lastProcessedSeq` as compatibility fallback.
- Keep remote interpolation keyed by `serverTime`; avoid rendering remote snapshots immediately on arrival.
- Track and display snapshot age, RTT, jitter, and dropped stale snapshots during playtests.

## Before/After Comparison Plan

1. Record a fixed load scenario against the Node server: 10, 25, 50, and 100 clients.
2. Record `/metrics`, CPU, memory, event-loop delay, snapshot age, and outbound skips.
3. Run the same scenario against the Go server.
4. Compare tick duration p95/p99, overruns, broadcast duration, dropped outbound messages, RTT, jitter, process memory, goroutine count, and GC pauses.
5. Only then optimize serialization or switch protocol format.

