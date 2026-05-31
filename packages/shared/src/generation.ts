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
import type {
  BiomeMetadata,
  EnemyKind,
  EnemySpawn,
  GeneratedChunk,
  HazardKind,
  HazardSpawn,
  JumpPadSpawn,
  PlacementMetadata,
  PlatformSpan,
  RouteBranch,
  RouteKind as PublicRouteKind,
  TileKind,
  TileMap,
  WindZoneSpawn,
  WorldBiomeId
} from "./types.js";
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

type RouteKind = PublicRouteKind | "rest";

export interface BiomeGenerationProfile {
  id: WorldBiomeId;
  name: string;
  lengthChunks: number;
  difficulty: number;
  safeWidthBonus: number;
  routeSpread: number;
  enemyKinds: EnemyKind[];
  maxEnemies: number;
  hazardChance: number;
  windChance: number;
  maxWindZones: number;
  jumpPadChance: number;
}

export const BIOME_GENERATION_PROFILES: readonly BiomeGenerationProfile[] = [
  { id: "floating-garden", name: "Floating Garden", lengthChunks: 4, difficulty: 0.08, safeWidthBonus: 2, routeSpread: 0, enemyKinds: ["goblin", "goblinScout"], maxEnemies: 1, hazardChance: 0.02, windChance: 0.00, maxWindZones: 0, jumpPadChance: 0.16 },
  { id: "ancient-ruins", name: "Ancient Ruins", lengthChunks: 4, difficulty: 0.20, safeWidthBonus: 1, routeSpread: 1, enemyKinds: ["goblin", "goblinScout", "archer"], maxEnemies: 1, hazardChance: 0.08, windChance: 0.00, maxWindZones: 0, jumpPadChance: 0.22 },
  { id: "crystal-heights", name: "Crystal Heights", lengthChunks: 5, difficulty: 0.34, safeWidthBonus: 0, routeSpread: 1, enemyKinds: ["goblinScout", "archer", "skeleton"], maxEnemies: 2, hazardChance: 0.14, windChance: 0.16, maxWindZones: 1, jumpPadChance: 0.30 },
  { id: "mechanical-skyworks", name: "Mechanical Skyworks", lengthChunks: 4, difficulty: 0.42, safeWidthBonus: 1, routeSpread: 2, enemyKinds: ["archer", "skeleton", "skeletonArmored"], maxEnemies: 2, hazardChance: 0.18, windChance: 0.22, maxWindZones: 1, jumpPadChance: 0.34 },
  { id: "storm-islands", name: "Storm Islands", lengthChunks: 5, difficulty: 0.52, safeWidthBonus: -1, routeSpread: 2, enemyKinds: ["iceBat", "windSpirit", "skeleton"], maxEnemies: 2, hazardChance: 0.22, windChance: 0.36, maxWindZones: 2, jumpPadChance: 0.38 },
  { id: "celestial-sanctuary", name: "Celestial Sanctuary", lengthChunks: 5, difficulty: 0.60, safeWidthBonus: 0, routeSpread: 2, enemyKinds: ["skeletonArmored", "iceGolem", "windSpirit"], maxEnemies: 2, hazardChance: 0.24, windChance: 0.38, maxWindZones: 2, jumpPadChance: 0.42 },
  { id: "sky-canyons", name: "Sky Canyons", lengthChunks: 5, difficulty: 0.64, safeWidthBonus: -1, routeSpread: 3, enemyKinds: ["iceBat", "windSpirit", "archer"], maxEnemies: 2, hazardChance: 0.18, windChance: 0.48, maxWindZones: 2, jumpPadChance: 0.44 },
  { id: "ember-peaks", name: "Ember Peaks", lengthChunks: 5, difficulty: 0.72, safeWidthBonus: -1, routeSpread: 2, enemyKinds: ["goblinChief", "skeletonArmored", "windSpirit"], maxEnemies: 3, hazardChance: 0.34, windChance: 0.30, maxWindZones: 2, jumpPadChance: 0.48 },
  { id: "void-expanse", name: "Void Expanse", lengthChunks: 6, difficulty: 0.82, safeWidthBonus: -2, routeSpread: 4, enemyKinds: ["iceBat", "windSpirit", "skeletonArmored"], maxEnemies: 3, hazardChance: 0.24, windChance: 0.42, maxWindZones: 2, jumpPadChance: 0.52 },
  { id: "arcane-nexus", name: "Arcane Nexus", lengthChunks: 6, difficulty: 0.88, safeWidthBonus: -1, routeSpread: 3, enemyKinds: ["windSpirit", "iceGolem", "archer"], maxEnemies: 3, hazardChance: 0.28, windChance: 0.46, maxWindZones: 3, jumpPadChance: 0.56 },
  { id: "frozen-heights", name: "Frozen Heights", lengthChunks: 6, difficulty: 0.92, safeWidthBonus: -1, routeSpread: 3, enemyKinds: ["iceBat", "iceGolem", "yeti"], maxEnemies: 3, hazardChance: 0.32, windChance: 0.44, maxWindZones: 3, jumpPadChance: 0.54 },
  { id: "celestial-rift", name: "Celestial Rift", lengthChunks: 7, difficulty: 1.00, safeWidthBonus: -2, routeSpread: 4, enemyKinds: ["windSpirit", "iceGolem", "yeti", "skeletonArmored"], maxEnemies: 4, hazardChance: 0.36, windChance: 0.52, maxWindZones: 3, jumpPadChance: 0.62 },
] as const;

