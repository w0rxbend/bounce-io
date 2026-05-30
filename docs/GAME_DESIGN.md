# Bounce IO — Game Design

## Pillars

- Competitive vertical race: every match is a short climb where position, tempo, and risk path choice matter more than elimination.
- Readable pixel action: silhouettes, hazards, coins, portals, and opponent states must be recognizable at browser scale.
- Authoritative multiplayer: the Hono WebSocket server owns simulation, scoring, collisions, pickups, and finish order.
- Expressive movement: jumps are predictable, recoveries are possible, and skilled routes create measurable leads.
- Direct rivalry: players can kick and push each other off ledges — physical confrontation is part of the race, not separate from it.

## Match Format

- Players: 1–8 concurrent racers (solo play is supported).
- Match start: countdown begins the moment the first player joins. The 3-second countdown ends with a "GO!" signal.
- Objective: race upward through procedurally-generated forest-ruin chunks and be the first to exit chunk 5.
- Win condition: the first player whose position reaches the exit platform of chunk index 5 (or above) ends the match. Remaining placements are assigned by vertical height, then coin count.
- Match timeout: 180 seconds. If no player has finished, the match ends and rank is determined by vertical progress.
- Respawn: falling more than 12 m without landing kills the player and returns them to the entry platform of the highest chunk reached by that player.

## World Structure

The world is an endless vertical column of generated chunks. There is no fixed map height.

- World width: 384 px (24 tiles × 16 px per tile).
- Tile size: 16 × 16 px.
- Chunk dimensions: 24 tiles wide × 18 tiles tall (384 × 288 px per chunk).
- Chunks are numbered from 0 (spawn) upward. Higher chunk index = higher altitude.
- The server generates chunks on demand as players climb. There is no ceiling.
- Match end is triggered when the first player reaches chunkY ≥ 5.
- Chunk generation is seeded from the room ID, so all clients share the same world.

## Core Loop

1. Spawn at the entry platform of chunk 0.
2. Climb through procedurally-generated platform layers — left (recovery), center (main), right (risk).
3. Collect coins (relics) on optional right-lane risk paths.
4. Kick or push rival players off ledges to slow them down.
5. Reach the exit platform at the top of chunk 5 first to win.

## Player Movement

- Horizontal run: fast acceleration (1200 px/s²), same max speed on ground and in air (150 px/s).
- Jump: 315 px/s upward impulse with coyote time (0.09 s) and input buffering (0.10 s).
- Short-hop: releasing jump early cuts vertical speed to 45% of full jump impulse.
- Gravity: 820 px/s², terminal fall speed 420 px/s.
- Drop-through: holding S (down) while on a one-way platform drops the player through it.
- Movement is locked during kick windup, active, and recovery phases.

## Kick System

Pressing F initiates a kick that launches nearby opponents horizontally.

| Phase    | Duration |
|----------|----------|
| Windup   | 0.10 s   |
| Active   | 0.08 s   |
| Recovery | 0.22 s   |
| Cooldown | 0.50 s   |

- Range: 20 px in front of the player's facing direction.
- Ground kick force: 260 px/s horizontal impulse.
- Air kick force: 160 px/s (reduced when kicker or target is airborne).
- Target receives 0.35 s of invulnerability after being hit to prevent chain-kick spam.
- A small upward bump is applied to the kicked player for visual clarity.
- A kick cooldown bar displays beneath the player sprite during cooldown.

## Passive Push

When player hitboxes (14 × 22 px) overlap, a passive separation force is applied.

- Push force: 800 px/s² applied proportional to overlap width.
- Max push velocity: 120 px/s cap on push-induced velocity change.
- Air push factor: 0.35 — pushes are significantly weaker when either player is airborne.
- This prevents players from simply stacking on the same platform.

## Multiplayer Rules

- Server tick rate: 60 Hz (authoritative physics step).
- Snapshot broadcast rate: 20 Hz (every 3rd tick) — clients interpolate between snapshots.
- Client render target: 60 FPS with client-side prediction and server reconciliation.
- Client sends input commands (not positions); the server owns all simulation.
- Reconciliation tolerance: 6 px — corrections below this threshold are silently absorbed.
- Reconnection window: 30 seconds. A disconnected session can resume within this window.
- Room capacity: 8 players maximum.
- Min players to start: 1 (a solo player triggers the countdown immediately).

## Procgen Chunk Design

Each chunk contains:

- Entry platform: 6 tiles wide, centered, at the bottom of the chunk (row 16 of 18).
- 4 intermediate layers spaced 3 tiles (48 px) apart vertically.
- Exit platform: 6 tiles wide, centered, at the top of the chunk (row 1).
- Solid floor tile row only in chunk 0. Upper chunks leave their bottom row passable so they do not become ceilings over the chunk below.

Each non-convergence intermediate layer has three parallel platforms:

- Left lane (recovery): wider platforms (3–5 tiles), positioned around x ≈ 5. Safer, slightly slower.
- Center lane (main): medium width (3–7 tiles), centered. The default route.
- Right lane (risk): narrower platforms (3–4 tiles), positioned around the right side. Coins placed here; hazard spikes appear at higher chunks.

