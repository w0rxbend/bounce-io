# Skybound Relics Platform Rules

These rules describe the actual procedural chunk generation system and the design constraints that govern it. See `packages/shared/src/generation.ts` for the implementation and `packages/shared/src/constants.ts` for the physics values that constrain placement.

## Coordinate System

- World units are pixels.
- Positive X moves right; positive Y moves downward.
- The race climbs toward lower Y values (higher chunks have more negative world Y).
- Tile coordinates: `(tileX, tileY)` where `tileY = 0` is the top of the tile grid.
- Chunk 0 covers world tile Y range `[0, 17]`; chunk 1 covers `[-18, -1]`; chunk N covers `[-N×18, -N×18 + 17]`.
- All platform geometry aligns to the 16 px tile grid.

## Chunk Anatomy

Every generated chunk is 24 tiles wide × 18 tiles tall (384 × 288 px).

```
row  0  :  [empty]
row  1  :  EXIT PLATFORM (6-wide, centered)
row  2  :  [empty]
row  3  :  [empty]
row  4  :  intermediate layer 4 (3-lane or convergence)
row  5  :  [empty]
row  6  :  [empty]
row  7  :  intermediate layer 3
row  8  :  [empty]
row  9  :  [empty]
row 10  :  intermediate layer 2
row 11  :  [empty]
row 12  :  [empty]
row 13  :  intermediate layer 1
row 14  :  [empty]
row 15  :  [empty]
row 16  :  ENTRY PLATFORM (6-wide, centered)
row 17  :  SOLID FLOOR
```

- Entry platform: always centered, 6 tiles wide, at row 16 (one row above the solid floor).
- Exit platform: always centered, 6 tiles wide, at row 1 (one row below the top edge).
- Intermediate layers: 4 layers at rows 4, 7, 10, 13 — each exactly 3 tiles above the next.
- Solid floor: row 17 is always a full-width solid row. It is the only solid row; all intermediate platforms are one-way.
- No full-width solid rows in the intermediate section (enforced by design).

## Three-Lane Layout

Each non-convergence intermediate layer contains three platforms placed in parallel horizontal zones:

| Lane | Position | Width | Character |
| --- | --- | --- | --- |
| Left (recovery) | x-center ≈ 3–7 tiles | 3–5 tiles | Wider, safer, slightly slower route. |
| Center (main) | x-center ≈ 10–14 tiles (± 2) | 3–7 tiles | Standard route, medium width. |
| Right (risk) | x-center ≈ 16–20 tiles | 3–4 tiles | Narrower, coins here, hazard spikes at higher altitude. |

A minimum 2-tile horizontal gap is enforced between all platforms on the same row. If spacing would violate this, platforms are shifted rightward. The rightmost platform is additionally capped to stay within 6 tiles (horizontally) of the previous layer's rightmost endpoint, preventing platforms that are unreachable due to convergence-induced narrowing in the layer below.

## Convergence Layers

At roughly 15–40% chance per layer (scaling with altitude), a layer is replaced by a single wide convergence platform spanning the center:

- Width: 7–11 tiles, randomly chosen.
- Position: centered (with up to ±1 tile randomization).
- Acts as a natural PvP zone where players funnel together and kicks become high-value.
- After a convergence layer, the rightmost tracking point resets to the convergence platform's right edge, which constrains the next regular layer's right-lane placement.

## Coin (Relic) Placement

- Coins are placed one tile above the surface of right-lane platforms.
- A platform qualifies as right-lane if its horizontal center exceeds 60% of the chunk width (i.e., x-center > 14.4 tiles).
- Convergence platforms do not receive coins (their center is at ≈ 50% of chunk width).
- A tile that already contains a hazard or relic is skipped.
- Maximum 5 relics per chunk.

## Hazard Spike Placement

- Hazard tiles are placed one tile above right-lane platforms at intermediate layers 2 and above.
- Probability scales from 0% at chunk 0 to 55% at chunk 20+.
- Hazards render as stone spikes. They do not deal damage in the current build (see Roadmap in GAME_DESIGN.md).

## Reachability Enforcement

After generation, every chunk is verified by a BFS reachability check (`verifyChunkReachability` in `generation.ts`):

- The entry platform (index 0) is the BFS root.
- A platform B is considered reachable from platform A if:
  - B is above A (lower tile Y).
  - The vertical gap from A to B is at most 3 tiles (48 px).
  - The horizontal gap (overlap or separation) between A and B is at most 6 tiles (96 px).
