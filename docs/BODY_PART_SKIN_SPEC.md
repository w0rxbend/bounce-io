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

`apps/client/src/cosmetics.ts` defines four independently customizable wire/menu slots
that resolve to eight articulated PNG pieces:

| Slot | Bones affected |
| --- | --- |
| `head` | `head`, `neck` |
| `torso` | `torso`, `chest` |
| `arms` | `armUpperL/R`, `armLowerL/R`, `handL/R` |
| `legs` | `legUpperL/R`, `legLowerL/R`, `footL/R` |

Each slot picks a discovered skin ID. A player's full look is a `PlayerCosmetics`
record—one skin ID per slot. Palette colors remain only as robust per-piece fallbacks.

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

## Adding a new skin

Create `skins/<wire-safe-id>/skin.json` plus the eight PNG part files, then run
`python3 tools/build-cosmetics-manifest.py`. The builder scans every skin directory,
validates its ID and metadata, reads PNG dimensions, and regenerates the browser-safe
aggregate manifest without changing the built-in asset generator. IDs use lowercase
letters, digits, `_` or `-` and are limited to 10 characters so four selected IDs fit
the server's 48-byte wire limit. At startup the client validates the aggregate manifest
atomically, installs its IDs/names/fallback colors into the live registry, and then
loads the referenced textures. No TypeScript catalog edit is required for a new skin.

`skin.json` may optionally define per-piece pixel pivots for silhouettes with custom
padding or proportions. Omitted pivots use the canonical defaults:

```json
{
  "schemaVersion": 1,
  "id": "my_skin",
  "displayName": "My Skin",
  "tags": ["custom"],
  "fallbackColor": "#7ab6d8",
  "pivots": { "head": [8, 15], "foot": [1, 2.5] }
}
```

The builder rejects unknown part names, non-numeric coordinates, and pivots outside
their PNG canvas. Authored pivots are preserved in the aggregate manifest and applied
as normalized Pixi sprite anchors at runtime.

## Adding a new body part slot

1. Add the slot name to `BodyPartSlot` and `BODY_PART_SLOTS` in `cosmetics.ts`.
2. Add a color field to `PlayerCosmetics`/`DEFAULT_COSMETICS` and route it into
   `cosmeticsToPalette()`'s returned `BodyRigPalette`.
3. Point the relevant bone(s) in `BODY_BONE_DEFS` (`bodyRig.ts`) at the new palette key.
4. Add a label to `BODY_PART_SLOT_LABELS` in `main.ts` so the picker shows a row for it.

## PNG part textures

The production rig resolves each selected slot to a `Sprite`, with the original
`Graphics` geometry retained as a safe fallback when a custom asset is missing or
fails to load. The built-in catalog contains 50 coherent skin IDs and eight PNGs per
ID (400 transparent assets total).

Built-in silhouettes deliberately follow the world art's rounded pixel grammar:
every part uses hard binary alpha, transparent canvas corners, stepped curved caps,
tapered joints, and clustered highlights rather than full-canvas rectangles or
antialiased curves. The validator enforces those silhouette invariants across all
400 files, so generator changes cannot accidentally reintroduce cubic limb cards.

Assets use this predefined layout:

```text
apps/client/public/assets/cosmetics/
  manifest.json
  skins/<skin-id>/
    head.png
    torso.png
    chest.png
    neck.png
    arm.png
    hand.png
    leg.png
    foot.png
```

The aggregate manifest is the browser-safe discovery index and includes dimensions,
pivots, display names, and tags. The client loads it separately from world art so the
two catalogs can evolve independently. Each selected slot is resolved by
`cosmetics/<skin-id>/<part>`; arms and legs reuse their segment art across both sides
and upper/lower joints. Hands follow the selected arm skin and feet follow the selected
leg skin, while remaining separately authored terminal assets.
Manifest pivots are validated and applied directly to each Pixi sprite anchor; decoded
PNG dimensions must match the manifest before a part is accepted. Feet use a left-center
pivot, limb segments use top-center, and torso/head pieces use bottom-center.

The manifest is installed without eagerly downloading all 400 PNGs. The active eight-part
loadout and the ten icon parts visible on the current picker page load on demand through a
deduplicating registry. Concurrent requests share one load, successful textures stay cached,
and an invalid or failed part independently retains its palette-based `Graphics` fallback.
Live players and menu previews refresh after a completed asset batch without retaining stale
preview objects across asynchronous work.

- One PNG per `(slot, swatchId)` pair, transparent background, nearest-neighbor.
- Head: 28×32 px, anchored at bone pivot (bottom-center). It renders at 2.75× the
  head-bone length to preserve the game's intentionally oversized big-head silhouette.
- Torso: 10×14 px, anchored at the hip pivot (bottom-center).
- Chest: 10×8 px, anchored at the lower-spine pivot (bottom-center).
- Neck: 6×4 px, anchored at the chest pivot (bottom-center).
- Arm segment (upper/lower, shared art): 6×10 px, anchored at the shoulder/elbow pivot
  (top-center).
- Hand: 6×5 px, anchored at the wrist (top-center).
- Leg segment (upper/lower, shared art): 8×10 px, anchored at the hip/knee pivot
  (top-center).
- Foot: 8×5 px, anchored at the ankle (left-center and oriented along the foot bone).

Run `npm run assets:skins` to regenerate built-ins, discover all folders, and validate
the resulting catalog. The validator
requires at least 50 unique complete sets, checks every referenced file and PNG header,
dimensions, RGBA color mode, and transparent coverage. Custom catalogs may instead
add folders using the same eight filenames and extend `manifest.json`; unknown or
failed entries fall back per part without breaking the player.

Aggregate manifest schema v2 requires all eight pieces. Legacy schema-v1 custom
manifests remain accepted with the original six pieces; absent chest and neck art use
the rig's geometric fallback. The articulated spine is `torso → chest → neck → head`,
with shoulders attached to the chest so turns distribute naturally through the trunk.

Physics and collision (`packages/shared/src/physics.ts`, Go's `world.go`) never depend
on cosmetics or rig art — the hitbox stays `PLAYER_WIDTH`×`PLAYER_HEIGHT` regardless of
what's selected.
