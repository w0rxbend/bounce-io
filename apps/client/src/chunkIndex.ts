import { CHUNK_HEIGHT_TILES, TILE_SIZE } from "@skybound/shared";

export function chunkYForWorldY(y: number): number {
  return Math.max(0, -Math.floor(Math.floor(y / TILE_SIZE) / CHUNK_HEIGHT_TILES));
}

export function binaryEnemyChunkY(worldY: number): number {
  return chunkYForWorldY(worldY);
}
