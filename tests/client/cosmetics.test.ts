import assert from "node:assert/strict";
import test from "node:test";
import {
  BODY_PART_SLOTS,
  decodeCosmetics,
  DEFAULT_COSMETICS,
  encodeCosmetics,
  PART_SWATCHES,
  configureSkinCatalog,
  parseCosmeticManifest,
  SWATCH_IDS,
} from "../../apps/client/src/cosmetics.js";

test("built-in cosmetic catalog exposes at least 50 complete, unique skin IDs", () => {
  assert.equal(SWATCH_IDS.length, 50);
  assert.equal(new Set(SWATCH_IDS).size, SWATCH_IDS.length);
  for (const id of SWATCH_IDS) assert.equal(typeof PART_SWATCHES[id], "number");
});

test("runtime catalog accepts discovered skins and rejects catalogs without defaults", () => {
  const original = SWATCH_IDS.map((id) => ({
    id,
    displayName: id,
    fallbackColor: `#${PART_SWATCHES[id]!.toString(16).padStart(6, "0")}`,
  }));
  const custom = { id: "custom_01", displayName: "Custom One", fallbackColor: "#123456" };
  assert.equal(configureSkinCatalog([...original, custom]), true);
  assert.ok(SWATCH_IDS.includes(custom.id));
  assert.equal(PART_SWATCHES[custom.id], 0x123456);
  assert.equal(decodeCosmetics(`custom_01.crimson.amber.slate`).head, custom.id);
  assert.equal(configureSkinCatalog([custom]), false);
  assert.ok(SWATCH_IDS.includes("amber"), "rejected catalog must not mutate active registry");
  assert.equal(configureSkinCatalog(original), true);
});

test("manifest parser rejects malformed and path-injected catalogs atomically", () => {
  const makeSkin = (id: string) => ({
    id, displayName: id, fallbackColor: "#123456", tags: ["built-in"],
    parts: Object.fromEntries(["head", "torso", "chest", "neck", "arm", "hand", "leg", "foot"].map((part) => [part, {
      png: `/assets/cosmetics/skins/${id}/${part}.png`, width: 8, height: 8, pivot: part === "foot" ? [0, 4] : [4, 0],
    }])),
  });
  const defaults = ["amber", "crimson", "slate"].map(makeSkin);
  const valid = { schemaVersion: 2, skinCount: 3, skins: defaults };
  assert.ok(parseCosmeticManifest(valid));
  assert.deepEqual(parseCosmeticManifest(valid)!.skins[0]!.parts.foot.pivot, [0, 4]);
  assert.deepEqual(parseCosmeticManifest(valid)!.skins[0]!.tags, ["built-in"]);
  const legacy = structuredClone(valid);
  legacy.schemaVersion = 1;
  for (const skin of legacy.skins) {
    delete (skin.parts as Record<string, unknown>).chest;
    delete (skin.parts as Record<string, unknown>).neck;
    for (const meta of Object.values(skin.parts)) delete (meta as Record<string, unknown>).pivot;
  }
  const parsedLegacy = parseCosmeticManifest(legacy);
  assert.ok(parsedLegacy, "schema-v1 six-part manifests remain compatible");
  assert.deepEqual(parsedLegacy.skins[0]!.parts.foot.pivot, [0, 4]);
  const incompleteV2 = structuredClone(valid);
  delete (incompleteV2.skins[0]!.parts as Record<string, unknown>).chest;
  assert.equal(parseCosmeticManifest(incompleteV2), null);
  const invalidPivot = structuredClone(valid);
  invalidPivot.skins[0]!.parts.head.pivot = [9, 4];
  assert.equal(parseCosmeticManifest(invalidPivot), null);
  const invalidTags = structuredClone(valid);
  invalidTags.skins[0]!.tags = ["valid", ""];
  assert.equal(parseCosmeticManifest(invalidTags), null);
  assert.equal(parseCosmeticManifest({ ...valid, skinCount: 9 }), null);
  assert.equal(parseCosmeticManifest({ ...valid, skins: [...defaults, makeSkin("Amber")] }), null);
  const injected = structuredClone(valid);
  injected.skins[0]!.parts.head.png = "/assets/cosmetics/skins/amber/../coal/head.png";
  assert.equal(parseCosmeticManifest(injected), null);
});

test("wire encoder normalizes unknown runtime skin ids", () => {
  assert.equal(encodeCosmetics({ head: "../../bad", torso: "crimson", arms: "amber", legs: "slate" }), "amber.crimson.amber.slate");
});

test("all catalog IDs round-trip in each modular body slot within the wire limit", () => {
  for (const id of SWATCH_IDS) {
    for (const slot of BODY_PART_SLOTS) {
      const cosmetics = { ...DEFAULT_COSMETICS, [slot]: id };
      const encoded = encodeCosmetics(cosmetics);
      assert.ok(encoded.length <= 48, encoded);
      assert.deepEqual(decodeCosmetics(encoded), cosmetics);
    }
  }
});

test("unknown or malformed cosmetics degrade independently to defaults", () => {
  assert.deepEqual(decodeCosmetics("unknown.crimson.bad.slate"), {
    head: DEFAULT_COSMETICS.head,
    torso: "crimson",
    arms: DEFAULT_COSMETICS.arms,
    legs: "slate",
  });
});
