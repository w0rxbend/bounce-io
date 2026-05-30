import {
  CHUNK_HEIGHT_TILES,
  CHUNK_WIDTH_TILES,
  MAX_PLATFORM_WIDTH_TILES,
  MAX_REACHABLE_HORIZONTAL_GAP_TILES,
  MAX_REACHABLE_VERTICAL_GAP_TILES,
  MIN_PLATFORM_WIDTH_TILES,
  TILE_SIZE
} from "./constants.js";
import type { EnemyKind, EnemySpawn, GeneratedChunk, JumpPadSpawn, PlatformSpan, TileKind, TileMap, WindZoneSpawn } from "./types.js";
import { createRng, hashSeed } from "./rng.js";

export interface GenerateChunkOptions {
  seed: number;
  chunkY: number;
  width?: number;
  height?: number;
}

export interface ReachabilityIssue {
  from: PlatformSpan;
  to: PlatformSpan;
  reason: "vertical-gap" | "horizontal-gap" | "unreachable";
}

function emptyTiles(width: number, height: number): TileKind[] {
  return new Array<TileKind>(width * height).fill("empty");
}

function tileIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function overlapOrGap(a: PlatformSpan, b: PlatformSpan): number {
  const aMax = a.x + a.width - 1;
  const bMax = b.x + b.width - 1;
  if (aMax < b.x) return b.x - aMax;
  if (bMax < a.x) return a.x - bMax;
  return 0;
}

function makePlatform(x: number, y: number, width: number, chunkWidth: number): PlatformSpan {
  const w = clamp(width, MIN_PLATFORM_WIDTH_TILES, Math.min(MAX_PLATFORM_WIDTH_TILES, chunkWidth - 2));
  return {
    x: clamp(x, 1, chunkWidth - w - 1),
    y,
    width: w
  };
}

// Ensure all spans on the same row have at least minGap tiles of horizontal space
// between them, pushing right-ward as needed, clamped to chunk bounds.
function separatePlatforms(spans: PlatformSpan[], minGap: number, chunkWidth: number): PlatformSpan[] {
  const sorted = [...spans].sort((a, b) => a.x - b.x);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const minX = prev.x + prev.width + minGap;
    if (sorted[i]!.x < minX) {
      sorted[i] = { ...sorted[i]!, x: Math.min(minX, chunkWidth - sorted[i]!.width - 1) };
    }
  }
  return sorted;
}

