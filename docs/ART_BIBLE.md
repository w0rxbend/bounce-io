# Bounce IO Art Bible

## Visual Identity

Bounce IO is a pixel art vertical race through floating forest ruins. The world feels ancient, overgrown, and magical without losing competitive readability. A player must be able to parse platforms, hazards, coins, portals, opponents, and UI state in a single glance — especially at 1x browser scale.

Visuals use a hybrid approach: gameplay-critical fallbacks are still drawn procedurally in PixiJS, while generated art lives as separate transparent PNG files under `apps/client/public/assets/`. Runtime gameplay assets should remain individual files rather than texture atlases or sprite sheets. See `docs/SEPARATE_ASSET_RULES.md` for the folder contract.

## Pixel Rules

- Base tile size: 16 × 16 px.
- Character visual frame: 24 × 32 px (hitbox 14 × 22 px, inset by 5 px on each side and 5 px from top).
- UI pixel unit: 4 px.
- Render: nearest-neighbor sampling only, `roundPixels: true`, no antialiasing.
- No subpixel blur, soft glow halos, or gradient fills that cross more than one pixel boundary.
- Animation prefers strong key poses and 2–4 px motion offsets over smooth distortion.
- Decorative detail must not compete with collision silhouettes or hazard readability.

## Implemented Palette

All colors are defined as the `PAL` constant object in `main.ts`. Values below are as implemented.

### Sky and Atmosphere

| Name | Hex | Usage |
| --- | --- | --- |
| `skyGround` | `#4a7040` | Warm forest green-blue near ground horizon |
| `skyMid` | `#2a4e88` | Deep warm mid-altitude sky blue |
| `skyDeep` | `#18305a` | Darker upper atmosphere |
| `skySpace` | `#080e1e` | Near-space deep indigo at maximum altitude |
| `starBright` | `#e8eeff` | Star dots (1–2 px) visible at high altitude |
| `skyHaze` | `#90c0d8` | Horizon haze strip at screen bottom |
| `mistPale` | `#c8e0e0` | Distant clouds and depth haze |

### Distant World

| Name | Hex | Usage |
| --- | --- | --- |
| `islandFar` | `#304068` | Far floating island silhouettes |
| `ruinsDark` | `#222e48` | Ancient tower silhouettes in background |
| `mountainFar` | `#28385a` | Unused currently; reserved for far mountain layer |
| `mountainMid` | `#384870` | Unused currently |

### Clouds

| Name | Hex | Usage |
| --- | --- | --- |
| `cloudFar` | `#6888b8` | Distant hazy blue-gray cloud fill |
| `cloudMid` | `#a8c0d8` | Medium soft blue-white cloud fill |
| `cloudBright` | `#e8f0f8` | Near-cloud bright white (largely unused directly) |
| `cloudShadow` | `#8898b8` | Cloud underside shadow |
| `cloudWarm` | `#f0e8d8` | Warm sunlit cloud top (front layer) |

### Terrain — Warm Sandstone

| Name | Hex | Usage |
| --- | --- | --- |
| `stoneShadow` | `#28221a` | Warm dark outline / mortar shadow |
| `stoneDark` | `#504030` | Dark warm stone face (floor tiles, portal pillars) |
| `stoneMid` | `#907858` | Warm sandstone — main platform body |
| `stoneLight` | `#c8a878` | Light sandstone highlight (top edges, jump dust) |
| `stoneWorn` | `#6a5840` | Worn stone at altitude (platform body blend target) |
| `stoneRuin` | `#606858` | Cool worn ruin stone (reserved for future biome) |

### Soil and Vegetation

| Name | Hex | Usage |
| --- | --- | --- |
| `soilWarm` | `#7a5030` | Warm topsoil under grass |
| `soilDark` | `#402818` | Deep soil underside band |
| `soilRoot` | `#583a20` | Hanging root segments |
| `grassTop` | `#90d838` | Bright fresh grass on exposed platform tops |
| `grassDark` | `#3a7818` | Grass shadow / base layer |
| `mossGreen` | `#489030` | Moss patches on stone, portal vines |
| `mossBright` | `#68c040` | Bright moss highlight, grass overflow |
| `barkMid` | `#6a4820` | Wood / bark (reserved) |
| `leafGreen` | `#78d050` | Falling leaf particles |
| `canopyDark` | `#1a3818` | Player leg color, deep foliage |
| `canopyMid` | `#2e6840` | Vine leaf tips on portals |
| `canopyLight` | `#6ac840` | Bright canopy (debug bars) |

### Hazards