Convergence layers (15–40% chance, scaling with altitude) replace the three lanes with a single wide central platform — a natural PvP arena where players are funneled together.

Coins (relics) are placed one tile above right-lane platforms whose center x exceeds 60% of chunk width. Maximum 5 relics per chunk.

Difficulty scales with chunk index (capped at 1.0 at chunkY = 20):
- Convergence frequency increases from 15% to 40%.
- Hazard spike probability on right-lane platforms scales up to 55%.

A BFS reachability check is performed on every generated chunk before it is used. All platforms must be reachable from the entry platform within the physics constants (max 3-tile vertical gap, max 6-tile horizontal gap). The server logs warnings if issues are detected. Regression tests also assert that upper chunk bottom rows remain non-solid and do not create full-width blockers.

Portals are placed at the exit platform of each chunk as visual goals. They are decorative-only in the current build — they do not teleport players.

## Interactive Objects

### Coins (Relics)

- Value: 1 per relic.
- Placed above right-lane (risk) platforms only.
- Server owns collection; once collected, the relic is removed for all players.
- Coin burst particles play at the collection point.
- Coins affect secondary ranking (tiebreaker) but do not determine the winner.

### Portals (Decorative)

- A stone arch with cyan swirl animation sits at the exit of each chunk.
- The arch signals the upward path and marks the transition zone.
- Portal teleportation is not yet implemented (see Roadmap).

### Checkpoints

- Each player has a server-owned checkpoint chunk.
- The checkpoint advances when the player first reaches a higher chunk.
- Respawn returns the player to that chunk's entry platform and clears old prediction/velocity state on the client.
- Checkpoint notifications are emitted only from authoritative server events.

### Hazard Tiles

- Hazard tiles (stone spikes) render on right-lane platforms at higher chunks.
- They are purely visual in the current build — no damage is dealt on contact.
- Hazard damage is planned (see Roadmap).

## Scoring and Ranking

- Primary rank: finish order (first to exit chunk 5 wins).
- Secondary rank: vertical height (chunk index, then pixel y-position).
- Tertiary rank: coin count.
- Coins feed the tiebreaker and post-match scoreboard, but a slower finisher cannot beat a faster finisher through coins alone.

## Controls

| Key          | Action                        |
|--------------|-------------------------------|
| A / D        | Run left / right              |
| Space / W    | Jump (hold for full jump)     |
| S            | Drop through platform         |
| F            | Kick                          |
| F1           | Toggle debug overlay          |
| F2           | Force respawn                 |
| F3           | Regenerate world (local only) |

## UI

- HUD: fantasy stone panel in the top-left corner showing coin count, height in meters, rank (e.g. #1/4), and server ping.
- Phase banners: "WAITING…", "GET READY!", "GO!", "FINISHED!" shown centered on screen.
- Player nameplates: small monospace labels floating above each player sprite.
- Crown icon shown above the current leader.
- Scoreboard panel (HTML sidebar): lists all players sorted by height with coin count.
- Notifications: brief floating pop-ups for relic collect, player join/leave, and match phase changes.
- Debug overlay (F1): FPS bar, ping bar, velocity bars, grounded indicator, chunk depth, prediction buffer, particle count.

## First Production Slice — What Is Implemented

- Endless procedurally-generated vertical world (chunk-based, reachability-verified).
- Passable chunk boundaries: only chunk 0 has a solid floor; upper chunks no longer create solid floor ceilings.
- 1–8 player multiplayer over WebSocket (solo play works without a server).
- Authoritative 60 Hz server simulation with 20 Hz snapshot broadcast.
- Client-side prediction and server reconciliation.
- Full kick system (windup/active/recovery/cooldown, range check, impulse).
- Passive push (AABB overlap separation).
- Coin (relic) collection synced across all players.
- Server-owned checkpoint chunks with respawn to the highest reached chunk entry.
- Procedural pixel-art rendering (no texture atlas): sky parallax, tiled platforms with moss/grass/roots/runes, portals, coins, player sprites with scarf and kick animations.
- HUD with coin count, height, rank, ping.
- Match lifecycle: waiting → countdown → playing → finished.
- Respawn to the highest reached chunk entry on fall-through.

## Roadmap — Not Yet Implemented

The following features are designed and partially specified but not present in the current build:

- **Wall slide / wall jump**: grip on moss-marked vertical faces. Physics stubs exist in the design but no code.
- **Moving platforms**: platforms that travel horizontally or vertically on a server-owned cycle.
- **Crumble platforms**: platforms that break after a short delay when stood on.
- **Portal teleportation**: functional paired portals that instantly move players between entry and exit points.
- **Hazard damage**: hazard spike tiles already render and place themselves; contact damage is not yet applied.
- **Biome system**: chunk generation is currently uniform. Future plan is to shift tile visuals and platform patterns per altitude band — e.g. Rootfall (low), Broken Canopy, Lantern Ruins, Sky Shrine (high). Generation parameters would shift per biome zone, but the chunk-based procgen architecture already supports this.
- **Post-match ranking panel**: a full end-of-match overlay showing finish order, time, coins, and deaths.
- **Cosmetic variety**: palette-swapped scarfs, player color selection, named presets.
