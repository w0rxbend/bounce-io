import assert from "node:assert/strict";
import test from "node:test";
import { CHUNK_HEIGHT_TILES, TILE_SIZE } from "@skybound/shared";
import { binaryEnemyChunkY, chunkYForWorldY } from "../../apps/client/src/chunkIndex.js";

test("binary enemies use chunkYForWorldY and do not keep a previous chunk", () => {
  const chunkPixels = CHUNK_HEIGHT_TILES * TILE_SIZE;
  const y = -chunkPixels - 1;
  const previousChunkY = 1;
  assert.equal(chunkYForWorldY(y), 2);
  assert.notEqual(Math.floor(-y / chunkPixels), chunkYForWorldY(y));
  assert.equal(binaryEnemyChunkY(y), chunkYForWorldY(y));
  assert.notEqual(binaryEnemyChunkY(y), previousChunkY);
});
