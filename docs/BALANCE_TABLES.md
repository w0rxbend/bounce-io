# Bounce IO Balance Tables

All values are taken directly from `packages/shared/src/constants.ts`. The server simulation owns authoritative values; the PixiJS client mirrors them for prediction and animation only.

## Simulation

| Constant | Value | Notes |
| --- | ---: | --- |
| Server tick rate | 60 Hz | Fixed authoritative physics step (`PHYSICS_STEP_SECONDS = 1/60`). |
| Snapshot rate | 20 Hz | Broadcast every 3rd tick (`SNAPSHOT_EVERY_N_TICKS = 3`). |
| Client render target | 60 FPS | Rendering only; client interpolates between snapshots. |
| Max players per room | 8 | Hard cap enforced at join. |
| Min players to start | 1 | Solo play is supported; countdown starts immediately. |
| Countdown | 3.0 s | Movement is not locked during countdown, but relic collection is. |
| Match hard limit | 180 s | Match ends and rank by height if no one finishes. |
| Reconnect window | 30 s | Disconnected session can resume within this window. |
| Jump input buffer | 0.10 s | Jump registered up to 100 ms before landing. |
| Coyote time | 0.09 s | Jump allowed up to 90 ms after leaving a platform edge. |
| Reconciliation tolerance | 6 px | Client correction threshold before full rollback. |
| Max delta cap | 1/15 s | Physics step clamped to prevent spiral-of-death on lag. |

## Player Movement

| Constant | Value | Notes |
| --- | ---: | --- |
| Player hitbox | 14 × 22 px | Centered inside a 24 × 32 visual sprite. |
| Run max speed (ground) | 150 px/s | Horizontal cap on the ground. |
| Run max speed (air) | 150 px/s | Same cap in air — no separate air speed limit currently. |
| Ground acceleration | 1200 px/s² | Fast, responsive start. |
| Ground deceleration (friction) | 1450 px/s² | Quick stop for precision landings. |
| Air acceleration | 760 px/s² | Enough for mid-air correction, noticeably less than ground. |
| Gravity | 820 px/s² | Applied every tick after the jump impulse. |
| Max fall speed | 420 px/s | Terminal velocity cap; keeps recovery readable. |
| Jump impulse | 315 px/s upward | Applied instantaneously; negative Y = upward. |
| Short-hop cutoff | 0.45 | Releasing jump early clamps vertical speed to `315 × 0.45 ≈ 142 px/s`. |
| Fatal fall distance | 12 m (384 px) | Player dies after falling beyond this threshold without landing; target band is 10–15 m. |
| Respawn invulnerability | 1.25 s | Visual blink required during this window. |

### Derived Jump Geometry

Maximum theoretical jump height = `JUMP_SPEED² / (2 × GRAVITY) = 315² / (2 × 820) ≈ 60.5 px ≈ 3.78 tiles`.

The chunk generator uses a 3-tile (48 px) vertical gap between layers, giving approximately 12+ px of clearance below the physics ceiling. This makes all required jumps comfortable from a standing start.

## Platform Reachability (Physics Constraints)

These values are enforced by `verifyChunkReachability` — the BFS check run on every generated chunk.

| Constraint | Value | Notes |
| --- | ---: | --- |
| Max reachable vertical gap | 3 tiles (48 px) | Derived from jump height; all chunk layers use this exact spacing. |
| Max reachable horizontal gap | 6 tiles (96 px) | Platform placement is capped relative to the previous layer's rightmost point. |
| Min platform width | 3 tiles (48 px) | Narrowest platform that can be generated. |
| Max platform width | 7 tiles (112 px) | Widest normal platform; convergence platforms can be wider. |

### Planned (Not Yet Implemented)

| Jump Type | Planned Max Vertical | Planned Max Horizontal | Status |
| --- | ---: | ---: | --- |
| Wall jump | ~58 px rise | ~92 px gap | Planned — no code yet. |
| Moving platform launch | ~50 px rise | ~112 px gap | Planned — no code yet. |

## Kick System

| Constant | Value | Notes |
| --- | ---: | --- |
| Windup duration | 0.10 s | Animation wind-up; movement locked. |
| Active duration | 0.08 s | Hit detection window. |
| Recovery duration | 0.22 s | Animation follow-through; movement locked. |
| Cooldown | 0.50 s | Time before kick can be initiated again. |
| Total kick cycle | 0.90 s | Windup + active + recovery + cooldown. |
| Kick range | 20 px | Forward from the player's facing edge. |
| Ground kick force | 260 px/s | Horizontal impulse applied to target when kicker is grounded. |
| Air kick force | 160 px/s | Reduced impulse when either player is airborne. |
| Upward bump | 60 px/s upward min | Applied to target if their vertical speed is above −60 px/s. |
| Hit invulnerability | 0.35 s | Target cannot be kicked again during this window. |

The kick cooldown bar renders as a 18 px wide bar below the player sprite. It is visible during windup, active, recovery, and the full cooldown phase.

## Passive Push

| Constant | Value | Notes |
| --- | ---: | --- |
| Push force | 800 px/s² | Applied proportional to AABB overlap width. |
| Max push velocity | 120 px/s | Cap on push-induced velocity change per tick. |
| Air push factor | 0.35 | Force multiplied by this when either player is airborne. |

Push fires every physics tick when two player AABBs overlap. The impulse scales with the overlap width (overlap × 15 × air factor), capped at `PLAYER_MAX_PUSH_VELOCITY`. Both players are pushed apart symmetrically based on their horizontal center distance.

## World Geometry

| Constant | Value | Notes |
| --- | ---: | --- |
| Tile size | 16 × 16 px | All geometry snaps to this grid. |
| World width | 384 px | 24 tiles wide; solid walls outside this boundary. |
| Chunk width | 24 tiles (384 px) | Same as world width — chunks span the full horizontal extent. |
| Chunk height | 18 tiles (288 px) | Vertical extent of one generated chunk. |
| Layer vertical gap | 3 tiles (48 px) | Fixed gap between every intermediate platform layer. |
| Convergence platform width | 7–11 tiles | Randomly chosen; forced to center. |
| Right-lane coin threshold | x-center > 60% of chunk width | Platforms further right than this receive a relic above them. |
| Max relics per chunk | 5 | Hard cap in generation code. |

## Procgen Difficulty Scaling

Difficulty = `min(1.0, chunkY / 20)` — reaches full difficulty at chunk 20 and stays there.

| Parameter | At chunk 0 | At chunk 20+ |
| --- | ---: | ---: |
| Convergence layer chance | 15% | 40% |
| Right-lane hazard spike chance | 0% | 55% |

## Pickups

| Item | Value | Respawn | Placement |
| --- | ---: | --- | --- |
| Relic (coin) | 1 | Never (match-persistent) | Above right-lane platforms only. |

## Planned Features (Not Yet Implemented)

| Feature | Planned Value | Notes |
| --- | --- | --- |
| Wall slide max speed | 95 px/s | Moss-marked walls only. |
| Wall jump X impulse | 190 px/s | Away from wall. |
| Wall jump Y impulse | 300 px/s upward | Slightly less than ground jump. |
| Moving platform horizontal speed | 48–68 px/s | Early vs late chunks. |
| Moving platform vertical speed | 38 px/s | Capped to avoid motion sickness. |
| Checkpoint respawn time | — | Per-player; not yet tracked. |
| Hazard spike damage | Knockback | Tiles render but deal no damage currently. |
| Portal lockout | 0.20 s | After teleport exit; portals are decorative only currently. |
| Portal exit invulnerability | 0.45 s | Hazards only; not implemented. |
