import assert from "node:assert/strict";
import test from "node:test";
import type { Texture } from "pixi.js";
import { CosmeticAssetRegistry } from "../../apps/client/src/cosmeticAssetRegistry.js";
import type { CosmeticManifestSkin, ParsedCosmeticManifest, PlayerCosmetics } from "../../apps/client/src/cosmetics.js";

const PARTS = ["head", "torso", "chest", "neck", "arm", "hand", "leg", "foot"] as const;

function manifest(ids: string[]): ParsedCosmeticManifest {
  const skins: CosmeticManifestSkin[] = ids.map((id) => ({
    id, displayName: id, fallbackColor: "#123456",
    parts: Object.fromEntries(PARTS.map((part) => [part, {
      png: `/assets/cosmetics/skins/${id}/${part}.png`, width: 8, height: 8,
      pivot: part === "foot" ? [0, 4] : [4, 0],
    }])) as CosmeticManifestSkin["parts"],
  }));
  return { schemaVersion: 2, skins };
}

function fakeTexture(width = 8, height = 8): Texture {
  return { width, height } as Texture;
}

test("registry installation is lazy and selected loadouts request only eight mapped parts", async () => {
  const calls: string[] = [];
  const registry = new CosmeticAssetRegistry(async (url) => { calls.push(url); return fakeTexture(); });
  registry.install(manifest(["headskin", "torsoskin", "armskin", "legskin"]));
  assert.equal(calls.length, 0);
  const cosmetics: PlayerCosmetics = { head: "headskin", torso: "torsoskin", arms: "armskin", legs: "legskin" };
  assert.deepEqual(registry.getLoadout(cosmetics), {
    head: undefined, neck: undefined, torso: undefined, chest: undefined,
    arm: undefined, hand: undefined, leg: undefined, foot: undefined,
  });
  await registry.ensureLoadout(cosmetics);
  assert.equal(calls.length, 8);
  assert.ok(registry.getLoadout(cosmetics).head);
  assert.ok(registry.getLoadout(cosmetics).neck);
  assert.ok(registry.getLoadout(cosmetics).chest);
  assert.ok(registry.getLoadout(cosmetics).foot);
  await registry.ensureLoadout(cosmetics);
  assert.equal(calls.length, 8, "ready assets must remain cached");
});

test("concurrent requests deduplicate and picker pages load only their icon part", async () => {
  const calls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const ids = Array.from({ length: 10 }, (_, index) => `skin${index}`);
  const registry = new CosmeticAssetRegistry(async (url) => { calls.push(url); await gate; return fakeTexture(); });
  registry.install(manifest(ids));
  const first = registry.ensurePickerParts("arms", ids);
  const second = registry.ensurePickerParts("arms", ids);
  await Promise.resolve();
  assert.equal(calls.length, 10);
  assert.ok(calls.every((url) => url.endsWith("/arm.png")));
  release();
  await Promise.all([first, second]);
  assert.equal(calls.length, 10);
});

test("partial failures preserve successful siblings and notify once per batch", async () => {
  const notifications: Array<ReadonlySet<string>> = [];
  const registry = new CosmeticAssetRegistry(async (url) => {
    if (url.endsWith("/neck.png")) throw new Error("missing");
    if (url.endsWith("/chest.png")) return fakeTexture(7, 8);
    return fakeTexture();
  }, undefined, () => {});
  registry.install(manifest(["amber"]));
  registry.subscribe((ids) => notifications.push(ids));
  const cosmetics: PlayerCosmetics = { head: "amber", torso: "amber", arms: "amber", legs: "amber" };
  await registry.ensureLoadout(cosmetics);
  await Promise.resolve();
  const loadout = registry.getLoadout(cosmetics);
  assert.ok(loadout.head && loadout.torso && loadout.arm && loadout.hand && loadout.leg && loadout.foot);
  assert.equal(loadout.neck, undefined);
  assert.equal(loadout.chest, undefined);
  assert.equal(notifications.length, 1);
  assert.deepEqual([...notifications[0]!], ["amber"]);
});

test("transient failures retry automatically while permanent failures stay bounded", async () => {
  let now = 0;
  const scheduled: Array<() => void> = [];
  const calls = new Map<string, number>();
  const registry = new CosmeticAssetRegistry(async (url) => {
    calls.set(url, (calls.get(url) ?? 0) + 1);
    if (url.endsWith("/head.png") && calls.get(url) === 1) throw new Error("transient");
    if (url.endsWith("/neck.png")) throw new Error("permanent");
    return fakeTexture();
  }, () => now, (callback) => scheduled.push(callback));
  registry.install(manifest(["amber"]));
  const cosmetics: PlayerCosmetics = { head: "amber", torso: "amber", arms: "amber", legs: "amber" };
  await registry.ensureLoadout(cosmetics);
  assert.equal(registry.getLoadout(cosmetics).head, undefined);
  assert.equal(scheduled.length, 2);

  for (let retry = 0; retry < 4; retry++) {
    now += 5_000;
    const batch = scheduled.splice(0);
    for (const callback of batch) callback();
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.ok(registry.getLoadout(cosmetics).head, "transient part should recover without another cosmetic request");
  assert.equal(calls.get("/assets/cosmetics/skins/amber/head.png"), 2);
  assert.equal(calls.get("/assets/cosmetics/skins/amber/neck.png"), 4, "initial attempt plus three bounded retries");
  assert.equal(scheduled.length, 0);
});
