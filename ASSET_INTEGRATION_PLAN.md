# Asset Integration Plan

## Basis

- Current rendering is procedural PixiJS `Graphics` in `apps/client/src/main.ts`; there are no image assets or atlases yet.
- Existing art constraints are defined in `docs/ART_BIBLE.md` and `docs/SPRITE_SHEET_SPEC.md`: 16 x 16 tiles, 24 x 32 player visual frames, nearest-neighbor sampling, 2 px transparent atlas padding, lowercase snake_case frame names.
- Gameplay constants in `packages/shared/src/constants.ts` keep collision separate from visuals: player hitbox is 14 x 22 inside the 24 x 32 visual frame, world width is 384 px, and chunk size is 384 x 288 px.

## Proposed Generated Assets

| File | Dimensions | Contents |
| --- | ---: | --- |
| `apps/client/src/assets/generated/skybound_relics_atlas.png` | 1024 x 1024 | Packed PNG atlas with transparent padding and nearest-neighbor pixel art. |
| `apps/client/src/assets/generated/skybound_relics_atlas.json` | Metadata | Frame rectangles, pivots, tags, and durations matching `docs/SPRITE_SHEET_SPEC.md`. |
| `apps/client/src/assets/generated/player_explorer_sheet.png` | 160 x 238 | Source sheet for 6 columns x 7 rows of 24 x 32 frames with 2 px padding. |
| `apps/client/src/assets/generated/tiles_ruins_sheet.png` | 88 x 34 | 5 columns x 2 rows of 16 x 16 tiles with 2 px padding: `one_way`, `solid`, `hazard`, moss/rune variants. |
| `apps/client/src/assets/generated/relic_coin_spin.png` | 38 x 16 | 4 coin frames in 8 x 14 bounds with 2 px padding. |
| `apps/client/src/assets/generated/portal_exit_sheet.png` | 194 x 48 | 2 portal base variants in 96 x 48 bounds with 2 px padding: entry and exit arches. |
| `apps/client/src/assets/generated/hud_icons_sheet.png` | 70 x 16 | Coin and height-arrow HUD icons in 16 x 16 bounds with 2 px padding. |

## Integration Sequence

1. Generate the source sheets from the palette and pixel grammar in `docs/ART_BIBLE.md`.
2. Pack source sheets into `skybound_relics_atlas.png` and `skybound_relics_atlas.json`.
3. Add a client atlas loader behind the existing procedural renderer, keeping current `Graphics` output as the fallback.
4. Replace visuals incrementally in this order: coins, tiles, portals, player, HUD icons.
5. Keep collision, chunk generation, relic ownership, and player physics unchanged; only rendering should consume atlas frame dimensions.

## Verification Steps

- Run `npm run typecheck`, `npm run build`, and `npm test`.
- Start `npm run dev`, open the Vite client, and verify the game still starts in local mode.
- Confirm PixiJS uses nearest-neighbor sampling and `roundPixels: true`; generated sprites must not blur at 1x browser scale.
- Compare screenshots at desktop and narrow widths against the current procedural renderer for readable platforms, hazards, coins, portals, player states, HUD, and nameplates.
- Join two clients to the same room and verify remote player interpolation, crown rendering, coin collection removal, and portal placement still align with authoritative chunks.
- Toggle F1 debug and verify hitboxes remain 14 x 22 even when player art uses 24 x 32 visual frames.
