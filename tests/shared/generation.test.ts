import assert from "node:assert/strict";
import test from "node:test";
import { LEVEL_DESIGN_CONFIG, biomeForChunkY, generateVerticalChunk, getTile, verifyChunkReachability } from "../../packages/shared/src/generation.js";
import { isClientMessage, isGeneratedChunk } from "../../packages/shared/src/validation.js";
import { GAME_VERSION, PROTOCOL_VERSION, TILE_SIZE } from "../../packages/shared/src/constants.js";
import type { GeneratedChunk, PlatformSpan } from "../../packages/shared/src/types.js";

const BALANCE_SEEDS = [0, 42, 1234, 0x5eedbabe, 0xdeadbeef];

function platformBelowTile(chunk: GeneratedChunk, x: number, y: number): PlatformSpan | undefined {
  return chunk.platforms.find((platform) =>
    platform.y === y + 1 &&
    x >= platform.x &&
    x < platform.x + platform.width
  );
}

function routeNodeTouchesPlatform(chunk: GeneratedChunk, routeKind: string, platform: PlatformSpan): boolean {
  const route = chunk.routes?.find((candidate) => candidate.kind === routeKind);
  return route?.nodes.some((node) => {
    const nodeTileX = Math.floor(node.x / TILE_SIZE);
    const nodeTileY = Math.floor(node.y / TILE_SIZE) - chunk.worldTileY;
    return nodeTileY === platform.y &&
      nodeTileX >= platform.x &&
      nodeTileX < platform.x + platform.width;
  }) ?? false;
}

test("vertical chunk generation is deterministic for a seed and chunk", () => {
  const first = generateVerticalChunk({ seed: 1234, chunkY: 7 });
  const second = generateVerticalChunk({ seed: 1234, chunkY: 7 });
  const different = generateVerticalChunk({ seed: 1234, chunkY: 8 });

  assert.deepEqual(first, second);
  assert.notDeepEqual(first.tiles, different.tiles);
  assert.equal(isGeneratedChunk(first), true);
});

test("vertical chunks expose a reachable entry-to-exit platform route", () => {
  for (let chunkY = 0; chunkY < 20; chunkY += 1) {
    const chunk = generateVerticalChunk({ seed: 8675309, chunkY });
    assert.deepEqual(verifyChunkReachability(chunk), []);
    assert.equal(getTile(chunk, chunk.entry.x, chunk.entry.y), "oneWay");
    assert.equal(getTile(chunk, chunk.exit.x, chunk.exit.y), "oneWay");
  }
});

test("no chunk has a full-width solid/oneWay row that blocks upward movement", () => {
  // Except for the intentional solid floor row at the bottom of chunk 0.
  const seed = 9999;
  for (let chunkY = 0; chunkY < 30; chunkY++) {
    const chunk = generateVerticalChunk({ seed, chunkY });
    const { width, height, tiles } = chunk;
    for (let row = 0; row < height; row++) {
      if (chunkY === 0 && row === height - 1) continue;
      let solidCount = 0;
      for (let col = 0; col < width; col++) {
        const t = tiles[row * width + col];
        if (t === "solid" || t === "oneWay") solidCount++;
      }
      assert.ok(solidCount < width,
        `chunk ${chunkY} row ${row} has a full-width blocker (${solidCount}/${width} tiles solid/oneWay)`);
    }
  }
});

test("upper chunk bottom rows are not solid ceilings over previous chunks", () => {
  const seed = 424242;
  for (let chunkY = 1; chunkY < 100; chunkY++) {
    const chunk = generateVerticalChunk({ seed, chunkY });
    for (let x = 0; x < chunk.width; x++) {
      assert.notEqual(
        getTile(chunk, x, chunk.height - 1),
        "solid",
        `chunk ${chunkY} bottom row must remain passable at x=${x}`
      );
    }
  }
});

test("all chunks 0-75 pass reachability check across multiple seeds", () => {
  const seeds = [0, 42, 1234, 0x5eedbabe, 0xdeadbeef];
  for (const seed of seeds) {
    for (let chunkY = 0; chunkY <= 75; chunkY++) {
      const chunk = generateVerticalChunk({ seed, chunkY });
      const issues = verifyChunkReachability(chunk);
      assert.deepEqual(issues, [],
        `seed=${seed} chunk ${chunkY} has reachability issues: ${issues.map(i => i.reason).join(", ")}`);
    }
  }
});

