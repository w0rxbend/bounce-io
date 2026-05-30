import {
  CHUNK_HEIGHT_TILES,
  CHUNK_WIDTH_TILES,
  MAX_PLATFORM_WIDTH_TILES,
  MIN_PLATFORM_WIDTH_TILES,
  SERVER_TICK_RATE,
  SNAPSHOT_RATE,
  TILE_SIZE
} from "../constants.js";

export const NETWORK = {
  serverTickRate: SERVER_TICK_RATE,
  snapshotRate: SNAPSHOT_RATE,
  interpolationDelayMs: 100
} as const;

export const WORLD = {
  chunkHeight: CHUNK_HEIGHT_TILES * TILE_SIZE,
  worldWidth: CHUNK_WIDTH_TILES * TILE_SIZE,
  platformMinWidth: MIN_PLATFORM_WIDTH_TILES * TILE_SIZE,
  platformMaxWidth: MAX_PLATFORM_WIDTH_TILES * TILE_SIZE,
  noFullWidthSolidRows: true
} as const;

export const COLLECTIBLES = {
  coinPickupRadius: 24
} as const;