// Multi-path chunk generator.
// Each chunk has:
//   - Entry platform: center-bottom, 6 tiles wide
//   - 4 intermediate layers at 3-tile vertical gaps (matching MAX_REACHABLE_VERTICAL_GAP_TILES)
//   - Per layer: LEFT (recovery) + CENTER (main) + RIGHT (risk) platforms
//     OR a convergence platform (25% chance) spanning the center
//   - Exit platform: center-top, 6 tiles wide
//   - Coins (relics) on RIGHT lane platforms
//   - Hazard tiles on RIGHT lane at layers 2+ (progressive difficulty)
export function generateVerticalChunk(options: GenerateChunkOptions): GeneratedChunk {
  const width = options.width ?? CHUNK_WIDTH_TILES;
  const height = options.height ?? CHUNK_HEIGHT_TILES;

  if (width < 12 || height < 12) {
    throw new Error("chunk dimensions too small for multi-path generation");
  }

  const rng = createRng(hashSeed(options.seed, options.chunkY));
  const tiles = emptyTiles(width, height);
  const allPlatforms: PlatformSpan[] = [];

  const difficulty = Math.min(1.0, options.chunkY / 20);

  // Entry: center bottom. Chunk 0 gets a full-width starting ground so the
  // first screen reads as a stable launch pad instead of a floating island.
  const isStartChunk = options.chunkY === 0;
  const entryWidth = isStartChunk ? width : clamp(6, MIN_PLATFORM_WIDTH_TILES, width - 4);
  const entry: PlatformSpan = {
    x: isStartChunk ? 0 : Math.floor(width / 2) - Math.floor(entryWidth / 2),
    y: height - 2,
    width: entryWidth
  };
  allPlatforms.push(entry);

  // Vertical layer positions: spaced exactly MAX_REACHABLE_VERTICAL_GAP_TILES apart
  // entry.y=16, layers at 13,10,7,4, exit at 1  (for height=18, gap=3)
  const gap = MAX_REACHABLE_VERTICAL_GAP_TILES;
  const numLayers = Math.floor((height - 3) / gap) - 1;

  // Track the highest reachable end-x from the previous layer so each layer's
  // rightmost platform stays within MAX_REACHABLE_HORIZONTAL_GAP_TILES of it.
  // A convergence layer can shift this significantly leftward; using entry-based
  // cap alone would still allow unreachable platforms after convergence layers.
  let prevLayerMaxEndX = entry.x + entry.width - 1;

  for (let layer = 1; layer <= numLayers; layer++) {
    const layerY = entry.y - layer * gap;
    if (layerY < 2) break;

    const convergenceChance = 0.15 + difficulty * 0.25;

    if (rng.nextFloat() < convergenceChance) {
      // Convergence: single wide platform — PvP zone
      const convWidth = clamp(rng.int(7, 11), MIN_PLATFORM_WIDTH_TILES, width - 4);
      const convX = Math.floor(width / 2) - Math.floor(convWidth / 2) + rng.int(-1, 1);
      const conv = makePlatform(convX, layerY, convWidth, width);
      allPlatforms.push(conv);
      prevLayerMaxEndX = conv.x + conv.width - 1;
    } else {
      // Left lane (recovery): centered around x≈5, wider platforms, small gaps
      const leftWidth = rng.int(3, 5);
      const leftCenter = rng.int(3, 7);
      const left = makePlatform(leftCenter - Math.floor(leftWidth / 2), layerY, leftWidth, width);

      // Center lane (main): centered, medium width
      const centerWidth = rng.int(3, MAX_PLATFORM_WIDTH_TILES);
      const centerCenter = Math.floor(width / 2) + rng.int(-2, 2);
      const center = makePlatform(centerCenter - Math.floor(centerWidth / 2), layerY, centerWidth, width);

      // Right lane (risk): centered around x≈19, narrower, high reward
      const rightWidth = rng.int(MIN_PLATFORM_WIDTH_TILES, 4);
      const rightCenter = rng.int(width - 8, width - 4);
      const right = makePlatform(rightCenter - Math.floor(rightWidth / 2), layerY, rightWidth, width);

      // Enforce minimum 2-tile gap between same-row platforms so player can pass between them
      const layerPlatforms = separatePlatforms([left, center, right], 2, width);

      // Cap rightmost to stay within reach of previous layer's rightmost platform.
      // prevLayerMaxEndX shrinks when a narrow convergence layer precedes this one.
      const reachCapX = prevLayerMaxEndX + MAX_REACHABLE_HORIZONTAL_GAP_TILES;
      const lastIdx = layerPlatforms.length - 1;
      const lastP = layerPlatforms[lastIdx]!;
      if (lastP.x > reachCapX) {
        layerPlatforms[lastIdx] = { ...lastP, x: Math.min(reachCapX, width - lastP.width - 1) };
      }

      for (const p of layerPlatforms) allPlatforms.push(p);
      const rightmostP = layerPlatforms[lastIdx]!;
      prevLayerMaxEndX = rightmostP.x + rightmostP.width - 1;

      // Hazard on right lane at layers 2+ (difficulty-scaled probability)
      if (layer >= 2 && rng.nextFloat() < difficulty * 0.55) {
        const hazardX = rightmostP.x + Math.floor(rightmostP.width / 2);
        const hazardY = layerY - 1;
        if (hazardY >= 0 && hazardY < height && tiles[tileIndex(width, hazardX, hazardY)] === "empty") {
          tiles[tileIndex(width, hazardX, hazardY)] = "hazard";
        }
      }
    }
  }

  // Exit: center top
  const exitWidth = clamp(6, MIN_PLATFORM_WIDTH_TILES, width - 4);
  const exit: PlatformSpan = {
    x: Math.floor(width / 2) - Math.floor(exitWidth / 2),
    y: 1,
    width: exitWidth
  };
  allPlatforms.push(exit);

  // Write oneWay tiles for all platforms — players can jump through from below,
  // land from above, and drop through with the drop input. Only the floor is solid.
  for (const platform of allPlatforms) {
    for (let x = platform.x; x < platform.x + platform.width; x++) {
      if (x >= 0 && x < width && platform.y >= 0 && platform.y < height) {
        tiles[tileIndex(width, x, platform.y)] = "oneWay";
      }
    }
  }

  // Only chunk 0 owns a true bottom floor. Floors on upper chunks become
  // full-width ceilings over the previous chunk when chunks are stacked.
  if (options.chunkY === 0) {
    for (let x = 0; x < width; x++) {
      tiles[tileIndex(width, x, height - 1)] = "solid";
    }
  }

  // Coin (relic) placement: on RIGHT lane platforms only, above the platform
  // Right platforms are every 3rd entry in allPlatforms after entry (index 0)
  // Pattern: entry, [left, center, right] per 3-platform layer, exit
  const relics: Array<{ id: string; x: number; y: number }> = [];
  const enemies: EnemySpawn[] = [];
  const jumpPads: JumpPadSpawn[] = [];
  const windZones: WindZoneSpawn[] = [];
  let relicIndex = 0;

  for (let i = 1; i < allPlatforms.length - 1; i++) {
    const platform = allPlatforms[i];
    if (!platform) continue;

    // Identify right-lane platforms: those with x center > width * 0.6
    const center = platform.x + platform.width / 2;
    if (center > width * 0.6 && relicIndex < 5) {
      const coinY = platform.y - 1;
      const coinX = platform.x + Math.floor(platform.width / 2);
      if (coinY >= 0 && coinY < height && tiles[tileIndex(width, coinX, coinY)] === "empty") {
        tiles[tileIndex(width, coinX, coinY)] = "relic";
        relics.push({ id: `relic:${options.chunkY}:${relicIndex}`, x: coinX, y: coinY });
        relicIndex++;
      }
    }
  }

  if (options.chunkY > 0) {
    const padCandidates = allPlatforms
      .slice(1, -1)
      .filter((platform) => platform.width >= 3 && platform.x + platform.width / 2 < width * 0.72);
    if (padCandidates.length > 0 && (options.chunkY <= 2 || rng.nextFloat() < 0.65)) {
      const platform = padCandidates[rng.int(0, padCandidates.length - 1)]!;
      const padX = platform.x + Math.floor(platform.width / 2);
      const padY = platform.y - 1;
      if (padY >= 0 && tiles[tileIndex(width, padX, padY)] === "empty") {
        jumpPads.push({
          id: `jumpPad:${options.chunkY}:0`,
          x: padX,
          y: padY,
          multiplier: 5
        });
      }
    }

    if (options.chunkY >= 8 && options.chunkY < 16) {
      const windCandidates = allPlatforms
        .slice(1, -1)
        .filter((platform) => platform.width >= 3 && platform.y >= 5);
      const maxWindZones = options.chunkY >= 12 ? 2 : 1;
      let windIndex = 0;
      for (let i = 0; i < windCandidates.length && windIndex < maxWindZones; i++) {
        const platform = windCandidates[(i + options.chunkY) % windCandidates.length];
        if (!platform) continue;
        const zoneSeed = hashSeed(options.seed, options.chunkY * 911 + platform.x * 37 + platform.y * 101);
        const chance = options.chunkY >= 12 ? 42 : 28;
        if (zoneSeed % 100 >= chance) continue;
        const zoneWidth = clamp(platform.width + 1, 3, 5);
        const zoneHeight = 4;
        const zoneX = clamp(platform.x + Math.floor(platform.width / 2) - Math.floor(zoneWidth / 2), 0, width - zoneWidth);
        const zoneY = clamp(platform.y - zoneHeight, 0, height - zoneHeight - 1);
        const direction: -1 | 1 = (zoneSeed & 1) === 0 ? 1 : -1;
        windZones.push({
          id: `wind:${options.chunkY}:${windIndex}`,
          x: zoneX,
          y: zoneY,
          width: zoneWidth,
          height: zoneHeight,
          direction,
          strength: options.chunkY >= 12 ? 620 : 480
        });
        windIndex++;
      }
    }

    const enemyKindsByAltitude: EnemyKind[][] = [
      ["goblin", "goblinScout", "archer"],
      ["goblinScout", "goblinChief", "archer", "skeleton"],
      ["iceBat", "skeleton", "archer"],
      ["iceBat", "skeletonArmored", "iceGolem", "windSpirit"],
      ["skeletonArmored", "iceGolem", "windSpirit", "yeti"],
    ];
    const band = Math.min(enemyKindsByAltitude.length - 1, Math.floor(options.chunkY / 3));
    const kindPool = enemyKindsByAltitude[band]!;
    const maxEnemies = 1 + Math.min(1, Math.floor(options.chunkY / 8));
    let enemyIndex = 0;

    for (let i = 1; i < allPlatforms.length - 1 && enemyIndex < maxEnemies; i++) {
      const platform = allPlatforms[i];
      if (!platform || platform.width < 3) continue;
      const center = platform.x + platform.width / 2;
      const isMainOrRiskLane = center > width * 0.32;
      const spawnRoll = rng.nextFloat();
      const spawnChance = Math.min(0.22, 0.08 + difficulty * 0.1);
      if (!isMainOrRiskLane || spawnRoll >= spawnChance) continue;

      const tileY = platform.y - 1;
      if (tileY < 0 || tiles[tileIndex(width, platform.x + Math.floor(platform.width / 2), tileY)] !== "empty") continue;
      const kind = kindPool[rng.int(0, kindPool.length - 1)]!;
      enemies.push({
        id: `enemy:${options.chunkY}:${enemyIndex}`,
        kind,
        x: platform.x + Math.floor(platform.width / 2),
        y: tileY
      });
      enemyIndex++;
    }
  }

  return {
    seed: options.seed,
    chunkY: options.chunkY,
    width,
    height,
    worldTileY: -options.chunkY * height,
    tiles,
    platforms: allPlatforms,
    entry,
    exit,
    relics,
    enemies,
    jumpPads,
    windZones
  };
}

