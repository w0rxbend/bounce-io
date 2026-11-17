import assert from "node:assert/strict";
import test from "node:test";
import { CHUNK_HEIGHT_TILES, CHUNK_WIDTH_TILES } from "../../packages/shared/src/constants.js";
import { generateVerticalChunk } from "../../packages/shared/src/generation.js";
import { MAX_CHESTS_PER_CHUNK, isGeneratedChunk } from "../../packages/shared/src/validation.js";
import type { TileKind } from "../../packages/shared/src/types.js";

test("a generated chunk matches the 36 by 18 chest contract", () => {
  const chunk = generateVerticalChunk({ seed: 5, chunkY: 2 });
  assert.equal(chunk.width, CHUNK_WIDTH_TILES);
  assert.equal(chunk.height, CHUNK_HEIGHT_TILES);
  assert.ok(chunk.chests.length <= MAX_CHESTS_PER_CHUNK);
  assert.equal(isGeneratedChunk(chunk), true);
});

test("a chunk with a huge height or an uncapped chest list is rejected before render", () => {
  const chunk = generateVerticalChunk({ seed: 5, chunkY: 2 });
  const hugeHeight = CHUNK_HEIGHT_TILES * 100;
  const tiles = Array.from({ length: CHUNK_WIDTH_TILES * hugeHeight }, () => "empty" as TileKind);
  assert.equal(isGeneratedChunk({ ...chunk, height: hugeHeight, tiles }), false);
  assert.equal(isGeneratedChunk({ ...chunk, width: CHUNK_WIDTH_TILES + 1 }), false);

  const omitted = { ...chunk } as Partial<typeof chunk>;
  delete omitted.chests;
  assert.equal(isGeneratedChunk(omitted), false);

  const chests = Array.from({ length: MAX_CHESTS_PER_CHUNK + 1 }, (_, index) => ({ id: `chest:${index}`, x: 1, y: 1 }));
  assert.equal(isGeneratedChunk({ ...chunk, chests }), false);
});