const BIOME_CYCLE_LENGTH_CHUNKS = BIOME_GENERATION_PROFILES.reduce((total, profile) => total + profile.lengthChunks, 0);

interface BiomePlan {
  profile: BiomeGenerationProfile;
  metadata: BiomeMetadata;
}

function routeProfileForBiome(profile: BiomeGenerationProfile): string {
  if (profile.id === "void-expanse" || profile.id === "celestial-rift") return "wide_split_high_risk";
  if (profile.id === "arcane-nexus") return "shortcut_lattice";
  if (profile.id === "sky-canyons" || profile.id === "storm-islands") return "wind_braided";
  if (profile.id === "frozen-heights") return "recovery_ledges";
  return "readable_braid";
}

function hazardProfileForBiome(profile: BiomeGenerationProfile): string {
  if (profile.id === "ember-peaks") return "ember_edges";
  if (profile.id === "frozen-heights") return "icefall_edges";
  if (profile.id === "arcane-nexus" || profile.id === "celestial-rift") return "rune_pressure";
  if (profile.id === "void-expanse") return "crumbling_void";
  return profile.hazardChance > 0.2 ? "side_route_pressure" : "telegraphed_sparse";
}

function windProfileForBiome(profile: BiomeGenerationProfile): string {
  if (profile.id === "sky-canyons") return "canyon_crosswinds";
  if (profile.id === "void-expanse") return "void_shear";
  if (profile.id === "celestial-rift") return "rift_currents";
  return profile.maxWindZones > 0 ? "route_gusts" : "calm";
}

export function biomeForChunkY(chunkY: number): BiomeMetadata {
  const normalizedChunkY = Math.max(0, chunkY);
  const cycle = Math.floor(normalizedChunkY / BIOME_CYCLE_LENGTH_CHUNKS);
  let startChunkY = cycle * BIOME_CYCLE_LENGTH_CHUNKS;

  for (let index = 0; index < BIOME_GENERATION_PROFILES.length; index++) {
    const profile = BIOME_GENERATION_PROFILES[index]!;
    const endChunkY = startChunkY + profile.lengthChunks - 1;
    if (normalizedChunkY <= endChunkY) {
      const localChunkY = normalizedChunkY - startChunkY;
      const localProgress = profile.lengthChunks <= 1 ? 1 : localChunkY / (profile.lengthChunks - 1);
      return {
        id: profile.id,
        name: profile.name,
        index: cycle * BIOME_GENERATION_PROFILES.length + index,
        cycle,
        localChunkY,
        startChunkY,
        endChunkY,
        lengthChunks: profile.lengthChunks,
        difficulty: clamp(profile.difficulty + localProgress * 0.08 + cycle * 0.06, 0, 1),
        routeProfile: routeProfileForBiome(profile),
        hazardProfile: hazardProfileForBiome(profile),
        windProfile: windProfileForBiome(profile)
      };
    }
    startChunkY += profile.lengthChunks;
  }

  const fallback = BIOME_GENERATION_PROFILES[BIOME_GENERATION_PROFILES.length - 1]!;
  return {
    id: fallback.id,
    name: fallback.name,
    index: cycle * BIOME_GENERATION_PROFILES.length + BIOME_GENERATION_PROFILES.length - 1,
    cycle,
    localChunkY: fallback.lengthChunks - 1,
    startChunkY: normalizedChunkY,
    endChunkY: normalizedChunkY,
    lengthChunks: fallback.lengthChunks,
    difficulty: 1,
    routeProfile: routeProfileForBiome(fallback),
    hazardProfile: hazardProfileForBiome(fallback),
    windProfile: windProfileForBiome(fallback)
  };
}

