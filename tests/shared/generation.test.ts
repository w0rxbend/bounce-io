import assert from "node:assert/strict";
import test from "node:test";
import { LEVEL_DESIGN_CONFIG, generateVerticalChunk, getTile, verifyChunkReachability } from "../../packages/shared/src/generation.js";
import { isClientMessage, isGeneratedChunk } from "../../packages/shared/src/validation.js";
import { GAME_VERSION, PROTOCOL_VERSION } from "../../packages/shared/src/constants.js";

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

test("all chunks 0-49 pass reachability check across multiple seeds", () => {
  const seeds = [0, 42, 1234, 0x5eedbabe, 0xdeadbeef];
  for (const seed of seeds) {
    for (let chunkY = 0; chunkY < 50; chunkY++) {
      const chunk = generateVerticalChunk({ seed, chunkY });
      const issues = verifyChunkReachability(chunk);
      assert.deepEqual(issues, [],
        `seed=${seed} chunk ${chunkY} has reachability issues: ${issues.map(i => i.reason).join(", ")}`);
    }
  }
});

test("sparse chunks keep readable platform counts and multiple route branches", () => {
  const seeds = [0, 42, 1234, 0x5eedbabe, 0xdeadbeef];
  let platformTotal = 0;
  let routeTotal = 0;
  let chunkTotal = 0;

  for (const seed of seeds) {
    for (let chunkY = 0; chunkY < 50; chunkY++) {
      const chunk = generateVerticalChunk({ seed, chunkY });
      assert.ok(
        chunk.platforms.length >= 8 && chunk.platforms.length <= 10,
        `seed=${seed} chunk=${chunkY} should stay sparse, got ${chunk.platforms.length} platforms`
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

  assert.ok(platformTotal / chunkTotal < 10, `average platform count should stay below 10, got ${platformTotal / chunkTotal}`);
  assert.ok(routeTotal / chunkTotal >= 2.8, `average route branches should stay near 3, got ${routeTotal / chunkTotal}`);
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