test("chunks keep readable platform counts and multiple route branches", () => {
  let platformTotal = 0;
  let routeTotal = 0;
  let chunkTotal = 0;

  for (const seed of BALANCE_SEEDS) {
    for (let chunkY = 0; chunkY < 50; chunkY++) {
      const chunk = generateVerticalChunk({ seed, chunkY });
      assert.ok(
        chunk.platforms.length >= 8 && chunk.platforms.length <= 12,
        `seed=${seed} chunk=${chunkY} should stay readable, got ${chunk.platforms.length} platforms`
      );
      assert.ok(
        (chunk.routes?.length ?? 0) >= LEVEL_DESIGN_CONFIG.routesPerBandMin,
        `seed=${seed} chunk=${chunkY} should expose multiple route branches`
      );
      platformTotal += chunk.platforms.length;
      routeTotal += chunk.routes?.length ?? 0;
      chunkTotal++;
    }
  }

  assert.ok(platformTotal / chunkTotal < 11.5, `average platform count should stay readable, got ${platformTotal / chunkTotal}`);
  assert.ok(routeTotal / chunkTotal >= 3.5, `average route branches should reflect safe/risk/relic/recovery choices, got ${routeTotal / chunkTotal}`);
});

test("chunks expose difficulty metrics and avoid mostly-staircase layouts", () => {
  const archetypes = new Set<string>();
  let staircaseTotal = 0;
  let chunkTotal = 0;
  let earlyScore = 0;
  let lateScore = 0;
  let earlyChunks = 0;
  let lateChunks = 0;
  let highStaircaseChunks = 0;

  for (const seed of BALANCE_SEEDS) {
    for (let chunkY = 0; chunkY < 60; chunkY++) {
      const chunk = generateVerticalChunk({ seed, chunkY });
      const metrics = chunk.difficultyMetrics;

      assert.ok(metrics, `seed=${seed} chunk=${chunkY} missing difficulty metrics`);
      assert.ok(metrics.score >= 0 && metrics.score <= 1, `seed=${seed} chunk=${chunkY} score out of range`);
      assert.ok(metrics.targetDifficulty >= 0 && metrics.targetDifficulty <= 1, `seed=${seed} chunk=${chunkY} target out of range`);
      if (metrics.staircaseRatio > 0.5) highStaircaseChunks++;

      archetypes.add(metrics.archetype);
      staircaseTotal += metrics.staircaseRatio;
      chunkTotal++;
      if (chunkY < 8) {
        earlyScore += metrics.score;
        earlyChunks++;
      } else if (chunkY >= 32) {
        lateScore += metrics.score;
        lateChunks++;
      }
    }
  }

  assert.ok(archetypes.size >= 5, `generator should produce varied archetypes, got ${[...archetypes].join(", ")}`);
  assert.ok(staircaseTotal / chunkTotal <= 0.20, `average staircase ratio should stay near the 20% target, got ${staircaseTotal / chunkTotal}`);
  assert.ok(highStaircaseChunks / chunkTotal <= 0.20, `mostly-staircase chunks should be rare, got ${highStaircaseChunks}/${chunkTotal}`);
  assert.ok(lateScore / lateChunks > earlyScore / earlyChunks, `late chunks should measure harder than early chunks`);
});

