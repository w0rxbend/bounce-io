# Bounce IO Sprite Sheet Spec

## Current Approach: Procedural Pixel Art

The game currently uses no sprite sheet atlases or external image assets. All visuals are drawn programmatically at runtime using PixiJS `Graphics` primitives (`rect`, `poly`, `circle`, `ellipse`) in `apps/client/src/main.ts`.

This approach was chosen for fast iteration: changing a color, shape, or animation is a code edit with immediate results and no asset pipeline. The pixel-art grammar described below documents what is being drawn programmatically, and serves as the specification for a future sprite atlas migration.

## Pixel Art Grammar

- Base tile size: 16 × 16 px.
- Character visual frame: 24 × 32 px (hitbox is 14 × 22 px, offset x+5 y+5 inside the frame).
- UI pixel unit: 4 px.
- Render mode: nearest-neighbor sampling (`TextureStyle.defaultOptions.scaleMode = "nearest"`), `roundPixels: true`, `antialias: false`.
- No subpixel blur, soft shadows, smeared glow, or antialiasing.
- All coordinates are integer-snapped before drawing.

## Player Sprite (Procedural)

The player is drawn entirely in `drawPlayerInto()`. The visual frame is 24 × 32 px; the hitbox is 14 × 22 px.

### Structural regions (bottom to top)

| Region | Pixels (relative to hitbox origin) | Colors |
| --- | --- | --- |
| Shadow ellipse | Below feet | Black, alpha 0.28 |
| Legs (2 rects) | Bottom 7–8 px | `canopyDark` |
| Body / jacket | Middle band | Player accent color |
| Outline | 1 px border around full sprite | `uiInk` |
| Body base | Full sprite rect | `0x485058` (neutral dark) |
| Head | Top 8 px | `skinLight` |
| Hair | Top 3 px of head | `hairDark` |
| Eye | 2 × 2 px, facing side | `uiInk` with 1 px white glint |

### Dynamic elements

- **Scarf trail**: 3 horizontal rects trailing opposite to movement direction. Length scales with speed and kick phase. Colors: `scarfPrimary`, `scarfShade`. Alpha fades per segment.
- **Squash and stretch**: landing compresses height (squash up to 3 px), fast falling stretches height (up to 4 px) and slightly widens.
- **Kick offset**: sprite shifts `fx × -2` px (windup), `fx × +5` px (active), `fx × +2` px (recovery).
- **Kick foot**: during active phase, an 8 × 5 px rect extends forward from the sprite at leg height.
- **Leg animation**: when grounded and moving faster than 18 px/s, legs swing with a sine offset keyed to elapsed time.
- **Invulnerability blink**: player is hidden on alternate 80 ms intervals when `invulnerable > 0`.
- **Crown**: small pixel-art crown (gold base, 3 points, accent gem) drawn above the current leader.
- **Kick cooldown bar**: 18 px wide, 2 px tall, drawn 7 px above the player when kick is not idle.
- **Nameplate**: 7 px monospace `Text` with `uiParchment` fill and `uiInk` stroke, centered above the player.

### Player color assignment

| Index | Hex | Assignment |
| --- | --- | --- |
| 0 | `0xf3c64b` | Local player (gold) |
| 1 | `0x48d6ff` | Remote player 1 (cyan) |
| 2 | `0x9b6dff` | Remote player 2 (violet) |
| 3 | `0x5dff9c` | Remote player 3 (green) |
| 4 | `0xff6b6b` | Remote player 4 (red) |
| 5 | `0xff9f4a` | Remote player 5 (orange) |
| 6 | `0xe8c8ff` | Remote player 6 (lavender) |
| 7 | `0x69a969` | Remote player 7 (muted green) |

## Environment Tiles (Procedural)

All tiles are drawn in `drawTile()` with per-tile deterministic pseudo-random seeds derived from tile coordinates.

### One-way platform tile (16 × 16 px)