- All platforms must be reachable from the entry platform.
- The server logs warnings for any chunk with reachability issues. Tests verify 250 chunks across 5 seeds.

## Physics Grounding for Gap Values

The 3-tile vertical gap is derived directly from physics:

- Max jump height = `JUMP_SPEED² / (2 × GRAVITY) = 315² / 1640 ≈ 60.5 px ≈ 3.78 tiles`.
- A 3-tile (48 px) gap leaves 12+ px of clearance — comfortable for all platform widths.
- The 6-tile horizontal cap is conservative relative to the running jump range but ensures reachability even after a brief stop.

## Tile Collision Semantics

| Tile Type | Collision Behavior |
| --- | --- |
| `solid` | Blocks movement from all directions. Used for the chunk floor and world side walls. |
| `oneWay` | Player lands when falling downward from above. Pass-through upward and when holding drop (S). |
| `empty` | No collision. |
| `relic` | No collision. Collected by proximity check on the server. |
| `hazard` | No collision currently. Visual only (damage planned). |

All intermediate platforms are `oneWay`. The solid floor row is `solid`. There are no solid walls within the chunk interior.

## Multi-Chunk Tile Map

The server and client maintain a `MultiChunkTileMap` that spans all loaded chunks simultaneously. Lookup uses the world tile coordinate:

- `chunkY = -floor(tileY / CHUNK_HEIGHT_TILES)`
- `localY = tileY + chunkY × CHUNK_HEIGHT_TILES`
- Out-of-bounds left/right → `solid` (world walls).
- Below chunk 0 floor → `solid`.
- Unloaded chunk area → `solid` at floor level, `empty` above.

The server pre-generates chunks 0 and 1 at room creation, then generates ahead of each player as they climb (always 2 chunks ahead). The client generates chunks locally using the same seed until the server sends an authoritative version.

## Portal Placement

A stone arch portal is placed at the exit platform of each chunk (tile coordinates: `chunk.exit.x, worldTileY + chunk.exit.y`). This is purely decorative. The arch width scales with the exit platform width. Portal teleportation is not yet implemented.

## Collision Rules (Physics)

- Player hitbox: 14 × 22 px.
- Hitbox is the truth for collision. Art extends outside the hitbox but should not imply a larger collision body.
- Horizontal resolution: resolves against `solid` tiles only on left/right faces.
- Vertical resolution (falling, dy > 0): resolves against `solid` tiles first, then `oneWay` tiles when player is not holding drop and velocity is downward.
- Vertical resolution (rising, dy < 0): resolves against `solid` tiles only (players pass through `oneWay` from below).
- A `oneWay` landing sets `grounded = true` and resets the coyote timer.

## Multiplayer Platform Notes

- Spawn lanes: all players spawn on the entry platform of chunk 0. The spawn x-position is `floor(CHUNK_WIDTH_TILES / 2) × TILE_SIZE` = 192 px (center).
- The entry platform is 6 tiles wide (96 px), which comfortably supports 2–3 players side by side.
- Passive push prevents players from indefinitely stacking on the same tile.
- No platform is marked as player-exclusive; any player can stand anywhere.

## Future Platform Features (Planned, Not Implemented)

The chunk-based architecture is designed to accommodate these future additions without restructuring the core layout:

- **Checkpoints**: a checkpoint marker on the entry platform of certain chunks would allow respawning at that chunk instead of chunk 0.
- **Moving platforms**: platforms that travel on a server-owned linear path within a layer's row. Would require the server to broadcast phase time so clients can interpolate platform position.
- **Crumble platforms**: one-way platforms that break after a player stands on them for ~0.65 s. Reset after 2.5 s.
- **Biome themes**: the generation parameters (platform width distributions, convergence frequency, hazard density, tile visual style) are already isolated per chunk. A biome selector keyed on chunk altitude ranges (e.g. chunks 0–5 = Rootfall, 6–12 = Broken Canopy, 13–20 = Lantern Ruins, 21+ = Sky Shrine) would require only a parameter table and visual skin per biome — no structural changes to the chunk format.
- **Wall-slide surfaces**: moss-marked vertical tile variants that enable wall slide and wall jump. No special tile type exists yet; this would require a new `mossy` tile kind and physics branch.