test("route generation consistently offers safe, risk, relic, and recovery beats", () => {
  for (const seed of BALANCE_SEEDS) {
    for (let chunkY = 0; chunkY < 50; chunkY++) {
      const chunk = generateVerticalChunk({ seed, chunkY });
      const routeKinds = new Set((chunk.routes ?? []).map((route) => route.kind));

      assert.ok(routeKinds.has("safe"), `seed=${seed} chunk=${chunkY} missing safe route`);
      assert.ok(routeKinds.has("risk"), `seed=${seed} chunk=${chunkY} missing risk route`);
      assert.ok(routeKinds.has("relic"), `seed=${seed} chunk=${chunkY} missing relic route`);
      assert.ok(chunk.relics.length >= 1, `seed=${seed} chunk=${chunkY} should offer at least one optional relic`);

      const safeRoute = chunk.routes?.find((route) => route.kind === "safe");
      const riskRoute = chunk.routes?.find((route) => route.kind === "risk");
      const relicRoute = chunk.routes?.find((route) => route.kind === "relic");
      assert.ok(safeRoute && riskRoute && relicRoute);
      assert.ok(safeRoute.reward < riskRoute.reward, `seed=${seed} chunk=${chunkY} safe route should be lower reward than risk`);
      assert.ok(safeRoute.reward < relicRoute.reward, `seed=${seed} chunk=${chunkY} safe route should be lower reward than relic`);

      const hasMidChunkRecoveryNode = safeRoute.nodes.some((node) => {
        const localTileY = Math.floor(node.y / TILE_SIZE) - chunk.worldTileY;
        return localTileY >= 6 && localTileY <= 8;
      });
      assert.equal(hasMidChunkRecoveryNode, true, `seed=${seed} chunk=${chunkY} safe route should include a mid-chunk recovery/convergence beat`);
    }
  }
});

test("hazards stay off mandatory safe-route platforms", () => {
  let checkedHazards = 0;

  for (const seed of BALANCE_SEEDS) {
    for (let chunkY = 0; chunkY < 50; chunkY++) {
      const chunk = generateVerticalChunk({ seed, chunkY });
      assert.deepEqual(verifyChunkReachability(chunk), [], `seed=${seed} chunk=${chunkY} must remain reachable with hazards present`);

      for (let y = 0; y < chunk.height; y++) {
        for (let x = 0; x < chunk.width; x++) {
          if (getTile(chunk, x, y) !== "hazard") continue;
          checkedHazards++;

          const platform = platformBelowTile(chunk, x, y);
          assert.ok(platform, `seed=${seed} chunk=${chunkY} hazard at ${x},${y} should sit above a platform`);
          assert.notDeepEqual(platform, chunk.entry, `seed=${seed} chunk=${chunkY} hazard blocks entry platform`);
          assert.notDeepEqual(platform, chunk.exit, `seed=${seed} chunk=${chunkY} hazard blocks exit platform`);
          assert.equal(
            routeNodeTouchesPlatform(chunk, "safe", platform),
            false,
            `seed=${seed} chunk=${chunkY} hazard at ${x},${y} sits on mandatory safe route platform`
          );
        }
      }
    }
  }

  assert.ok(checkedHazards > 0, "test should exercise at least one generated hazard");
});

test("mid-altitude chunks add biome complexity without breaking playability", () => {
  const bandComplexity = (start: number, end: number) => {
    let score = 0;
    let chunks = 0;
    for (const seed of BALANCE_SEEDS) {
      for (let chunkY = start; chunkY <= end; chunkY++) {
        const chunk = generateVerticalChunk({ seed, chunkY });
        assert.deepEqual(verifyChunkReachability(chunk), [], `seed=${seed} chunk=${chunkY} must stay reachable`);
        const hazards = chunk.tiles.filter((tile) => tile === "hazard").length;
        score += hazards + chunk.enemies.length + chunk.windZones.length;
        chunks++;
      }
    }
    return score / chunks;
  };

  const starterComplexity = bandComplexity(0, 5);
  const skyComplexity = bandComplexity(8, 15);

  assert.ok(
    skyComplexity >= starterComplexity * 3,
    `mid-altitude biome complexity should ramp clearly: starter=${starterComplexity}, sky=${skyComplexity}`
  );
});

test("new biome progression follows the post-existing region sequence", () => {
  const expected = [
    { chunkY: 27, id: "sky-canyons", name: "Sky Canyons" },
    { chunkY: 32, id: "ember-peaks", name: "Ember Peaks" },
    { chunkY: 37, id: "void-expanse", name: "Void Expanse" },
    { chunkY: 43, id: "arcane-nexus", name: "Arcane Nexus" },
    { chunkY: 49, id: "frozen-heights", name: "Frozen Heights" },
    { chunkY: 55, id: "celestial-rift", name: "Celestial Rift" }
  ] as const;

  for (const expectedBiome of expected) {
    const metadata = biomeForChunkY(expectedBiome.chunkY);
    const chunk = generateVerticalChunk({ seed: 2026, chunkY: expectedBiome.chunkY });

    assert.equal(metadata.id, expectedBiome.id);
    assert.equal(metadata.name, expectedBiome.name);
    assert.equal(chunk.regionId, expectedBiome.id);
    assert.equal(chunk.regionName, expectedBiome.name);
    assert.equal(chunk.checkpoint, true);
    assert.equal(chunk.portal?.checkpoint, true);
    assert.equal(chunk.biome?.startChunkY, expectedBiome.chunkY);
    assert.ok(chunk.routes?.some((route) => route.kind === "recovery" && route.checkpointSafe));
  }
});