1. Dark outline: full 16 × 16 rect in `stoneShadow`.
2. Stone body: 14 × 14 inset rect, color lerped between `stoneMid` and `stoneWorn` based on chunk altitude.
3. Brick mortar seams: 1 px horizontal line at y+8, two staggered 1 px vertical seams (alternating rows). Alpha 0.38–0.50.
4. Top highlight: 1 px strip at y+1 in `stoneLight`, alpha 0.22.
5. Right-edge shadow: 1 × (h-3) px strip at x+14, alpha 0.20.
6. Moss patch (1 in 3 tiles): 3 × 2 px rect in `mossGreen` with 2 × 1 px bright highlight in `mossBright`.
7. Altitude rune glow (rare, chunks 16+): 2 × 4 px rect in `runeGlow`, alpha 0.38–0.63.
8. Grass top (when tile above is empty): soil band in `soilWarm`, grass layer in `grassDark`/`grassTop` lerped toward `mossBright` at altitude. Tiny 1 px grass tufts above the tile edge. Occasional 1 px flower (pink, gold, or white).
9. Hanging roots (when tile below is empty): `soilDark`/`soilWarm` underside band. 2–4 hanging root segments in `soilRoot`. Occasional 2 px wide vine in `mossGreen`.

### Solid floor tile (16 × 16 px)

Dark outline (`stoneShadow`), dark body (`stoneDark`), faint top highlight (`stoneMid`, alpha 0.25).

### Hazard spike tile (16 × 16 px)

5 px base in `hazardBase` with a red top edge. Three triangle spikes in `hazardRed` with `hazardGlow` shafts and white 1 px tip gleams.

## Coin (Relic) Animation (Procedural)

Drawn in `updateRelicAnims()` each frame. Each coin has a container that bobs vertically (`sin(t × 3.0 + tileX × 0.8) × 2.5` px).

- 4-frame spin cycle at 5 FPS: widths are 8, 5, 2, 5 px.
- Gold rect in `coinGold` with `coinGlow` top strip and `coinShade` right edge (when wide enough).
- Glow halo: slightly wider rect in `coinGlow`, alpha 0.28.
- On collection: `coinBurst()` spawns 8 outward gold particles and 8 inner glow particles.

## Portal Animation (Procedural)

Drawn in `updatePortals()` each frame. Each portal has a static stone arch (`bodyGfx`) and an animated glow interior (`glowGfx`).

### Static arch (drawn once at spawn)

- Left and right stone pillars (5 × ph px) in `stoneDark` with `stoneWorn` cap stones and moss patches.
- Lintel crossbar in `stoneDark` with `stoneWorn` top edge.
- Rune glow on lintel center: `runeGlow`, alpha 0.3–0.5. Exit portals have additional side runes.
- Hanging vines from lintel: 1 px wide `mossGreen` segments with leaf tips in `canopyMid`.

### Animated glow interior (redrawn each frame)

- Fill rect inside arch opening, color `portalBlue` (exit) or `uiHighlight` (entry), alpha pulses with a sine wave.
- Bright central column (4–6 px wide), same color, higher alpha.
- 4–6 horizontal scan lines animated with a sine offset to simulate flowing energy.
- 3–5 orbiting rune dots following an elliptical path around the arch center.
- Exit portal: bright white center flash when pulse exceeds 0.85.

## Sky and Parallax Layers (Procedural)

Drawn in `buildSkyStatic()` (rebuilt on resize and when clouds drift off-screen) and animated in `updateSkyParallax()` each frame.

| Layer | Content | Parallax Y factor | Drift |
| --- | --- | ---: | --- |
| Sky gradient | 5 horizontal bands, `skyMid`/`skyDeep`/`skySpace`/`skyGround` lerped by altitude | — | None |
| Horizon haze | Thin strip at screen bottom, `skyHaze`, alpha fades at altitude | — | None |
| Sun glow | Warm golden concentric circles, `0xf8e080`, lower-right quadrant. Fades at altitude | — | None |
| Stars | 100 dots (1–2 px), `starBright`, deterministic positions. Visible at altitude | 0.0 | None |
| Distant islands | 12 silhouette islands with grass tops and tree silhouettes, `islandFar` | 0.05 | None |
| Ancient towers | 7 tower silhouettes with battlements and window glow, `ruinsDark` | 0.11 | None |
| Far clouds | 10 pixel-art puffy clouds, `cloudMid`/`cloudFar`, alpha 0.42 | 0.20 | 6 px/s |
| Mid clouds | 7 clouds, `cloudMid`/`cloudShadow`, alpha 0.60 | 0.34 | 11 px/s |
| Front clouds | 5 large warm-lit clouds, `cloudWarm`/`cloudShadow`, alpha 0.72 | 0.50 | 18 px/s |

Each cloud layer drifts horizontally. When `cloudDriftFar` exceeds screen width + 80 px, all cloud layers are rebuilt from scratch at offset 0.

