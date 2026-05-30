import {
  CHUNK_HEIGHT_TILES,
  CHUNK_WIDTH_TILES,
  GRAVITY,
  JUMP_SPEED,
  MAX_PLATFORM_WIDTH_TILES,
  MAX_REACHABLE_HORIZONTAL_GAP_TILES,
  MAX_REACHABLE_VERTICAL_GAP_TILES,
  MIN_PLATFORM_WIDTH_TILES,
  TILE_SIZE
} from "./constants.js";
import type { EnemyKind, EnemySpawn, GeneratedChunk, JumpPadSpawn, PlatformSpan, RouteBranch, TileKind, TileMap, WindZoneSpawn } from "./types.js";
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

type RouteKind = "safe" | "risk" | "relic" | "rest";

interface PlannedPlatform {
  span: PlatformSpan;
  route: RouteKind;
}

export const LEVEL_DESIGN_CONFIG = {
  targetPlatformDensity: 0.64,
  minVerticalGap: MAX_REACHABLE_VERTICAL_GAP_TILES * TILE_SIZE,
  maxVerticalGap: MAX_REACHABLE_VERTICAL_GAP_TILES * TILE_SIZE * 2,
  minHorizontalGap: 4 * TILE_SIZE,
  maxHorizontalGap: MAX_REACHABLE_HORIZONTAL_GAP_TILES * TILE_SIZE,
  routesPerBandMin: 2,
  routesPerBandMax: 3,
  safeRouteChance: 0.72,
  riskyShortcutChance: 0.35,
  jumpPadChance: 0.35,
  maxNormalJumpHeight: Math.floor((JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY)),
  maxNormalJumpHorizontal: MAX_REACHABLE_HORIZONTAL_GAP_TILES * TILE_SIZE,
  jumpPadBoostHeight: Math.floor(((JUMP_SPEED * 2.35) * (JUMP_SPEED * 2.35)) / (2 * GRAVITY)),
  jumpPadMultiplier: 2.35,
  restPlatformEveryBands: 3
} as const;

const SPARSE_BAND_ROWS = [13, 10, 7, 4] as const;
const REST_BAND_ROW = 7;
const MAX_ASSISTED_VERTICAL_GAP_TILES = MAX_REACHABLE_VERTICAL_GAP_TILES * 2;
const MAX_ASSISTED_HORIZONTAL_GAP_TILES = MAX_REACHABLE_HORIZONTAL_GAP_TILES * 2;

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

export function estimateMaxNormalJumpHeight(): number {
  return LEVEL_DESIGN_CONFIG.maxNormalJumpHeight;
}

export function estimateMaxHorizontalJumpDistance(): number {
  return LEVEL_DESIGN_CONFIG.maxNormalJumpHorizontal;
}

export function canReachPlatform(
  from: PlatformSpan,
  to: PlatformSpan,
  assisted = false
): boolean {
  if (to.y >= from.y) return false;
  const verticalGap = from.y - to.y;
  const horizontalGap = overlapOrGap(from, to);
  const maxVertical = assisted ? MAX_ASSISTED_VERTICAL_GAP_TILES : MAX_REACHABLE_VERTICAL_GAP_TILES;
  const maxHorizontal = assisted ? MAX_ASSISTED_HORIZONTAL_GAP_TILES : MAX_REACHABLE_HORIZONTAL_GAP_TILES;
  return verticalGap <= maxVertical && horizontalGap <= maxHorizontal;
}

function makePlatform(x: number, y: number, width: number, chunkWidth: number): PlatformSpan {
  const w = clamp(width, MIN_PLATFORM_WIDTH_TILES, Math.min(MAX_PLATFORM_WIDTH_TILES, chunkWidth - 2));
  return {
    x: clamp(x, 1, chunkWidth - w - 1),
    y,
    width: w
  };
}

function platformCenter(platform: PlatformSpan): number {
  return platform.x + platform.width / 2;
}

function platformCenterPx(platform: PlatformSpan, worldTileY: number): { x: number; y: number } {
  return {
    x: platformCenter(platform) * TILE_SIZE,
    y: (worldTileY + platform.y) * TILE_SIZE
  };
}

function routeCenter(route: RouteKind, row: number, width: number, rng: ReturnType<typeof createRng>): number {
  const mid = Math.floor(width / 2);
  switch (route) {
    case "safe":
      return clamp(mid + rng.int(-2, 1), 7, width - 8);
    case "risk":
      return clamp(width - 10 + rng.int(-2, 2), 8, width - 5);
    case "relic":
      return row >= REST_BAND_ROW
        ? clamp(9 + rng.int(-2, 2), 4, width - 9)
        : clamp(width - 11 + rng.int(-2, 2), 8, width - 5);
    case "rest":
    default:
      return clamp(mid + rng.int(-1, 1), 7, width - 8);
  }
}

