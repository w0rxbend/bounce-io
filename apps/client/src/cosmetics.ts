// Per-body-part cosmetic customization: each of the four bone-rig slots
// (head/torso/arms/legs, see bodyRig.ts) picks an independently discovered skin.
// Encoded as a compact dot-joined string carried in the existing wire
// `skinId` field (packages/shared/src/types.ts PlayerState.skinId) — the
// server treats it as an opaque string, so this needs no protocol change.
// PNG metadata is discovered from the public manifest; palette entries remain
// as safe fallbacks when an individual texture cannot load.
import type { BodyRigPalette } from "./bodyRig";

export type BodyPartSlot = "head" | "torso" | "arms" | "legs";

export const BODY_PART_SLOTS: readonly BodyPartSlot[] = ["head", "torso", "arms", "legs"];

// Stable, wire-safe IDs. The first eight preserve existing saved/networked
// looks; the compact sNN IDs keep a four-part loadout below the server's
// 48-byte skinId limit. Every ID has a complete PNG set in
// public/assets/cosmetics/skins/<id>/.
const BUILTIN_SWATCH_IDS = [
  "amber", "crimson", "teal", "violet", "forest", "slate", "ivory", "coal",
  "s08", "s09", "s10", "s11", "s12", "s13", "s14", "s15", "s16", "s17",
  "s18", "s19", "s20", "s21", "s22", "s23", "s24", "s25", "s26", "s27",
  "s28", "s29", "s30", "s31", "s32", "s33", "s34", "s35", "s36", "s37",
  "s38", "s39", "s40", "s41", "s42", "s43", "s44", "s45", "s46", "s47",
  "s48", "s49",
] as const;
export type PartSwatchId = string;

// These collections are intentionally mutated in place by configureSkinCatalog
// after the browser manifest loads. Menu/background systems retain references
// to the same array and immediately see newly discovered skin folders.
export const SWATCH_IDS: PartSwatchId[] = [...BUILTIN_SWATCH_IDS];

const BASE_SWATCHES: Partial<Record<PartSwatchId, number>> = {
  amber: 0xffd090,
  crimson: 0xb83020,
  teal: 0x30c8c0,
  violet: 0x9b6dff,
  forest: 0x4f6f3f,
  slate: 0x36475f,
  ivory: 0xf4e8c8,
  coal: 0x1c1f2a,
};

function generatedSwatch(index: number): number {
  const hue = (index * 137.508 + 18) % 360;
  const saturation = 0.48 + (index % 4) * 0.08;
  const lightness = 0.42 + (index % 3) * 0.07;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = lightness - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0]
    : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c]
    : hue < 300 ? [x, 0, c] : [c, 0, x];
  return (Math.round((r + m) * 255) << 16) |
    (Math.round((g + m) * 255) << 8) |
    Math.round((b + m) * 255);
}

export const PART_SWATCHES: Record<PartSwatchId, number> = Object.fromEntries(
  SWATCH_IDS.map((id, index) => [id, BASE_SWATCHES[id] ?? generatedSwatch(index)])
) as Record<PartSwatchId, number>;

export const SKIN_DISPLAY_NAMES: Record<PartSwatchId, string> = Object.fromEntries(
  SWATCH_IDS.map((id, index) => [id, index < 8 ? id[0]!.toUpperCase() + id.slice(1) : `Relic ${String(index + 1).padStart(2, "0")}`])
) as Record<PartSwatchId, string>;

export interface SkinCatalogEntry {
  id: string;
  displayName: string;
  fallbackColor: string;
  tags?: readonly string[];
}

export interface CosmeticPartManifest {
  png: string;
  width: number;
  height: number;
  pivot: [number, number];
}

export interface CosmeticManifestSkin extends SkinCatalogEntry {
  parts: Record<"head" | "torso" | "arm" | "hand" | "leg" | "foot", CosmeticPartManifest> &
    Partial<Record<"chest" | "neck", CosmeticPartManifest>>;
}

export interface ParsedCosmeticManifest {
  schemaVersion: 1 | 2;
  skins: CosmeticManifestSkin[];
}

const WIRE_SAFE_SKIN_ID = /^[a-z0-9][a-z0-9_-]{0,9}$/;
const LEGACY_COSMETIC_PARTS = ["head", "torso", "arm", "hand", "leg", "foot"] as const;
const ARTICULATED_COSMETIC_PARTS = [...LEGACY_COSMETIC_PARTS, "chest", "neck"] as const;

function canonicalPartPivot(part: string, width: number, height: number): [number, number] {
  if (part === "foot") return [0, height / 2];
  if (part === "arm" || part === "hand" || part === "leg") return [width / 2, 0];
  return [width / 2, height];
}