test("biome-scaled placements carry route and danger metadata", () => {
  let hazards = 0;
  let assistedObjects = 0;

  for (const seed of BALANCE_SEEDS) {
    for (let chunkY = 27; chunkY <= 61; chunkY++) {
      const chunk = generateVerticalChunk({ seed, chunkY });

      for (const hazard of chunk.hazards ?? []) {
        hazards++;
        assert.equal(hazard.biomeId, chunk.biome?.id);
        assert.ok(hazard.route === "risk" || hazard.route === "relic");
        assert.ok(hazard.danger > 0 && hazard.danger <= 1);
        assert.equal(getTile(chunk, hazard.x, hazard.y), "hazard");
      }

      for (const spawn of [...chunk.enemies, ...chunk.jumpPads, ...chunk.windZones]) {
        if (!spawn.placement) continue;
        assistedObjects++;
        assert.equal(spawn.placement.biomeId, chunk.biome?.id);
        assert.ok(spawn.placement.difficulty >= 0 && spawn.placement.difficulty <= 1);
        assert.ok(spawn.placement.danger >= 0 && spawn.placement.danger <= 1);
      }
    }
  }

  assert.ok(hazards > 0, "new biome bands should produce hazard metadata");
  assert.ok(assistedObjects > 0, "new biome bands should produce placement metadata for assisted objects");
});

test("chunk entry and exit platforms are always within world bounds", () => {
  for (let chunkY = 0; chunkY < 20; chunkY++) {
    const chunk = generateVerticalChunk({ seed: 777, chunkY });
    assert.ok(chunk.entry.x >= 0 && chunk.entry.x < chunk.width, `entry x out of bounds at chunk ${chunkY}`);
    assert.ok(chunk.exit.x >= 0 && chunk.exit.x < chunk.width, `exit x out of bounds at chunk ${chunkY}`);
    assert.ok(chunk.entry.y >= 0 && chunk.entry.y < chunk.height, `entry y out of bounds at chunk ${chunkY}`);
    assert.ok(chunk.exit.y >= 0 && chunk.exit.y < chunk.height, `exit y out of bounds at chunk ${chunkY}`);
  }
});

test("client protocol validation accepts known messages and rejects malformed input", () => {
  assert.equal(isClientMessage({
    type: "hello",
    protocol: PROTOCOL_VERSION,
    version: GAME_VERSION,
    name: "runner"
  }), true);

  assert.equal(isClientMessage({
    type: "input",
    playerId: "p1",
    input: {
      left: false,
      right: true,
      jumpPressed: true,
      jumpHeld: true,
      drop: false,
      kick: false,
      sequence: 12
    }
  }), true);

  assert.equal(isClientMessage({
    type: "input",
    playerId: "p1",
    input: { left: false, right: true, sequence: -1 }
  }), false);
});

test("treasure chests occasionally generate on relic/risk platforms, hidden by default", () => {
  let found = false;
  for (const seed of BALANCE_SEEDS) {
    for (let chunkY = 1; chunkY < 60; chunkY += 1) {
      const chunk = generateVerticalChunk({ seed, chunkY });
      assert.ok(Array.isArray(chunk.chests));
      for (const chest of chunk.chests) {
        found = true;
        assert.ok(chest.x >= 0 && chest.x < chunk.width);
        assert.ok(chest.y >= 0 && chest.y < chunk.height);
        // A chest sits on a platform surface, not floating in open air —
        // the tile directly below it must be a platform (oneWay/solid).
        const below = chunk.tiles[(chest.y + 1) * chunk.width + chest.x];
        assert.ok(below === "oneWay" || below === "solid", `chest ${chest.id} should sit on a platform`);
      }
    }
  }
  assert.equal(found, true, "expected at least one chest across the scanned seeds/chunks");
});