export function getTile(chunk: GeneratedChunk, x: number, y: number): TileKind {
  if (x < 0 || y < 0 || x >= chunk.width || y >= chunk.height) return "solid";
  return chunk.tiles[tileIndex(chunk.width, x, y)] ?? "solid";
}

export function createChunkTileMap(chunk: GeneratedChunk): TileMap {
  return {
    isSolid: (tileX, tileY) => getTile(chunk, tileX, tileY) === "solid",
    isOneWay: (tileX, tileY) => getTile(chunk, tileX, tileY) === "oneWay",
    getTile: (tileX, tileY) => getTile(chunk, tileX, tileY)
  };
}

// Multi-chunk tile map spanning an arbitrary number of loaded chunks.
// Chunks are keyed by chunkY (0 = ground, 1 = first chunk up, etc.).
// World tile coordinate Y: chunk 0 covers tileY [0, height-1],
// chunk 1 covers [-height, -1], etc.
export function createMultiChunkTileMap(
  chunks: Map<number, GeneratedChunk>,
  chunkWidth: number = CHUNK_WIDTH_TILES,
  chunkHeight: number = CHUNK_HEIGHT_TILES
): TileMap {
  function lookupTile(tileX: number, tileY: number): TileKind {
    // World side walls
    if (tileX < 0 || tileX >= chunkWidth) return "solid";
    // Below chunk 0 floor
    if (tileY >= chunkHeight) return "solid";

    const chunkY = -Math.floor(tileY / chunkHeight);
    const chunk = chunks.get(chunkY);
    if (!chunk) {
      // Unloaded area: treat as empty above, solid at floor level
      return tileY >= 0 ? "solid" : "empty";
    }

    const localY = tileY + chunkY * chunkHeight;
    return getTile(chunk, tileX, localY);
  }

  return {
    isSolid: (x, y) => lookupTile(x, y) === "solid",
    isOneWay: (x, y) => lookupTile(x, y) === "oneWay",
    getTile: (x, y) => lookupTile(x, y)
  };
}