| Name | Hex | Usage |
| --- | --- | --- |
| `hazardRed` | `#e84030` | Spike triangle fill and red accent |
| `hazardGlow` | `#ffa060` | Spike shaft inner glow |
| `hazardBase` | `#3a1a10` | Spike base platform strip |
| `hazardMag` | `#b82060` | Arcane hazard core (reserved; grounded indicator in debug) |

### Coins and Relics

| Name | Hex | Usage |
| --- | --- | --- |
| `coinGold` | `#f8c830` | Coin main fill, crown, HUD coin count |
| `coinShade` | `#b07020` | Coin right-edge shadow |
| `coinGlow` | `#ffe870` | Coin top highlight, glow halo, firefly particles |

### Portal and Magic

| Name | Hex | Usage |
| --- | --- | --- |
| `portalBlue` | `#40d8f8` | Portal glow fill and scan lines |
| `portalGlow` | `#a0f0ff` | Portal outer glow (reserved) |
| `runeGlow` | `#30c8c0` | Rune markings on lintel and high-altitude tiles |

### Character

| Name | Hex | Usage |
| --- | --- | --- |
| `skinLight` | `#ffd090` | Player head / face |
| `hairDark` | `#281a10` | Player hair strip |
| `scarfPrimary` | `#b83020` | Scarf trail primary color |
| `scarfShade` | `#701818` | Scarf trail shadow segments |

### UI

| Name | Hex | Usage |
| --- | --- | --- |
| `uiInk` | `#1c1f2a` | Text shadow, panel borders, player outline |
| `uiParchment` | `#f4e8c8` | Primary text, nameplates, notification text |
| `uiHighlight` | `#40c8d0` | Cyan accent strip on HUD panels, height icon, phase banner |
| `uiCyan` | `#40c8d0` | Join notification color (same as highlight) |
| `uiGray` | `#6a8aaf` | Leave notification color, subdued UI text |

## Rendering Layer Hierarchy

Layers are organized as PixiJS containers in the following draw order (back to front):

| Layer | Container | Contents |
| --- | --- | --- |
| 0 | `skyLayer` | Sky gradient, sun glow, stars, distant islands, towers, 3 cloud layers |
| 1 | `chunkLayer` | Static tile `Graphics` per loaded chunk |
| 2 | `portalLayer` | Portal arch + glow containers per chunk |
| 3 | `relicLayer` | Animated coin containers |
| 4 | `remoteLayer` | Opponent `Graphics` + nameplate `Text` objects |
| 5 | `localLayer` | Local player `Graphics` |
| 6 | `effectLayer` | Particle `Graphics` (pooled) |
| 7 | `hudLayer` | HUD panels, icons, text, notifications, debug overlay |

`skyLayer` is screen-space (not camera-transformed). Layers 1–6 are inside `worldLayer`, which is scaled and translated to follow the camera. `hudLayer` is screen-space.

## Environment Visual Language

### Floating Platform Tiles

- Warm sandstone body with dark outline and staggered brick mortar seams.
- Exposed upper face: soil band, bright grass layer, tiny grass tufts poking above the tile edge, occasional 1 px flowers (pink / gold / white).
- Exposed lower face: dark soil underside band with 2–4 hanging root segments and occasional 2 px hanging vines.
- Altitude shift: platform stone color lerps from warm sandstone toward worn grey-brown as chunk index increases.
- Rune glow: at chunk 16+, rare tiles show a small `runeGlow` (cyan-teal) inscription.
- Moss patches: 1 in 3 tiles has a small moss spot.

### Solid Floor Tiles

Dark stone body (`stoneDark`) with minimal top highlight. Used only for the solid floor row of each chunk and as the out-of-bounds fill.

### Hazard Spike Tiles

Three pixel-art stone spikes per tile, rising from a dark base. Spikes use `hazardRed` with `hazardGlow` inner shafts and a white 1 px gleam at each tip. Currently visual-only; no damage hitbox.

### Sky Parallax

The sky uses 8 independently-scrolling layers at different Y parallax factors. As the player climbs:

- Sky gradient shifts from warm forest green-blue near the ground toward deep indigo / near-black space.
- Sun glow (lower-right quadrant) fades out above mid-altitude.
- Stars fade in from fully transparent to fully visible at high altitude.
- Distant islands and tower silhouettes scroll slowly (factors 0.05–0.11).
- Three cloud layers (far / mid / front) scroll faster (factors 0.20–0.50) and drift horizontally at 6 / 11 / 18 px/s.

### Portals

A stone arch portal sits at the exit platform of every chunk. It reads as the upward goal.

