# Performance Diagnostics

Use this before optimizing. The goal is to decide whether a bad run is render-bound, update-bound, chunk-bound, network-bound, or server-bound.

## Client Overlay

Start the client with diagnostics enabled:

```bash
npm run dev:client
```

Open:

```text
http://localhost:5173/?debug=1
```

Hotkeys:

- `I`: inspection overlay with camera/AOI/chunk/entity bounds and focused runtime stats.
- `F1`: lightweight performance overlay, updated about four times per second.
- `Shift+F1`: heavier world/chunk overlay.

Record these fields during local and online runs:

- FPS and frame current/average/p95.
- update, render estimate, render prep, simulation, network apply.
- visible/rendered/loaded entities.
- visible/loaded chunks and current zoom.
- display object, sprite, graphics, text, and particle counts.
- long frames and long tasks.
- local speed, render delta, and authoritative delta.
- RTT, jitter, interpolation delay, stale drops, correction count, hard snaps, extrapolations, and snapshot queue.

## Server Metrics

Start the Go server:

```bash
npm run dev:server:go
```

Capture metrics as NDJSON:

```bash
node tools/record-server-metrics.mjs \
  --url http://127.0.0.1:8787/metrics \
  --duration-ms 60000 \
  --interval-ms 1000 \
  --label online-2p \
  --out perf-online-2p.ndjson
```

The recorder keeps one line per sample and includes room tick duration, snapshot build/send duration, queue depth, AOI counts, websocket bytes/sec, goroutines, heap, and GC pause data.

## Repro Scenarios

Local solo baseline:

1. Open `http://localhost:5173/?debug=1`.
2. Start local play.
3. Climb for 60 seconds.
4. Note frame p95, long frames, loaded chunks, rendered entities, and local render delta.

Online 2-player baseline:

1. Start the Go server.
2. Start metrics recording with label `online-2p`.
3. Open two browser windows at `http://localhost:5173/?debug=1`.
4. Join the same room and climb for 60 seconds.
5. Compare client frame p95 and movement deltas with server tick/build/send duration and per-client queue depth.

Load baseline:

```bash
cd apps/server-go
go run ./cmd/loadtest -url ws://127.0.0.1:8787/ws?room=load -clients 25 -duration 60s -latency 40ms -jitter 20ms
go run ./cmd/loadtest -url ws://127.0.0.1:8787/ws?room=load -clients 50 -duration 60s -burst-every 3s -slow-clients 5
```

Capture `/metrics` in parallel with `tools/record-server-metrics.mjs`.

## Interpreting A Run

| Symptom | Likely owner | Evidence |
| --- | --- | --- |
| Frame p95 high while server tick is low | Client rendering/update | render prep, display objects, chunks, entities, long tasks |
| Update or simulation time high | Client game loop | update/sim metrics, loaded chunks/entities |
| Network apply or parse high | Client protocol | netapply, parse max, snapshot size |
| RTT/jitter high but frame p95 fine | Network path | RTT, jitter, snapshot age |
| Corrections or hard snaps rise | Movement/reconciliation | auth delta, correction count, hard snap count |
| Server tick/build/send high | Server/world/AOI | tick duration, snapshot build/send, AOI counts |
| Queue depth or dropped outbound rises | Server backpressure | per-client queue depth, dropped outbound, bytes/sec |
| Heap/GC pauses rise over time | Server lifecycle | heap, num GC, last GC pause, world object counts |

Do not make FPS optimizations until one of these rows has evidence from the overlay or recorded server metrics.

When using agents for performance work, have them enable `I` during local and online repros and reference the inspection readings that support each proposed optimization.