// BFS-based multi-path reachability: checks every platform is reachable
// from the entry platform using the physics constants as constraints.
export function verifyChunkReachability(chunk: GeneratedChunk): ReachabilityIssue[] {
  const platforms = chunk.platforms;
  if (platforms.length === 0) return [];

  const reachable = new Set<number>([0]); // entry is index 0

  // Process platforms sorted by descending y (bottom-first)
  const indexed = platforms.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => b.p.y - a.p.y);

  let changed = true;
  while (changed) {
    changed = false;
    for (const { p: to, i: toIdx } of indexed) {
      if (reachable.has(toIdx)) continue;
      for (const fromIdx of reachable) {
        const from = platforms[fromIdx];
        if (!from) continue;
        if (to.y >= from.y) continue; // must be above (lower tile y)

        const verticalGap = from.y - to.y;
        const horizontalGap = overlapOrGap(from, to);

        if (
          verticalGap <= MAX_REACHABLE_VERTICAL_GAP_TILES &&
          horizontalGap <= MAX_REACHABLE_HORIZONTAL_GAP_TILES
        ) {
          reachable.add(toIdx);
          changed = true;
          break;
        }
      }
    }
  }

  const issues: ReachabilityIssue[] = [];
  for (let i = 1; i < platforms.length; i++) {
    if (!reachable.has(i)) {
      const platform = platforms[i];
      if (platform) {
        issues.push({
          from: platforms[0] as PlatformSpan,
          to: platform,
          reason: "unreachable"
        });
      }
    }
  }

  return issues;
}

// Convenience: return world pixel Y of a tile's top surface
export function tileTopPx(worldTileY: number): number {
  return worldTileY * TILE_SIZE;
}