- Stone pillars and lintel in `stoneDark` / `stoneWorn` with moss patches and hanging vines.
- Rune glyphs on the lintel in `runeGlow`.
- Animated interior: pulsing fill (`portalBlue`), bright central column, horizontal scan lines, orbiting rune dots.
- Exit portals (chunks 1+) are taller arches with additional lintel runes and 5 orbiting dots instead of 3.
- The interior alpha and orbit speed pulse on a sine wave (3.5 Hz exit, 2.5 Hz entry).

## Characters

### Readability Priority

- Player silhouettes must be compact and brighter than the stone/foliage background.
- The head and jacket must remain recognizable during run, jump, fall, and kick.
- Opponent readability matters more than costume detail at small scale.
- Facial details are minimal: 2 × 2 px eye with a 1 px white glint.

### Accent Color System

Each player has a unique accent color applied to the jacket region. The local player is always gold (`0xf3c64b`). Remote players cycle through 7 additional colors. The scarf always uses `scarfPrimary` / `scarfShade` regardless of accent.

### Motion Language

- **Scarf trail**: trails opposite to movement. Longer and brighter during kick active phase. Communicates speed and attack state without extra animation frames.
- **Squash on landing**: sprite compresses vertically by up to 3 px, widens slightly. Impact strength is proportional to fall velocity.
- **Stretch on falling**: sprite stretches vertically and narrows slightly above 160 px/s fall speed.
- **Kick offset**: sprite shifts forward (active) and back (windup) along the facing axis.
- **Invulnerability blink**: alternates visible/hidden every 80 ms.

### Particles

Particles reinforce the game feel without adding visual noise:

- **Jump dust**: 5 stone-colored particles spray sideways on takeoff.
- **Land dust**: up to 10 light stone particles scatter outward on hard landings.
- **Kick spark**: 7 directional sparks + 1 white flash at the kick impact point.
- **Coin burst**: 8 gold + 8 glow particles radiate from the collection point.
- **Ambient leaves**: gentle falling leaves drift down from above the camera at low gravity. Rare firefly dots float near platform level.

## Coins

- Gold center fill (`coinGold`), warm glow top strip (`coinGlow`), right-edge shade (`coinShade`).
- 4-frame horizontal spin cycle (widths: 8 / 5 / 2 / 5 px at 5 FPS).
- Soft glow halo slightly wider than the coin itself.
- Bobbing vertical motion (sine wave, amplitude 2.5 px).
- On collection: gold and glow particle burst + notification toast.
- Coins placed in the right lane should read as a path marker when multiple are vertically stacked.

## HUD and UI

- HUD panels use the stone aesthetic: dark body, 2 px dark borders, 1 px inner highlight, cyan top accent strip, moss corner dots.
- Text uses monospace bitmap-style fonts at small sizes (7–11 px). High contrast: light text on dark panel.
- No rounded modern pills. Use squared tabs, plaques, and small carved panels.
- Placement / rank uses the `uiParchment` color. No medal color differentiation yet.
- Phase banners ("GET READY!", "GO!", "MATCH OVER") are large centered text in `uiHighlight` / `coinGold` / `hazardRed`.
- Notification toasts use the same stone panel grammar, float upward, and fade out over 2.5 s.

## Depth and Contrast Guidelines

- Background layers (sky, islands, towers): low contrast, desaturated, cool colors.
- Mid-ground decoration (distant cloud silhouettes): medium contrast.
- Gameplay layer (platforms, hazards, portals, coins): full contrast, warm sandstone and bright accents clearly readable against sky.
- Player layer: bright accent colors against the stone/foliage environment. Outline in `uiInk` ensures separation from any background.
- HUD: screen-space, stone aesthetic, always in front.

Hazard tiles use saturated red and orange — the only warm-saturated color in the environment other than coins. This makes them immediately identifiable even before the player reads their shape.

Coins use gold — the brightest warm color in the scene. Coin routes should be visible from a platform away.

## Future Biome Themes

The chunk-based procgen architecture supports per-altitude biome color shifts. When implemented, the following themes are planned for platform tile rendering and sky gradient stops. The core pixel grammar remains the same; only the palette and generation parameters shift.

| Altitude Range | Biome | Tile Shift | Sky Shift |
| --- | --- | --- | --- |
| Chunks 0–5 | Rootfall | Current warm sandstone + grass | Forest green ground sky |
| Chunks 6–12 | Broken Canopy | Mossy ruin stone, leaf canopy tops | Cooler mid-blue |
| Chunks 13–20 | Lantern Ruins | Dark worn stone, rune glow dominant | Deep blue-grey |
| Chunks 21+ | Sky Shrine | Pale shrine marble, gold accents | Near-space indigo |

Biome transitions should blend over 2–3 chunks rather than cutting hard at a boundary.
