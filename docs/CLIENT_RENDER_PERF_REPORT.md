# Client Render Performance Report

Date: 2026-05-30

## Summary

This pass investigated PixiJS frame-time instability as a contributor to multiplayer jitter. The client already had several good foundations: pooled particles, `ParticleContainer`, cached static graphics, culling windows, fixed-step local prediction, and adaptive visual quality.

The main gap was observability. The old debug overlay exposed EMA frame/update numbers, but not percentile frame time, render estimate, network apply cost, long-task spikes, or display-tree composition. That made it hard to distinguish network correction jitter from CPU/render spikes.

## Implemented

- Added renderer experiment flags:
  - `?renderer=webgl`
  - `?renderer=webgpu`
  - `?resolution=1`
  - `?aa=1`
- Added frame-time ring buffer with p50, p95, and p99.
- Added a small frame-time graph in the F1 debug overlay.
- Added approximate post-render timing using Pixi ticker priority after the app render listener.
- Added network snapshot apply timing and entity apply timing.
- Added entity sprite update, particle update, and UI/debug update timings.
- Added display-tree counters:
  - total visible display objects,
  - visible sprites,
  - Graphics objects,
  - Text objects,
  - ParticleContainer particles,
  - active filters.
- Added browser long-task instrumentation via `PerformanceObserver` when supported.
- Added optional heap-used reporting where `performance.memory` exists.
- Tightened adaptive quality: auto mode now also reacts to p95 frame time, long tasks, and snapshot backlog.
- Avoided redundant HUD phase text updates in the hot path.

## Current Findings

Client FPS/frame spikes can contribute to visible multiplayer jitter because a bad frame delays input sampling, delays snapshot application, and makes visual correction more noticeable. The previous networking pass already prevents large physics deltas from producing unbounded prediction replay, and this pass adds the missing render-side measurement.

The likely PixiJS hotspots to watch in the new overlay are:

- `gfx`: dynamic `Graphics` objects, especially debug/world overlays and procedural scenery.
- `text`: HUD/debug text updates.
- `particles`: effect and mountain crumble particles.
- `prep`: chunk render queue, scenery animation, procedural flora/tree updates.
- `netapply`: JSON parse/apply and snapshot processing.

## WebGL/WebGPU Benchmark Matrix

Run the client with:

```bash
./node_modules/.bin/vite --host 127.0.0.1 --port 4177
```

Then compare:

```text
http://127.0.0.1:4177/?perf=auto&renderer=webgl&resolution=1
http://127.0.0.1:4177/?perf=auto&renderer=webgl&resolution=2
http://127.0.0.1:4177/?perf=auto&renderer=webgpu&resolution=1
http://127.0.0.1:4177/?perf=medium&renderer=webgl&resolution=1
http://127.0.0.1:4177/?perf=low&renderer=webgl&resolution=1
```

Use F1 in-game and record:

- FPS average,
- p95/p99 frame time,
- update/render estimate,
- particles/UI/entity/network apply timing,
- correction distance,
- snapshot age,
- object/sprite/graphics/filter counts.

## Shader Candidates

Not implemented in this pass. The strongest candidates remain visual-only effects:

- wind sway for trees/grass/vines,
- portal shimmer,
- crystal glow,
- atmospheric background waves.

Recommendation: implement these only after the new overlay shows CPU-side scenery animation as a measured bottleneck. Avoid full-screen filters on low-end profiles.

## Recommendation

Keep the current PixiJS renderer defaults as WebGL-first for compatibility, then test WebGPU through `?renderer=webgpu` on supported browsers. Prioritize stable p95 frame time over richer decoration in multiplayer. If p95 exceeds 22 ms for several seconds, auto quality should reduce particles/scenery updates before network smoothing becomes visible.