function parseManifestPart(raw: unknown, id: string, part: string, requirePivot: boolean): CosmeticPartManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const meta = raw as Record<string, unknown>;
  const expectedPath = `/assets/cosmetics/skins/${id}/${part}.png`;
  if (meta.png !== expectedPath || !Number.isInteger(meta.width) || (meta.width as number) <= 0 || (meta.width as number) > 256 ||
      !Number.isInteger(meta.height) || (meta.height as number) <= 0 || (meta.height as number) > 256) return null;
  const width = meta.width as number;
  const height = meta.height as number;
  const rawPivot = meta.pivot;
  if (rawPivot === undefined && !requirePivot) return { png: expectedPath, width, height, pivot: canonicalPartPivot(part, width, height) };
  if (!Array.isArray(rawPivot) || rawPivot.length !== 2 || !rawPivot.every(Number.isFinite)) return null;
  const pivot: [number, number] = [rawPivot[0] as number, rawPivot[1] as number];
  if (pivot[0] < 0 || pivot[0] > width || pivot[1] < 0 || pivot[1] > height) return null;
  return { png: expectedPath, width, height, pivot };
}

/** Atomically validates untrusted browser JSON before it reaches Pixi Assets. */
export function parseCosmeticManifest(value: unknown): ParsedCosmeticManifest | null {
  if (!value || typeof value !== "object") return null;
  const manifest = value as Record<string, unknown>;
  if ((manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2) || !Array.isArray(manifest.skins) || manifest.skins.length === 0) return null;
  if (typeof manifest.skinCount === "number" && manifest.skinCount !== manifest.skins.length) return null;
  const skins: CosmeticManifestSkin[] = [];
  const ids = new Set<string>();
  for (const raw of manifest.skins) {
    if (!raw || typeof raw !== "object") return null;
    const skin = raw as Record<string, unknown>;
    const id = skin.id;
    if (typeof id !== "string" || !WIRE_SAFE_SKIN_ID.test(id) || ids.has(id.toLowerCase())) return null;
    if (typeof skin.displayName !== "string" || !skin.displayName.trim() || skin.displayName.length > 40) return null;
    if (typeof skin.fallbackColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(skin.fallbackColor)) return null;
    if (skin.tags !== undefined && (!Array.isArray(skin.tags) || skin.tags.length > 24 ||
      skin.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.length > 24))) return null;
    if (!skin.parts || typeof skin.parts !== "object") return null;
    const rawParts = skin.parts as Record<string, unknown>;
    const parts = {} as CosmeticManifestSkin["parts"];
    const requiredParts = manifest.schemaVersion === 2 ? ARTICULATED_COSMETIC_PARTS : LEGACY_COSMETIC_PARTS;
    for (const part of requiredParts) {
      const parsed = parseManifestPart(rawParts[part], id, part, manifest.schemaVersion === 2);
      if (!parsed) return null;
      parts[part] = parsed;
    }
    if (manifest.schemaVersion === 1) {
      for (const part of ["chest", "neck"] as const) {
        const rawPart = rawParts[part];
        if (!rawPart) continue;
        const parsed = parseManifestPart(rawPart, id, part, false);
        if (!parsed) return null;
        parts[part] = parsed;
      }
    }
    ids.add(id.toLowerCase());
    skins.push({
      id,
      displayName: skin.displayName,
      fallbackColor: skin.fallbackColor,
      tags: skin.tags ? [...skin.tags as string[]] : [],
      parts,
    });
  }
  if (Object.values(DEFAULT_COSMETICS).some((id) => !ids.has(id))) return null;
  return { schemaVersion: manifest.schemaVersion, skins };
}

/** Installs a manifest-discovered catalog while preserving safe built-in fallback. */
export function configureSkinCatalog(entries: readonly SkinCatalogEntry[]): boolean {
  const valid = entries.filter((entry, index) =>
    WIRE_SAFE_SKIN_ID.test(entry.id) &&
    entry.displayName.trim().length > 0 && entry.displayName.length <= 40 &&
    /^#[0-9a-fA-F]{6}$/.test(entry.fallbackColor) &&
    entries.findIndex((candidate) => candidate.id === entry.id) === index
  );
  // Defaults must always remain decodable even if a custom or stale manifest
  // is served. Reject the whole catalog rather than creating partial looks.
  const required = Object.values(DEFAULT_COSMETICS);
  if (valid.length === 0 || required.some((id) => !valid.some((entry) => entry.id === id))) return false;

  SWATCH_IDS.splice(0, SWATCH_IDS.length, ...valid.map((entry) => entry.id));
  for (const id of Object.keys(PART_SWATCHES)) delete PART_SWATCHES[id];
  for (const id of Object.keys(SKIN_DISPLAY_NAMES)) delete SKIN_DISPLAY_NAMES[id];
  for (const entry of valid) {
    PART_SWATCHES[entry.id] = Number.parseInt(entry.fallbackColor.slice(1), 16);
    SKIN_DISPLAY_NAMES[entry.id] = entry.displayName;
  }
  return true;
}

export type PlayerCosmetics = Record<BodyPartSlot, PartSwatchId>;

export const DEFAULT_COSMETICS: PlayerCosmetics = {
  head: "amber",
  torso: "crimson",
  arms: "amber",
  legs: "slate",
};

function isSwatchId(value: string | undefined): value is PartSwatchId {
  return !!value && SWATCH_IDS.includes(value);
}

export function encodeCosmetics(cosmetics: PlayerCosmetics): string {
  return BODY_PART_SLOTS.map((slot) => isSwatchId(cosmetics[slot]) ? cosmetics[slot] : DEFAULT_COSMETICS[slot]).join(".");
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