function routeWidth(route: RouteKind, row: number, rng: ReturnType<typeof createRng>): number {
  if (route === "rest") return rng.int(8, 10);
  if (route === "safe") return row <= 4 ? rng.int(5, 7) : rng.int(6, 7);
  if (route === "relic") return rng.int(4, 5);
  return rng.int(3, 4);
}

function findNormalLaunchPlatform(target: PlatformSpan, lower: PlatformSpan[]): PlatformSpan | null {
  for (const platform of lower) {
    if (canReachPlatform(platform, target)) return platform;
  }
  return null;
}

function findAssistedLaunchPlatform(target: PlatformSpan, lower: PlatformSpan[]): PlatformSpan | null {
  let best: PlatformSpan | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const platform of lower) {
    if (canReachPlatform(platform, target)) continue;
    if (!canReachPlatform(platform, target, true)) continue;
    const verticalGap = platform.y - target.y;
    const horizontalGap = overlapOrGap(platform, target);
    const score = verticalGap * 2 + horizontalGap;
    if (score < bestScore) {
      best = platform;
      bestScore = score;
    }
  }
  return best;
}

function placeJumpPadOnPlatform(platform: PlatformSpan, chunkY: number, index: number): JumpPadSpawn {
  return {
    id: `jumpPad:${chunkY}:${index}`,
    x: platform.x + Math.floor(platform.width / 2),
    y: platform.y - 1,
    multiplier: LEVEL_DESIGN_CONFIG.jumpPadMultiplier
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

// Sparse multi-path chunk generator.
// Each chunk keeps the normal 3-tile vertical cadence for casual climbing, but
// most bands now expose two route nodes instead of three dense same-row islands.
// The middle band is a readable rest/convergence platform, and occasional jump
// pads create faster high-gap shortcuts without becoming mandatory.
export function generateVerticalChunk(options: GenerateChunkOptions): GeneratedChunk {
  const width = options.width ?? CHUNK_WIDTH_TILES;
  const height = options.height ?? CHUNK_HEIGHT_TILES;

  if (width < 12 || height < 12) {
    throw new Error("chunk dimensions too small for multi-path generation");
  }

  const rng = createRng(hashSeed(options.seed, options.chunkY));
  const tiles = emptyTiles(width, height);
  const plannedPlatforms: PlannedPlatform[] = [];

  const difficulty = Math.min(1.0, options.chunkY / 20);

  // Entry: center bottom. Chunk 0 gets a wider starting island, but not a
  // full-width row; keeping side air gaps prevents the first screen from
  // reading as a ceiling-like band.
  const isStartChunk = options.chunkY === 0;
  const entryWidth = isStartChunk ? clamp(14, MIN_PLATFORM_WIDTH_TILES, width - 4) : clamp(6, MIN_PLATFORM_WIDTH_TILES, width - 4);
  const entry: PlatformSpan = {
    x: Math.floor(width / 2) - Math.floor(entryWidth / 2),
    y: height - 2,
    width: entryWidth
  };
  plannedPlatforms.push({ span: entry, route: "safe" });

  for (const row of SPARSE_BAND_ROWS) {
    if (row < 2 || row >= height - 1) continue;

    const rowPlans: PlannedPlatform[] = [];
    if (row === REST_BAND_ROW) {
      const platformWidth = routeWidth("rest", row, rng);
      const center = routeCenter("rest", row, width, rng);
      rowPlans.push({
        span: makePlatform(center - Math.floor(platformWidth / 2), row, platformWidth, width),
        route: "rest"
      });
    } else {
      const sideRoute: RouteKind = row === 10 || (row === 4 && rng.nextFloat() < 0.5) ? "risk" : "relic";
      const routes: RouteKind[] = ["safe", sideRoute];
      if (row === 4 && options.chunkY > 1 && rng.nextFloat() < 0.18) routes.push(sideRoute === "risk" ? "relic" : "risk");

      for (const route of routes) {
        const platformWidth = routeWidth(route, row, rng);
        const center = routeCenter(route, row, width, rng);
        rowPlans.push({
          span: makePlatform(center - Math.floor(platformWidth / 2), row, platformWidth, width),
          route
        });
      }
    }

    const separated = separatePlatforms(rowPlans.map((plan) => plan.span), 4, width);
    for (let i = 0; i < rowPlans.length; i++) {
      const span = separated[i];
      const plan = rowPlans[i];
      if (!span || !plan) continue;
      plannedPlatforms.push({ ...plan, span });
    }
  }

  // Exit: center top
  const exitWidth = clamp(6, MIN_PLATFORM_WIDTH_TILES, width - 4);
  const exit: PlatformSpan = {
    x: Math.floor(width / 2) - Math.floor(exitWidth / 2),
    y: 1,
    width: exitWidth
  };
  plannedPlatforms.push({ span: exit, route: "safe" });
  const allPlatforms = plannedPlatforms.map((platform) => platform.span);

  const jumpPads: JumpPadSpawn[] = [];
  const sortedByHeight = [...allPlatforms].sort((a, b) => b.y - a.y);
  for (const target of sortedByHeight) {
    if (target === entry) continue;
    const lower = allPlatforms.filter((platform) => platform.y > target.y);
    if (findNormalLaunchPlatform(target, lower)) continue;
    const launch = findAssistedLaunchPlatform(target, lower);
    if (launch && launch.y > 0 && !jumpPads.some((pad) => pad.x === launch.x + Math.floor(launch.width / 2) && pad.y === launch.y - 1)) {
      jumpPads.push(placeJumpPadOnPlatform(launch, options.chunkY, jumpPads.length));
    }
  }

  if (options.chunkY > 0 && rng.nextFloat() < LEVEL_DESIGN_CONFIG.riskyShortcutChance) {
    const shortcutLaunch = plannedPlatforms.find((platform) => platform.route === "risk" && platform.span.y === 10)?.span;
    const shortcutTarget = plannedPlatforms.find((platform) => platform.span.y === 4 && platform.route !== "safe")?.span;
    if (shortcutLaunch && shortcutTarget && canReachPlatform(shortcutLaunch, shortcutTarget, true)) {
      const pad = placeJumpPadOnPlatform(shortcutLaunch, options.chunkY, jumpPads.length);
      if (!jumpPads.some((existing) => existing.x === pad.x && existing.y === pad.y)) jumpPads.push(pad);
    }
  }

  // Hazard on sparse risk platforms only, so the main route remains readable.
  for (const platform of plannedPlatforms) {
    if (platform.route !== "risk" || platform.span.y > 10 || rng.nextFloat() >= difficulty * 0.35) continue;
    const hazardX = platform.span.x + Math.floor(platform.span.width / 2);
    const hazardY = platform.span.y - 1;
    if (hazardY >= 0 && hazardY < height && tiles[tileIndex(width, hazardX, hazardY)] === "empty") {
      tiles[tileIndex(width, hazardX, hazardY)] = "hazard";
    }
  }

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
  const windZones: WindZoneSpawn[] = [];
  let relicIndex = 0;

  for (const planned of plannedPlatforms) {
    const platform = planned.span;
    if (platform === entry || platform === exit) continue;

    if ((planned.route === "relic" || planned.route === "risk") && relicIndex < 4) {
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

  const worldTileY = -options.chunkY * height;
  const routeNodes = (route: RouteKind): Array<{ x: number; y: number }> => {
    const nodes = plannedPlatforms
      .filter((platform) => platform.route === route || platform.route === "rest" || (route === "safe" && platform.span === exit))
      .map((platform) => platformCenterPx(platform.span, worldTileY));
    if (route !== "safe") nodes.unshift(platformCenterPx(entry, worldTileY));
    if (route !== "safe") nodes.push(platformCenterPx(exit, worldTileY));
    return nodes.sort((a, b) => b.y - a.y);
  };
  const routes: RouteBranch[] = [
    { id: `route:${options.chunkY}:safe`, kind: "safe", label: "safe route", hidden: false, reward: 1, nodes: routeNodes("safe") },
    { id: `route:${options.chunkY}:risk`, kind: "risk", label: "risky shortcut", hidden: false, reward: 3, nodes: routeNodes("risk") },
    { id: `route:${options.chunkY}:relic`, kind: "relic", label: "relic side route", hidden: false, reward: 2, nodes: routeNodes("relic") }
  ].filter((route) => route.nodes.length >= 3);

  return {
    seed: options.seed,
    chunkY: options.chunkY,
    width,
    height,
    worldTileY,
    tiles,
    platforms: allPlatforms,
    entry,
    exit,
    routes,
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
  const padLaunches = new Set(
    chunk.jumpPads.map((pad) => `${pad.x}:${pad.y + 1}`)
  );

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
        const hasLaunchPad = padLaunches.has(`${from.x + Math.floor(from.width / 2)}:${from.y}`);
        if (canReachPlatform(from, to) || (hasLaunchPad && canReachPlatform(from, to, true))) {
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