function biomePlanForChunkY(chunkY: number): BiomePlan {
  const metadata = biomeForChunkY(chunkY);
  const profile = BIOME_GENERATION_PROFILES.find((candidate) => candidate.id === metadata.id) ?? BIOME_GENERATION_PROFILES[0]!;
  return { profile, metadata };
}

function publicRoute(route: RouteKind): PublicRouteKind {
  return route === "rest" ? "recovery" : route;
}

function placement(
  biome: BiomeMetadata,
  route: RouteKind,
  purpose: PlacementMetadata["purpose"],
  danger: number
): PlacementMetadata {
  return {
    biomeId: biome.id,
    route: publicRoute(route),
    purpose,
    difficulty: biome.difficulty,
    danger: clamp(danger, 0, 1),
    readable: true
  };
}

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
  routesPerBandMin: 4,
  routesPerBandMax: 4,
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

export function biomeProfileForChunkY(chunkY: number): BiomeGenerationProfile {
  return biomePlanForChunkY(chunkY).profile;
}

export function biomeRegionIndexForChunkY(chunkY: number): number {
  return biomeForChunkY(chunkY).index;
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

function makePlatform(x: number, y: number, width: number, chunkWidth: number, route?: RouteKind, biomeId?: WorldBiomeId): PlatformSpan {
  const w = clamp(width, MIN_PLATFORM_WIDTH_TILES, Math.min(MAX_PLATFORM_WIDTH_TILES, chunkWidth - 2));
  const platform: PlatformSpan = {
    x: clamp(x, 1, chunkWidth - w - 1),
    y,
    width: w
  };
  if (route) platform.route = publicRoute(route);
  if (biomeId) platform.biomeId = biomeId;
  return platform;
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

function routeCenter(route: RouteKind, row: number, width: number, rng: ReturnType<typeof createRng>, profile: BiomeGenerationProfile): number {
  const mid = Math.floor(width / 2);
  const spread = profile.routeSpread;
  switch (route) {
    case "safe":
      return clamp(mid + rng.int(-2, 1) + (profile.id === "void-expanse" ? -1 : 0), 7, width - 8);
    case "risk":
      return clamp(width - 10 + Math.floor(spread / 2) + rng.int(-2, 2), 8, width - 5);
    case "relic":
      return row >= REST_BAND_ROW
        ? clamp(9 - Math.floor(spread / 2) + rng.int(-2, 2), 4, width - 9)
        : clamp(width - 11 + Math.floor(spread / 2) + rng.int(-2, 2), 8, width - 5);
    case "recovery":
      return clamp(5 - Math.floor(spread / 3) + rng.int(-1, 2), 4, width - 10);
    case "rest":
    default:
      return clamp(mid + rng.int(-1, 1), 7, width - 8);
  }
}

function routeWidth(route: RouteKind, row: number, rng: ReturnType<typeof createRng>, profile?: BiomeGenerationProfile): number {
  const safeBonus = profile?.safeWidthBonus ?? 0;
  if (route === "rest") return clamp(rng.int(8, 10) + (profile?.id === "frozen-heights" ? 1 : 0), 8, 11);
  if (route === "safe") return clamp((row <= 4 ? rng.int(5, 7) : rng.int(6, 7)) + safeBonus, 4, 9);
  if (route === "recovery") return clamp(rng.int(6, 8) + Math.max(0, safeBonus), 5, 10);
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

function placeJumpPadOnPlatform(
  platform: PlatformSpan,
  chunkY: number,
  index: number,
  biome: BiomeMetadata,
  purpose: PlacementMetadata["purpose"],
  target?: PlatformSpan
): JumpPadSpawn {
  const pad: JumpPadSpawn = {
    id: `jumpPad:${chunkY}:${index}`,
    x: platform.x + Math.floor(platform.width / 2),
    y: platform.y - 1,
    multiplier: clamp(LEVEL_DESIGN_CONFIG.jumpPadMultiplier + biome.difficulty * 0.18, 2.25, 2.55),
    launchX: 0,
    launchY: -1,
    placement: placement(biome, platform.route ?? "safe", purpose, purpose === "shortcut" ? biome.difficulty * 0.6 : 0.2)
  };
  if (target) {
    pad.launchX = target.x + Math.floor(target.width / 2);
    pad.launchY = target.y;
  }
  return pad;
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

function hazardKindForBiome(biome: BiomeGenerationProfile): HazardKind {
  if (biome.id === "frozen-heights") return "fallingIcicle";
  if (biome.id === "void-expanse") return "crumblingPlatform";
  if (biome.id === "arcane-nexus" || biome.id === "celestial-rift") return "lightningRune";
  if (biome.id === "sky-canyons" || biome.id === "storm-islands") return "windGust";
  return "spikeTrap";
}

function hazardTelegraph(kind: HazardKind): HazardSpawn["telegraph"] {
  if (kind === "lightningRune") return "rune_glow";
  if (kind === "windGust") return "wind_line";
  if (kind === "fallingIcicle" || kind === "crumblingPlatform") return "edge_warning";
  return "open_tile";
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

  const { profile: biome, metadata: biomeMetadata } = biomePlanForChunkY(options.chunkY);
  const regionIndex = biomeMetadata.index;
  const difficulty = biomeMetadata.difficulty;
  const isCheckpoint = options.chunkY === biomeMetadata.startChunkY;

  // Entry: center bottom. Chunk 0 gets a wider starting island, but not a
  // full-width row; keeping side air gaps prevents the first screen from
  // reading as a ceiling-like band.
  const isStartChunk = options.chunkY === 0;
  const entryWidth = isStartChunk ? clamp(14, MIN_PLATFORM_WIDTH_TILES, width - 4) : clamp(6, MIN_PLATFORM_WIDTH_TILES, width - 4);
  const entry: PlatformSpan = {
    x: Math.floor(width / 2) - Math.floor(entryWidth / 2),
    y: height - 2,
    width: entryWidth,
    route: "safe",
    biomeId: biome.id
  };
  plannedPlatforms.push({ span: entry, route: "safe" });

  for (const row of SPARSE_BAND_ROWS) {
    if (row < 2 || row >= height - 1) continue;

    const rowPlans: PlannedPlatform[] = [];
    if (row === REST_BAND_ROW) {
      const platformWidth = routeWidth("rest", row, rng, biome);
      const center = routeCenter("rest", row, width, rng, biome);
      rowPlans.push({
        span: makePlatform(center - Math.floor(platformWidth / 2), row, platformWidth, width, "rest", biome.id),
        route: "rest"
      });
      if (options.chunkY > 0 && rng.nextFloat() < 0.72) {
        const recoveryWidth = routeWidth("recovery", row, rng, biome);
        const recoveryCenter = routeCenter("recovery", row, width, rng, biome);
        rowPlans.push({
          span: makePlatform(recoveryCenter - Math.floor(recoveryWidth / 2), row, recoveryWidth, width, "recovery", biome.id),
          route: "recovery"
        });
      }
    } else {
      const sideRoute: RouteKind = row === 10 || (row === 4 && rng.nextFloat() < 0.5) ? "risk" : "relic";
      const routes: RouteKind[] = ["safe", sideRoute];
      if (row === 13 && options.chunkY > 0) routes.push("recovery");
      if (row === 4 && options.chunkY > 1 && rng.nextFloat() < 0.18 + biome.difficulty * 0.18) routes.push(sideRoute === "risk" ? "relic" : "risk");

      for (const route of routes) {
        const platformWidth = routeWidth(route, row, rng, biome);
        const center = routeCenter(route, row, width, rng, biome);
        rowPlans.push({
          span: makePlatform(center - Math.floor(platformWidth / 2), row, platformWidth, width, route, biome.id),
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
    width: exitWidth,
    route: "safe",
    biomeId: biome.id
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
      jumpPads.push(placeJumpPadOnPlatform(launch, options.chunkY, jumpPads.length, biomeMetadata, "recovery", target));
    }
  }

  if (!isCheckpoint && options.chunkY > 0 && rng.nextFloat() < Math.max(LEVEL_DESIGN_CONFIG.riskyShortcutChance, biome.jumpPadChance)) {
    const shortcutLaunch = plannedPlatforms.find((platform) => platform.route === "risk" && platform.span.y === 10)?.span;
    const shortcutTarget = plannedPlatforms.find((platform) => platform.span.y === 4 && platform.route !== "safe")?.span;
    if (shortcutLaunch && shortcutTarget && canReachPlatform(shortcutLaunch, shortcutTarget, true)) {
      const pad = placeJumpPadOnPlatform(shortcutLaunch, options.chunkY, jumpPads.length, biomeMetadata, "shortcut", shortcutTarget);
      pad.launchX = shortcutTarget.x > shortcutLaunch.x ? 0.42 : -0.42;
      pad.launchY = -1;
      if (!jumpPads.some((existing) => existing.x === pad.x && existing.y === pad.y)) jumpPads.push(pad);
    }
  }

  const hazards: HazardSpawn[] = [];
  const hazardKind = hazardKindForBiome(biome);

  // Hazard on sparse risk/relic platforms only, so the main route remains readable.
  for (const platform of plannedPlatforms) {
    if (isCheckpoint) continue;
    if ((platform.route !== "risk" && platform.route !== "relic") || platform.span.y > 10 || rng.nextFloat() >= biome.hazardChance + difficulty * 0.12) continue;
    const hazardX = platform.span.width <= 3
      ? platform.span.x + Math.floor(platform.span.width / 2)
      : platform.span.x + (rng.nextFloat() < 0.5 ? 1 : platform.span.width - 2);
    const hazardY = platform.span.y - 1;
    if (hazardY >= 0 && hazardY < height && tiles[tileIndex(width, hazardX, hazardY)] === "empty") {
      tiles[tileIndex(width, hazardX, hazardY)] = "hazard";
      hazards.push({
        id: `hazard:${options.chunkY}:${hazards.length}`,
        kind: hazardKind,
        x: hazardX,
        y: hazardY,
        width: 1,
        height: 1,
        route: publicRoute(platform.route),
        biomeId: biome.id,
        danger: clamp(difficulty * (platform.route === "risk" ? 0.9 : 0.65), 0.1, 1),
        telegraph: hazardTelegraph(hazardKind)
      });
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
    if (biome.maxWindZones > 0) {
      const windCandidates = allPlatforms
        .slice(1, -1)
        .filter((platform) => platform.width >= 3 && platform.y >= 5 && (!isCheckpoint || platform.route === "recovery"))
        .sort((a, b) => a.y - b.y);
      const maxWindZones = biome.maxWindZones;
      let windIndex = 0;
      for (let i = 0; i < windCandidates.length && windIndex < maxWindZones; i++) {
        const platform = windCandidates[(i + options.chunkY) % windCandidates.length];
        if (!platform) continue;
        const zoneSeed = hashSeed(options.seed, options.chunkY * 911 + platform.x * 37 + platform.y * 101);
        const chance = Math.round(biome.windChance * 100);
        if (zoneSeed % 100 >= chance) continue;
        const zoneWidth = clamp(platform.width + 1, 3, 5);
        const zoneHeight = zoneSeed % 5 === 0 && biome.difficulty > 0.55 ? 5 : 4;
        const zoneX = clamp(platform.x + Math.floor(platform.width / 2) - Math.floor(zoneWidth / 2), 0, width - zoneWidth);
        const zoneY = clamp(platform.y - zoneHeight, 0, height - zoneHeight - 1);
        const direction: -1 | 1 = (zoneSeed & 1) === 0 ? 1 : -1;
        const axis = zoneSeed % 3 === 0 && biome.difficulty > 0.5 ? "vertical" : "horizontal";
        windZones.push({
          id: `wind:${options.chunkY}:${windIndex}`,
          x: zoneX,
          y: zoneY,
          width: zoneWidth,
          height: zoneHeight,
          axis,
          direction,
          strength: 420 + Math.round(biomeMetadata.difficulty * 360),
          placement: placement(biomeMetadata, platform.route ?? "safe", "pressure", biomeMetadata.difficulty * 0.55)
        });
        windIndex++;
      }
    }

    const kindPool = biome.enemyKinds;
    const maxEnemies = isCheckpoint ? 0 : Math.min(4, biome.maxEnemies + Math.floor(biomeMetadata.cycle / 2));
    let enemyIndex = 0;

    for (let i = 1; i < allPlatforms.length - 1 && enemyIndex < maxEnemies; i++) {
      const platform = allPlatforms[i];
      if (!platform || platform.width < 3) continue;
      const center = platform.x + platform.width / 2;
      const isMainOrRiskLane = center > width * 0.32;
      const spawnRoll = rng.nextFloat();
      const spawnChance = Math.min(0.34, 0.08 + difficulty * 0.16 + (plannedPlatforms.find((plan) => plan.span === platform)?.route === "risk" ? 0.08 : 0));
      if (!isMainOrRiskLane || spawnRoll >= spawnChance) continue;

      const tileY = platform.y - 1;
      if (tileY < 0 || tiles[tileIndex(width, platform.x + Math.floor(platform.width / 2), tileY)] !== "empty") continue;
      const kind = kindPool[rng.int(0, kindPool.length - 1)]!;
      enemies.push({
        id: `enemy:${options.chunkY}:${enemyIndex}`,
        kind,
        x: platform.x + Math.floor(platform.width / 2),
        y: tileY,
        placement: placement(biomeMetadata, plannedPlatforms.find((plan) => plan.span === platform)?.route ?? "safe", "pressure", spawnChance)
      });
      enemyIndex++;
    }
  }

  const worldTileY = -options.chunkY * height;
  const routeNodes = (route: RouteKind): Array<{ x: number; y: number }> => {
    const nodes = plannedPlatforms
      .filter((platform) => {
        if (platform.span === exit) return route === "safe";
        if (route === "safe") return platform.route === "safe" || platform.route === "rest";
        if (route === "recovery") return platform.route === "safe" || platform.route === "recovery" || platform.route === "rest";
        return platform.route === route || platform.route === "recovery" || platform.route === "rest";
      })
      .map((platform) => platformCenterPx(platform.span, worldTileY));
    if (route !== "safe") nodes.unshift(platformCenterPx(entry, worldTileY));
    if (route !== "safe") nodes.push(platformCenterPx(exit, worldTileY));
    return nodes.sort((a, b) => b.y - a.y);
  };
  const routes: RouteBranch[] = [
    { id: `route:${options.chunkY}:safe`, kind: "safe", label: "main safe route", hidden: false, reward: 1, nodes: routeNodes("safe"), biomeId: biome.id, difficulty, checkpointSafe: true, recommended: true },
    { id: `route:${options.chunkY}:risk`, kind: "risk", label: "alternative risk route", hidden: false, reward: 3, nodes: routeNodes("risk"), biomeId: biome.id, difficulty: clamp(difficulty + 0.18, 0, 1), checkpointSafe: false, recommended: false },
    { id: `route:${options.chunkY}:relic`, kind: "relic", label: "relic side route", hidden: false, reward: 2, nodes: routeNodes("relic"), biomeId: biome.id, difficulty: clamp(difficulty + 0.08, 0, 1), checkpointSafe: false, recommended: false },
    { id: `route:${options.chunkY}:recovery`, kind: "recovery", label: "recovery route", hidden: false, reward: 0, nodes: routeNodes("recovery"), biomeId: biome.id, difficulty: clamp(difficulty - 0.12, 0, 1), checkpointSafe: true, recommended: isCheckpoint }
  ].filter((route) => route.nodes.length >= 3);

  const portalWidth = Math.min(4, entry.width);
  const portalX = clamp(entry.x + Math.floor((entry.width - portalWidth) / 2), 0, width - portalWidth);
  const portal = isCheckpoint
    ? {
        id: `portal:${options.chunkY}:${biome.id}`,
        regionId: biome.id,
        chunkY: options.chunkY,
        x: portalX,
        y: entry.y,
        width: portalWidth,
        style: `${biome.id}:checkpoint`,
        checkpoint: true,
        trigger: {
          x: portalX * TILE_SIZE,
          y: (worldTileY + entry.y - 4) * TILE_SIZE,
          width: portalWidth * TILE_SIZE,
          height: 5 * TILE_SIZE
        }
      }
    : undefined;
  const landmarks = isCheckpoint
    ? [{
        id: `landmark:${options.chunkY}:${biome.id}`,
        regionId: biome.id,
        kind: biomeMetadata.routeProfile,
        x: portalX,
        y: entry.y - 4,
        width: portalWidth,
        height: 4,
        hidden: false
      }]
    : undefined;

  return {
    seed: options.seed,
    chunkY: options.chunkY,
    width,
    height,
    worldTileY,
    regionId: biome.id,
    regionIndex,
    regionName: biome.name,
    biome: biomeMetadata,
    checkpoint: isCheckpoint,
    tiles,
    platforms: allPlatforms,
    entry,
    exit,
    ...(portal ? { portal } : {}),
    ...(landmarks ? { landmarks } : {}),
    routes,
    hazards,
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
