# Separate Asset Rules

The project now treats gameplay art as individual transparent PNG files. Do not generate sprite atlases, tilemap sheets, or combined character sheets for runtime gameplay assets.

## Folder Contract

- `apps/client/public/assets/playable_characters/<character>/`
  - `main_body.png`
  - `idle_body.png`
  - `idle_frame1.png` through `idle_frame4.png`
  - `walking_frame1.png` through `walking_frame6.png`
  - `running_frame1.png` through `running_frame6.png`
  - `jumping_frame1.png` through `jumping_frame2.png`
  - `falling_frame1.png` through `falling_frame2.png`
  - `kick_frame1.png` through `kick_frame3.png`
  - `shooting_frame1.png` through `shooting_frame4.png`
  - `lying_dead_frame1.png` through `lying_dead_frame2.png`

The generated multiplayer roster currently uses `character1` through `character10`: eight armored silhouettes, `character9` as a casual glasses runner, and `character10` as a bearded runner with dark hair, navy shirt, jeans, and light sneakers.
- `apps/client/public/assets/environment/`
  - `backgrounds/`
  - `mountainBackgrounds/`
  - `midMountains/` - 16x16 second-layer mountain connector tiles, not panorama images
  - `clouds/`
  - `collectibles/`
  - `crystals/`
  - `decorations/`
  - `effects/`
  - `particleEffects/`
  - `enemies/`
  - `hazards/`
  - `ladders/`
  - `lights/`
  - `lanterns/`
  - `platforms/`
  - `platformVariants/`
  - `rocks/`
  - `flora/`
  - `banners/`
  - `relicShrines/`
  - `ropeBridges/`
  - `structures/`
  - `tiles/`
  - `terrainTiles/`
  - `snowTiles/`
  - `mossTiles/`
  - `ruinTiles/`
  - `sheetElements/`
  - `ui/`
  - `vegetation/`
  - `pineTrees/`
  - `snowTrees/`

## Generation

Run:

```bash
npm run assets:generate
```

This calls `tools/generate-separated-assets.py` and writes PNGs only. The generator also writes `apps/client/public/assets/manifest.json` so the folder contract can be inspected without loading the app.

The primary alpine background is sourced from `tools/assets/alpine_mountain_background.png` and emitted to `apps/client/public/assets/environment/backgrounds/mountain_panorama.png`.

## Style Constraints

- 2D pixel art only.
- Transparent background for gameplay sprites.
- Nearest-neighbor rendering in PixiJS.
- No atlas JSON, no tilemap JSON, and no sheet metadata for runtime use.
- Keep character frames bottom-centered so their feet line up when animated.
- Keep platform and hazard collision rectangular in code. Decorative PNGs are visual only unless the game explicitly marks their tile as collidable.
- Build mid-mountain depth from repeatable connector tiles behind platforms. Do not put full mountain panel images in `midMountains/`.
- Use altitude-specific variants: Pine Valley should lean grass/wood, Cloud Ridge stone/cloud, Snowfall Cliffs snow caps, Frozen Spires ice/sharp rock, and Celestial Summit white-gold ruins with blue crystal accents.
