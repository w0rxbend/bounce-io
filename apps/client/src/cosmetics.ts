// Per-body-part cosmetic customization: each of the four bone-rig slots
// (head/torso/arms/legs, see bodyRig.ts) picks an independent color swatch.
// Encoded as a compact dot-joined string carried in the existing wire
// `skinId` field (packages/shared/src/types.ts PlayerState.skinId) — the
// server treats it as an opaque string, so this needs no protocol change.
// Adding a new lookAndFeel later (real per-part textures, unlockable
// swatches, etc.) only means extending PART_SWATCHES / this module — see
// docs/BODY_PART_SKIN_SPEC.md.
import type { BodyRigPalette } from "./bodyRig";

export type BodyPartSlot = "head" | "torso" | "arms" | "legs";

export const BODY_PART_SLOTS: readonly BodyPartSlot[] = ["head", "torso", "arms", "legs"];

export const SWATCH_IDS = ["amber", "crimson", "teal", "violet", "forest", "slate", "ivory", "coal"] as const;
export type PartSwatchId = typeof SWATCH_IDS[number];

export const PART_SWATCHES: Record<PartSwatchId, number> = {
  amber: 0xffd090,
  crimson: 0xb83020,
  teal: 0x30c8c0,
  violet: 0x9b6dff,
  forest: 0x4f6f3f,
  slate: 0x36475f,
  ivory: 0xf4e8c8,
  coal: 0x1c1f2a,
};

export type PlayerCosmetics = Record<BodyPartSlot, PartSwatchId>;

export const DEFAULT_COSMETICS: PlayerCosmetics = {
  head: "amber",
  torso: "crimson",
  arms: "amber",
  legs: "slate",
};

function isSwatchId(value: string | undefined): value is PartSwatchId {
  return !!value && (SWATCH_IDS as readonly string[]).includes(value);
}

export function encodeCosmetics(cosmetics: PlayerCosmetics): string {
  return BODY_PART_SLOTS.map((slot) => cosmetics[slot]).join(".");
}

export function decodeCosmetics(raw: string | null | undefined): PlayerCosmetics {
  const parts = (raw ?? "").split(".");
  const [head, torso, arms, legs] = parts;
  return {
    head: isSwatchId(head) ? head : DEFAULT_COSMETICS.head,
    torso: isSwatchId(torso) ? torso : DEFAULT_COSMETICS.torso,
    arms: isSwatchId(arms) ? arms : DEFAULT_COSMETICS.arms,
    legs: isSwatchId(legs) ? legs : DEFAULT_COSMETICS.legs,
  };
}

// Deterministic distinct default look per player color slot, so remote
// players without a stored preference still read as visually distinct.
export function cosmeticsForColorIndex(colorIndex: number): PlayerCosmetics {
  const n = SWATCH_IDS.length;
  const pick = (offset: number) => SWATCH_IDS[((colorIndex + offset) % n + n) % n]!;
  return { head: DEFAULT_COSMETICS.head, torso: pick(0), arms: DEFAULT_COSMETICS.arms, legs: pick(4) };
}

function shade(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

export function cosmeticsToPalette(cosmetics: PlayerCosmetics): BodyRigPalette {
  const torso = PART_SWATCHES[cosmetics.torso];
  const legs = PART_SWATCHES[cosmetics.legs];
  const head = PART_SWATCHES[cosmetics.head];
  return {
    skin: head,
    hair: shade(head, 0.5),
    torso,
    torsoShade: shade(torso, 0.62),
    arms: PART_SWATCHES[cosmetics.arms],
    limb: legs,
    limbShade: shade(legs, 0.55),
    boot: shade(legs, 0.35),
  };
}
