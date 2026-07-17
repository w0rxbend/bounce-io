# Body Part Skin Spec

## Overview

Player characters are rendered as a 2D bone-rigged body (`apps/client/src/bodyRig.ts`)
instead of pre-baked sprite-sheet characters. Each bone is a `Container` holding a
`Graphics` shape, parented into a hierarchy (`hip` → `torso` → `head`, `armUpper*` →
`armLower*`, `legUpper*` → `legLower*`), posed procedurally per animation state
(`idle`/`run`/`jump_fall`/`kick_push`/`hit`) instead of swapping texture frames.

This replaced the previous `apps/client/public/assets/playable_characters/characterN/`
sprite-sheet system (13 hand-authored characters, ~500 individual PNG frames). See
`docs/SPRITE_SHEET_SPEC.md` for the retired frame-animation grammar.

## Cosmetic customization

`apps/client/src/cosmetics.ts` defines four independently customizable slots that map
onto the bone groups:

| Slot | Bones affected |
| --- | --- |
| `head` | `head` (and a derived hair shade, currently unused by any bone) |
| `torso` | `torso` (plus a derived shade, currently unused — reserved for a future sleeve/shoulder bone) |
| `arms` | `armUpperL/R`, `armLowerL/R` |
| `legs` | `legUpperL/R` (flat) and `legLowerL/R` (auto-darkened "boot" shade) |

Each slot picks one `PartSwatchId` from `PART_SWATCHES` (a small built-in flat-color
palette: `amber`, `crimson`, `teal`, `violet`, `forest`, `slate`, `ivory`, `coal`).
A player's full look is a `PlayerCosmetics` record — one swatch id per slot.

### Wire format

The network protocol was **not** changed to add cosmetics support. `PlayerState.skinId`
(`packages/shared/src/types.ts`) already carried an opaque string end-to-end — the Go
server only ever validates its character set/length (`sanitizeSkinID` in
`apps/server-go/internal/game/util.go`) and relays it, never interprets it. Cosmetics are
encoded client-side as a compact dot-joined string, e.g. `"amber.crimson.amber.slate"`
(`encodeCosmetics`/`decodeCosmetics` in `cosmetics.ts`), and carried in that same
`skinId` field. Malformed or unrecognized strings (including old `characterN` values
from before this system existed) decode to `DEFAULT_COSMETICS` gracefully — there is no
crash path, so no explicit migration step was needed for existing `localStorage` values.

## Adding a new swatch (color)

Add an entry to `SWATCH_IDS` and `PART_SWATCHES` in `cosmetics.ts`. It immediately
becomes selectable for every slot in the skin-select screen (`renderSkinSelect` in
`main.ts`) — no other code changes needed.

## Adding a new body part slot

1. Add the slot name to `BodyPartSlot` and `BODY_PART_SLOTS` in `cosmetics.ts`.
2. Add a color field to `PlayerCosmetics`/`DEFAULT_COSMETICS` and route it into
   `cosmeticsToPalette()`'s returned `BodyRigPalette`.
3. Point the relevant bone(s) in `BODY_BONE_DEFS` (`bodyRig.ts`) at the new palette key.
4. Add a label to `BODY_PART_SLOT_LABELS` in `main.ts` so the picker shows a row for it.

## Future: real per-part textures

The current system renders each slot as a flat `Graphics` color fill. To upgrade a slot
to a textured sprite instead of a flat color without changing the wire protocol or the
encoding format: swap the `Graphics` fill in `createBodyRig()` for a `Sprite` using a
texture looked up by `(slot, swatchId)`, keeping the same string IDs. Suggested asset
contract for that migration, mirroring the retired sprite-sheet convention:

- One PNG per `(slot, swatchId)` pair, transparent background, nearest-neighbor.
- Head: 16×16 px, anchored at bone pivot (bottom-center of the circle).
- Torso: 10×14 px, anchored at the hip pivot (bottom-center).
- Arm segment (upper/lower, shared art): 6×8 px, anchored at the shoulder/elbow pivot
  (top-center).
- Leg segment (upper/lower, shared art): 8×10 px, anchored at the hip/knee pivot
  (top-center).

Physics and collision (`packages/shared/src/physics.ts`, Go's `world.go`) never depend
on cosmetics or rig art — the hitbox stays `PLAYER_WIDTH`×`PLAYER_HEIGHT` regardless of
what's selected.