## HUD (Procedural)

The HUD is drawn in `buildHudPanels()` (static geometry) and `updateHud()` (dynamic text and icons).

### Stone panel (left top)

82 × 56 px panel drawn with:
- Drop shadow (3 px offset, black, alpha 0.5).
- Dark stone body (`0x080e18`).
- 2 px dark border edges (`0x040810`).
- Inner top-left highlight strip (`0x2a4060`).
- 1 px cyan top accent strip (`uiHighlight`, alpha 0.55).
- Moss corner dots (`mossGreen`/`canopyDark`).

### HUD elements

| Element | Position in panel | Type |
| --- | --- | --- |
| Coin icon | x:10, y:10 | Procedural 4-frame spin (same grammar as world coins) |
| Coin count | x:28, y:10 | `Text`, `coinGold`, 9 px monospace bold |
| Height arrow icon | x:10, y:28 | 3-rect upward arrow in `uiHighlight` |
| Height in meters | x:28, y:26 | `Text`, `uiParchment`, 10 px monospace bold |
| Rank | x:10, y:52 | `Text`, `uiParchment`, 8 px monospace |
| Ping | right-aligned in panel, y:52 | `Text`, `0x486878`, 8 px monospace |
| Phase banner | Screen center, y:10 | `Text`, `uiHighlight`, 11 px monospace bold |

### Notification toasts

Pop-up panels that float upward and fade. Each uses the same stone panel grammar at a smaller size. Text colors: `coinGold` for relics, `uiCyan` for joins, `uiGray` for leaves, `uiParchment` for match events.

## Particle System (Procedural)

`spawnPart()` allocates `Graphics` objects from a pool. Each particle has position, velocity, gravity, lifetime, and color.

| Effect | Count | Colors | Gravity |
| --- | --- | --- | --- |
| Jump dust | 5 | `stoneMid` | Default (200 px/s²) |
| Land dust | up to 10 | `stoneLight` | Default |
| Kick spark | 7 + 1 flash | Player accent color | Default |
| Coin burst | 8 gold + 8 glow | `coinGold`, `coinGlow` | Default |
| Spawn ring | 12 | `portalBlue` | Default |
| Generic burst | 8 | Caller-specified | Default |
| Falling leaf | 1 per 1.5 s | `leafGreen` / `grassTop` | 12 px/s² (gentle) |
| Firefly | Rare | `coinGlow` | 0 (floats) |

Maximum 80 simultaneous particles (ambient spawning pauses above this threshold).

## Future Work: Sprite Atlas Migration

When the procedural approach reaches its limits (e.g. animated character sheets with more frames, multi-resolution export, or a dedicated artist workflow), the plan is to migrate to a packed PNG atlas loaded via PixiJS.

### Target atlas standards

- Format: PNG with alpha.
- Sampling: nearest neighbor.
- Atlas size: 1024 × 1024 px preferred, 2048 × 2048 px maximum.
- Frame padding: 2 px transparent between frames.
- Frame names: lowercase snake_case.
- JSON metadata per frame: `frame` (x/y/w/h), `sourceSize`, `spriteSourceSize`, `pivot` (x/y), `tags`, `durationMs`.

### Target player animation frames

| Animation | Frames | FPS | Loop |
| --- | ---: | ---: | --- |
| Idle | 4 | 6 | Yes |
| Run | 6 | 12 | Yes |
| Jump | 2 | 10 | No |
| Fall | 2 | 8 | Yes |
| Land | 2 | 12 | No |
| Kick windup | 2 | 12 | No |
| Kick active | 1 | — | No |
| Kick recovery | 2 | 10 | No |
| Stunned | 2 | 6 | Yes |
| Respawn | 6 | 14 | No |
| Wall slide | 2 | 8 | Yes (planned) |
| Wall jump | 2 | 12 | No (planned) |

### Pivot conventions

- Player pivot: bottom center at `(12, 30)` for 24 × 32 frames.
- Tile pivot: top-left.
- Pickup pivot: center.
- Portal pivot: center bottom.
- Hazard pivot: top-left for static tiles, center for projectiles.

### Implementation notes

- The server never depends on atlas frame dimensions for physics.
- Palette swaps should affect player accent pixels only, not outlines or hitbox-readable body shapes.
- Gameplay collision and sprite visuals remain separate throughout the migration.
