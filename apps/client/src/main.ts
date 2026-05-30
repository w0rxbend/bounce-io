import { Application, Assets, Container, Graphics, Particle as PixiParticle, ParticleContainer, Sprite, Text, Texture, TextureStyle } from "pixi.js";
import {
  CHUNK_HEIGHT_TILES,
  CHUNK_WIDTH_TILES,
  GAME_VERSION,
  JUMP_SPEED,
  KICK_ACTIVE_SECONDS,
  KICK_COOLDOWN_SECONDS,
  KICK_RECOVERY_SECONDS,
  KICK_WINDUP_SECONDS,
  PHYSICS_STEP_SECONDS,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PROTOCOL_VERSION,
  RECONCILIATION_TOLERANCE_PX,
  TILE_SIZE,
} from "@skybound/shared";
import {
  collectibleKindForRelicId,
  createMultiChunkTileMap,
  createPlayerState,
  generateVerticalChunk,
  isPlayerDead,
  respawnPlayerState,
  stepPlayer,
} from "@skybound/shared";
import { isServerMessage } from "@skybound/shared";
import type { CollectibleKind, EnemyKind, EnemyState, GeneratedChunk, JumpPadSpawn, PlayerInput, PlayerState, RelicSpawn, TileKind } from "@skybound/shared";
import "./styles.css";

// ── Palette ───────────────────────────────────────────────────────────────────

const PAL = {
  // Sky — cold alpine gradient
  skyGround:    0x4f7fa6,
  skyMid:       0x2f6fad,
  skyDeep:      0x1f4d8a,
  skySpace:     0x080e1e,  // near-space deep indigo
  starBright:   0xe8eeff,
  // Distant world
  mountainFar:  0x28385a,
  mountainMid:  0x384870,
  ruinsDark:    0x222e48,
  islandFar:    0x304068,  // far floating islands
  // Clouds — warm soft white tones
  cloudFar:     0x6888b8,  // distant hazy blue-gray
  cloudMid:     0xa8c0d8,  // medium soft blue-white
  cloudBright:  0xe8f0f8,  // near bright white (almost white)
  cloudShadow:  0x8898b8,  // cloud underside shadow
  cloudWarm:    0xf0e8d8,  // warm sunlit cloud top
  // Atmospheric haze
  mistPale:     0xc8e0e0,
  skyHaze:      0x90c0d8,  // horizon haze
  // Terrain — blue-gray mountain stone with snow/moss accents
  stoneShadow:  0x26354a,
  stoneDark:    0x36475f,
  stoneMid:     0x4c5e78,
  stoneLight:   0x9fb4ca,
  stoneWorn:    0x6f82a3,
  stoneRuin:    0x8796a9,
  // Soil & earth
  soilWarm:     0x6b4a31,
  soilDark:     0x332618,
  soilRoot:     0x4d3524,
  // Vegetation — muted alpine greens
  grassTop:     0x87a65a,
  grassDark:    0x4f6f3f,
  canopyDark:   0x1a3818,
  canopyMid:    0x2e6840,
  canopyLight:  0x6ac840,  // bright canopy
  mossGreen:    0x6d8c47,
  mossBright:   0x9fb76b,
  barkMid:      0x6a4820,
  leafGreen:    0x78d050,  // vegetation leaf
  // Hazard
  hazardRed:    0xc84a4a,
  hazardGlow:   0xe9f2ff,
  hazardBase:   0x2c3748,
  hazardMag:    0xb82060,
  // Coin / relic
  coinGold:     0xf8c830,
  coinShade:    0xb07020,
  coinGlow:     0xffe870,
  // Portal / magic
  portalBlue:   0x40d8f8,
  portalGlow:   0xa0f0ff,
  runeGlow:     0x30c8c0,  // magical rune cyan-teal
  // Character
  skinLight:    0xffd090,
  hairDark:     0x281a10,
  scarfPrimary: 0xb83020,
  scarfShade:   0x701818,
  // UI
  uiInk:        0x1c1f2a,
  uiParchment:  0xf4e8c8,
  uiHighlight:  0x40c8d0,
  uiCyan:       0x40c8d0,
  uiGray:       0x6a8aaf,
} as const;

const PLAYER_COLORS = [
  0xf3c64b, 0x48d6ff, 0x9b6dff, 0x5dff9c,
  0xff6b6b, 0xff9f4a, 0xe8c8ff, 0x69a969,
] as const;

const WORLD_WIDTH = CHUNK_WIDTH_TILES * TILE_SIZE; // 384px

// ── Network interpolation tuning ──────────────────────────────────────────────
const MIN_INTERP_DELAY_MS   = 50;    // floor for local/LAN play
const MAX_INTERP_DELAY_MS   = 300;   // ceiling; beyond this the delay itself hurts
const SNAPSHOT_INTERVAL_MS  = 1000 / 20; // 50 ms — matches server SNAPSHOT_RATE
const PING_HISTORY_SIZE     = 16;    // larger window for more stable jitter estimate
let   adaptiveInterpDelayMs = 100;   // starts neutral, self-tunes each pong
let   smoothedRttMs         = 100;   // EMA-smoothed RTT used for delay target
const CHUNKS_PRELOAD_BEHIND = 3;     // keep enough below for intentional descents
const CHUNKS_PRELOAD_AHEAD  = 4;     // preload upward route without growing forever
const INITIAL_CHUNKS_TO_LOAD = 4;

const ASSET_URLS = {
  aiForestRuinsPanorama: "/assets/environment/backgrounds/forest_ruins_panorama.png",
  bgCloudBank: "/assets/environment/backgrounds/cloud_bank.png",
  bgSkyArches: "/assets/environment/backgrounds/sky_arches.png",
  bush: "/assets/environment/vegetation/bush_1.png",
  cloud: "/assets/environment/backgrounds/cloud.png",
  cloudSmall: "/assets/environment/backgrounds/cloud_small.png",
  cloudTall: "/assets/environment/backgrounds/cloud_tall.png",
  cloudLong: "/assets/environment/backgrounds/cloud_long.png",
  cloudWispy: "/assets/environment/backgrounds/cloud_wispy.png",
  cloudCluster: "/assets/environment/backgrounds/cloud_cluster.png",
  cloudFlat: "/assets/environment/backgrounds/cloud_flat.png",
  cloudStreak: "/assets/environment/backgrounds/cloud_streak.png",
  cloudPuff: "/assets/environment/backgrounds/cloud_puff.png",
  coin: "/assets/environment/collectibles/coin_1.png",
  coinSpin0: "/assets/environment/collectibles/coin_spin_frame1.png",
  coinSpin1: "/assets/environment/collectibles/coin_spin_frame2.png",
  coinSpin2: "/assets/environment/collectibles/coin_spin_frame3.png",
  coinSpin3: "/assets/environment/collectibles/coin_spin_frame4.png",
  coinGold: "/assets/environment/collectibles/coin_gold_1.png",
  coinSilver: "/assets/environment/collectibles/coin_silver_1.png",
  coinCopper: "/assets/environment/collectibles/coin_copper_1.png",
  coinRuneBlue: "/assets/environment/collectibles/coin_rune_blue_1.png",
  coinRunePurple: "/assets/environment/collectibles/coin_rune_purple_1.png",
  collectibleRing: "/assets/environment/effects/collectible_ring_1.png",
  collectibleSparkle: "/assets/environment/effects/collectible_sparkle_1.png",
  decorBannerBlue: "/assets/environment/decorations/banner_blue_large.png",
  decorBannerGold: "/assets/environment/decorations/banner_gold_large.png",
  decorBannerGreen: "/assets/environment/decorations/banner_green_large.png",
  decorLanternBlue: "/assets/environment/decorations/hanging_lantern_blue.png",
  decorLanternGold: "/assets/environment/decorations/hanging_lantern_gold.png",
  decorLanternGreen: "/assets/environment/decorations/hanging_lantern_green.png",
  decorPedestalBlue: "/assets/environment/decorations/pedestal_lamp_blue.png",
  decorPedestalGreen: "/assets/environment/decorations/pedestal_lamp_green.png",
  decorPedestalGold: "/assets/environment/decorations/pedestal_lamp_gold.png",
  decorSignWood: "/assets/environment/decorations/sign_board_wood.png",
  decorSignRune: "/assets/environment/decorations/sign_board_rune.png",
  decorBannerHelp: "/assets/environment/decorations/banner_help.png",
  decorBannerDanger: "/assets/environment/decorations/banner_danger.png",
  decorBannerCaution: "/assets/environment/decorations/banner_caution.png",
  decorBannerNoWinners: "/assets/environment/decorations/banner_no_winners.png",
  decorRopePosts: "/assets/environment/decorations/rope_posts_plain.png",
  decorRopeLanterns: "/assets/environment/decorations/rope_posts_lanterns.png",
  decorFlowerCrystalBlue: "/assets/environment/decorations/flower_crystal_blue.png",
  decorFlowerCrystalGreen: "/assets/environment/decorations/flower_crystal_green.png",
  decorFlowerCrystalPurple: "/assets/environment/decorations/flower_crystal_purple.png",
  decorSkeletonMarker: "/assets/environment/decorations/skeleton_marker.png",
  decorBrazierGold: "/assets/environment/decorations/snow_brazier_gold.png",
  decorBrazierBlue: "/assets/environment/decorations/snow_brazier_blue.png",
  decorBrazierGreen: "/assets/environment/decorations/snow_brazier_green.png",
  decorCampfireWarm: "/assets/environment/decorations/campfire_warm.png",
  decorCampfireBlue: "/assets/environment/decorations/campfire_blue.png",
  decorCampfireGreen: "/assets/environment/decorations/campfire_green.png",
  decorTripodRed: "/assets/environment/decorations/tripod_red.png",
  decorTripodBlue: "/assets/environment/decorations/tripod_blue.png",
  decorTripodPurple: "/assets/environment/decorations/tripod_purple.png",
  decorCrateStackWood: "/assets/environment/decorations/crate_stack_wood.png",
  decorCrateStackRune: "/assets/environment/decorations/crate_stack_rune.png",
  decorBarrelStackWood: "/assets/environment/decorations/barrel_stack_wood.png",
  decorBarrelStackRune: "/assets/environment/decorations/barrel_stack_rune.png",
  decorCrystalTotemBlue: "/assets/environment/decorations/crystal_totem_blue.png",
  decorCrystalTotemGreen: "/assets/environment/decorations/crystal_totem_green.png",
  decorCrystalTotemPurple: "/assets/environment/decorations/crystal_totem_purple.png",
  decorStatueStone: "/assets/environment/decorations/statue_stone.png",
  decorStatueSnow: "/assets/environment/decorations/statue_snow.png",
  decorSmallShrineWood: "/assets/environment/decorations/small_shrine_wood.png",
  decorSmallShrineSnow: "/assets/environment/decorations/small_shrine_snow.png",
  decorSmallShrinePurple: "/assets/environment/decorations/small_shrine_purple.png",
  decorSnowLampBlue: "/assets/environment/decorations/snow_lamp_blue.png",
  decorSnowLampGold: "/assets/environment/decorations/snow_lamp_gold.png",
  decorSnowLampPurple: "/assets/environment/decorations/snow_lamp_purple.png",
  decorFlowerPostWhite: "/assets/environment/decorations/flower_post_white.png",
  decorFlowerPostPink: "/assets/environment/decorations/flower_post_pink.png",
  decorFlowerPostBlue: "/assets/environment/decorations/flower_post_blue.png",
  crown: "/assets/environment/ui/crown_1.png",
  crystalMarker: "/assets/environment/structures/crystal_marker_1.png",
  fence: "/assets/environment/structures/fence_1.png",
  flowerPatch: "/assets/environment/vegetation/flower_patch_1.png",
  grassClump: "/assets/environment/vegetation/grass_clump_1.png",
  hazardSpikes: "/assets/environment/hazards/spikes_1.png",
  heightArrow: "/assets/environment/ui/height_arrow_1.png",
  hudPanel: "/assets/environment/ui/hud_panel_1.png",
  lanternCyan: "/assets/environment/lights/lantern_cyan_1.png",
  leafCluster: "/assets/environment/vegetation/leaf_cluster_1.png",
  gemCyan0: "/assets/environment/collectibles/gem_variant1.png",
  gemCyan1: "/assets/environment/collectibles/gem_variant2.png",
  gemCyan2: "/assets/environment/collectibles/gem_variant3.png",
  gemCyan3: "/assets/environment/collectibles/gem_variant4.png",
  gemRed: "/assets/environment/collectibles/gem_red_1.png",
  gemBlue: "/assets/environment/collectibles/gem_blue_1.png",
  gemGreen: "/assets/environment/collectibles/gem_green_1.png",
  gemPurple: "/assets/environment/collectibles/gem_purple_1.png",
  gemGold: "/assets/environment/collectibles/gem_gold_1.png",
  heart: "/assets/environment/collectibles/heart_1.png",
  mushroomCluster: "/assets/environment/vegetation/mushroom_cluster_1.png",
  pebbleCluster: "/assets/environment/vegetation/pebble_cluster_1.png",
  rockCap: "/assets/environment/rocks/stone_cap_1.png",
  rockCluster: "/assets/environment/rocks/rock_cluster_plain_1.png",
  rockClusterMoss: "/assets/environment/rocks/rock_cluster_moss_1.png",
  rockSpire: "/assets/environment/rocks/rock_spire_1.png",
  tileClusterMoss: "/assets/environment/sheetElements/moss_tile_cluster.png",
  tileClusterStone: "/assets/environment/sheetElements/stone_tile_cluster.png",
  tileClusterSnow: "/assets/environment/sheetElements/snow_tile_cluster.png",
  tileClusterSummit: "/assets/environment/sheetElements/summit_tile_cluster.png",
  reedGrassWheat: "/assets/environment/flora/reed_grass_wheat_1.png",
  reedGrassYellow: "/assets/environment/flora/reed_grass_yellow_1.png",
  flowerPink: "/assets/environment/flora/flower_pink_1.png",
  wildflowerMixed: "/assets/environment/flora/wildflower_mixed_1.png",
  wildflowerPink: "/assets/environment/flora/wildflower_pink_1.png",
  wildflowerYellow: "/assets/environment/flora/wildflower_yellow_1.png",
  snowTree: "/assets/environment/snowTrees/snow_pine.png",
  bentPine: "/assets/environment/snowTrees/frosted_bent_pine.png",
  fallingIcicle: "/assets/environment/hazards/falling_icicle_1.png",
  fallingIciclesCluster: "/assets/environment/hazards/falling_icicles_cluster_1.png",
  stoneSpikes: "/assets/environment/hazards/stone_spikes_1.png",
  iceSpikes: "/assets/environment/hazards/ice_spikes_1.png",
  summitSpikes: "/assets/environment/hazards/summit_spikes_1.png",
  spikeMachine: "/assets/environment/hazards/spike_machine_1.png",
  spikeBall: "/assets/environment/hazards/spike_ball_1.png",
  spikeBoulder: "/assets/environment/hazards/spike_boulder_1.png",
  crystalSpikesBlue: "/assets/environment/hazards/crystal_spikes_blue_1.png",
  crystalSpikesGreen: "/assets/environment/hazards/crystal_spikes_green_1.png",
  crystalSpikesPurple: "/assets/environment/hazards/crystal_spikes_purple_1.png",
  magicArcPurple: "/assets/environment/hazards/magic_arc_purple_1.png",
  magicArcBlue: "/assets/environment/hazards/magic_arc_blue_1.png",
  runeTrapGreen: "/assets/environment/hazards/rune_trap_green_1.png",
  runeTrapGold: "/assets/environment/hazards/rune_trap_gold_1.png",
  windZone: "/assets/environment/hazards/wind_zone_1.png",
  magicWindPurple: "/assets/environment/hazards/magic_wind_purple_1.png",
  magicWindGreen: "/assets/environment/hazards/magic_wind_green_1.png",
  lightningHazard: "/assets/environment/hazards/lightning_1.png",
  lightningBlue: "/assets/environment/hazards/lightning_blue_1.png",
  lightningPurple: "/assets/environment/hazards/lightning_purple_1.png",
  rollingBoulder: "/assets/environment/hazards/rolling_boulder_1.png",
  rollingBoulderRune: "/assets/environment/hazards/rolling_boulder_rune_1.png",
  climbingChain: "/assets/environment/ladders/climbing_chain.png",
  magicOrbBlue: "/assets/environment/collectibles/magic_orb_blue_1.png",
  magicOrbGold: "/assets/environment/collectibles/magic_orb_gold_1.png",
  magicOrbPurple: "/assets/environment/collectibles/magic_orb_purple_1.png",
  crownGold: "/assets/environment/collectibles/crown_gold_1.png",
  crownBlue: "/assets/environment/collectibles/crown_blue_1.png",
  potionBlue: "/assets/environment/collectibles/potion_blue_1.png",
  potionRed: "/assets/environment/collectibles/potion_red_1.png",
  potionGold: "/assets/environment/collectibles/potion_gold_1.png",
  treasureChest: "/assets/environment/collectibles/treasure_chest_1.png",
  treasureChestBlue: "/assets/environment/collectibles/treasure_chest_blue_1.png",
  treasureChestRed: "/assets/environment/collectibles/treasure_chest_red_1.png",
  enemyGoblin: "/assets/environment/enemies/goblin_1.png",
  enemyGoblinScout: "/assets/environment/enemies/goblin_scout_1.png",
  enemyGoblinChief: "/assets/environment/enemies/goblin_chief_1.png",
  enemyGoblinDark: "/assets/environment/enemies/goblin_dark_1.png",
  enemyArcher: "/assets/environment/enemies/archer_1.png",
  enemyArcherDark: "/assets/environment/enemies/archer_dark_1.png",
  enemyArcherBone: "/assets/environment/enemies/archer_bone_1.png",
  enemyIceBat: "/assets/environment/enemies/ice_bat_1.png",
  enemyIceBatFrost: "/assets/environment/enemies/ice_bat_frost_1.png",
  enemySkullBat: "/assets/environment/enemies/skull_bat_1.png",
  enemySkeleton: "/assets/environment/enemies/skeleton_1.png",
  enemySkeletonDark: "/assets/environment/enemies/skeleton_dark_1.png",
  enemySkeletonArmored: "/assets/environment/enemies/skeleton_armored_1.png",
  enemySkeletonMage: "/assets/environment/enemies/skeleton_mage_1.png",
  enemyYeti: "/assets/environment/enemies/yeti_1.png",
  enemyIceGolem: "/assets/environment/enemies/ice_golem_1.png",
  enemyArmoredBrute: "/assets/environment/enemies/armored_brute_1.png",
  enemyWindSpirit: "/assets/environment/enemies/wind_spirit_1.png",
  enemyPortalBlue: "/assets/environment/enemies/portal_blue_1.png",
  playerExplorer: "/assets/playable_characters/character1/main_body.png",
  playerIdle: "/assets/playable_characters/character1/idle_frame1.png",
  playerRun1: "/assets/playable_characters/character1/running_frame2.png",
  playerRun2: "/assets/playable_characters/character1/running_frame5.png",
  playerJump: "/assets/playable_characters/character1/jumping_frame1.png",
  playerFall: "/assets/playable_characters/character1/falling_frame1.png",
  playerKick: "/assets/playable_characters/character1/kick_frame2.png",
  relicPink0: "/assets/environment/collectibles/relic_pink_frame1.png",
  relicPink1: "/assets/environment/collectibles/relic_pink_frame2.png",
  relicPink2: "/assets/environment/collectibles/relic_pink_frame3.png",
  relicPink3: "/assets/environment/collectibles/relic_pink_frame4.png",
  runeStone: "/assets/environment/structures/rune_stone_1.png",
  seedGreen0: "/assets/environment/collectibles/seed_green_frame1.png",
  seedGreen1: "/assets/environment/collectibles/seed_green_frame2.png",
  seedGreen2: "/assets/environment/collectibles/seed_green_frame3.png",
  seedGreen3: "/assets/environment/collectibles/seed_green_frame4.png",
  ropeBridge: "/assets/environment/structures/rope_bridge_1.png",
  ruinArchFragment: "/assets/environment/structures/ruin_arch_fragment_1.png",
  signpost: "/assets/environment/structures/signpost_1.png",
  starShard0: "/assets/environment/collectibles/star_shard_frame1.png",
  starShard1: "/assets/environment/collectibles/star_shard_frame2.png",
  starShard2: "/assets/environment/collectibles/star_shard_frame3.png",
  starShard3: "/assets/environment/collectibles/star_shard_frame4.png",
  orbBlue0: "/assets/environment/collectibles/magic_orb_blue_frame1.png",
  orbBlue1: "/assets/environment/collectibles/magic_orb_blue_frame2.png",
  orbBlue2: "/assets/environment/collectibles/magic_orb_blue_frame3.png",
  orbBlue3: "/assets/environment/collectibles/magic_orb_blue_frame4.png",
  orbGold0: "/assets/environment/collectibles/magic_orb_gold_frame1.png",
  orbGold1: "/assets/environment/collectibles/magic_orb_gold_frame2.png",
  orbGold2: "/assets/environment/collectibles/magic_orb_gold_frame3.png",
  orbGold3: "/assets/environment/collectibles/magic_orb_gold_frame4.png",
  orbPurple0: "/assets/environment/collectibles/magic_orb_purple_frame1.png",
  orbPurple1: "/assets/environment/collectibles/magic_orb_purple_frame2.png",
  orbPurple2: "/assets/environment/collectibles/magic_orb_purple_frame3.png",
  orbPurple3: "/assets/environment/collectibles/magic_orb_purple_frame4.png",
  burstFire0: "/assets/environment/collectibles/elemental_burst_fire_frame1.png",
  burstFire1: "/assets/environment/collectibles/elemental_burst_fire_frame2.png",
  burstFire2: "/assets/environment/collectibles/elemental_burst_fire_frame3.png",
  burstFire3: "/assets/environment/collectibles/elemental_burst_fire_frame4.png",
  burstIce0: "/assets/environment/collectibles/elemental_burst_ice_frame1.png",
  burstIce1: "/assets/environment/collectibles/elemental_burst_ice_frame2.png",
  burstIce2: "/assets/environment/collectibles/elemental_burst_ice_frame3.png",
  burstIce3: "/assets/environment/collectibles/elemental_burst_ice_frame4.png",
  medallionGreen0: "/assets/environment/collectibles/medallion_green_frame1.png",
  medallionGreen1: "/assets/environment/collectibles/medallion_green_frame2.png",
  medallionGreen2: "/assets/environment/collectibles/medallion_green_frame3.png",
  medallionGreen3: "/assets/environment/collectibles/medallion_green_frame4.png",
  medallionGold0: "/assets/environment/collectibles/medallion_gold_frame1.png",
  medallionGold1: "/assets/environment/collectibles/medallion_gold_frame2.png",
  medallionGold2: "/assets/environment/collectibles/medallion_gold_frame3.png",
  medallionGold3: "/assets/environment/collectibles/medallion_gold_frame4.png",
  relicPedestalBlue0: "/assets/environment/collectibles/relic_pedestal_blue_frame1.png",
  relicPedestalBlue1: "/assets/environment/collectibles/relic_pedestal_blue_frame2.png",
  relicPedestalBlue2: "/assets/environment/collectibles/relic_pedestal_blue_frame3.png",
  relicPedestalBlue3: "/assets/environment/collectibles/relic_pedestal_blue_frame4.png",
  relicPedestalFire0: "/assets/environment/collectibles/relic_pedestal_fire_frame1.png",
  relicPedestalFire1: "/assets/environment/collectibles/relic_pedestal_fire_frame2.png",
  relicPedestalFire2: "/assets/environment/collectibles/relic_pedestal_fire_frame3.png",
  relicPedestalFire3: "/assets/environment/collectibles/relic_pedestal_fire_frame4.png",
  stump: "/assets/environment/vegetation/stump_1.png",
  tree: "/assets/environment/vegetation/tree_pine_1.png",
  ruinColumn: "/assets/environment/structures/ruin_column_1.png",
  vineHanging: "/assets/environment/vegetation/vine_hanging_1.png",
} as const;

type AssetKey = string;

interface PixelManifestAsset {
  png: string;
  width: number;
  height: number;
}

interface PixelAssetManifest {
  assets: Record<string, PixelManifestAsset>;
}

const ASSET_MANIFEST_URL = "/assets/manifest.json";
const manifestAssetFolders = new Map<string, AssetKey[]>();
const manifestAssetSizes = new Map<AssetKey, { width: number; height: number }>();
const PROCEDURAL_MOUNTAIN_FOLDERS = new Set(["environment/midMountains"]);
const PROCEDURAL_PLATFORM_FOLDERS = new Set(["environment/platforms", "environment/platformVariants"]);
const PROCEDURAL_GAMEPLAY_PROP_FOLDERS = new Set(["environment/relicShrines"]);

function isProceduralManifestAsset(relPath: string): boolean {
  const folder = relPath.split("/").slice(0, -1).join("/");
  if (PROCEDURAL_MOUNTAIN_FOLDERS.has(folder)) return true;
  if (PROCEDURAL_GAMEPLAY_PROP_FOLDERS.has(folder)) return true;
  if (relPath === "environment/effects/jump_pad_1.png") return true;
  if (relPath === "environment/effects/portal_arch_1.png") return true;
  if (!PROCEDURAL_PLATFORM_FOLDERS.has(folder)) return false;
  return /^platform_[a-z]+_(top|body|bottom|outer)_(left|inner|right)\.png$/.test(relPath.split("/").pop() ?? "");
}

const BIOME_IDS = ["pineValley", "cloudRidge", "snowfallCliffs", "frozenSpires", "celestialSummit"] as const;
type BiomeId = typeof BIOME_IDS[number];

function biomeForChunkY(chunkY: number): BiomeId {
  if (chunkY >= 16) return "celestialSummit";
  if (chunkY >= 12) return "frozenSpires";
  if (chunkY >= 8) return "snowfallCliffs";
  if (chunkY >= 4) return "cloudRidge";
  return "pineValley";
}

function biomeDisplayName(biome: BiomeId): string {
  if (biome === "pineValley") return "PINE VALLEY";
  if (biome === "cloudRidge") return "CLOUD RIDGE";
  if (biome === "snowfallCliffs") return "SNOWFALL CLIFFS";
  if (biome === "frozenSpires") return "FROZEN SPIRES";
  return "CELESTIAL SUMMIT";
}

function altitude01(chunkY: number, start: number, end: number): number {
  return Math.max(0, Math.min(1, (chunkY - start) / Math.max(1, end - start)));
}

const CHARACTER_IDS = ["character1", "character2", "character3", "character4", "character5", "character6", "character7", "character8"] as const;
const CHARACTER_ANIMATION_NAMES = [
  "idle",
  "walk",
  "walk_left",
  "walk_right",
  "run",
  "jump_fall",
  "kick_push",
  "punch",
  "hit",
  "taking_damage",
  "shoot_fire",
  "hit_death_special"
] as const;
const CHARACTER_SPRITE_SCALE = 0.72;
const CHARACTER_ANCHOR_Y = 0.96;

type CharacterId = typeof CHARACTER_IDS[number];
type CharacterAnimationName = typeof CHARACTER_ANIMATION_NAMES[number];

interface CharacterRuntimeAnimation {
  textures: Texture[];
  durationMs: number;
}

interface CharacterRig {
  main: Texture;
  animations: Partial<Record<CharacterAnimationName, CharacterRuntimeAnimation>>;
  anchorY: number;
}

const CHARACTER_ANIMATION_URLS = Object.fromEntries(CHARACTER_IDS.map((id) => [id, {
  main: `/assets/playable_characters/${id}/main_body.png`,
  idle: frameUrls(id, "idle", 4),
  walk: frameUrls(id, "walking", 6),
  walk_left: frameUrls(id, "walking_left", 6),
  walk_right: frameUrls(id, "walking_right", 6),
  run: frameUrls(id, "running", 6),
  jump_fall: [...frameUrls(id, "jumping", 2), ...frameUrls(id, "falling", 2)],
  kick_push: frameUrls(id, "kick", 3),
  punch: frameUrls(id, "punching", 3),
  hit: frameUrls(id, "hitting", 3),
  taking_damage: frameUrls(id, "taking_damage", 2),
  shoot_fire: frameUrls(id, "shooting", 4),
  hit_death_special: frameUrls(id, "lying_dead", 2),
}])) as Record<CharacterId, { main: string } & Record<CharacterAnimationName, string[]>>;

function frameUrls(characterId: CharacterId, animation: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `/assets/playable_characters/${characterId}/${animation}_frame${i + 1}.png`);
}

// ── HTML shell ────────────────────────────────────────────────────────────────

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("Missing #app root");

appRoot.innerHTML = `
  <main class="shell">
    <section class="game-wrap"></section>
    <aside class="side">
      <div class="brand"><h1>Skybound Relics</h1>
        <p>Race upward. Collect coins. Kick rivals off ledges.</p></div>
      <div class="panel join">
        <h2>Room</h2>
        <input id="player-name" value="Explorer" maxlength="16" aria-label="Player name"/>
        <button id="join-room">Join Room</button>
        <p id="net-status">Local mode — server optional.</p>
      </div>
      <div class="panel"><h2>Controls</h2>
        <div class="controls">
          <div class="key">A / D — run</div><div class="key">Space — jump</div>
          <div class="key">S — drop through</div><div class="key">F — kick</div>
          <div class="key">F1 — debug</div><div class="key">F2 — respawn</div>
        </div>
      </div>
      <div class="panel"><h2>Players</h2><div id="scoreboard"></div></div>
    </aside>
  </main>`;

const gameWrap  = appRoot.querySelector<HTMLElement>(".game-wrap")!;
const netStatus = appRoot.querySelector<HTMLElement>("#net-status")!;
const joinBtn   = appRoot.querySelector<HTMLButtonElement>("#join-room")!;
const nameInput = appRoot.querySelector<HTMLInputElement>("#player-name")!;
const scoreboard = appRoot.querySelector<HTMLElement>("#scoreboard")!;

// ── PixiJS init ───────────────────────────────────────────────────────────────

TextureStyle.defaultOptions.scaleMode = "nearest";

const pixi = new Application();
await pixi.init({
  manageImports: false,
  resizeTo: gameWrap,
  preference: ["webgl", "canvas"],
  backgroundAlpha: 0,
  antialias: false,
  powerPreference: "high-performance",
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
  roundPixels: true,
});
pixi.canvas.style.imageRendering = "pixelated";
gameWrap.prepend(pixi.canvas);

function pathAliasForAsset(relPath: string): AssetKey {
  return relPath
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match, chr: string) => chr.toUpperCase())
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase());
}

function registerManifestAssetKey(relPath: string, key: AssetKey, width: number, height: number): void {
  const folder = relPath.split("/").slice(0, -1).join("/");
  const keys = manifestAssetFolders.get(folder) ?? [];
  if (!keys.includes(key)) keys.push(key);
  manifestAssetFolders.set(folder, keys);
  manifestAssetSizes.set(key, { width, height });
}

async function loadAssetManifest(): Promise<PixelAssetManifest | null> {
  try {
    const response = await fetch(ASSET_MANIFEST_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as PixelAssetManifest;
  } catch (err) {
    console.warn(`Could not load pixel asset manifest ${ASSET_MANIFEST_URL}`, err);
    return null;
  }
}

async function loadPixelAssets(): Promise<Record<AssetKey, Texture>> {
  const loaded: Record<AssetKey, Texture> = {};
  const aliasByUrl = new Map<string, string>();
  for (const [key, url] of Object.entries(ASSET_URLS)) aliasByUrl.set(url, key);

  const manifest = await loadAssetManifest();
  const loadedUrls = new Set<string>();
  if (manifest) {
    await Promise.all(Object.entries(manifest.assets).map(async ([relPath, meta]) => {
      try {
        if (isProceduralManifestAsset(relPath)) return;
        const texture = await Assets.load<Texture>(meta.png);
        const pathAlias = pathAliasForAsset(relPath);
        loaded[relPath] = texture;
        loaded[meta.png] = texture;
        loaded[pathAlias] = texture;
        registerManifestAssetKey(relPath, relPath, meta.width, meta.height);
        registerManifestAssetKey(relPath, pathAlias, meta.width, meta.height);

        const semanticAlias = aliasByUrl.get(meta.png);
        if (semanticAlias) {
          loaded[semanticAlias] = texture;
          manifestAssetSizes.set(semanticAlias, { width: meta.width, height: meta.height });
        }
        loadedUrls.add(meta.png);
      } catch (err) {
        console.warn(`Could not load pixel asset ${meta.png}`, err);
      }
    }));
  }

  await Promise.all(Object.entries(ASSET_URLS).map(async ([key, url]) => {
    if (loaded[key] || loadedUrls.has(url)) return;
    try {
      loaded[key] = await Assets.load<Texture>(url);
    } catch (err) {
      console.warn(`Could not load pixel asset ${url}`, err);
    }
  }));
  return loaded;
}

const pixelAssets = await loadPixelAssets();
const characterRigs = await loadCharacterRigs();

async function loadCharacterRigs(): Promise<Partial<Record<CharacterId, CharacterRig>>> {
  const rigs: Partial<Record<CharacterId, CharacterRig>> = {};
  await Promise.all(CHARACTER_IDS.map(async (id) => {
    const spec = CHARACTER_ANIMATION_URLS[id];
    try {
      const main = await Assets.load<Texture>(spec.main);
      const animations: Partial<Record<CharacterAnimationName, CharacterRuntimeAnimation>> = {};
      await Promise.all(CHARACTER_ANIMATION_NAMES.map(async (name) => {
        const textures = await loadTextureSequence(spec[name]);
        if (textures.length > 0) {
          animations[name] = { textures, durationMs: durationForCharacterAnimation(name) };
        }
      }));
      rigs[id] = { main, animations, anchorY: CHARACTER_ANCHOR_Y };
    } catch (err) {
      console.warn(`Could not load character rig ${id}`, err);
    }
  }));
  return rigs;
}

async function loadTextureSequence(urls: string[]): Promise<Texture[]> {
  const textures = await Promise.all(urls.map(async (url) => {
    try {
      return await Assets.load<Texture>(url);
    } catch (err) {
      console.warn(`Could not load character frame ${url}`, err);
      return null;
    }
  }));
  return textures.filter((texture): texture is Texture => !!texture && texture !== Texture.EMPTY);
}

function durationForCharacterAnimation(name: CharacterAnimationName): number {
  if (name === "run") return 82;
  if (name === "walk") return 115;
  if (name === "walk_left" || name === "walk_right") return 115;
  if (name === "idle") return 180;
  if (name === "punch" || name === "hit") return 72;
  if (name === "taking_damage") return 95;
  if (name === "shoot_fire") return 85;
  if (name === "kick_push") return 95;
  if (name === "hit_death_special") return 180;
  return 120;
}

function assetTexture(key: AssetKey): Texture {
  return pixelAssets[key] ?? Texture.EMPTY;
}

function hasAsset(key: AssetKey): boolean {
  return !!pixelAssets[key];
}

function makeSprite(key: AssetKey): Sprite {
  const s = new Sprite(assetTexture(key));
  s.roundPixels = true;
  return s;
}

function makeSceneSprite(key: AssetKey): Sprite {
  const s = makeSprite(key);
  s.scale.set(SCENE_ASSET_SCALE);
  return s;
}

function folderAssetKeys(folder: string): AssetKey[] {
  return manifestAssetFolders.get(folder) ?? [];
}

function assetPixelSize(key: AssetKey): { width: number; height: number } {
  const size = manifestAssetSizes.get(key);
  if (size) return size;
  const texture = assetTexture(key);
  return { width: texture.width, height: texture.height };
}

function uniqueAssetKeys(keys: AssetKey[]): AssetKey[] {
  return [...new Set(keys)].filter(hasAsset);
}

function chooseAsset(keys: AssetKey[], seed: number, fallback: AssetKey): AssetKey {
  const available = uniqueAssetKeys(keys);
  if (available.length === 0) return fallback;
  return available[Math.abs(seed) % available.length]!;
}

function makeCharacterSprite(characterId: CharacterId): Sprite {
  const s = new Sprite(characterRigs[characterId]?.main ?? characterRigs.character1?.main ?? assetTexture("playerExplorer"));
  s.roundPixels = true;
  return s;
}

function hasPlayerAnimationAssets(): boolean {
  return hasCharacterAnimationAssets("character1") || (hasAsset("playerIdle") && hasAsset("playerRun1") && hasAsset("playerJump") && hasAsset("playerFall") && hasAsset("playerKick"));
}

function hasCharacterAnimationAssets(characterId: CharacterId): boolean {
  const rig = characterRigs[characterId];
  return !!rig?.animations.idle && !!rig.animations.run && !!rig.animations.jump_fall && !!rig.animations.kick_push;
}

function playerSpriteScale(): number {
  return hasPlayerAnimationAssets() ? CHARACTER_SPRITE_SCALE : 1;
}

function playerSpriteAnchorY(): number {
  return hasPlayerAnimationAssets() ? CHARACTER_ANCHOR_Y : 1;
}

function characterAnimationTexture(characterId: CharacterId, name: CharacterAnimationName, elapsed: number): Texture | null {
  const rig = characterRigs[characterId] ?? characterRigs.character1;
  const animation = rig?.animations[name];
  if (!animation || animation.textures.length === 0) return null;
  const frame = Math.floor(elapsed / animation.durationMs) % animation.textures.length;
  return animation.textures[frame] ?? null;
}

function characterForRemote(colorIndex: number): CharacterId {
  return CHARACTER_IDS[colorIndex % CHARACTER_IDS.length]!;
}

function playerAnimationTexture(s: PlayerState, elapsed: number, characterId: CharacterId = "character1"): Texture | null {
  if (!hasCharacterAnimationAssets(characterId)) return null;
  if (s.kickPhase === "active") {
    return characterAnimationTexture(characterId, "hit", elapsed) ??
      characterAnimationTexture(characterId, "shoot_fire", elapsed) ??
      characterAnimationTexture(characterId, "kick_push", elapsed);
  }
  if (s.kickPhase === "windup") return characterAnimationTexture(characterId, "punch", elapsed) ?? characterAnimationTexture(characterId, "kick_push", elapsed);
  if (s.kickPhase !== "idle") return characterAnimationTexture(characterId, "kick_push", elapsed);
  if (s.invulnerable > 0) return characterAnimationTexture(characterId, "taking_damage", elapsed) ?? characterAnimationTexture(characterId, "hit_death_special", elapsed) ?? characterAnimationTexture(characterId, "idle", elapsed);
  if (!s.grounded) return characterAnimationTexture(characterId, "jump_fall", elapsed);

  const speed = Math.abs(s.velocity.x);
  if (speed > 115) return characterAnimationTexture(characterId, "run", elapsed);
  if (speed > 28) {
    const directionalWalk = s.facing < 0 ? "walk_left" : "walk_right";
    return characterAnimationTexture(characterId, directionalWalk, elapsed) ??
      characterAnimationTexture(characterId, "walk", elapsed) ??
      characterAnimationTexture(characterId, "run", elapsed);
  }
  return characterAnimationTexture(characterId, "idle", elapsed);
}

function fallbackPlayerAnimationAsset(s: PlayerState, elapsed: number): AssetKey {
  if (s.kickPhase === "active" || s.kickPhase === "windup") return "playerKick";
  if (!s.grounded) return s.velocity.y < -20 ? "playerJump" : "playerFall";
  if (Math.abs(s.velocity.x) > 28) return Math.floor(elapsed / 95) % 2 === 0 ? "playerRun1" : "playerRun2";
  return "playerIdle";
}

function coinFrameAsset(frame: number): AssetKey {
  if (hasAsset("coinSpin0") && hasAsset("coinSpin1") && hasAsset("coinSpin2") && hasAsset("coinSpin3")) {
    return (["coinSpin0", "coinSpin1", "coinSpin2", "coinSpin3"] as const)[frame % 4]!;
  }
  return "coin";
}

function collectibleVisual(kind: CollectibleKind | undefined): { color: number; label: string; notification: string } {
  if (kind === "smallHeart" || kind === "bigHeart" || kind === "greenCrystal") {
    return { color: 0x5dff9c, label: "+HP", notification: "HP +1" };
  }
  if (kind === "purpleCrystal" || kind === "blueCrystal") {
    return { color: 0xb06dff, label: "+JUMP", notification: "JUMP UP" };
  }
  return { color: 0xff4d5e, label: "+ATK", notification: "ATTACK UP" };
}

function firstFrameGroup(groups: AssetKey[][]): AssetKey[] | null {
  for (const group of groups) {
    if (group.every(hasAsset)) return group;
  }
  return null;
}

function repeatedFrame(key: AssetKey): AssetKey[] {
  return [key, key, key, key];
}

function collectibleFrames(kind: CollectibleKind, id: string, tileX: number, tileY: number): AssetKey[] {
  const hpGroup = firstFrameGroup([
    ["heart", "heart", "heart", "heart"],
    ["gemGreen", "gemGreen", "gemGreen", "gemGreen"],
    ["medallionGreen0", "medallionGreen1", "medallionGreen2", "medallionGreen3"],
  ]);
  const jumpGroup = firstFrameGroup([
    ["orbPurple0", "orbPurple1", "orbPurple2", "orbPurple3"],
    ["gemPurple", "gemPurple", "gemPurple", "gemPurple"],
    ["magicOrbPurple", "magicOrbPurple", "magicOrbPurple", "magicOrbPurple"],
  ]);
  const attackGroup = firstFrameGroup([
    ["relicPedestalFire0", "relicPedestalFire1", "relicPedestalFire2", "relicPedestalFire3"],
    ["burstFire0", "burstFire1", "burstFire2", "burstFire3"],
    ["gemRed", "potionRed", "gemRed", "potionRed"],
    ["relicPink0", "relicPink1", "relicPink2", "relicPink3"],
  ]);

  if (kind === "smallHeart" || kind === "bigHeart" || kind === "greenCrystal") return hpGroup ?? repeatedFrame("coin");
  if (kind === "purpleCrystal" || kind === "blueCrystal") return jumpGroup ?? repeatedFrame("coin");
  if (attackGroup) return attackGroup;

  const groups: AssetKey[][] = [
    ["coinSpin0", "coinSpin1", "coinSpin2", "coinSpin3"],
    ["gemCyan0", "gemCyan1", "gemCyan2", "gemCyan3"],
    ["relicPink0", "relicPink1", "relicPink2", "relicPink3"],
    ["seedGreen0", "seedGreen1", "seedGreen2", "seedGreen3"],
    ["starShard0", "starShard1", "starShard2", "starShard3"],
    ["orbBlue0", "orbBlue1", "orbBlue2", "orbBlue3"],
    ["orbGold0", "orbGold1", "orbGold2", "orbGold3"],
    ["orbPurple0", "orbPurple1", "orbPurple2", "orbPurple3"],
    ["burstFire0", "burstFire1", "burstFire2", "burstFire3"],
    ["burstIce0", "burstIce1", "burstIce2", "burstIce3"],
    ["medallionGreen0", "medallionGreen1", "medallionGreen2", "medallionGreen3"],
    ["medallionGold0", "medallionGold1", "medallionGold2", "medallionGold3"],
    ["relicPedestalBlue0", "relicPedestalBlue1", "relicPedestalBlue2", "relicPedestalBlue3"],
    ["relicPedestalFire0", "relicPedestalFire1", "relicPedestalFire2", "relicPedestalFire3"],
    ["gemRed", "gemBlue", "gemGreen", "gemPurple"],
    ["coinGold", "coinSilver", "coinCopper", "coinRuneBlue"],
    ["crownGold", "crownBlue", "potionBlue", "potionRed"],
    ["treasureChest", "treasureChestBlue", "treasureChestRed", "gemGold"],
  ];
  const hash = [...id].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, tileX * 131 + tileY * 977);
  const manifestCollectibles = uniqueAssetKeys(folderAssetKeys("environment/collectibles"));
  if (manifestCollectibles.length >= 4 && hash % 3 === 0) {
    const start = hash % manifestCollectibles.length;
    return [0, 1, 2, 3].map((offset) => manifestCollectibles[(start + offset) % manifestCollectibles.length]!);
  }
  for (let tries = 0; tries < groups.length; tries++) {
    const group = groups[(hash + tries) % groups.length]!;
    if (group.every(hasAsset)) return group;
  }
  if (manifestCollectibles.length >= 4) {
    const start = hash % manifestCollectibles.length;
    return [0, 1, 2, 3].map((offset) => manifestCollectibles[(start + offset) % manifestCollectibles.length]!);
  }
  const coinFrames: AssetKey[] = ["coinSpin0", "coinSpin1", "coinSpin2", "coinSpin3"];
  return coinFrames.every(hasAsset) ? coinFrames : ["coin", "coin", "coin", "coin"];
}

function enemyAssetForKind(kind: EnemyKind): AssetKey {
  const keyByKind: Record<EnemyKind, AssetKey> = {
    goblin: "enemyGoblin",
    goblinScout: "enemyGoblinScout",
    goblinChief: "enemyGoblinChief",
    archer: "enemyArcher",
    iceBat: "enemyIceBat",
    skeleton: "enemySkeleton",
    skeletonArmored: "enemySkeletonArmored",
    yeti: "enemyYeti",
    iceGolem: "enemyIceGolem",
    windSpirit: "enemyWindSpirit",
  };
  const preferred = keyByKind[kind];
  if (hasAsset(preferred)) return preferred;
  const fallback = folderAssetKeys("environment/enemies")[0];
  return fallback && hasAsset(fallback) ? fallback : "enemyGoblin";
}

function cloudAsset(i: number, layer: "far" | "mid" | "front"): AssetKey {
  const variants: AssetKey[] = layer === "far"
    ? ["cloudSmall", "cloudWispy", "cloudFlat", "cloudStreak", "cloud"]
    : layer === "mid"
      ? ["cloud", "cloudLong", "cloudPuff", "cloudTall", "cloudCluster"]
      : ["cloudLong", "cloudStreak", "cloudTall", "cloudPuff", "cloudCluster", "cloudFlat", "cloud"];
  variants.push(...folderAssetKeys("environment/clouds"), ...folderAssetKeys("environment/backgrounds").filter((key) => key.includes("cloud")));
  for (let tries = 0; tries < variants.length; tries++) {
    const key = variants[(i + tries) % variants.length]!;
    if (hasAsset(key)) return key;
  }
  return "cloud";
}

interface PlatformPixelPalette {
  outline: number;
  surfaceDark: number;
  surface: number;
  surfaceLight: number;
  surfaceTip: number;
  soilDark: number;
  soil: number;
  rockDark: number;
  rock: number;
  rockLight: number;
  root: number;
  accent: number;
}

const PROCEDURAL_PLATFORM_PIXEL_SIZE = 2;
const SCENE_ASSET_SCALE = 0.7;
const COLLECTIBLE_ASSET_SCALE = 0.5;
const COLLECTIBLE_PLATFORM_Y_OFFSET = -8;

interface MidMountainPalette {
  core: number;
  deep: number;
  edge: number;
  ridge: number;
  highlight: number;
  dust: number;
}

function midMountainPalette(biome: BiomeId): MidMountainPalette {
  if (biome === "pineValley") {
    return { core: 0x111619, deep: 0x080b0e, edge: 0x020305, ridge: 0x1b2820, highlight: 0x3f5b37, dust: 0x4d6042 };
  }
  if (biome === "cloudRidge") {
    return { core: 0x12171d, deep: 0x080c12, edge: 0x020408, ridge: 0x203042, highlight: 0x496178, dust: 0x5f788e };
  }
  if (biome === "snowfallCliffs") {
    return { core: 0x121820, deep: 0x090e15, edge: 0x02050a, ridge: 0x26384a, highlight: 0x6c8397, dust: 0x8799aa };
  }
  if (biome === "frozenSpires") {
    return { core: 0x101820, deep: 0x071019, edge: 0x020509, ridge: 0x1d4158, highlight: 0x4f88a7, dust: 0x69a9c6 };
  }
  return { core: 0x15161c, deep: 0x0a0b11, edge: 0x03040a, ridge: 0x2b2b37, highlight: 0x8a7636, dust: 0xa08a4f };
}

function platformPixelPalette(biome: BiomeId): PlatformPixelPalette {
  if (biome === "pineValley") {
    return {
      outline: 0x130b08,
      surfaceDark: 0x5f9519,
      surface: 0x86c51f,
      surfaceLight: 0xb0df3a,
      surfaceTip: 0xd5f36a,
      soilDark: 0x2c170d,
      soil: 0x5d3920,
      rockDark: 0x321d14,
      rock: 0x6c4327,
      rockLight: 0x9a6338,
      root: 0x1f120a,
      accent: 0x3c5b1d,
    };
  }
  if (biome === "cloudRidge") {
    return {
      outline: 0x151516,
      surfaceDark: 0x6f873d,
      surface: 0x9bb54c,
      surfaceLight: 0xc8d86f,
      surfaceTip: 0xf0ed9b,
      soilDark: 0x2e2a25,
      soil: 0x5b5143,
      rockDark: 0x292d31,
      rock: 0x58616b,
      rockLight: 0x89959a,
      root: 0x211915,
      accent: 0x8fb0b6,
    };
  }
  if (biome === "snowfallCliffs") {
    return {
      outline: 0x09111d,
      surfaceDark: 0x7c9ab5,
      surface: 0xc6e6f2,
      surfaceLight: 0xf4fbff,
      surfaceTip: 0xffffff,
      soilDark: 0x1a2634,
      soil: 0x31445a,
      rockDark: 0x182337,
      rock: 0x3e5871,
      rockLight: 0x7f96aa,
      root: 0x121a25,
      accent: 0x9deaff,
    };
  }
  if (biome === "frozenSpires") {
    return {
      outline: 0x050b16,
      surfaceDark: 0x2f7190,
      surface: 0x59c8e6,
      surfaceLight: 0xbdf8ff,
      surfaceTip: 0xf4ffff,
      soilDark: 0x10172b,
      soil: 0x202e4c,
      rockDark: 0x101728,
      rock: 0x263e60,
      rockLight: 0x4e82a6,
      root: 0x07101c,
      accent: 0x55e8ff,
    };
  }
  return {
    outline: 0x130f1e,
    surfaceDark: 0x82733b,
    surface: 0xc2a84d,
    surfaceLight: 0xf6d978,
    surfaceTip: 0xfff4b0,
    soilDark: 0x342744,
    soil: 0x6d607e,
    rockDark: 0x262136,
    rock: 0x635d79,
    rockLight: 0x9a99b0,
    root: 0x181325,
    accent: 0x8cf7ff,
  };
}

interface MidMountainConnection {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  radius: number;
  strength: number;
}

interface MidMountainCrumbleEmitter {
  chunkY: number;
  container: Container;
  x: number;
  y: number;
  width: number;
  color: number;
  accent: number;
  seed: number;
  timer: number;
}

interface MidMountainCrumbleShard {
  chunkY: number;
  gfx: Graphics;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

type BiomeFlutterKind = "bright" | "frost" | "ember" | "star";

interface BiomeFlutterPalette {
  wingA: number;
  wingB: number;
  body: number;
  spark: number;
}

interface BiomeFlutter {
  chunkY: number;
  gfx: Graphics;
  baseX: number;
  baseY: number;
  phase: number;
  speed: number;
  orbitX: number;
  orbitY: number;
  size: number;
  seed: number;
  kind: BiomeFlutterKind;
  palette: BiomeFlutterPalette;
}

interface LianaPalette {
  vineDark: number;
  vineMid: number;
  vineLight: number;
  leafDark: number;
  leafLight: number;
  flower: number;
}

interface ProceduralLiana {
  chunkY: number;
  gfx: Graphics;
  anchorX: number;
  anchorY: number;
  length: number;
  phase: number;
  speed: number;
  amplitude: number;
  seed: number;
  thickness: number;
  palette: LianaPalette;
  frozen: boolean;
}

interface ProceduralFloraPalette {
  stemDark: number;
  stem: number;
  leafDark: number;
  leaf: number;
  leafLight: number;
  petalA: number;
  petalB: number;
  center: number;
  frost: number;
}

type ProceduralFloraKind = "grass" | "sprout" | "daisy" | "bell" | "berry" | "crystal" | "lotus";

interface ProceduralFlora {
  chunkY: number;
  gfx: Graphics;
  baseX: number;
  baseY: number;
  phase: number;
  speed: number;
  amplitude: number;
  seed: number;
  height: number;
  kind: ProceduralFloraKind;
  palette: ProceduralFloraPalette;
}

const midMountainCrumbleEmitters = new Map<number, MidMountainCrumbleEmitter[]>();
const midMountainCrumbleShards: MidMountainCrumbleShard[] = [];
const biomeFlutters = new Map<number, BiomeFlutter[]>();
const proceduralLianas = new Map<number, ProceduralLiana[]>();
const proceduralFlora = new Map<number, ProceduralFlora[]>();

function midMountainNoise(chunkY: number, x: number, y: number, salt = 0): number {
  let h = Math.imul(chunkY + 101, 374761393)
    ^ Math.imul(Math.round(x) + 17, 668265263)
    ^ Math.imul(Math.round(y) + 31, -2048144789)
    ^ Math.imul(salt + 7, -1028477379);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 0.001) return Math.hypot(px - ax, py - ay);
  const t = clamp01(((px - ax) * vx + (py - ay) * vy) / lenSq);
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

function platformCenterPx(platform: GeneratedChunk["platforms"][number]): { x: number; y: number } {
  return {
    x: (platform.x + platform.width / 2) * TILE_SIZE,
    y: platform.y * TILE_SIZE,
  };
}

function buildMidMountainConnections(chunk: GeneratedChunk): MidMountainConnection[] {
  const connections: MidMountainConnection[] = [];
  const platforms = [...chunk.platforms].sort((a, b) => b.y - a.y || a.x - b.x);

  for (let i = 0; i < platforms.length; i++) {
    const from = platforms[i]!;
    const fromCenter = platformCenterPx(from);
    let best: GeneratedChunk["platforms"][number] | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const to of platforms) {
      const dy = from.y - to.y;
      if (dy <= 0 || dy > 4) continue;
      const toCenter = platformCenterPx(to);
      const score = Math.abs(toCenter.x - fromCenter.x) + dy * TILE_SIZE * 0.55;
      if (score < bestScore) {
        best = to;
        bestScore = score;
      }
    }
    if (best) {
      const toCenter = platformCenterPx(best);
      connections.push({
        ax: fromCenter.x,
        ay: fromCenter.y + TILE_SIZE * 0.9,
        bx: toCenter.x,
        by: toCenter.y + TILE_SIZE * 1.6,
        radius: 20 + Math.min(from.width, best.width) * 2,
        strength: 1,
      });
    }
  }

  for (let i = 0; i < platforms.length - 1; i++) {
    const a = platforms[i]!;
    const b = platforms[i + 1]!;
    if (a.y !== b.y) continue;
    const aCenter = platformCenterPx(a);
    const bCenter = platformCenterPx(b);
    connections.push({
      ax: aCenter.x,
      ay: aCenter.y + TILE_SIZE * 1.3,
      bx: bCenter.x,
      by: bCenter.y + TILE_SIZE * 1.3,
      radius: 15,
      strength: 0.9,
    });
  }

  return connections;
}

function midMountainDensity(
  chunk: GeneratedChunk,
  connections: MidMountainConnection[],
  x: number,
  y: number,
): number {
  let density = 0;

  for (const platform of chunk.platforms) {
    const topY = platform.y * TILE_SIZE;
    const below = y - topY;
    if (below < -2 || below > 118) continue;

    const left = platform.x * TILE_SIZE - 6;
    const right = (platform.x + platform.width) * TILE_SIZE + 6;
    const dx = x < left ? left - x : x > right ? x - right : 0;
    const rootBand = clamp01(1 - Math.max(0, below) / 34) * clamp01(1 - dx / 20);
    density = Math.max(density, rootBand);

    const center = platformCenterPx(platform);
    const leftRootX = platform.x * TILE_SIZE + TILE_SIZE * 0.45;
    const rightRootX = (platform.x + platform.width) * TILE_SIZE - TILE_SIZE * 0.45;
    const rootHalfWidth = Math.max(12, platform.width * TILE_SIZE * 0.38 - Math.max(0, below) * 0.12);
    const rootReach = clamp01(1 - Math.max(0, below) / 112);
    const centerRoot = clamp01(1 - Math.abs(x - center.x) / rootHalfWidth) * rootReach;
    const leftRoot = clamp01(1 - Math.abs(x - leftRootX) / 15) * rootReach * 0.86;
    const rightRoot = clamp01(1 - Math.abs(x - rightRootX) / 15) * rootReach * 0.86;
    density = Math.max(density, centerRoot, leftRoot, rightRoot);
  }

  for (const connection of connections) {
    const d = distanceToSegment(x, y, connection.ax, connection.ay, connection.bx, connection.by);
    const t = clamp01(1 - d / connection.radius);
    density = Math.max(density, t * t * connection.strength);
  }

  return clamp01(density);
}

function midMountainParticleColor(palette: MidMountainPalette, density: number, noise: number): number {
  if (density > 0.82 && noise % 11 === 0) return palette.highlight;
  if (density > 0.66 && noise % 5 === 0) return palette.ridge;
  if (density < 0.38 && noise % 4 === 0) return palette.dust;
  if (density < 0.42) return palette.edge;
  if (noise % 7 === 0) return palette.deep;
  return palette.core;
}

function clearMidMountainCrumbleChunk(chunkY: number): void {
  midMountainCrumbleEmitters.delete(chunkY);
  for (let i = midMountainCrumbleShards.length - 1; i >= 0; i--) {
    const shard = midMountainCrumbleShards[i]!;
    if (shard.chunkY !== chunkY) continue;
    if (!shard.gfx.destroyed) shard.gfx.destroy();
    midMountainCrumbleShards.splice(i, 1);
  }
}

function registerMidMountainCrumbleEmitters(
  chunk: GeneratedChunk,
  container: Container,
  palette: MidMountainPalette,
  connections: MidMountainConnection[],
): void {
  const emitters: MidMountainCrumbleEmitter[] = [];
  const baseY = chunk.worldTileY * TILE_SIZE;

  for (const platform of chunk.platforms) {
    const seed = platformSeed(chunk, platform, 951);
    const count = platform.width >= 7 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const n = midMountainNoise(chunk.chunkY, platform.x * 29 + i * 47, platform.y * 31, 19);
      const xT = (i + 1) / (count + 1);
      emitters.push({
        chunkY: chunk.chunkY,
        container,
        x: (platform.x + platform.width * xT) * TILE_SIZE + (n % 9) - 4,
        y: baseY + platform.y * TILE_SIZE + 8 + ((n >> 5) % 8),
        width: Math.max(12, platform.width * TILE_SIZE * 0.34),
        color: palette.deep,
        accent: n % 4 === 0 ? palette.ridge : palette.core,
        seed: seed + i * 177,
        timer: ((n >> 8) % 100) / 100,
      });
    }
  }

  for (const [i, connection] of connections.entries()) {
    const n = midMountainNoise(chunk.chunkY, connection.ax + i * 13, connection.ay + i * 17, 37);
    emitters.push({
      chunkY: chunk.chunkY,
      container,
      x: (connection.ax + connection.bx) * 0.5 + (n % 17) - 8,
      y: baseY + (connection.ay + connection.by) * 0.5 + ((n >> 4) % 13) - 6,
      width: connection.radius * 0.8,
      color: palette.edge,
      accent: palette.deep,
      seed: chunk.chunkY * 4099 + i * 733 + n,
      timer: ((n >> 9) % 100) / 100,
    });
  }

  midMountainCrumbleEmitters.set(chunk.chunkY, emitters);
}

function spawnMidMountainCrumbleShard(emitter: MidMountainCrumbleEmitter): void {
  if (midMountainCrumbleShards.length > 180 || emitter.container.destroyed) return;
  const n = midMountainNoise(emitter.chunkY, emitter.x + emitter.timer * 97, emitter.y, emitter.seed);
  const size = n % 5 === 0 ? 3 : n % 3 === 0 ? 2 : 1;
  const gfx = new Graphics();
  gfx.rect(0, 0, size, size).fill(n % 6 === 0 ? emitter.accent : emitter.color);
  gfx.x = Math.round(emitter.x + ((n >> 4) % Math.max(1, Math.round(emitter.width))) - emitter.width * 0.5);
  gfx.y = Math.round(emitter.y + ((n >> 11) % 7) - 3);
  gfx.alpha = 1;
  emitter.container.addChild(gfx);
  midMountainCrumbleShards.push({
    chunkY: emitter.chunkY,
    gfx,
    vx: ((n >> 7) % 25) - 12,
    vy: 18 + ((n >> 13) % 34),
    life: 0.58 + ((n >> 18) % 45) / 100,
    max: 1,
  });
  const shard = midMountainCrumbleShards[midMountainCrumbleShards.length - 1]!;
  shard.max = shard.life;
}

function updateMidMountainCrumble(dt: number): void {
  for (const emitters of midMountainCrumbleEmitters.values()) {
    for (const emitter of emitters) {
      emitter.timer -= dt;
      if (emitter.timer > 0) continue;
      spawnMidMountainCrumbleShard(emitter);
      const n = midMountainNoise(emitter.chunkY, emitter.x, emitter.y, Math.round(elapsedMs) + emitter.seed);
      emitter.timer = 0.18 + (n % 70) / 100;
    }
  }

  for (let i = midMountainCrumbleShards.length - 1; i >= 0; i--) {
    const shard = midMountainCrumbleShards[i]!;
    shard.life -= dt;
    if (shard.life <= 0 || shard.gfx.destroyed) {
      if (!shard.gfx.destroyed) shard.gfx.destroy();
      midMountainCrumbleShards.splice(i, 1);
      continue;
    }
    shard.vy += 78 * dt;
    shard.gfx.x += shard.vx * dt;
    shard.gfx.y += shard.vy * dt;
    shard.gfx.alpha = clamp01(shard.life / shard.max);
  }
}

function biomeFlutterPalette(biome: BiomeId, seed: number): { kind: BiomeFlutterKind; palette: BiomeFlutterPalette } {
  if (biome === "pineValley") {
    const variants: BiomeFlutterPalette[] = [
      { wingA: 0xbaff5f, wingB: 0xfff06a, body: 0x172313, spark: 0xffffff },
      { wingA: 0x66f2ff, wingB: 0xff73d9, body: 0x14233a, spark: 0xfff6a4 },
      { wingA: 0xffc84a, wingB: 0x74ff8d, body: 0x261a0b, spark: 0xffffff },
    ];
    return { kind: "bright", palette: variants[seed % variants.length]! };
  }
  if (biome === "cloudRidge") {
    const variants: BiomeFlutterPalette[] = [
      { wingA: 0xeaf7ff, wingB: 0xa8e7ff, body: 0x263447, spark: 0xffffff },
      { wingA: 0xf9e8a4, wingB: 0x9fe5d8, body: 0x2a2e35, spark: 0xffffff },
    ];
    return { kind: "frost", palette: variants[seed % variants.length]! };
  }
  if (biome === "snowfallCliffs") {
    if (seed % 5 === 0) {
      return {
        kind: "ember",
        palette: { wingA: 0xffd15a, wingB: 0xff6b2a, body: 0x2b1009, spark: 0xfff2a6 },
      };
    }
    return {
      kind: "frost",
      palette: { wingA: 0xffffff, wingB: 0xb9ecff, body: 0x263b4d, spark: 0xffffff },
    };
  }
  if (biome === "frozenSpires") {
    return {
      kind: "frost",
      palette: seed % 3 === 0
        ? { wingA: 0xf6fdff, wingB: 0x65e9ff, body: 0x14283f, spark: 0xffffff }
        : { wingA: 0xdff7ff, wingB: 0x9cc9ff, body: 0x16223a, spark: 0xffffff },
    };
  }
  return {
    kind: "star",
    palette: seed % 2 === 0
      ? { wingA: 0xffe58a, wingB: 0xb68cff, body: 0x211a38, spark: 0xffffff }
      : { wingA: 0xf8fbff, wingB: 0x8cf7ff, body: 0x1b1f3e, spark: 0xffde72 },
  };
}

function clearBiomeFluttersChunk(chunkY: number): void {
  const flutters = biomeFlutters.get(chunkY);
  if (!flutters) return;
  for (const flutter of flutters) {
    if (!flutter.gfx.destroyed) flutter.gfx.destroy();
  }
  biomeFlutters.delete(chunkY);
}

function drawBiomeFlutter(flutter: BiomeFlutter, tSec: number): void {
  const { gfx, kind, palette, size } = flutter;
  const flap = Math.sin(tSec * flutter.speed + flutter.phase);
  const spread = size + Math.round((flap + 1) * 1.35);
  const lift = flap > 0 ? -1 : 1;
  gfx.clear();

  if (kind === "ember") {
    gfx.rect(-spread - 3, -3, spread + 3, 7).fill({ color: palette.wingB, alpha: 0.2 });
    gfx.rect(1, -3, spread + 3, 7).fill({ color: palette.wingB, alpha: 0.2 });
  } else if (kind === "star") {
    gfx.rect(-spread - 2, -2, spread + 2, 5).fill({ color: palette.wingB, alpha: 0.16 });
    gfx.rect(1, -2, spread + 2, 5).fill({ color: palette.wingB, alpha: 0.16 });
  }

  gfx.rect(-spread - 1, -3 + lift, spread + 1, 3).fill(palette.wingA);
  gfx.rect(1, -3 + lift, spread + 1, 3).fill(palette.wingA);
  gfx.rect(-spread, 1 - lift, spread, 2).fill(palette.wingB);
  gfx.rect(1, 1 - lift, spread, 2).fill(palette.wingB);
  gfx.rect(-1, -2, 2, 5).fill(palette.body);
  gfx.rect(0, -3, 1, 1).fill(palette.spark);

  if (size > 1 || kind === "star") {
    gfx.rect(-spread, -2 + lift, 1, 1).fill(palette.spark);
    gfx.rect(spread, -2 + lift, 1, 1).fill(palette.spark);
  }
}

function composeBiomeFlutters(chunk: GeneratedChunk, target: Container, biome: BiomeId): void {
  clearBiomeFluttersChunk(chunk.chunkY);
  const flutters: BiomeFlutter[] = [];

  for (const platform of chunk.platforms) {
    if (platform.width < 3) continue;
    const baseSeed = platformSeed(chunk, platform, 1379);
    const count = Math.min(4, Math.max(1, Math.floor(platform.width / 4) + (baseSeed % 2)));
    for (let i = 0; i < count; i++) {
      const n = midMountainNoise(chunk.chunkY, platform.x * 41 + i * 97, platform.y * 53, 863);
      const { kind, palette } = biomeFlutterPalette(biome, baseSeed + i * 31 + n);
      const xT = (i + 1) / (count + 1);
      const gfx = new Graphics();
      gfx.zIndex = 7;
      if (kind === "ember" || kind === "star") gfx.blendMode = "add";
      const flutter: BiomeFlutter = {
        chunkY: chunk.chunkY,
        gfx,
        baseX: Math.round((platform.x + platform.width * xT) * TILE_SIZE + (n % 17) - 8),
        baseY: Math.round(platformTopY(chunk, platform) - 12 - ((n >> 5) % 24)),
        phase: ((n >> 9) % 628) / 100,
        speed: 7.5 + ((n >> 16) % 55) / 10,
        orbitX: 8 + ((n >> 21) % 13),
        orbitY: 4 + ((n >> 25) % 8),
        size: kind === "ember" ? 1 : n % 6 === 0 ? 2 : 1,
        seed: n,
        kind,
        palette,
      };
      drawBiomeFlutter(flutter, 0);
      gfx.x = flutter.baseX;
      gfx.y = flutter.baseY;
      target.addChild(gfx);
      flutters.push(flutter);
    }
  }

  if (flutters.length > 0) biomeFlutters.set(chunk.chunkY, flutters);
}

function updateBiomeFlutters(tSec: number): void {
  for (const [chunkY, flutters] of biomeFlutters) {
    for (let i = flutters.length - 1; i >= 0; i--) {
      const flutter = flutters[i]!;
      if (flutter.gfx.destroyed) {
        flutters.splice(i, 1);
        continue;
      }
      const drift = Math.sin(tSec * 0.42 + flutter.phase + flutter.seed * 0.001) * 3;
      flutter.gfx.x = Math.round(flutter.baseX + Math.sin(tSec * 0.85 + flutter.phase) * flutter.orbitX + drift);
      flutter.gfx.y = Math.round(flutter.baseY + Math.cos(tSec * 1.1 + flutter.phase) * flutter.orbitY);
      drawBiomeFlutter(flutter, tSec);
    }
    if (flutters.length === 0) biomeFlutters.delete(chunkY);
  }
}

function lianaPaletteForBiome(biome: BiomeId): LianaPalette {
  if (biome === "cloudRidge") {
    return { vineDark: 0x314632, vineMid: 0x58783c, vineLight: 0x9ab75a, leafDark: 0x243f28, leafLight: 0x7fb45a, flower: 0xf26bd8 };
  }
  if (biome === "snowfallCliffs") {
    return { vineDark: 0x3e5968, vineMid: 0x6f91a2, vineLight: 0xc4ddeb, leafDark: 0x476a78, leafLight: 0xaed4e6, flower: 0xc179ff };
  }
  if (biome === "frozenSpires") {
    return { vineDark: 0x334b69, vineMid: 0x628db2, vineLight: 0xe3f7ff, leafDark: 0x476f91, leafLight: 0xbdeaff, flower: 0x8cf7ff };
  }
  if (biome === "celestialSummit") {
    return { vineDark: 0x35406d, vineMid: 0x6a7cc8, vineLight: 0xf0f4ff, leafDark: 0x4e5c9b, leafLight: 0xd7dcff, flower: 0xffe58a };
  }
  return { vineDark: 0x233b1c, vineMid: 0x5d7f32, vineLight: 0x9dbb52, leafDark: 0x2d5528, leafLight: 0x86b94a, flower: 0xff5bd6 };
}

function clearProceduralLianasChunk(chunkY: number): void {
  const lianas = proceduralLianas.get(chunkY);
  if (!lianas) return;
  for (const liana of lianas) {
    if (!liana.gfx.destroyed) liana.gfx.destroy();
  }
  proceduralLianas.delete(chunkY);
}

function drawProceduralLiana(liana: ProceduralLiana, tSec: number): void {
  const { gfx, length, palette, seed } = liana;
  const wind = Math.sin(tSec * liana.speed + liana.phase);
  const bounce = Math.sin(tSec * (liana.speed * 1.7) + liana.phase * 0.6) * 1.6;
  const segments = Math.max(5, Math.ceil(length / 5));
  let prevX = 0;
  let prevY = 0;
  gfx.clear();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const y = Math.round(t * length + Math.abs(wind) * t * 1.2 + bounce * t);
    const localWave = Math.sin(tSec * liana.speed + liana.phase + t * 2.2 + (seed % 17) * 0.1);
    const x = Math.round(localWave * liana.amplitude * t + Math.sin(t * Math.PI * 1.4 + liana.phase) * 2.5 * t);
    const width = Math.max(1, liana.thickness - (t > 0.72 ? 1 : 0));
    const color = i % 4 === 0 ? palette.vineLight : i % 3 === 0 ? palette.vineDark : palette.vineMid;
    if (i > 0) drawPixelLine(gfx, prevX, prevY, x, y, width, color, 0.92);
    if (i % 3 === 0) gfx.rect(x - 1, y - 1, 2, 2).fill(palette.vineDark);

    const n = midMountainNoise(seed, i * 31, y, 2203);
    if (i > 1 && i < segments && n % 3 !== 0) {
      const side = n % 2 === 0 ? -1 : 1;
      const leafW = 3 + (n % 3);
      const leafH = 4 + ((n >> 3) % 4);
      const sway = Math.round(wind * side * t * 2);
      const lx = x + side * (2 + (n % 3)) + sway;
      const ly = y - Math.round(leafH / 2);
      const leafX = side < 0 ? lx - leafW : lx;
      gfx.rect(leafX, ly, leafW, leafH).fill(n % 5 === 0 ? palette.leafLight : palette.leafDark);
      gfx.rect(leafX, ly, Math.max(1, leafW - 1), 1).fill({ color: palette.vineLight, alpha: 0.45 });
    }
    if (i > 2 && n % 17 === 0) {
      gfx.rect(x - 2, y - 2, 4, 4).fill(palette.flower);
      gfx.rect(x - 1, y - 1, 2, 2).fill(PAL.coinGlow);
    }
    if (liana.frozen && i % 4 === 0) {
      gfx.rect(x - 2, y - 1, 4, 1).fill({ color: palette.vineLight, alpha: 0.75 });
    }
    prevX = x;
    prevY = y;
  }

  const tipSway = Math.round(wind * liana.amplitude);
  gfx.rect(prevX - 1 + tipSway * 0.12, prevY, 2, 5).fill(liana.frozen ? palette.vineLight : palette.vineDark);
}

function composeProceduralLianas(chunk: GeneratedChunk, target: Container, biome: BiomeId): void {
  clearProceduralLianasChunk(chunk.chunkY);
  const lianas: ProceduralLiana[] = [];
  const palette = lianaPaletteForBiome(biome);
  const frozen = biome === "snowfallCliffs" || biome === "frozenSpires" || biome === "celestialSummit";

  for (const platform of chunk.platforms) {
    if (platform.width < 2) continue;
    const baseSeed = platformSeed(chunk, platform, 2423);
    const edgeCount = platform.width >= 7 ? 3 : platform.width >= 4 ? 2 : 1;
    const anchors: number[] = [];
    for (let i = 0; i < edgeCount; i++) {
      const leftOffset = i * 0.42 + ((baseSeed >> (i + 1)) % 5) * 0.04;
      const rightOffset = i * 0.42 + ((baseSeed >> (i + 5)) % 5) * 0.04;
      anchors.push(platform.x * TILE_SIZE + 2 + leftOffset * TILE_SIZE);
      anchors.push((platform.x + platform.width) * TILE_SIZE - 2 - rightOffset * TILE_SIZE);
    }
    if (platform.width >= 8 && baseSeed % 2 === 0) {
      anchors.push((platform.x + platform.width * 0.5) * TILE_SIZE + ((baseSeed >> 7) % 13) - 6);
    }

    for (const [i, anchorX] of anchors.entries()) {
      const n = midMountainNoise(chunk.chunkY, anchorX, platform.y * 17 + i * 41, 2401);
      const length = 20 + (n % 34) + (platform.width >= 6 ? 10 : 0);
      const liana: ProceduralLiana = {
        chunkY: chunk.chunkY,
        gfx: new Graphics(),
        anchorX: Math.round(anchorX),
        anchorY: platformTopY(chunk, platform) + 5 + ((n >> 5) % 5),
        length,
        phase: ((n >> 9) % 628) / 100,
        speed: 0.85 + ((n >> 15) % 65) / 100,
        amplitude: 2.5 + ((n >> 21) % 55) / 10,
        seed: n,
        thickness: n % 5 === 0 ? 3 : 2,
        palette,
        frozen,
      };
      liana.gfx.zIndex = 1;
      liana.gfx.alpha = biome === "celestialSummit" ? 0.74 : frozen ? 0.82 : 0.9;
      liana.gfx.x = liana.anchorX;
      liana.gfx.y = liana.anchorY;
      drawProceduralLiana(liana, 0);
      target.addChild(liana.gfx);
      lianas.push(liana);
    }
  }

  if (lianas.length > 0) proceduralLianas.set(chunk.chunkY, lianas);
}

function updateProceduralLianas(tSec: number): void {
  for (const [chunkY, lianas] of proceduralLianas) {
    for (let i = lianas.length - 1; i >= 0; i--) {
      const liana = lianas[i]!;
      if (liana.gfx.destroyed) {
        lianas.splice(i, 1);
        continue;
      }
      liana.gfx.x = liana.anchorX + Math.round(Math.sin(tSec * 0.22 + liana.phase) * 1.5);
      liana.gfx.y = liana.anchorY + Math.round(Math.sin(tSec * 0.48 + liana.phase) * 0.8);
      drawProceduralLiana(liana, tSec);
    }
    if (lianas.length === 0) proceduralLianas.delete(chunkY);
  }
}

function proceduralFloraPaletteForBiome(biome: BiomeId): ProceduralFloraPalette {
  if (biome === "cloudRidge") {
    return { stemDark: 0x2d5442, stem: 0x5f9a67, leafDark: 0x2f6f57, leaf: 0x67b978, leafLight: 0xb7e58b, petalA: 0x58b8ff, petalB: 0xea7bff, center: 0xffe982, frost: 0xdff6ff };
  }
  if (biome === "snowfallCliffs") {
    return { stemDark: 0x4a6375, stem: 0x7ba0b3, leafDark: 0x526f88, leaf: 0x91bed4, leafLight: 0xdff7ff, petalA: 0xbadfff, petalB: 0xc787ff, center: 0xf7f0b8, frost: 0xffffff };
  }
  if (biome === "frozenSpires") {
    return { stemDark: 0x334b67, stem: 0x6e98bd, leafDark: 0x48779c, leaf: 0x9fddf4, leafLight: 0xe9fbff, petalA: 0x8df7ff, petalB: 0xbfc6ff, center: 0xffffff, frost: 0xffffff };
  }
  if (biome === "celestialSummit") {
    return { stemDark: 0x38446d, stem: 0x7786c6, leafDark: 0x4e6095, leaf: 0x9aa8ec, leafLight: 0xe3e8ff, petalA: 0xffdf76, petalB: 0xc17bff, center: 0xffffff, frost: 0xd7fff9 };
  }
  return { stemDark: 0x24451f, stem: 0x4d7b2c, leafDark: 0x2f6427, leaf: 0x72a83c, leafLight: 0xb5d852, petalA: 0xff7b39, petalB: 0xff71c9, center: 0xffd65a, frost: 0xe4f7d6 };
}

function chooseProceduralFloraKind(biome: BiomeId, seed: number): ProceduralFloraKind {
  const roll = seed % 12;
  if (biome === "pineValley") return roll < 3 ? "grass" : roll < 5 ? "sprout" : roll < 8 ? "daisy" : roll < 10 ? "berry" : "bell";
  if (biome === "cloudRidge") return roll < 2 ? "grass" : roll < 4 ? "bell" : roll < 7 ? "daisy" : roll < 10 ? "lotus" : "berry";
  if (biome === "snowfallCliffs") return roll < 2 ? "sprout" : roll < 5 ? "bell" : roll < 8 ? "crystal" : roll < 10 ? "lotus" : "grass";
  if (biome === "frozenSpires") return roll < 4 ? "crystal" : roll < 7 ? "bell" : roll < 10 ? "sprout" : "lotus";
  return roll < 3 ? "crystal" : roll < 6 ? "lotus" : roll < 9 ? "bell" : "daisy";
}

function clearProceduralFloraChunk(chunkY: number): void {
  const flora = proceduralFlora.get(chunkY);
  if (!flora) return;
  for (const plant of flora) {
    if (!plant.gfx.destroyed) plant.gfx.destroy();
  }
  proceduralFlora.delete(chunkY);
}

function drawFloraPixelLeaf(g: Graphics, x: number, y: number, side: number, width: number, height: number, color: number): void {
  const leafX = side < 0 ? x - width : x;
  g.rect(Math.round(leafX), Math.round(y), width, height).fill(color);
  g.rect(Math.round(leafX + (side < 0 ? 0 : width - 1)), Math.round(y - 1), 1, height + 2).fill({ color, alpha: 0.55 });
}

function drawFloraPetal(g: Graphics, x: number, y: number, width: number, height: number, color: number, alpha = 1): void {
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  g.rect(Math.round(x - w / 2), Math.round(y - h / 2), w, h).fill({ color, alpha });
  if (w > 3 && h > 3) g.rect(Math.round(x - w / 2 + 1), Math.round(y - h / 2), Math.max(1, w - 2), 1).fill({ color: 0xffffff, alpha: 0.22 * alpha });
}

function drawProceduralFlora(flora: ProceduralFlora, tSec: number): void {
  const { gfx, height, kind, palette, seed } = flora;
  const wind = Math.sin(tSec * flora.speed + flora.phase);
  const flutter = Math.sin(tSec * (flora.speed * 1.9) + flora.phase * 0.7);
  const topSway = Math.round(wind * flora.amplitude);
  const cold = kind === "crystal" || palette.frost === 0xffffff;
  gfx.clear();

  if (kind === "grass") {
    const blades = 4 + (seed % 4);
    for (let i = 0; i < blades; i++) {
      const n = midMountainNoise(seed, i * 23, height, 2549);
      const bx = -6 + i * 3 + (n % 3);
      const bh = Math.max(9, height - 8 + (n % 12));
      const bend = Math.round((wind * (2 + (n % 4))) + (i - blades / 2) * 0.4);
      drawPixelLine(gfx, bx, 0, bx + bend, -bh, n % 3 === 0 ? 2 : 1, n % 4 === 0 ? palette.leafLight : palette.leaf);
      if (n % 5 === 0) gfx.rect(bx + bend - 1, -bh - 1, 3, 2).fill(cold ? palette.frost : palette.petalA);
    }
    return;
  }

  const stemTopX = topSway;
  const stemTopY = -height;
  drawPixelLine(gfx, 0, 0, Math.round(stemTopX * 0.35), Math.round(stemTopY * 0.48), 2, palette.stemDark, 0.96);
  drawPixelLine(gfx, Math.round(stemTopX * 0.35), Math.round(stemTopY * 0.48), stemTopX, stemTopY, 2, palette.stem, 0.96);
  drawPixelLine(gfx, 1, -2, stemTopX + 1, stemTopY + 1, 1, palette.leafLight, 0.5);
  drawFloraPixelLeaf(gfx, -1 + Math.round(wind), -Math.round(height * 0.35), -1, 5 + (seed % 3), 4, palette.leafDark);
  drawFloraPixelLeaf(gfx, 1 + Math.round(wind * 0.5), -Math.round(height * 0.58), 1, 5 + ((seed >> 4) % 3), 4, palette.leaf);

  if (kind === "sprout") {
    drawFloraPixelLeaf(gfx, stemTopX - 1, stemTopY - 2, -1, 8, 6, palette.leaf);
    drawFloraPixelLeaf(gfx, stemTopX + 1, stemTopY - 1, 1, 8, 6, palette.leafLight);
    gfx.rect(stemTopX - 2, stemTopY - 8, 5, 6).fill(cold ? palette.frost : palette.petalB);
    gfx.rect(stemTopX - 1, stemTopY - 9, 3, 2).fill(palette.center);
    return;
  }

  if (kind === "berry") {
    const berryColor = (seed >> 3) % 2 === 0 ? palette.petalA : palette.petalB;
    const offsets = [[-4, -3], [1, -5], [5, -1], [-1, 2], [4, 4]] as const;
    for (const [i, [ox, oy]] of offsets.entries()) {
      const wiggle = Math.round(flutter * ((i % 2) + 1));
      gfx.rect(stemTopX + ox + wiggle, stemTopY + oy, 4, 4).fill(berryColor);
      gfx.rect(stemTopX + ox + wiggle + 1, stemTopY + oy, 1, 1).fill({ color: 0xffffff, alpha: 0.38 });
    }
    gfx.rect(stemTopX - 6, stemTopY - 8, 10, 3).fill(palette.leafDark);
    return;
  }

  if (kind === "crystal") {
    const shine = Math.max(0.25, 0.6 + flutter * 0.28);
    gfx.rect(stemTopX - 4, stemTopY - 5, 8, 10).fill({ color: palette.petalA, alpha: 0.9 });
    gfx.rect(stemTopX - 2, stemTopY - 13, 4, 8).fill({ color: palette.frost, alpha: 0.95 });
    gfx.rect(stemTopX - 7, stemTopY - 2, 3, 8).fill({ color: palette.petalB, alpha: 0.82 });
    gfx.rect(stemTopX + 4, stemTopY - 1, 3, 7).fill({ color: palette.leafLight, alpha: 0.72 });
    gfx.rect(stemTopX - 1, stemTopY - 10, 2, 13).fill({ color: 0xffffff, alpha: shine });
    return;
  }

  if (kind === "bell") {
    const cupColor = (seed >> 6) % 2 === 0 ? palette.petalA : palette.petalB;
    gfx.rect(stemTopX - 4, stemTopY - 4, 8, 3).fill(palette.leafLight);
    gfx.rect(stemTopX - 5, stemTopY - 1, 10, 7).fill(cupColor);
    gfx.rect(stemTopX - 7, stemTopY + 4, 4, 4).fill(cupColor);
    gfx.rect(stemTopX + 3, stemTopY + 4, 4, 4).fill(cupColor);
    gfx.rect(stemTopX - 2, stemTopY + 5, 4, 5).fill({ color: palette.center, alpha: 0.8 });
    gfx.rect(stemTopX - 4, stemTopY, 8, 1).fill({ color: 0xffffff, alpha: 0.22 });
    return;
  }

  if (kind === "lotus") {
    const baseY = stemTopY + 2;
    const a = palette.petalA;
    const b = palette.petalB;
    drawFloraPetal(gfx, stemTopX - 7, baseY + 3, 7, 6, a, 0.95);
    drawFloraPetal(gfx, stemTopX + 7, baseY + 3, 7, 6, b, 0.95);
    drawFloraPetal(gfx, stemTopX - 3, baseY - 1, 7, 8, b, 0.95);
    drawFloraPetal(gfx, stemTopX + 3, baseY - 1, 7, 8, a, 0.95);
    drawFloraPetal(gfx, stemTopX, baseY - 5, 6, 8, palette.frost, cold ? 0.8 : 0.55);
    gfx.rect(stemTopX - 2, baseY + 1, 4, 4).fill(palette.center);
    return;
  }

  const petalA = palette.petalA;
  const petalB = palette.petalB;
  drawFloraPetal(gfx, stemTopX, stemTopY - 9, 6, 7, petalA);
  drawFloraPetal(gfx, stemTopX - 7, stemTopY - 3, 7, 6, petalB);
  drawFloraPetal(gfx, stemTopX + 7, stemTopY - 3, 7, 6, petalB);
  drawFloraPetal(gfx, stemTopX - 4, stemTopY + 5, 6, 6, petalA);
  drawFloraPetal(gfx, stemTopX + 4, stemTopY + 5, 6, 6, petalA);
  gfx.rect(stemTopX - 3, stemTopY - 3, 6, 6).fill(palette.center);
  gfx.rect(stemTopX - 1, stemTopY - 4, 2, 2).fill({ color: 0xffffff, alpha: 0.45 });
}

function composeProceduralFlora(chunk: GeneratedChunk, target: Container, biome: BiomeId): void {
  clearProceduralFloraChunk(chunk.chunkY);
  const flora: ProceduralFlora[] = [];
  const palette = proceduralFloraPaletteForBiome(biome);

  for (const platform of chunk.platforms) {
    if (platform.width < 2) continue;
    const baseSeed = platformSeed(chunk, platform, 3167);
    const count = Math.min(9, Math.max(2, Math.floor(platform.width / 2) + (baseSeed % 3)));
    const topY = platformTopY(chunk, platform);

    for (let i = 0; i < count; i++) {
      const n = midMountainNoise(chunk.chunkY, platform.x * 41 + i * 73, platform.y * 59, 3191);
      if (n % 5 === 0 && platform.width < 5) continue;
      const edgeBias = i % 4 === 0 ? 0.08 + ((n >> 5) % 8) / 100 : i % 4 === 1 ? 0.92 - ((n >> 9) % 8) / 100 : (i + 0.55) / (count + 0.8);
      const xRatio = Math.max(0.08, Math.min(0.92, edgeBias + (((n >> 13) % 17) - 8) / 100));
      const kind = chooseProceduralFloraKind(biome, n);
      const height = kind === "grass" ? 13 + (n % 12) : kind === "crystal" ? 18 + (n % 12) : 16 + (n % 17);
      const plant: ProceduralFlora = {
        chunkY: chunk.chunkY,
        gfx: new Graphics(),
        baseX: Math.round((platform.x + platform.width * xRatio) * TILE_SIZE),
        baseY: topY + 2,
        phase: ((n >> 17) % 628) / 100,
        speed: 0.85 + ((n >> 23) % 70) / 100,
        amplitude: 1.5 + ((n >> 3) % 33) / 10,
        seed: n,
        height,
        kind,
        palette,
      };
      plant.gfx.zIndex = 5;
      plant.gfx.alpha = biome === "celestialSummit" ? 0.82 : biome === "frozenSpires" ? 0.88 : 0.94;
      plant.gfx.x = plant.baseX;
      plant.gfx.y = plant.baseY;
      drawProceduralFlora(plant, 0);
      target.addChild(plant.gfx);
      flora.push(plant);
    }
  }

  if (flora.length > 0) proceduralFlora.set(chunk.chunkY, flora);
}

function updateProceduralFlora(tSec: number): void {
  for (const [chunkY, flora] of proceduralFlora) {
    for (let i = flora.length - 1; i >= 0; i--) {
      const plant = flora[i]!;
      if (plant.gfx.destroyed) {
        flora.splice(i, 1);
        continue;
      }
      plant.gfx.x = plant.baseX + Math.round(Math.sin(tSec * 0.18 + plant.phase) * 0.5);
      plant.gfx.y = plant.baseY;
      drawProceduralFlora(plant, tSec);
    }
    if (flora.length === 0) proceduralFlora.delete(chunkY);
  }
}

function proceduralPlatformRockColor(palette: PlatformPixelPalette, xCell: number, yCell: number, seed: number, edge = false): number {
  const noise = midMountainNoise(seed, xCell, yCell, 421);
  if (edge) return noise % 7 === 0 ? palette.rockDark : palette.outline;
  if (noise % 17 === 0) return palette.rockLight;
  if (noise % 5 === 0) return palette.soil;
  if (noise % 3 === 0) return palette.rock;
  if (noise % 17 === 0) return palette.outline;
  return palette.rockDark;
}

function proceduralPlatformSurfaceColor(palette: PlatformPixelPalette, xCell: number, yCell: number, seed: number): number {
  const noise = midMountainNoise(seed, xCell, yCell, 613);
  if (yCell <= 1 && noise % 5 === 0) return palette.surfaceTip;
  if (noise % 7 === 0) return palette.surfaceLight;
  if (noise % 4 === 0) return palette.surfaceDark;
  return palette.surface;
}

function drawProceduralPlatformPixel(
  g: Graphics,
  x: number,
  y: number,
  color: number,
  alpha = 0.98,
): void {
  g.rect(x, y, PROCEDURAL_PLATFORM_PIXEL_SIZE, PROCEDURAL_PLATFORM_PIXEL_SIZE).fill({ color, alpha });
}

function addProceduralPlatform(
  target: Container,
  tileX: number,
  tileY: number,
  widthTiles: number,
  biome: BiomeId,
  palette: PlatformPixelPalette,
  seed: number,
): void {
  const g = new Graphics();
  const cell = PROCEDURAL_PLATFORM_PIXEL_SIZE;
  const cellsPerTile = TILE_SIZE / cell;
  const widthCells = widthTiles * cellsPerTile;
  const x = tileX * TILE_SIZE;
  const y = tileY * TILE_SIZE;
  const surfaceCells = biome === "pineValley" ? 5 : biome === "snowfallCliffs" || biome === "frozenSpires" ? 4 : 5;
  const bodyStart = Math.max(3, surfaceCells - 1);
  const heightCells =
    biome === "frozenSpires" ? 20 :
    biome === "snowfallCliffs" ? 18 :
    biome === "celestialSummit" ? 19 :
    17;
  const lobeCenters = [
    Math.max(1, Math.floor(widthCells * 0.18) + (seed % 4) - 1),
    Math.floor(widthCells * 0.48) + ((seed >> 3) % 3) - 1,
    Math.min(widthCells - 2, Math.floor(widthCells * 0.8) - ((seed >> 5) % 4) + 1),
  ];
  const lobeRadii = [
    Math.max(4, Math.floor(widthCells * 0.2)),
    Math.max(5, Math.floor(widthCells * 0.3)),
    Math.max(4, Math.floor(widthCells * 0.2)),
  ];
  const bottomLimits: number[] = [];

  for (let cx = 0; cx < widthCells; cx++) {
    let limit = bodyStart + 2;
    const leftFalloff = Math.min(1, cx / (cellsPerTile * 0.9));
    const rightDistance = widthCells - 1 - cx;
    const rightFalloff = Math.min(1, rightDistance / (cellsPerTile * 0.9));
    const sideTaper = Math.min(leftFalloff, rightFalloff);

    for (let i = 0; i < lobeCenters.length; i++) {
      const distance = Math.abs(cx - lobeCenters[i]!);
      const strength = clamp01(1 - distance / lobeRadii[i]!);
      limit = Math.max(limit, bodyStart + 3 + Math.round(strength * heightCells * sideTaper));
    }

    const chipNoise = midMountainNoise(seed, cx, limit, 733);
    if (chipNoise % 11 === 0 && cx > cellsPerTile - 1 && cx < widthCells - cellsPerTile) limit = Math.max(bodyStart + 4, limit - 2);
    if (chipNoise % 17 === 0 && sideTaper > 0.6) limit = Math.min(heightCells, limit + 1);
    bottomLimits[cx] = limit;

    for (let cy = bodyStart; cy <= limit; cy++) {
      const edge = cy === limit || cx === 0 || cx === widthCells - 1;
      const color = cy <= bodyStart + 1 && !edge
        ? (midMountainNoise(seed, cx, cy, 149) % 3 === 0 ? palette.soil : palette.soilDark)
        : proceduralPlatformRockColor(palette, cx, cy, seed, edge);
      drawProceduralPlatformPixel(g, x + cx * cell, y + cy * cell, color);
    }
  }

  for (let cx = 0; cx < widthCells; cx++) {
    const edgeDip = midMountainNoise(seed, cx, 0, 317) % 3 === 0 ? 1 : 0;
    for (let cy = 0; cy < surfaceCells + edgeDip; cy++) {
      if (cy === surfaceCells + edgeDip - 1 && midMountainNoise(seed, cx, cy, 719) % 5 === 0) continue;
      drawProceduralPlatformPixel(g, x + cx * cell, y + cy * cell, proceduralPlatformSurfaceColor(palette, cx, cy, seed));
    }
  }

  for (let cx = 0; cx < widthCells; cx += 2) {
    if (midMountainNoise(seed, cx, 1, 881) % 4 === 0) continue;
    const bladeHeight = 1 + (midMountainNoise(seed, cx, 2, 883) % 3);
    for (let i = 0; i < bladeHeight; i++) {
      drawProceduralPlatformPixel(g, x + cx * cell, y - i * cell, i === bladeHeight - 1 ? palette.surfaceTip : palette.surfaceLight, 0.95);
    }
  }

  for (let tile = 0; tile < widthTiles; tile++) {
    const rootNoise = midMountainNoise(seed, tile, widthTiles, 977);
    if (rootNoise % 5 === 0) continue;
    const rootX = tile * TILE_SIZE + 4 + (rootNoise % 5) * cell;
    const rootCellX = Math.min(widthCells - 1, Math.max(0, Math.floor(rootX / cell)));
    const rootY = (bottomLimits[rootCellX] ?? bodyStart + 4) * cell + cell + ((rootNoise >> 3) % 2) * cell;
    const rootCells = 5 + ((rootNoise >> 5) % 10);
    for (let i = 0; i < rootCells; i++) {
      const wiggle = ((rootNoise >> (i + 1)) & 1) === 0 ? 0 : cell;
      const color = i === rootCells - 1 || i % 3 === 2 ? palette.outline : (i % 2 === 0 ? palette.root : palette.soilDark);
      drawProceduralPlatformPixel(g, x + rootX + wiggle, y + rootY + i * cell, color, 0.9);
    }
  }

  if (biome === "frozenSpires" || biome === "snowfallCliffs") {
    for (let cx = 2; cx < widthCells - 2; cx += 5) {
      const n = midMountainNoise(seed, cx, widthCells, 991);
      if (n % 4 === 0) continue;
      const icicleCells = 3 + (n % 5);
      const startY = (bottomLimits[cx] ?? bodyStart + 5) * cell;
      for (let i = 0; i < icicleCells; i++) {
        drawProceduralPlatformPixel(g, x + cx * cell, y + startY + i * cell, i === icicleCells - 1 ? palette.surfaceLight : palette.accent, 0.88);
      }
    }
  }

  if (biome === "celestialSummit") {
    for (let cx = 4; cx < widthCells - 4; cx += 9) {
      if (midMountainNoise(seed, cx, widthCells, 997) % 3 === 0) continue;
      const cy = Math.max(bodyStart + 2, Math.floor((bottomLimits[cx] ?? bodyStart + 8) * 0.62));
      drawProceduralPlatformPixel(g, x + cx * cell, y + cy * cell, palette.accent, 0.95);
      drawProceduralPlatformPixel(g, x + (cx + 1) * cell, y + cy * cell, palette.surfaceLight, 0.85);
    }
  }

  g.zIndex = 2;
  target.addChild(g);
}

// ── Layer hierarchy ───────────────────────────────────────────────────────────
// skyLayer    — screen-space parallax bg (not inside worldLayer)
// worldLayer  — world-space (camera-transformed)
//   backDecorationLayer — backgroundMid / non-colliding scenery
//   chunkLayer          — terrain / simple rectangular collision tiles
//   decorationLayer     — decorations / hazards as non-blocking sprites
//   portalLayer         — relic shrines and portal effects
//   relicLayer          — collectibles
//   enemyLayer          — server-authoritative NPCs
//   remoteLayer         — players
//   localLayer          — players
//   effectLayer         — particles
// hudLayer              — ui

const skyLayer    = new Container();
const worldLayer  = new Container();
const backDecorationLayer = new Container();
const chunkLayer  = new Container();
const decorationLayer = new Container();
const portalLayer = new Container();
const relicLayer  = new Container();
const enemyLayer  = new Container();
const remoteLayer = new Container();
const localLayer  = new Container();
const effectLayer = new Container();
const hudLayer    = new Container();

enemyLayer.sortableChildren = true;
worldLayer.addChild(backDecorationLayer, chunkLayer, decorationLayer, portalLayer, relicLayer, enemyLayer, remoteLayer, localLayer, effectLayer);
pixi.stage.addChild(skyLayer, worldLayer, hudLayer);

const screenFlashGfx = new Graphics();
hudLayer.addChild(screenFlashGfx);
let screenFlashLife = 0;
let screenFlashMax = 0;
let screenFlashColor = 0xffffff;

// ── State ─────────────────────────────────────────────────────────────────────

let localPlayer: PlayerState | null = null;
let localVisualPosition: { x: number; y: number } | null = null;
let localPlayerId: string | null = null;
let sessionToken: string | null = null;
let serverSeed = 0x5eed_babe; // updated from welcome message to match server chunks

const loadedChunks   = new Map<number, GeneratedChunk>();
const chunkGraphics  = new Map<number, Graphics>();
const chunkDecorations = new Map<number, { back: Container; front: Container }>();
const chunkHazardTelegraphs = new Map<number, HazardTelegraph[]>();
const tileMap        = createMultiChunkTileMap(loadedChunks);
const collectedRelics = new Set<string>();

interface HazardTelegraph {
  gfx: Graphics;
  x: number;
  y: number;
  seed: number;
  style: "spike" | "falling" | "wind" | "rune";
  width: number;
}

interface RelicAnim {
  container: Container;
  aura: Graphics;
  gfx: Graphics;
  sprite: Sprite;
  sparkle: Sprite | null;
  ring: Sprite | null;
  kind: CollectibleKind;
  auraColor: number;
  frames: AssetKey[];
  tileX: number;
  tileY: number;
}
const relicAnims = new Map<string, RelicAnim>();

interface JumpPadAnim {
  container: Container;
  aura: Graphics;
  padGfx: Graphics;
  pad: JumpPadSpawn;
  worldX: number;
  worldY: number;
}
const jumpPadAnims = new Map<string, JumpPadAnim>();

interface EnemyEntry {
  state: EnemyState;
  sprite: Sprite;
  hp: Graphics;
}
const enemyEntries = new Map<string, EnemyEntry>();

interface RemoteEntry {
  states: Array<{ state: PlayerState; t: number }>;
  current: PlayerState;
  colorIndex: number;
  sprite: Sprite;
  crownSprite: Sprite;
  gfx: Graphics;
  label: Text;
}
const remotePlayers  = new Map<string, RemoteEntry>();
const playerNames    = new Map<string, string>();
let   playerColorIdx = 1; // 0 = local (gold)

interface PredEntry { seq: number; input: PlayerInput; state: PlayerState }
const predBuf: PredEntry[] = [];
let   localSeq = 0;
let   predictionAccumulatorSeconds = 0;
let   queuedJumpPressed = false;
let   queuedKickPressed = false;

const MAX_PREDICTION_STEPS_PER_FRAME = 3;
const MAX_PREDICTION_ACCUMULATOR_SECONDS = PHYSICS_STEP_SECONDS * MAX_PREDICTION_STEPS_PER_FRAME;
const PREDICTION_STEP_EPSILON = 0.000_001;
const LOCAL_VISUAL_CORRECTION_RATE = 18;
const LOCAL_VISUAL_SNAP_THRESHOLD_PX = 72;
let ws: WebSocket | null = null;
let pingMs        = 0;
let lastPingTime  = 0;
let serverTimeOffsetMs = 0;
let hasServerClock = false;
const pingSamples: number[] = [];
let   pingJitterMs = 0;
let serverTick    = 0;
let matchPhase    = "waiting";
let reconnDelay   = 1000;
let reconnTimeout: ReturnType<typeof setTimeout> | null = null;

let cameraY   = 0;
let cameraSnap = true;
let showDebug  = false;
let elapsedMs  = 0;
let lastLocalJumpPadFxMs = -Infinity;

// Camera shake
let shakeX = 0, shakeY = 0;

// Cloud horizontal drift offsets (px/s)
let cloudDriftFar   = 0;
let cloudDriftMid   = 0;
let cloudDriftFront = 0;

// Pre-allocated persistent graphics for local player
const localSprite = makeCharacterSprite("character1");
const localCrownSprite = makeSprite("crown");
const localGfx = new Graphics();
localSprite.anchor.set(0.5, playerSpriteAnchorY());
localSprite.alpha = hasPlayerAnimationAssets() ? 0.92 : hasAsset("playerExplorer") ? 0.62 : 0;
localCrownSprite.anchor.set(0.5, 1);
localCrownSprite.visible = false;
localGfx.alpha = hasPlayerAnimationAssets() ? 0.12 : 1;
localLayer.addChild(localSprite, localGfx, localCrownSprite);

// ── Input ─────────────────────────────────────────────────────────────────────

const held: Record<string, boolean> = {};
let jumpEdge = false, kickEdge = false;

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  held[e.code] = true;
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") { jumpEdge = true; e.preventDefault(); }
  if (e.code === "KeyF") kickEdge = true;
  if (e.code === "F1") { showDebug = !showDebug; e.preventDefault(); }
  if (e.code === "F2") respawnLocal();
  if (e.code === "F3") regenerateWorld();
});
window.addEventListener("keyup", (e) => { held[e.code] = false; });

type FrameInput = Omit<PlayerInput, "sequence">;

function captureInput(): FrameInput {
  const inp: FrameInput = {
    left:        !!held["ArrowLeft"]  || !!held["KeyA"],
    right:       !!held["ArrowRight"] || !!held["KeyD"],
    jumpPressed: jumpEdge,
    jumpHeld:    !!held["Space"] || !!held["ArrowUp"] || !!held["KeyW"],
    drop:        !!held["ArrowDown"]  || !!held["KeyS"],
    kick:        kickEdge,
  };
  jumpEdge = false; kickEdge = false;
  return inp;
}

function createPredictionInput(frameInput: FrameInput): PlayerInput {
  const inp: PlayerInput = {
    ...frameInput,
    jumpPressed: queuedJumpPressed,
    kick: queuedKickPressed,
    sequence: localSeq++,
  };
  queuedJumpPressed = false;
  queuedKickPressed = false;
  return inp;
}

function clonePlayerState(state: PlayerState): PlayerState {
  return {
    ...state,
    position: { ...state.position },
    velocity: { ...state.velocity },
  };
}

function snapLocalVisualToSimulation(): void {
  localVisualPosition = localPlayer
    ? { x: localPlayer.position.x, y: localPlayer.position.y }
    : null;
}

function updateLocalVisualPosition(dt: number): void {
  if (!localPlayer) {
    localVisualPosition = null;
    return;
  }

  if (!localVisualPosition || cameraSnap) {
    snapLocalVisualToSimulation();
    return;
  }

  const dx = localPlayer.position.x - localVisualPosition.x;
  const dy = localPlayer.position.y - localVisualPosition.y;
  const correction = Math.hypot(dx, dy);
  if (correction > LOCAL_VISUAL_SNAP_THRESHOLD_PX) {
    snapLocalVisualToSimulation();
    return;
  }

  const alpha = 1 - Math.exp(-LOCAL_VISUAL_CORRECTION_RATE * dt);
  localVisualPosition.x += dx * alpha;
  localVisualPosition.y += dy * alpha;
}

function getLocalRenderPosition(): { x: number; y: number } | null {
  if (!localPlayer) return null;
  return localVisualPosition ?? localPlayer.position;
}

function resetLocalPrediction(): void {
  predBuf.length = 0;
  predictionAccumulatorSeconds = 0;
  queuedJumpPressed = false;
  queuedKickPressed = false;
}

// ── World management ──────────────────────────────────────────────────────────

function loadChunk(cy: number): void {
  if (cy < 0) return;
  if (loadedChunks.has(cy)) return;
  const chunk = generateVerticalChunk({ seed: serverSeed, chunkY: cy });
  loadedChunks.set(cy, chunk);
  renderChunk(chunk);
}

function chunkYForWorldY(y: number): number {
  return Math.max(0, -Math.floor(Math.floor(y / TILE_SIZE) / CHUNK_HEIGHT_TILES));
}

function currentChunkWindow(): { min: number; max: number } | null {
  if (!localPlayer) return null;
  const pChunkY = chunkYForWorldY(localPlayer.position.y);
  return {
    min: Math.max(0, pChunkY - CHUNKS_PRELOAD_BEHIND),
    max: pChunkY + CHUNKS_PRELOAD_AHEAD,
  };
}

function ensureChunksAhead(): void {
  if (!localPlayer) return;
  const window = currentChunkWindow();
  if (!window) return;
  for (let cy = window.min; cy <= window.max; cy++) loadChunk(cy);

  // Sliding-window streaming. Chunks are deterministic, so disposing visuals is
  // safe; if the player goes back down, the window above reloads them.
  for (const cy of [...loadedChunks.keys()]) {
    if (cy < window.min || cy > window.max) {
      destroyChunkVisuals(cy);
      loadedChunks.delete(cy);
    }
  }
}

function regenerateWorld(): void {
  clearWorldChunks();
  for (let cy = 0; cy < INITIAL_CHUNKS_TO_LOAD; cy++) loadChunk(cy);
  respawnLocal();
}

function clearWorldChunks(): void {
  loadedChunks.clear();
  for (const g of chunkGraphics.values()) g.destroy();
  chunkGraphics.clear();
  for (const c of chunkDecorations.values()) {
    c.back.destroy({ children: true });
    c.front.destroy({ children: true });
  }
  chunkDecorations.clear();
  chunkHazardTelegraphs.clear();
  midMountainCrumbleEmitters.clear();
  for (const shard of midMountainCrumbleShards) {
    if (!shard.gfx.destroyed) shard.gfx.destroy();
  }
  midMountainCrumbleShards.length = 0;
  for (const flutters of biomeFlutters.values()) {
    for (const flutter of flutters) {
      if (!flutter.gfx.destroyed) flutter.gfx.destroy();
    }
  }
  biomeFlutters.clear();
  for (const lianas of proceduralLianas.values()) {
    for (const liana of lianas) {
      if (!liana.gfx.destroyed) liana.gfx.destroy();
    }
  }
  proceduralLianas.clear();
  for (const flora of proceduralFlora.values()) {
    for (const plant of flora) {
      if (!plant.gfx.destroyed) plant.gfx.destroy();
    }
  }
  proceduralFlora.clear();
  backDecorationLayer.removeChildren();
  chunkLayer.removeChildren();
  decorationLayer.removeChildren();
  for (const a of relicAnims.values()) a.container.destroy({ children: true });
  relicAnims.clear();
  for (const a of portalAnims.values()) a.container.destroy({ children: true });
  portalAnims.clear();
  for (const a of jumpPadAnims.values()) a.container.destroy({ children: true });
  jumpPadAnims.clear();
  for (const e of enemyEntries.values()) {
    e.sprite.destroy();
    e.hp.destroy();
  }
  enemyEntries.clear();
}

function destroyChunkVisuals(chunkY: number): void {
  const oldGfx = chunkGraphics.get(chunkY);
  if (oldGfx) {
    oldGfx.destroy();
    chunkGraphics.delete(chunkY);
  }

  const decor = chunkDecorations.get(chunkY);
  if (decor) {
    decor.back.destroy({ children: true });
    decor.front.destroy({ children: true });
    chunkDecorations.delete(chunkY);
  }
  chunkHazardTelegraphs.delete(chunkY);
  clearMidMountainCrumbleChunk(chunkY);
  clearBiomeFluttersChunk(chunkY);
  clearProceduralLianasChunk(chunkY);
  clearProceduralFloraChunk(chunkY);

  const relicPrefix = `relic:${chunkY}:`;
  for (const [id, anim] of [...relicAnims.entries()]) {
    const animChunkY = Math.max(0, -Math.floor(anim.tileY / CHUNK_HEIGHT_TILES));
    if (id.startsWith(relicPrefix) || animChunkY === chunkY) {
      anim.container.destroy({ children: true });
      relicAnims.delete(id);
    }
  }

  const portal = portalAnims.get(chunkY);
  if (portal) {
    portal.container.destroy({ children: true });
    portalAnims.delete(chunkY);
  }
  clearJumpPadAnimsForChunk(chunkY);
  for (const [enemyId, entry] of [...enemyEntries.entries()]) {
    if (entry.state.chunkY === chunkY) {
      entry.sprite.destroy();
      entry.hp.destroy();
      enemyEntries.delete(enemyId);
    }
  }
}

function getSpawnPos(chunkY = 0): { x: number; y: number } {
  const chunk = loadedChunks.get(chunkY) ?? loadedChunks.get(0);
  if (!chunk) return { x: WORLD_WIDTH / 2 - PLAYER_WIDTH / 2, y: -PLAYER_HEIGHT };
  return {
    x: (chunk.entry.x + Math.floor(chunk.entry.width / 2)) * TILE_SIZE - PLAYER_WIDTH / 2,
    y: (chunk.worldTileY + chunk.entry.y) * TILE_SIZE - PLAYER_HEIGHT,
  };
}

function respawnLocal(): void {
  if (!localPlayerId) { localPlayerId = "local"; playerNames.set("local", nameInput.value || "Explorer"); }
  const checkpointChunkY = Math.max(0, localPlayer?.checkpointChunkY ?? 0);
  const { x, y } = getSpawnPos(checkpointChunkY);
  if (localPlayer) {
    respawnPlayerState(localPlayer, x, y, checkpointChunkY);
  } else {
    localPlayer = createPlayerState(localPlayerId, x, y);
  }
  snapLocalVisualToSimulation();
  resetLocalPrediction();
  cameraSnap = true;
  spawnRing(x + PLAYER_WIDTH / 2, y + PLAYER_HEIGHT / 2, PAL.portalBlue);
}

// ── Sky parallax ──────────────────────────────────────────────────────────────

const skyBgGfx    = new Graphics();
const sunGlowGfx  = new Graphics();
const starsGfx    = new Graphics();
const aiPanoramaBack = new Container();
const forestPanoramaBack = new Container();
const skyArchesBack = new Container();
const ruinTowersBack = new Container();
const islandsFar  = new Container();
const towersCont  = new Container();
const cloudBankBack = new Container();
const cloudsFar   = new Container();
const cloudsMid   = new Container();
const cloudsFront = new Container();
const canopyFrameFront = new Container();
skyLayer.addChild(
  skyBgGfx,
  sunGlowGfx,
  starsGfx,
  aiPanoramaBack,
  forestPanoramaBack,
  skyArchesBack,
  ruinTowersBack,
  islandsFar,
  towersCont,
  cloudBankBack,
  cloudsFar,
  cloudsMid,
  cloudsFront,
  canopyFrameFront,
);

function lerpColor(a: number, b: number, t: number): number {
  const c = Math.max(0, Math.min(1, t));
  const r = Math.round(((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * c);
  const g = Math.round(((a >>  8) & 0xff) + (((b >>  8) & 0xff) - ((a >>  8) & 0xff)) * c);
  const v = Math.round(( a        & 0xff) + (( b        & 0xff) - ( a        & 0xff)) * c);
  return (r << 16) | (g << 8) | v;
}

// Draw a pixel-art puffy cloud shape at (cx, cy) with width w
function drawPixelCloud(g: Graphics, cx: number, cy: number, w: number, bright: number, shadow: number, alpha = 1): void {
  const h = Math.max(6, Math.round(w / 5));
  // Bottom base (widest)
  g.rect(cx,              cy + h * 2, w,              h * 2).fill({ color: bright, alpha });
  // Mid body
  g.rect(cx + 2,          cy + h,     w - 4,          h * 2).fill({ color: bright, alpha });
  // Top bumps (three rounded domes)
  g.rect(cx + Math.round(w * 0.08), cy + Math.round(h * 0.4),  Math.round(w * 0.32), Math.round(h * 1.3)).fill({ color: bright, alpha });
  g.rect(cx + Math.round(w * 0.36), cy,                         Math.round(w * 0.36), Math.round(h * 1.6)).fill({ color: bright, alpha });
  g.rect(cx + Math.round(w * 0.72), cy + Math.round(h * 0.6),  Math.round(w * 0.22), Math.round(h * 1.1)).fill({ color: bright, alpha });
  // Underside shadow strip
  g.rect(cx + 3, cy + h * 4 - 2, w - 6, 3).fill({ color: shadow, alpha: alpha * 0.5 });
}

// Draw a small floating island silhouette for bg layers
function drawBgIsland(g: Graphics, ix: number, iy: number, w: number, h: number, col: number): void {
  g.rect(ix,      iy,     w,     h    ).fill(col);
  g.rect(ix + 2,  iy + h, w - 4, 2   ).fill(lerpColor(col, 0x000000, 0.35));
  g.rect(ix + 5,  iy + h + 2, w - 10, 2).fill(lerpColor(col, 0x000000, 0.55));
  // Tiny grass top
  g.rect(ix,      iy,     w,     2).fill(lerpColor(col, 0x60a020, 0.6));
  // Tiny tree silhouettes (2px wide each)
  const treeH = 3 + w % 4;
  g.rect(ix + Math.round(w * 0.2), iy - treeH, 2, treeH).fill(lerpColor(col, 0x204010, 0.4));
  g.rect(ix + Math.round(w * 0.7), iy - treeH + 1, 2, treeH - 1).fill(lerpColor(col, 0x204010, 0.3));
}

function addWideBackdrop(container: Container, key: AssetKey, sw: number, y: number, alpha: number): void {
  if (!hasAsset(key)) return;
  const sprite = makeSprite(key);
  const texW = Math.max(1, sprite.texture.width);
  const texH = Math.max(1, sprite.texture.height);
  const scale = Math.max(1, sw / texW);
  sprite.x = Math.round((sw - texW * scale) / 2);
  sprite.y = Math.round(y);
  sprite.scale.set(scale);
  sprite.alpha = alpha;
  container.addChild(sprite);

  if (texW * scale < sw + 80) {
    const extra = makeSprite(key);
    extra.x = Math.round(sprite.x + texW * scale);
    extra.y = sprite.y;
    extra.scale.set(scale);
    extra.alpha = alpha;
    container.addChild(extra);
  }

}

function addCoverBackdrop(container: Container, key: AssetKey, sw: number, sh: number, alpha: number): void {
  if (!hasAsset(key)) return;
  const sprite = makeSprite(key);
  const texW = Math.max(1, sprite.texture.width);
  const texH = Math.max(1, sprite.texture.height);
  const scale = Math.max(sw / texW, sh / texH);
  sprite.x = Math.round((sw - texW * scale) / 2);
  sprite.y = Math.round((sh - texH * scale) / 2);
  sprite.scale.set(scale);
  sprite.alpha = alpha;
  container.addChild(sprite);
}

function addProceduralMountainBackdrop(container: Container, sw: number, sh: number): void {
  const g = new Graphics();
  const layerSpecs = [
    { base: 0.74, amp: 0.18, step: 72, color: PAL.mountainFar, alpha: 0.34, seed: 11 },
    { base: 0.82, amp: 0.22, step: 56, color: PAL.mountainMid, alpha: 0.42, seed: 29 },
    { base: 0.92, amp: 0.16, step: 42, color: PAL.ruinsDark, alpha: 0.22, seed: 47 },
  ];

  for (const spec of layerSpecs) {
    const ridge: number[] = [-80, sh + 40, -80, Math.round(sh * spec.base)];
    for (let x = -40; x <= sw + 80; x += spec.step) {
      const n = Math.sin((x + spec.seed * 37) * 0.013) * 0.5 + Math.sin((x + spec.seed * 17) * 0.031) * 0.5;
      const y = Math.round(sh * spec.base - (0.45 + n * 0.5) * sh * spec.amp);
      ridge.push(x, y);
    }
    ridge.push(sw + 80, sh + 40);
    g.poly(ridge).fill({ color: spec.color, alpha: spec.alpha });

    for (let x = 0; x < sw; x += spec.step) {
      const n = Math.sin((x + spec.seed * 19) * 0.027);
      const y = Math.round(sh * spec.base - (0.42 + n * 0.2) * sh * spec.amp);
      const w = 18 + ((x + spec.seed) % 28);
      g.rect(x + 6, y + 18, w, 3).fill({ color: PAL.skyHaze, alpha: spec.alpha * 0.18 });
      if ((x / spec.step + spec.seed) % 3 < 1) {
        g.rect(x + w * 0.4, y + 28, 2, 18).fill({ color: PAL.canopyDark, alpha: spec.alpha * 0.35 });
        g.poly([x + w * 0.4 - 5, y + 34, x + w * 0.4 + 1, y + 21, x + w * 0.4 + 7, y + 34])
          .fill({ color: PAL.canopyDark, alpha: spec.alpha * 0.28 });
      }
    }
  }

  container.addChild(g);
}

function buildSkyStatic(sw: number, sh: number): void {
  // Stars (visible at high altitude)
  starsGfx.clear();
  for (let i = 0; i < 100; i++) {
    const sx = (i * 7919 + 1031) % sw;
    const sy = (i * 4231 +  571) % Math.round(sh * 3.0) - sh;
    const big = i % 7 === 0;
    starsGfx.rect(sx, sy, big ? 2 : 1, big ? 2 : 1)
      .fill({ color: PAL.starBright, alpha: big ? 0.9 : 0.42 });
  }

  // Sun glow (warm golden circle, lower-right quadrant)
  sunGlowGfx.clear();
  const sunX = sw * 0.72, sunY = sh * 0.88;
  for (let r = 7; r >= 1; r--) {
    sunGlowGfx.circle(sunX, sunY, r * 32).fill({ color: 0xf8e080, alpha: r * 0.025 });
  }
  sunGlowGfx.circle(sunX, sunY, 18).fill({ color: 0xfff8c0, alpha: 0.45 });
  sunGlowGfx.circle(sunX, sunY, 8).fill({ color: 0xfffff0, alpha: 0.8 });

  aiPanoramaBack.removeChildren();
  addProceduralMountainBackdrop(aiPanoramaBack, sw, sh);

  skyArchesBack.removeChildren();
  addWideBackdrop(skyArchesBack, "bgSkyArches", sw, sh * 0.28, 0.12);

  cloudBankBack.removeChildren();
  addWideBackdrop(cloudBankBack, "bgCloudBank", sw, sh * 0.12, 0.18);

  // Distant floating island silhouettes
  islandsFar.removeChildren();
  if (hasAsset("floatingIsland")) {
    for (let i = 0; i < 10; i++) {
      const island = makeSprite("floatingIsland");
      island.x = ((i * 89 + 23) % (sw + 110)) - 55;
      island.y = sh * 0.42 + (i * 61 % Math.round(sh * 0.36));
      const sc = 0.42 + (i % 4) * 0.12;
      island.scale.set(sc * SCENE_ASSET_SCALE);
      island.alpha = 0.34;
      islandsFar.addChild(island);
    }
  } else {
    const ig = new Graphics();
    for (let i = 0; i < 12; i++) {
      const ix = ((i * 89 + 23) % (sw + 60)) - 30;
      const iy = sh * 0.45 + (i * 61 % Math.round(sh * 0.35));
      const iw = 20 + (i * 37 % 55);
      const ih = 6 + (i * 23 % 12);
      drawBgIsland(ig, ix, iy, iw, ih, PAL.islandFar);
    }
    islandsFar.addChild(ig);
  }

  // Ancient tower silhouettes
  towersCont.removeChildren();
  const tg = new Graphics();
  const towerGroundY = Math.round(sh * 1.06);
  tg.rect(0, towerGroundY - 22, sw, 22).fill({ color: PAL.ruinsDark, alpha: 0.28 });
  tg.rect(0, towerGroundY - 10, sw, 10).fill({ color: PAL.uiInk, alpha: 0.24 });
  tg.rect(0, towerGroundY - 24, sw, 3).fill({ color: PAL.canopyMid, alpha: 0.18 });
  for (let i = 0; i < 7; i++) {
    const tx = ((i * 113 + 41) % (sw + 80)) - 30;
    const th = sh * (0.15 + (i * 43 % 60) / 300);
    const tw = 10 + i * 5;
    const towerTopY = towerGroundY - th;
    tg.rect(tx, towerTopY, tw, th + 18).fill(PAL.ruinsDark);
    // Tower top / spire
    tg.poly([tx + 1, towerTopY, tx + Math.round(tw / 2), towerTopY - 10, tx + tw - 1, towerTopY]).fill(PAL.ruinsDark);
    // Battlements
    for (let b = 0; b < 3; b++) tg.rect(tx + b * Math.floor(tw / 3), towerTopY - 5, Math.floor(tw / 4), 5).fill(PAL.ruinsDark);
    // Window glow
    tg.rect(tx + Math.round(tw * 0.3), towerTopY + th * 0.45, 3, 5).fill({ color: PAL.portalBlue, alpha: 0.14 });
    tg.rect(tx - 4, towerGroundY - 4, tw + 8, 5).fill({ color: PAL.uiInk, alpha: 0.22 });
  }
  towersCont.addChild(tg);

  // Far clouds (thin, hazy, distant)
  cloudsFar.removeChildren();
  if (hasAsset("cloud")) {
    for (let i = 0; i < 10; i++) {
      const cloud = makeSprite(cloudAsset(i, "far"));
      cloud.x = ((i * 97 + 17) % (sw + 120)) - 60;
      cloud.y = sh * 0.06 + (i * 79 % Math.round(sh * 0.70));
      cloud.scale.set((0.38 + (i % 3) * 0.08) * SCENE_ASSET_SCALE);
      cloud.alpha = 0.38;
      cloudsFar.addChild(cloud);
    }
  } else {
    const cfg = new Graphics();
    for (let i = 0; i < 10; i++) {
      const cw = 36 + (i * 53 % 80);
      const cx = ((i * 97 + 17) % (sw + 80)) - 40;
      const cy = sh * 0.06 + (i * 79 % Math.round(sh * 0.70));
      drawPixelCloud(cfg, cx, cy, cw, PAL.cloudMid, PAL.cloudFar, 0.42);
    }
    cloudsFar.addChild(cfg);
  }

  // Mid clouds (medium, puffier, warmer)
  cloudsMid.removeChildren();
  if (hasAsset("cloud")) {
    for (let i = 0; i < 7; i++) {
      const cloud = makeSprite(cloudAsset(i, "mid"));
      cloud.x = ((i * 137 + 53) % (sw + 150)) - 70;
      cloud.y = sh * 0.04 + (i * 103 % Math.round(sh * 0.68));
      cloud.scale.set((0.72 + (i % 3) * 0.12) * SCENE_ASSET_SCALE);
      cloud.alpha = 0.56;
      cloudsMid.addChild(cloud);
    }
  } else {
    const cmg = new Graphics();
    for (let i = 0; i < 7; i++) {
      const cw = 70 + (i * 61 % 90);
      const cx = ((i * 137 + 53) % (sw + 120)) - 50;
      const cy = sh * 0.04 + (i * 103 % Math.round(sh * 0.68));
      drawPixelCloud(cmg, cx, cy, cw, PAL.cloudMid, PAL.cloudShadow, 0.60);
    }
    cloudsMid.addChild(cmg);
  }

  // Front clouds (large, detailed, warm sunlit)
  cloudsFront.removeChildren();
  if (hasAsset("cloud")) {
    for (let i = 0; i < 5; i++) {
      const cloud = makeSprite(cloudAsset(i, "front"));
      cloud.x = ((i * 173 + 31) % (sw + 200)) - 80;
      cloud.y = sh * 0.02 + (i * 127 % Math.round(sh * 0.72));
      cloud.scale.set((1.05 + (i % 2) * 0.25) * SCENE_ASSET_SCALE);
      cloud.alpha = 0.7;
      cloudsFront.addChild(cloud);
    }
  } else {
    const cfg2 = new Graphics();
    for (let i = 0; i < 5; i++) {
      const cw = 110 + (i * 71 % 100);
      const cx = ((i * 173 + 31) % (sw + 160)) - 60;
      const cy = sh * 0.02 + (i * 127 % Math.round(sh * 0.72));
      // Warm sunlit top, cool shadow underneath
      drawPixelCloud(cfg2, cx, cy, cw, PAL.cloudWarm, PAL.cloudShadow, 0.72);
      // Subtle warm highlight on topmost bump
      cfg2.rect(cx + Math.round(cw * 0.38), cy, Math.round(cw * 0.24), 2)
        .fill({ color: 0xfffff0, alpha: 0.3 });
    }
    cloudsFront.addChild(cfg2);
  }
}

function updateSkyParallax(camY: number, scale: number): void {
  const sw = pixi.screen.width, sh = pixi.screen.height;
  const scrollPx = -camY * scale;
  const heightT  = Math.max(0, -camY / TILE_SIZE);
  const t        = Math.min(1.0, heightT / (CHUNK_HEIGHT_TILES * 20));

  // Sky gradient — 5 bands for smooth depth
  const b = Math.round(sh / 5);
  skyBgGfx.clear();
  skyBgGfx.rect(0,     0, sw, b    ).fill(lerpColor(PAL.skyMid,    PAL.skyDeep,  t));
  skyBgGfx.rect(0,     b, sw, b    ).fill(lerpColor(PAL.skyMid,    PAL.skySpace, t * 0.6));
  skyBgGfx.rect(0, b * 2, sw, b    ).fill(lerpColor(PAL.skyGround, PAL.skyMid,   Math.min(1, t * 1.3)));
  skyBgGfx.rect(0, b * 3, sw, b    ).fill(lerpColor(PAL.skyGround, PAL.skyMid,   0.3 + t * 0.4));
  skyBgGfx.rect(0, b * 4, sw, sh - b * 4).fill(PAL.skyGround);
  // Soft horizon haze strip
  skyBgGfx.rect(0, sh - 6, sw, 6).fill({ color: PAL.skyHaze, alpha: 0.28 - t * 0.25 });

  // Sun glow fades as player climbs into space
  sunGlowGfx.alpha = Math.max(0, 1 - t * 2.2);

  starsGfx.alpha    = Math.min(1, t * 3.0);
  starsGfx.y        = scrollPx * 0.0;
  // Moderate parallax so the valley floor shows near ground and peaks emerge as
  // the player climbs. Alpha stays high; fades gently at near-space altitudes.
  aiPanoramaBack.y = Math.round(scrollPx * 0.07);
  aiPanoramaBack.alpha = Math.max(0.72, 1 - t * 0.18);
  forestPanoramaBack.y = scrollPx * 0.035;
  forestPanoramaBack.alpha = Math.max(0.08, 0.38 - t * 0.28);
  skyArchesBack.y   = scrollPx * 0.025;
  ruinTowersBack.y  = scrollPx * 0.075;
  islandsFar.y      = scrollPx * 0.05;
  towersCont.y      = scrollPx * 0.11;
  cloudBankBack.x   = cloudDriftFar * 0.45;
  cloudBankBack.y   = scrollPx * 0.14;
  cloudsFar.x   = cloudDriftFar;
  cloudsFar.y       = scrollPx * 0.20;
  cloudsMid.x   = cloudDriftMid;
  cloudsMid.y       = scrollPx * 0.34;
  cloudsFront.x = cloudDriftFront;
  cloudsFront.y     = scrollPx * 0.50;
  canopyFrameFront.y = Math.round(scrollPx * 0.02);
  canopyFrameFront.alpha = Math.max(0.12, 0.58 - t * 0.5);
}

buildSkyStatic(pixi.screen.width, pixi.screen.height);
window.addEventListener("resize", () =>
  setTimeout(() => buildSkyStatic(pixi.screen.width, pixi.screen.height), 80)
);

// ── Tile rendering ────────────────────────────────────────────────────────────

function renderChunk(chunk: GeneratedChunk): void {
  const g = new Graphics();
  const baseTileY = chunk.worldTileY;

  for (let ly = 0; ly < chunk.height; ly++) {
    for (let lx = 0; lx < chunk.width; lx++) {
      const kind = chunk.tiles[ly * chunk.width + lx] as TileKind;
      if (kind === "empty" || kind === "relic") continue;
      const above = ly > 0 ? chunk.tiles[(ly - 1) * chunk.width + lx] as TileKind : "empty";
      const below = ly < chunk.height - 1 ? chunk.tiles[(ly + 1) * chunk.width + lx] as TileKind : "solid";
      drawTile(g, lx, baseTileY + ly, kind, above, below, chunk.chunkY);
    }
  }

  chunkLayer.addChild(g);
  chunkGraphics.set(chunk.chunkY, g);
  decorateChunk(chunk);

  for (const rel of chunk.relics) {
    if (!collectedRelics.has(rel.id)) spawnRelicAnim(rel.id, rel.x, baseTileY + rel.y);
  }

  for (const pad of chunk.jumpPads) {
    spawnJumpPadAnim(pad, baseTileY + pad.y);
  }

  // Portal at exit platform (the upward goal for this chunk)
  spawnPortalAt(chunk.chunkY, chunk.exit.x, baseTileY + chunk.exit.y, chunk.exit.width, chunk.chunkY > 0);
}

function canPlaceDecoration(chunk: GeneratedChunk, lx: number, ly: number): boolean {
  if (ly <= 0 || lx < 0 || lx >= chunk.width) return false;
  const idx = ly * chunk.width + lx;
  const here = chunk.tiles[idx] as TileKind;
  const above = chunk.tiles[(ly - 1) * chunk.width + lx] as TileKind;
  return here === "oneWay" && (above === "empty" || above === "relic");
}

function canPlaceDecorationSpan(chunk: GeneratedChunk, lx: number, ly: number, widthTiles: number): boolean {
  for (let ox = 0; ox < widthTiles; ox++) {
    if (!canPlaceDecoration(chunk, lx + ox, ly)) return false;
  }
  return true;
}

function composeMidMountainLayer(chunk: GeneratedChunk, target: Container, biome: BiomeId): void {
  const baseTileY = chunk.worldTileY;
  const palette = midMountainPalette(biome);
  const connections = buildMidMountainConnections(chunk);
  const mountainParticles: PixiParticle[] = [];
  const topY = baseTileY * TILE_SIZE;
  const chunkPixelHeight = chunk.height * TILE_SIZE;
  const step = 4;

  for (let localY = 0; localY < chunkPixelHeight; localY += step) {
    for (let x = 0; x < WORLD_WIDTH; x += step) {
      const sampleX = x + 2;
      const sampleY = localY + 2;
      const density = midMountainDensity(chunk, connections, sampleX, sampleY);
      const noise = midMountainNoise(chunk.chunkY, sampleX, sampleY, 313);
      const grain = (noise & 255) / 255;
      const threshold = 0.18 + grain * 0.18;
      if (density <= threshold) continue;

      const edge = density < 0.44;
      const size = edge
        ? (noise % 5 === 0 ? 3 : 4)
        : (density > 0.84 && noise % 7 === 0 ? 7 : 5);
      const jitter = edge ? 1 : 0;
      mountainParticles.push(new PixiParticle({
        texture: Texture.WHITE,
        x: x + (jitter ? (noise % 3) - 1 : 0),
        y: topY + localY + (jitter ? ((noise >> 4) % 3) - 1 : 0),
        scaleX: size,
        scaleY: size,
        tint: midMountainParticleColor(palette, density, noise),
        alpha: 1,
      }));
    }
  }

  const mountain = new ParticleContainer<PixiParticle>({
    texture: Texture.WHITE,
    roundPixels: true,
    dynamicProperties: {
      vertex: false,
      position: false,
      rotation: false,
      uvs: false,
      color: false,
    },
  });
  mountain.zIndex = -6;
  mountain.particleChildren.push(...mountainParticles);
  mountain.update();
  target.addChild(mountain);
  clearMidMountainCrumbleChunk(chunk.chunkY);
  registerMidMountainCrumbleEmitters(chunk, target, palette, connections);
}

function composePlatformPartLayer(chunk: GeneratedChunk, target: Container, biome: BiomeId): void {
  const baseTileY = chunk.worldTileY;
  for (const platform of chunk.platforms) {
    const seed = (chunk.chunkY * 92821 + platform.x * 3701 + platform.y * 809 + platform.width * 97) >>> 0;
    const platformPalette = platformPixelPalette(biome);
    const topTileY = baseTileY + platform.y;
    addProceduralPlatform(target, platform.x, topTileY, platform.width, biome, platformPalette, seed);
  }
}

function biomeDecorationFolders(biome: BiomeId): string[] {
  const common = [
    "environment/decorations",
    "environment/structures",
    "environment/rocks",
    "environment/ladders",
    "environment/ropeBridges",
    "environment/lanterns",
    "environment/lights",
    "environment/crystals",
    "environment/banners",
    "environment/sheetElements",
    "environment/effects",
    "environment/particleEffects",
  ];
  if (biome === "pineValley") {
    return [...common, "environment/flora", "environment/vegetation", "environment/pineTrees", "environment/mossTiles", "environment/terrainTiles"];
  }
  if (biome === "cloudRidge") {
    return [...common, "environment/flora", "environment/vegetation", "environment/pineTrees", "environment/ruinTiles", "environment/clouds", "environment/terrainTiles"];
  }
  if (biome === "snowfallCliffs") {
    return [...common, "environment/flora", "environment/snowTrees", "environment/snowTiles", "environment/ruinTiles", "environment/clouds"];
  }
  if (biome === "frozenSpires") {
    return [...common, "environment/flora", "environment/snowTrees", "environment/snowTiles", "environment/ruinTiles"];
  }
  return [...common, "environment/flora", "environment/relicShrines", "environment/snowTiles", "environment/ruinTiles", "environment/terrainTiles"];
}

function folderAssetKeysForBiome(folder: string, biome: BiomeId): AssetKey[] {
  if (folder === "environment/rocks") return biomeRockAssetKeys(biome);
  if (folder === "environment/flora") return biomeFloraAssetKeys(biome);
  return folderAssetKeys(folder);
}

function folderChoiceForBiome(biome: BiomeId, seed: number): AssetKey | null {
  const folders = biomeDecorationFolders(biome);
  const folder = folders[Math.abs(seed) % folders.length]!;
  const keys = folderAssetKeysForBiome(folder, biome);
  if (keys.length === 0) return null;
  return chooseAsset(keys, seed >> 3, "");
}

function placeManifestDecoration(
  target: Container,
  key: AssetKey,
  wx: number,
  wy: number,
  seed: number,
  backLayer: boolean
): void {
  if (!key || !hasAsset(key)) return;
  const sprite = makeSprite(key);
  const size = assetPixelSize(key);
  const maxWidth = backLayer ? 64 : 52;
  const maxHeight = backLayer ? 72 : 58;
  const scale = Math.min(1, maxWidth / Math.max(1, size.width), maxHeight / Math.max(1, size.height));
  sprite.anchor.set(0.5, 1);
  sprite.x = wx + TILE_SIZE / 2 + ((seed >> 4) % 5) - 2;
  sprite.y = wy + (backLayer ? 4 : 2);
  sprite.scale.set(scale * SCENE_ASSET_SCALE);
  sprite.alpha = backLayer ? 0.5 : 0.78;
  sprite.zIndex = backLayer ? -1 : 3;
  target.addChild(sprite);
}

interface SceneSpriteOptions {
  maxWidth?: number;
  maxHeight?: number;
  alpha?: number;
  zIndex?: number;
  anchorX?: number;
  anchorY?: number;
  xJitter?: number;
  yOffset?: number;
  scaleMultiplier?: number;
  tint?: number;
  addBlend?: boolean;
}

function biomeRockAssetKeys(biome: BiomeId, shape: "any" | "cap" | "cluster" | "spire" = "any"): AssetKey[] {
  const keys = uniqueAssetKeys(folderAssetKeys("environment/rocks"));
  const themeMatch = (key: AssetKey): boolean => {
    const lower = key.toLowerCase();
    if (biome === "pineValley") return lower.includes("pine") || lower.includes("moss");
    if (biome === "cloudRidge") return lower.includes("cloud") || lower.includes("plain") || lower.includes("single") || lower.includes("slab") || lower.includes("rubble");
    if (biome === "snowfallCliffs") return lower.includes("snow");
    if (biome === "frozenSpires") return lower.includes("ice");
    return lower.includes("summit");
  };
  const shapeMatch = (key: AssetKey): boolean => {
    const lower = key.toLowerCase();
    if (shape === "cap") return lower.includes("stonecap") || lower.includes("stone_cap");
    if (shape === "cluster") return lower.includes("cluster") || lower.includes("boulder") || lower.includes("stack");
    if (shape === "spire") return lower.includes("spire") || lower.endsWith("rockSpire1".toLowerCase()) || lower.includes("tall");
    return true;
  };
  const themed = keys.filter((key) => themeMatch(key) && shapeMatch(key));
  if (themed.length > 0) return themed;
  const shaped = keys.filter(shapeMatch);
  return shaped.length > 0 ? shaped : keys;
}

function chooseBiomeRockAsset(biome: BiomeId, seed: number, shape: "any" | "cap" | "cluster" | "spire" = "any"): AssetKey | null {
  const keys = biomeRockAssetKeys(biome, shape);
  if (keys.length === 0) return null;
  return keys[Math.abs(seed) % keys.length]!;
}

type FloraShape = "any" | "tall" | "ground" | "bloom";

function biomeFloraAssetKeys(biome: BiomeId, shape: FloraShape = "any"): AssetKey[] {
  const keys = uniqueAssetKeys(folderAssetKeys("environment/flora"));
  const biomeMatch = (key: AssetKey): boolean => {
    const lower = key.toLowerCase();
    if (biome === "pineValley") return lower.includes("pine") || lower.includes("moss") || lower.includes("clover") || lower.includes("wildflower") || lower.includes("reed_grass") || lower.includes("flower_pink");
    if (biome === "cloudRidge") return lower.includes("cloud") || lower.includes("sky") || lower.includes("wind") || lower.includes("blue_sprig") || lower.includes("wildflower");
    if (biome === "snowfallCliffs") return lower.includes("snow") || lower.includes("frost") || lower.includes("blue_sprig") || lower.includes("silver");
    if (biome === "frozenSpires") return lower.includes("ice") || lower.includes("crystal") || lower.includes("frost") || lower.includes("silver");
    return lower.includes("star") || lower.includes("moon") || lower.includes("summit") || lower.includes("crystal");
  };
  const shapeMatch = (key: AssetKey): boolean => {
    const lower = key.toLowerCase();
    if (shape === "tall") return lower.includes("reed") || lower.includes("grass") || lower.includes("bells") || lower.includes("thistle");
    if (shape === "ground") return lower.includes("fern") || lower.includes("moss") || lower.includes("lichen") || lower.includes("sprout");
    if (shape === "bloom") return lower.includes("flower") || lower.includes("bloom") || lower.includes("lotus") || lower.includes("snowdrop") || lower.includes("clover") || lower.includes("sprig");
    return true;
  };
  const themed = keys.filter((key) => biomeMatch(key) && shapeMatch(key));
  if (themed.length > 0) return themed;
  const shaped = keys.filter(shapeMatch);
  return shaped.length > 0 ? shaped : keys;
}

function chooseBiomeFloraAsset(biome: BiomeId, seed: number, shape: FloraShape = "any"): AssetKey | null {
  const keys = biomeFloraAssetKeys(biome, shape);
  if (keys.length === 0) return null;
  return keys[Math.abs(seed) % keys.length]!;
}

function chooseAssetFromFolders(folders: string[], seed: number, biome?: BiomeId): AssetKey | null {
  const keys = uniqueAssetKeys(folders.flatMap((folder) =>
    biome ? folderAssetKeysForBiome(folder, biome) : folderAssetKeys(folder)
  )).filter((key) => !isProceduralGameplayPropAsset(key));
  if (keys.length === 0) return null;
  return keys[Math.abs(seed) % keys.length]!;
}

function placeSceneSprite(
  target: Container,
  key: AssetKey | null,
  wx: number,
  wy: number,
  seed: number,
  options: SceneSpriteOptions = {}
): Sprite | null {
  if (!key || !hasAsset(key)) return null;
  const sprite = makeSprite(key);
  const size = assetPixelSize(key);
  const maxWidth = options.maxWidth ?? 58;
  const maxHeight = options.maxHeight ?? 64;
  const fitScale = Math.min(1, maxWidth / Math.max(1, size.width), maxHeight / Math.max(1, size.height));
  const jitter = options.xJitter ?? 0;
  const jitterX = jitter > 0 ? ((seed >> 5) % (jitter * 2 + 1)) - jitter : 0;
  sprite.anchor.set(options.anchorX ?? 0.5, options.anchorY ?? 1);
  sprite.x = Math.round(wx + jitterX);
  sprite.y = Math.round(wy + (options.yOffset ?? 0));
  sprite.scale.set(fitScale * (options.scaleMultiplier ?? 1) * SCENE_ASSET_SCALE);
  sprite.alpha = options.alpha ?? 0.86;
  sprite.zIndex = options.zIndex ?? 2;
  if (typeof options.tint === "number") sprite.tint = options.tint;
  if (options.addBlend) sprite.blendMode = "add";
  target.addChild(sprite);
  return sprite;
}

function isProceduralGameplayPropAsset(key: AssetKey): boolean {
  const raw = String(key);
  const url = (ASSET_URLS as Record<string, string>)[raw] ?? raw;
  return raw === "jumpPad" || raw === "relicShrine" || raw === "ancientBeacon"
    || url.includes("/relicShrines/")
    || url.includes("/effects/jump_pad_")
    || url.includes("/effects/portal_arch_");
}

type ProceduralTreeShape = "round" | "straight" | "zigzag" | "deformed" | "wind" | "frostRound" | "frostPine" | "dead" | "deadZigzag" | "crystalDead";

interface ProceduralTreePalette {
  barkDark: number;
  barkMid: number;
  barkLight: number;
  leafDark: number;
  leafMid: number;
  leafLight: number;
  frost: number;
  frostShade: number;
  accent: number;
}

function biomeTreePalette(biome: BiomeId): ProceduralTreePalette {
  if (biome === "cloudRidge") {
    return { barkDark: 0x1d2d28, barkMid: 0x32473a, barkLight: 0x64705d, leafDark: 0x23472b, leafMid: 0x5a873f, leafLight: 0xa4bd57, frost: 0xd7edf4, frostShade: 0x8eaec0, accent: 0x9db36a };
  }
  if (biome === "snowfallCliffs") {
    return { barkDark: 0x3a3948, barkMid: 0x67667b, barkLight: 0x9aa2b4, leafDark: 0x456374, leafMid: 0x7fa7b8, leafLight: 0xc4dceb, frost: 0xf3fbff, frostShade: 0xa7c7dc, accent: 0xc7e3ef };
  }
  if (biome === "frozenSpires") {
    return { barkDark: 0x262b3e, barkMid: 0x4b5876, barkLight: 0x8798b6, leafDark: 0x415c78, leafMid: 0x7fa8cc, leafLight: 0xd3edff, frost: 0xf8fdff, frostShade: 0x9ebbd8, accent: 0x7fe9ff };
  }
  if (biome === "celestialSummit") {
    return { barkDark: 0x232640, barkMid: 0x4a4d72, barkLight: 0x9797c6, leafDark: 0x43506f, leafMid: 0x7d8fc4, leafLight: 0xe1e7ff, frost: 0xffffff, frostShade: 0xb9c8f6, accent: 0xffeaa0 };
  }
  return { barkDark: 0x25331e, barkMid: PAL.barkMid, barkLight: 0x8a6634, leafDark: PAL.canopyDark, leafMid: PAL.canopyMid, leafLight: PAL.canopyLight, frost: 0xdcecf0, frostShade: 0x8fb4c4, accent: PAL.mossBright };
}

function chooseProceduralTreeShape(biome: BiomeId, seed: number): ProceduralTreeShape {
  const roll = seed % 6;
  if (biome === "pineValley") return roll < 2 ? "round" : roll < 4 ? "straight" : "deformed";
  if (biome === "cloudRidge") return roll < 2 ? "wind" : roll < 4 ? "zigzag" : "round";
  if (biome === "snowfallCliffs") return roll < 2 ? "frostRound" : roll < 4 ? "frostPine" : "dead";
  if (biome === "frozenSpires") return roll < 2 ? "dead" : roll < 4 ? "deadZigzag" : "frostPine";
  return roll < 2 ? "crystalDead" : roll < 4 ? "deadZigzag" : "frostRound";
}

function drawPixelLine(g: Graphics, x1: number, y1: number, x2: number, y2: number, width: number, color: number, alpha = 1): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x1 + (x2 - x1) * t);
    const y = Math.round(y1 + (y2 - y1) * t);
    g.rect(x - Math.floor(width / 2), y - Math.floor(width / 2), width, width).fill({ color, alpha });
  }
}

function drawLeafBlob(g: Graphics, cx: number, cy: number, rx: number, ry: number, palette: ProceduralTreePalette, seed: number, frosted: boolean): void {
  for (let y = -ry; y <= ry; y += 4) {
    for (let x = -rx; x <= rx; x += 4) {
      const n = midMountainNoise(seed, cx + x, cy + y, 1701);
      const edge = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (edge > 1.06 || (edge > 0.78 && n % 5 === 0)) continue;
      const block = 4 + (n % 2) * 2;
      const color = frosted
        ? (n % 7 === 0 ? palette.frost : n % 3 === 0 ? palette.leafLight : palette.leafMid)
        : (edge > 0.74 ? palette.leafDark : n % 5 === 0 ? palette.leafLight : palette.leafMid);
      g.rect(Math.round(cx + x), Math.round(cy + y), block, block).fill(color);
      if (frosted && y < -ry * 0.25 && n % 4 === 0) {
        g.rect(Math.round(cx + x), Math.round(cy + y), block, 2).fill(palette.frost);
      }
    }
  }
}

function drawPineTier(g: Graphics, cx: number, cy: number, width: number, palette: ProceduralTreePalette, seed: number, frosted: boolean): void {
  for (let row = 0; row < 4; row++) {
    const rowW = Math.max(6, width - row * 7);
    const x = Math.round(cx - rowW / 2 + (midMountainNoise(seed, row, width, 1803) % 3) - 1);
    const y = cy + row * 4;
    g.rect(x, y, rowW, 4).fill(row === 3 ? palette.leafDark : palette.leafMid);
    if (frosted) g.rect(x + 1, y, Math.max(2, rowW - 2), 2).fill(row === 0 ? palette.frost : palette.frostShade);
  }
}

function makeProceduralTree(biome: BiomeId, seed: number): Container {
  const palette = biomeTreePalette(biome);
  const shape = chooseProceduralTreeShape(biome, seed);
  const tree = new Container();
  const g = new Graphics();
  const height = 48 + (seed % 18) + (shape === "round" || shape === "wind" ? 14 : 0);
  const segments = 6;
  const points: Array<{ x: number; y: number }> = [];
  let x = 0;

  for (let i = 0; i <= segments; i++) {
    const n = midMountainNoise(seed, i * 13, height, 1601);
    if (i > 0) {
      if (shape === "zigzag" || shape === "deadZigzag") x += (i % 2 === 0 ? -1 : 1) * (4 + (n % 4));
      else if (shape === "wind") x -= 3 + (n % 3);
      else if (shape === "deformed" || shape === "crystalDead") x += Math.round(Math.sin(i * 1.7 + seed) * 4) + (n % 3) - 1;
      else x += (n % 5) - 2;
    }
    points.push({ x, y: Math.round(-height * (i / segments)) });
  }

  g.rect(-9, -2, 18, 3).fill({ color: palette.barkDark, alpha: 0.35 });
  g.rect(-5, -4, 4, 7).fill(palette.barkDark);
  g.rect(2, -3, 5, 6).fill(palette.barkDark);

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const w = Math.max(3, 8 - i);
    drawPixelLine(g, a.x, a.y, b.x, b.y, w, palette.barkDark);
    drawPixelLine(g, a.x + 1, a.y, b.x + 1, b.y, Math.max(2, w - 3), palette.barkMid);
    if (i % 2 === 0) drawPixelLine(g, a.x + 2, a.y - 1, b.x + 2, b.y, 1, palette.barkLight, 0.75);
  }

  const branchTips: Array<{ x: number; y: number }> = [];
  const branchCount = shape === "dead" || shape === "deadZigzag" || shape === "crystalDead" ? 7 : 5;
  for (let i = 1; i <= branchCount; i++) {
    const p = points[Math.min(points.length - 2, 2 + (i % 4))]!;
    const n = midMountainNoise(seed, i * 29, p.y, 1637);
    const side = (i + seed) % 2 === 0 ? -1 : 1;
    const len = 12 + (n % 16) + (shape === "wind" ? 8 : 0);
    const lift = 8 + (n % 12);
    const endX = p.x + side * len + (shape === "wind" ? -10 : 0);
    const endY = p.y - lift;
    drawPixelLine(g, p.x, p.y, endX, endY, Math.max(2, 5 - Math.floor(i / 2)), palette.barkDark);
    drawPixelLine(g, p.x + side, p.y, endX, endY, 1, palette.barkLight, 0.7);
    branchTips.push({ x: endX, y: endY });
    if ((shape === "dead" || shape === "deadZigzag" || shape === "crystalDead") && n % 3 !== 0) {
      drawPixelLine(g, endX, endY, endX + side * (4 + n % 5), endY - 5, 2, palette.barkLight, 0.85);
    }
  }

  const top = points[points.length - 1]!;
  const frosted = shape === "frostRound" || shape === "frostPine" || shape === "crystalDead" || biome === "frozenSpires" || biome === "celestialSummit";
  if (shape === "frostPine") {
    for (let i = 0; i < 5; i++) drawPineTier(g, top.x, top.y + 6 + i * 9, 42 - i * 5, palette, seed + i * 17, true);
  } else if (shape === "dead" || shape === "deadZigzag" || shape === "crystalDead") {
    for (const tip of branchTips) {
      if (frosted) g.rect(Math.round(tip.x - 2), Math.round(tip.y - 1), 5, 2).fill(shape === "crystalDead" ? palette.accent : palette.frost);
    }
  } else {
    drawLeafBlob(g, top.x - 18, top.y + 3, 27, 16, palette, seed, frosted);
    drawLeafBlob(g, top.x + 11, top.y - 3, 29, 18, palette, seed + 41, frosted);
    drawLeafBlob(g, top.x + (shape === "wind" ? -18 : 0), top.y - 16, 25, 18, palette, seed + 83, frosted);
    if (shape === "deformed") drawLeafBlob(g, top.x + 24, top.y + 7, 18, 13, palette, seed + 127, false);
  }

  if (frosted) {
    for (let i = 0; i < 7; i++) {
      const p = points[1 + (i % (points.length - 1))]!;
      const n = midMountainNoise(seed, i * 37, p.y, 1889);
      if (n % 2 === 0) g.rect(p.x - 2 + (n % 5), p.y - 2, 4, 2).fill(palette.frost);
    }
  }

  tree.addChild(g);
  tree.scale.set(SCENE_ASSET_SCALE * (0.84 + (seed % 5) * 0.04));
  return tree;
}

function shouldPlaceProceduralTree(biome: BiomeId, seed: number): boolean {
  const frequency: Record<BiomeId, number> = {
    pineValley: 83,
    cloudRidge: 97,
    snowfallCliffs: 89,
    frozenSpires: 109,
    celestialSummit: 131,
  };
  return seed % frequency[biome] === 0;
}

function placeProceduralTreeOnPlatform(
  target: Container,
  chunk: GeneratedChunk,
  platform: GeneratedChunk["platforms"][number],
  biome: BiomeId,
  seed: number,
  offsetRatio: number
): void {
  const tree = makeProceduralTree(biome, seed);
  const usableWidth = Math.max(0, platform.width - 2) * TILE_SIZE;
  const edgeJitter = ((seed >> 9) % 7) - 3;
  tree.x = Math.round(platformCenterX(platform) + usableWidth * offsetRatio + edgeJitter);
  tree.y = platformTopY(chunk, platform) + 6;
  tree.alpha = biome === "celestialSummit" ? 0.82 : biome === "frozenSpires" ? 0.88 : 0.94;
  tree.zIndex = 0;
  target.addChild(tree);
}

function makeProceduralCheckpointMarker(biome: BiomeId, seed: number): Container {
  const marker = new Container();
  const g = new Graphics();
  const cold = biome === "snowfallCliffs" || biome === "frozenSpires" || biome === "celestialSummit";
  const accent = biome === "celestialSummit" ? PAL.coinGold : biome === "pineValley" ? PAL.mossBright : PAL.portalGlow;
  const shade = cold ? 0x5e7390 : PAL.stoneDark;

  g.rect(-13, -4, 26, 5).fill(PAL.stoneShadow);
  g.rect(-11, -7, 22, 4).fill(shade);
  g.rect(-9, -8, 18, 1).fill({ color: cold ? PAL.mistPale : PAL.stoneLight, alpha: 0.75 });
  g.rect(-2, -39, 4, 34).fill(PAL.stoneShadow);
  g.rect(-1, -40, 2, 34).fill(cold ? PAL.stoneLight : PAL.stoneWorn);
  g.rect(-8, -36, 8, 3).fill(accent);
  g.rect(-8, -33, 13, 8).fill(biome === "pineValley" ? PAL.canopyLight : biome === "celestialSummit" ? PAL.coinGold : PAL.portalBlue);
  g.rect(-8, -25, 9, 3).fill({ color: accent, alpha: 0.78 });
  g.rect(-10, -22, 2, 8).fill({ color: accent, alpha: 0.45 });
  g.rect(4, -30, 2, 9).fill({ color: PAL.uiInk, alpha: 0.22 });
  g.circle(0, -46, 5).fill({ color: accent, alpha: 0.92 });
  g.circle(0, -46, 9).stroke({ color: accent, alpha: 0.32, width: 1 });
  g.rect(-1, -50, 2, 8).fill({ color: PAL.cloudBright, alpha: 0.68 });
  if (cold) {
    g.rect(-12, -9, 24, 2).fill(PAL.cloudBright);
    g.rect(-7, -38, 7, 2).fill(PAL.cloudBright);
  }
  if (seed % 2 === 0) {
    g.rect(7, -18, 1, 12).fill({ color: accent, alpha: 0.42 });
    g.rect(6, -7, 3, 1).fill({ color: accent, alpha: 0.5 });
  }

  marker.addChild(g);
  marker.scale.set(SCENE_ASSET_SCALE * 1.04);
  return marker;
}

function placeProceduralCheckpointMarker(
  target: Container,
  chunk: GeneratedChunk,
  platform: GeneratedChunk["platforms"][number],
  biome: BiomeId,
  seed: number
): void {
  const marker = makeProceduralCheckpointMarker(biome, seed);
  marker.x = platformCenterX(platform);
  marker.y = platformTopY(chunk, platform) + 3;
  marker.alpha = 0.96;
  marker.zIndex = 4;
  target.addChild(marker);
}

function platformCenterX(platform: GeneratedChunk["platforms"][number]): number {
  return (platform.x + platform.width / 2) * TILE_SIZE;
}

function platformTopY(chunk: GeneratedChunk, platform: GeneratedChunk["platforms"][number]): number {
  return (chunk.worldTileY + platform.y) * TILE_SIZE;
}

function platformSeed(chunk: GeneratedChunk, platform: GeneratedChunk["platforms"][number], salt = 0): number {
  return (chunk.chunkY * 1664525 + platform.x * 1013904223 + platform.y * 69069 + platform.width * 362437 + salt) >>> 0;
}

function biomePropFolders(biome: BiomeId): string[] {
  if (biome === "pineValley") {
    return ["environment/pineTrees", "environment/vegetation", "environment/flora", "environment/rocks", "environment/lights", "environment/decorations"];
  }
  if (biome === "cloudRidge") {
    return ["environment/pineTrees", "environment/clouds", "environment/structures", "environment/decorations", "environment/crystals", "environment/rocks"];
  }
  if (biome === "snowfallCliffs") {
    return ["environment/snowTrees", "environment/flora", "environment/rocks", "environment/ruinTiles", "environment/decorations", "environment/lanterns", "environment/crystals"];
  }
  if (biome === "frozenSpires") {
    return ["environment/snowTrees", "environment/flora", "environment/rocks", "environment/decorations", "environment/crystals", "environment/particleEffects"];
  }
  return ["environment/relicShrines", "environment/flora", "environment/decorations", "environment/crystals", "environment/structures", "environment/lights", "environment/banners"];
}

function biomeSmallPropFolders(biome: BiomeId): string[] {
  if (biome === "pineValley") return ["environment/flora", "environment/vegetation", "environment/rocks"];
  if (biome === "cloudRidge") return ["environment/flora", "environment/rocks", "environment/clouds", "environment/crystals"];
  if (biome === "snowfallCliffs") return ["environment/flora", "environment/rocks", "environment/snowTrees", "environment/lanterns", "environment/crystals"];
  if (biome === "frozenSpires") return ["environment/flora", "environment/rocks", "environment/crystals", "environment/particleEffects", "environment/hazards"];
  return ["environment/flora", "environment/crystals", "environment/decorations", "environment/lights", "environment/banners"];
}

function hazardTelegraphStyle(assetKey: AssetKey): HazardTelegraph["style"] {
  if (assetKey.includes("falling") || assetKey.includes("icicle")) return "falling";
  if (assetKey.includes("wind")) return "wind";
  if (assetKey.includes("lightning") || assetKey.includes("rune") || assetKey.includes("arc")) return "rune";
  return "spike";
}

function addHazardTelegraph(
  target: Container,
  chunkY: number,
  wx: number,
  wy: number,
  seed: number,
  style: HazardTelegraph["style"],
  width: number
): void {
  const gfx = new Graphics();
  gfx.x = wx;
  gfx.y = wy;
  gfx.zIndex = 3;
  target.addChild(gfx);

  const telegraphs = chunkHazardTelegraphs.get(chunkY) ?? [];
  telegraphs.push({ gfx, x: wx, y: wy, seed, style, width });
  chunkHazardTelegraphs.set(chunkY, telegraphs);
}

function updateHazardTelegraphs(tSec: number): void {
  for (const telegraphs of chunkHazardTelegraphs.values()) {
    for (const h of telegraphs) {
      if (h.gfx.destroyed) continue;
      const pulse = Math.sin(tSec * 4.8 + h.seed * 0.013) * 0.5 + 0.5;
      h.gfx.clear();
      if (h.style === "falling") {
        const w = Math.max(16, h.width);
        h.gfx.rect(-2, -30, w + 4, 2).fill({ color: PAL.hazardGlow, alpha: 0.18 + pulse * 0.22 });
        h.gfx.rect(Math.round(w / 2) - 1, -28, 2, 22).fill({ color: PAL.hazardGlow, alpha: 0.08 + pulse * 0.18 });
        h.gfx.poly([Math.round(w / 2) - 5, -8, Math.round(w / 2), -1, Math.round(w / 2) + 5, -8])
          .fill({ color: PAL.hazardRed, alpha: 0.18 + pulse * 0.18 });
      } else if (h.style === "wind") {
        for (let i = 0; i < 3; i++) {
          const y = -24 + i * 8;
          const x = -28 + ((tSec * 28 + h.seed + i * 19) % 32);
          h.gfx.rect(x, y, 26, 1).fill({ color: PAL.portalGlow, alpha: 0.14 + pulse * 0.16 });
          h.gfx.rect(x + 14, y + 2, 12, 1).fill({ color: PAL.portalBlue, alpha: 0.12 + pulse * 0.14 });
        }
      } else if (h.style === "rune") {
        const r = 10 + Math.round(pulse * 4);
        h.gfx.circle(8, -8, r).stroke({ color: PAL.portalBlue, alpha: 0.22 + pulse * 0.26, width: 1 });
        h.gfx.rect(7, -18, 2, 20).fill({ color: PAL.hazardGlow, alpha: 0.12 + pulse * 0.2 });
        h.gfx.rect(-2, -9, 20, 2).fill({ color: PAL.hazardGlow, alpha: 0.12 + pulse * 0.2 });
      } else {
        h.gfx.rect(0, 10, TILE_SIZE, 2).fill({ color: PAL.hazardRed, alpha: 0.14 + pulse * 0.26 });
        h.gfx.rect(2, 12, TILE_SIZE - 4, 1).fill({ color: PAL.hazardGlow, alpha: 0.14 + pulse * 0.2 });
      }
    }
  }
}

function composeChunkAtmosphere(chunk: GeneratedChunk, back: Container, biome: BiomeId): void {
  const baseTileY = chunk.worldTileY;
  const chunkTop = baseTileY * TILE_SIZE;
  const seed = (chunk.chunkY * 48271 + 97) >>> 0;
  const cloudDensity =
    biome === "pineValley" ? 1 :
    biome === "cloudRidge" ? 4 :
    biome === "snowfallCliffs" ? 3 :
    biome === "frozenSpires" ? 2 :
    5;

  const cloudFolders = biome === "pineValley"
    ? ["environment/backgrounds"]
    : ["environment/clouds", "environment/backgrounds"];
  for (let i = 0; i < cloudDensity; i++) {
    const cSeed = (seed + i * 7919) >>> 0;
    const cloudKey = chooseAssetFromFolders(cloudFolders, cSeed);
    if (!cloudKey || !cloudKey.includes("cloud")) continue;
    const x = ((cSeed % 310) / 310) * WORLD_WIDTH;
    const y = chunkTop + 30 + ((cSeed >> 7) % Math.max(1, CHUNK_HEIGHT_TILES * TILE_SIZE - 40));
    const cloud = placeSceneSprite(back, cloudKey, x, y, cSeed, {
      maxWidth: 126,
      maxHeight: 48,
      alpha: biome === "cloudRidge" || biome === "celestialSummit" ? 0.34 : 0.22,
      zIndex: -6,
      xJitter: 10,
      scaleMultiplier: 0.75 + (cSeed % 35) / 100,
    });
    if (cloud && biome === "frozenSpires") cloud.tint = 0xc8dcff;
  }

  if ((biome === "cloudRidge" || biome === "snowfallCliffs" || biome === "frozenSpires") && hasAsset("environment/effects/fog_strip_1.png")) {
    placeSceneSprite(back, "environment/effects/fog_strip_1.png", WORLD_WIDTH / 2, chunkTop + CHUNK_HEIGHT_TILES * TILE_SIZE * 0.66, seed, {
      maxWidth: WORLD_WIDTH,
      maxHeight: 38,
      alpha: biome === "cloudRidge" ? 0.22 : 0.14,
      zIndex: -4,
      scaleMultiplier: 1.25,
    });
  }
}

function composeTraversalConnectors(chunk: GeneratedChunk, back: Container, front: Container, biome: BiomeId): void {
  const platforms = [...chunk.platforms].sort((a, b) => b.y - a.y);
  const ladderKey = biome === "pineValley" || biome === "cloudRidge"
    ? chooseAsset(["environment/ladders/frosted_wood_ladder.png", "climbingChain"], chunk.chunkY, "climbingChain")
    : chooseAsset(["climbingChain", "environment/ladders/climbing_chain.png"], chunk.chunkY, "climbingChain");
  const bridgeKey = chooseAsset(["environment/ropeBridges/rope_bridge_worn.png", "ropeBridge"], chunk.chunkY, "ropeBridge");

  for (let i = 0; i < platforms.length; i++) {
    const lower = platforms[i]!;
    const lowerCx = platformCenterX(lower) / TILE_SIZE;
    let best: GeneratedChunk["platforms"][number] | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let j = i + 1; j < platforms.length; j++) {
      const upper = platforms[j]!;
      const dy = lower.y - upper.y;
      if (dy < 2 || dy > 5) continue;
      const dx = Math.abs(lowerCx - platformCenterX(upper) / TILE_SIZE);
      if (dx > 2.8) continue;
      const score = dx * 2 + dy;
      if (score < bestScore) {
        best = upper;
        bestScore = score;
      }
    }
    if (!best) continue;
    const seed = platformSeed(chunk, lower, 1123);
    if (seed % 4 === 0) continue;
    const wx = (platformCenterX(lower) + platformCenterX(best)) / 2;
    const lowerY = platformTopY(chunk, lower);
    placeSceneSprite(back, ladderKey, wx, lowerY + 2, seed, {
      maxWidth: 24,
      maxHeight: Math.max(42, (lower.y - best.y) * TILE_SIZE + 12),
      alpha: biome === "pineValley" ? 0.78 : 0.64,
      zIndex: 0,
      yOffset: -1,
      xJitter: 2,
    });
  }

  for (let i = 0; i < platforms.length - 1; i++) {
    const a = platforms[i]!;
    const b = platforms[i + 1]!;
    if (Math.abs(a.y - b.y) > 1) continue;
    const left = a.x + a.width <= b.x ? a : b;
    const right = left === a ? b : a;
    const gap = right.x - (left.x + left.width);
    if (gap < 2 || gap > 8) continue;
    const seed = platformSeed(chunk, left, 2701);
    if (seed % 3 !== 0) continue;
    const wx = (left.x + left.width + gap / 2) * TILE_SIZE;
    const wy = (chunk.worldTileY + Math.min(left.y, right.y)) * TILE_SIZE - 1;
    placeSceneSprite(front, bridgeKey, wx, wy, seed, {
      maxWidth: gap * TILE_SIZE + 22,
      maxHeight: 24,
      alpha: 0.64,
      zIndex: 1,
      yOffset: 4,
      scaleMultiplier: 1.08,
    });
  }
}

function composePlatformSceneDressing(chunk: GeneratedChunk, back: Container, front: Container, biome: BiomeId): void {
  const mainFolders = biomePropFolders(biome);
  const smallFolders = biomeSmallPropFolders(biome);

  const placeLandmark = (
    platform: GeneratedChunk["platforms"][number],
    salt: number,
    key: AssetKey | null,
    zIndex: number,
    alpha = 0.92
  ): void => {
    if (!key) return;
    const seed = platformSeed(chunk, platform, salt);
    const wx = platformCenterX(platform);
    const wy = platformTopY(chunk, platform) + 2;
    placeSceneSprite(front, key, wx, wy, seed, {
      maxWidth: Math.max(36, platform.width * TILE_SIZE - 8),
      maxHeight: 66,
      alpha,
      zIndex,
      xJitter: Math.max(0, Math.min(8, platform.width * 2)),
    });
  };

  placeProceduralCheckpointMarker(front, chunk, chunk.entry, biome, platformSeed(chunk, chunk.entry, 31));

  placeLandmark(
    chunk.exit,
    79,
    biome === "celestialSummit"
      ? chooseAsset(["decorPedestalGold", "decorBrazierGold", "decorBannerGold"], platformSeed(chunk, chunk.exit, 79), "decorPedestalGold")
      : chooseAssetFromFolders(["environment/crystals", "environment/banners", "environment/lights"], platformSeed(chunk, chunk.exit, 79)) ??
        chooseAsset(["crystalMarker", "decorPedestalBlue", "decorBannerBlue"], chunk.chunkY, "crystalMarker"),
    3,
    0.82
  );

  for (const platform of chunk.platforms) {
    const seed = platformSeed(chunk, platform, 503);
    const topY = platformTopY(chunk, platform);
    if (platform.width >= 4) {
      const treeSeed = platformSeed(chunk, platform, 1801);
      const leftEdge = -0.43 + ((treeSeed % 9) - 4) * 0.008;
      const rightEdge = 0.43 + (((treeSeed >> 5) % 9) - 4) * 0.008;
      const preferLeft = treeSeed % 2 === 0;
      placeProceduralTreeOnPlatform(back, chunk, platform, biome, treeSeed, preferLeft ? leftEdge : rightEdge);
      if (platform.width >= 6) {
        placeProceduralTreeOnPlatform(back, chunk, platform, biome, treeSeed ^ 0x9e3779b9, preferLeft ? rightEdge : leftEdge);
      }
      if (platform.width >= 9 && treeSeed % 3 !== 1) {
        const centerDrift = ((treeSeed >> 11) % 21) / 100 - 0.1;
        placeProceduralTreeOnPlatform(back, chunk, platform, biome, treeSeed ^ 0x85ebca6b, centerDrift);
      }
    }

    if (platform.width >= 5 && seed % 3 !== 1) {
      const mainKey = chooseAssetFromFolders(mainFolders, seed, biome);
      const frontLayer = seed % 5 !== 0;
      placeSceneSprite(frontLayer ? front : back, mainKey, platformCenterX(platform), topY + 2, seed, {
        maxWidth: Math.min(104, platform.width * TILE_SIZE - 6),
        maxHeight: frontLayer ? 76 : 92,
        alpha: frontLayer ? 0.8 : 0.48,
        zIndex: frontLayer ? 2 : -1,
        xJitter: Math.min(10, platform.width),
        scaleMultiplier: platform.width >= 8 ? 1.08 : 0.92,
      });
    }

    if (platform.width >= 3 && seed % 4 === 0) {
      const smallKey = chooseAssetFromFolders(smallFolders, seed >> 2, biome);
      const side = seed % 2 === 0 ? -0.32 : 0.32;
      placeSceneSprite(front, smallKey, platformCenterX(platform) + side * platform.width * TILE_SIZE, topY + 1, seed, {
        maxWidth: 42,
        maxHeight: 48,
        alpha: 0.86,
        zIndex: 3,
        xJitter: 4,
      });
    }

    if ((biome === "cloudRidge" || biome === "snowfallCliffs" || biome === "frozenSpires") && platform.width >= 4 && seed % 9 === 0) {
      const effectKey = chooseAssetFromFolders(["environment/particleEffects", "environment/effects"], seed);
      placeSceneSprite(front, effectKey, platformCenterX(platform), topY - 4, seed, {
        maxWidth: 74,
        maxHeight: 34,
        alpha: 0.52,
        zIndex: 5,
        addBlend: true,
      });
    }
  }
}

function decorateChunk(chunk: GeneratedChunk): void {
  if (Object.keys(pixelAssets).length === 0) return;

  const back = new Container();
  const front = new Container();
  back.sortableChildren = true;
  front.sortableChildren = true;
  const baseTileY = chunk.worldTileY;
  const biome = biomeForChunkY(chunk.chunkY);
  composeChunkAtmosphere(chunk, back, biome);
  composeMidMountainLayer(chunk, back, biome);
  composePlatformPartLayer(chunk, front, biome);
  composeTraversalConnectors(chunk, back, front, biome);
  composePlatformSceneDressing(chunk, back, front, biome);
  composeProceduralLianas(chunk, front, biome);
  composeProceduralFlora(chunk, front, biome);
  composeBiomeFlutters(chunk, front, biome);

  for (let ly = 0; ly < chunk.height; ly++) {
    for (let lx = 0; lx < chunk.width; lx++) {
      const wx = lx * TILE_SIZE;
      const wy = (baseTileY + ly) * TILE_SIZE;
      const seed = (chunk.chunkY * 92821 + lx * 3701 + ly * 809) >>> 0;
      const kind = chunk.tiles[ly * chunk.width + lx] as TileKind;

      if (kind === "hazard") {
        const hazardChoicesByBiome: Record<BiomeId, AssetKey[]> = {
          pineValley: ["stoneSpikes", "spikeMachine", "rollingBoulder", "hazardSpikes"],
          cloudRidge: ["stoneSpikes", "spikeBall", "crystalSpikesBlue", "magicArcPurple"],
          snowfallCliffs: ["fallingIciclesCluster", "fallingIcicle", "iceSpikes", "crystalSpikesBlue"],
          frozenSpires: ["fallingIciclesCluster", "iceSpikes", "spikeBoulder", "magicArcBlue"],
          celestialSummit: ["lightningHazard", "lightningBlue", "summitSpikes", "runeTrapGold"],
        };
        const hazardChoices = [...hazardChoicesByBiome[biome], ...folderAssetKeys("environment/hazards")];
        let hazardKey = hazardChoices[seed % hazardChoices.length]!;
        if (!hasAsset(hazardKey)) hazardKey = "hazardSpikes";
        if (hasAsset(hazardKey)) {
          const hazard = makeSceneSprite(hazardKey);
          const isHanging = hazardKey === "fallingIcicle" || hazardKey === "fallingIciclesCluster" || hazardKey === "lightningHazard" || hazardKey === "lightningBlue" || hazardKey === "lightningPurple";
          const isWide = hazardKey === "magicArcPurple" || hazardKey === "magicArcBlue" || hazardKey === "runeTrapGold" || hazardKey === "runeTrapGreen" || hazardKey === "fallingIciclesCluster";
          hazard.x = wx + (isWide ? -16 : hazardKey === "spikeMachine" ? -12 : hazardKey === "spikeBall" || hazardKey === "spikeBoulder" ? -8 : 0);
          hazard.y = isHanging ? wy - 24 : hazardKey === "spikeBall" || hazardKey === "spikeBoulder" || hazardKey === "rollingBoulder" ? wy - 14 : wy - 2;
          hazard.alpha = 0.96;
          hazard.zIndex = 4;
          addHazardTelegraph(front, chunk.chunkY, wx + (isWide ? -16 : 0), wy, seed, hazardTelegraphStyle(hazardKey), isWide ? 48 : TILE_SIZE);
          front.addChild(hazard);
        }
        continue;
      }

      if (!canPlaceDecoration(chunk, lx, ly)) continue;

      if (seed % 23 === 0) {
        const key = folderChoiceForBiome(biome, seed);
        if (key) placeManifestDecoration(seed % 2 === 0 ? back : front, key, wx, wy, seed, seed % 2 === 0);
      }

      if (seed % 41 === 0) {
        const terrainKeys = [
          ...folderAssetKeys("environment/terrainTiles"),
          ...folderAssetKeys("environment/mossTiles"),
          ...folderAssetKeys("environment/snowTiles"),
          ...folderAssetKeys("environment/ruinTiles"),
          ...folderAssetKeys("environment/tiles"),
        ];
        const key = chooseAsset(terrainKeys, seed, "");
        if (key) placeManifestDecoration(back, key, wx, wy + 4, seed, true);
      }

      if (biome !== "frozenSpires" && biome !== "celestialSummit" && hasAsset("grassClump") && seed % 7 === 0) {
        const grass = makeSceneSprite("grassClump");
        grass.x = wx + (seed % 5);
        grass.y = wy - 12;
        grass.alpha = 0.9;
        grass.zIndex = 2;
        front.addChild(grass);
      }

      if ((biome === "pineValley" || biome === "cloudRidge") && hasAsset("flowerPatch") && seed % 19 === 0) {
        const flower = makeSceneSprite("flowerPatch");
        flower.x = wx;
        flower.y = wy - 13;
        flower.alpha = 0.92;
        flower.zIndex = 3;
        front.addChild(flower);
      }

      if ((biome === "pineValley" || biome === "cloudRidge") && hasAsset("leafCluster") && seed % 11 === 0) {
        const leaves = makeSceneSprite("leafCluster");
        leaves.x = wx + (seed % 4);
        leaves.y = wy - 14;
        leaves.alpha = 0.84;
        leaves.zIndex = 2;
        front.addChild(leaves);
      }

      if (biome !== "celestialSummit" && hasAsset("vineHanging") && seed % 17 === 0) {
        const vine = makeSceneSprite("vineHanging");
        vine.x = wx + (seed % 6);
        vine.y = wy + TILE_SIZE - 2;
        vine.alpha = 0.78;
        vine.zIndex = 1;
        front.addChild(vine);
      }

      if (hasAsset("pebbleCluster") && seed % 29 === 0) {
        const pebbles = makeSceneSprite("pebbleCluster");
        pebbles.x = wx + (seed % 6);
        pebbles.y = wy + 3;
        pebbles.alpha = 0.72;
        pebbles.zIndex = 2;
        front.addChild(pebbles);
      }

      const rockCapKey = seed % 89 === 0 ? chooseBiomeRockAsset(biome, seed, "cap") : null;
      if (rockCapKey && seed % 89 === 0) {
        const cap = makeSceneSprite(rockCapKey);
        cap.x = wx - 2;
        cap.y = wy - 9;
        cap.alpha = 0.82;
        cap.zIndex = 2;
        front.addChild(cap);
      }

      const rockClusterKey = seed % 127 === 0 ? chooseBiomeRockAsset(biome, seed, "cluster") : null;
      if (rockClusterKey && lx < chunk.width - 3 && canPlaceDecorationSpan(chunk, lx, ly, 3)) {
        const rocks = makeSceneSprite(rockClusterKey);
        rocks.x = wx - 6;
        rocks.y = wy - 25;
        rocks.alpha = 0.74;
        rocks.zIndex = 0;
        back.addChild(rocks);
      }

      const rockSpireKey = seed % 193 === 0 ? chooseBiomeRockAsset(biome, seed, "spire") : null;
      if (rockSpireKey && lx < chunk.width - 3 && canPlaceDecorationSpan(chunk, lx, ly, 3)) {
        const spire = makeSceneSprite(rockSpireKey);
        spire.x = wx - 5;
        spire.y = wy - 27;
        spire.alpha = 0.68;
        spire.zIndex = 0;
        back.addChild(spire);
      }

      const tallFloraKey = seed % 31 === 0 ? chooseBiomeFloraAsset(biome, seed, "tall") : null;
      if (tallFloraKey) {
        const reeds = makeSceneSprite(tallFloraKey);
        reeds.x = wx - 3;
        reeds.y = wy - 27;
        reeds.alpha = 0.84;
        reeds.zIndex = 3;
        front.addChild(reeds);
      }

      const bloomFloraKey = seed % 37 === 0 ? chooseBiomeFloraAsset(biome, seed, "bloom") : null;
      if (bloomFloraKey) {
        const flowers = makeSceneSprite(bloomFloraKey);
        flowers.x = wx - 3;
        flowers.y = wy - 19;
        flowers.alpha = 0.9;
        flowers.zIndex = 3;
        front.addChild(flowers);
      }

      const groundFloraKey = seed % 61 === 0 ? chooseBiomeFloraAsset(biome, seed, "ground") : null;
      if (groundFloraKey) {
        const flower = makeSceneSprite(groundFloraKey);
        flower.x = wx - 3;
        flower.y = wy - 18;
        flower.alpha = 0.82;
        flower.zIndex = 3;
        front.addChild(flower);
      }

      if (hasAsset("runeStone") && chunk.chunkY >= 8 && seed % 53 === 0) {
        const rune = makeSceneSprite("runeStone");
        rune.x = wx;
        rune.y = wy;
        rune.alpha = 0.86;
        rune.zIndex = 2;
        front.addChild(rune);
      }

      if (hasAsset("signpost") && seed % 83 === 0) {
        const sign = makeSceneSprite("signpost");
        sign.x = wx;
        sign.y = wy - 20;
        sign.alpha = 0.9;
        sign.zIndex = 3;
        front.addChild(sign);
      }

      if (hasAsset("fence") && seed % 97 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const fence = makeSceneSprite("fence");
        fence.x = wx;
        fence.y = wy - 12;
        fence.alpha = 0.86;
        fence.zIndex = 2;
        front.addChild(fence);
      }

      if (biome !== "celestialSummit" && hasAsset("ropeBridge") && seed % 181 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 3)) {
        const bridge = makeSceneSprite("ropeBridge");
        bridge.x = wx;
        bridge.y = wy - 8;
        bridge.alpha = 0.72;
        bridge.zIndex = 1;
        front.addChild(bridge);
      }

      if (hasAsset("lanternCyan") && chunk.chunkY >= 3 && seed % 67 === 0) {
        const lantern = makeSceneSprite("lanternCyan");
        lantern.x = wx;
        lantern.y = wy - 22;
        lantern.alpha = 0.9;
        lantern.zIndex = 4;
        front.addChild(lantern);
      }

      if (hasAsset("stump") && seed % 109 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const stump = makeSceneSprite("stump");
        stump.x = wx - 4;
        stump.y = wy - 20;
        stump.alpha = 0.86;
        stump.zIndex = 2;
        front.addChild(stump);
      }

      if (hasAsset("mushroomCluster") && seed % 43 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const mushrooms = makeSceneSprite("mushroomCluster");
        mushrooms.x = wx - 3;
        mushrooms.y = wy - 17;
        mushrooms.alpha = 0.88;
        mushrooms.zIndex = 3;
        front.addChild(mushrooms);
      }

      if (hasAsset("ruinArchFragment") && seed % 113 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const arch = makeSceneSprite("ruinArchFragment");
        arch.x = wx - 6;
        arch.y = wy - 28;
        arch.alpha = 0.58;
        arch.zIndex = 0;
        back.addChild(arch);
      }

      if (hasAsset("ruinColumn") && seed % 157 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const column = makeSceneSprite("ruinColumn");
        column.x = wx - 4;
        column.y = wy - 36;
        column.alpha = 0.78;
        column.zIndex = 1;
        front.addChild(column);
      }

      if (hasAsset("crystalMarker") && chunk.chunkY >= 4 && seed % 131 === 0) {
        const crystal = makeSceneSprite("crystalMarker");
        crystal.x = wx;
        crystal.y = wy - 20;
        crystal.alpha = 0.86;
        crystal.zIndex = 3;
        front.addChild(crystal);
      }

      if (seed % 137 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const decorChoices: AssetKey[] =
          biome === "pineValley" ? ["decorBannerGreen", "decorSignWood", "decorBannerHelp", "decorBannerCaution", "decorLanternGold", "decorRopePosts", "decorFlowerCrystalGreen", "decorCampfireWarm", "decorTripodRed", "decorCrateStackWood", "decorBarrelStackWood", "decorSmallShrineWood", "decorFlowerPostPink"] :
          biome === "cloudRidge" ? ["decorBannerBlue", "decorBannerHelp", "decorBannerDanger", "decorLanternBlue", "decorPedestalBlue", "decorSignRune", "decorRopeLanterns", "decorCampfireBlue", "decorTripodBlue", "decorCrateStackRune", "decorCrystalTotemBlue", "decorFlowerPostWhite"] :
          biome === "snowfallCliffs" ? ["decorBannerCaution", "decorBannerDanger", "decorPedestalBlue", "decorBrazierBlue", "decorFlowerCrystalBlue", "decorSkeletonMarker", "decorCampfireBlue", "decorStatueSnow", "decorSmallShrineSnow", "decorSnowLampBlue", "decorCrystalTotemBlue", "decorFlowerPostBlue"] :
          biome === "frozenSpires" ? ["decorBannerDanger", "decorBannerNoWinners", "decorBrazierBlue", "decorFlowerCrystalPurple", "decorSkeletonMarker", "decorLanternBlue", "decorTripodPurple", "decorStatueSnow", "decorSnowLampPurple", "decorCrystalTotemPurple", "decorSmallShrinePurple"] :
          ["decorBannerNoWinners", "decorBannerDanger", "decorBannerGold", "decorPedestalGold", "decorBrazierGold", "decorLanternGreen", "decorFlowerCrystalBlue", "decorCampfireGreen", "decorStatueStone", "decorSnowLampGold", "decorCrystalTotemGreen", "decorSmallShrineSnow"];
        let decorKey = decorChoices[(seed >> 5) % decorChoices.length]!;
        if (!hasAsset(decorKey)) decorKey = "decorSignWood";
        if (hasAsset(decorKey)) {
          const decor = makeSceneSprite(decorKey);
          const tallDecor = decorKey === "decorBannerBlue" || decorKey === "decorBannerGold" || decorKey === "decorBannerGreen" || decorKey === "decorPedestalBlue" || decorKey === "decorPedestalGreen" || decorKey === "decorPedestalGold" || decorKey === "decorSkeletonMarker" || decorKey === "decorStatueStone" || decorKey === "decorStatueSnow" || decorKey === "decorCrystalTotemBlue" || decorKey === "decorCrystalTotemGreen" || decorKey === "decorCrystalTotemPurple";
          const mediumDecor = decorKey === "decorTripodRed" || decorKey === "decorTripodBlue" || decorKey === "decorTripodPurple" || decorKey === "decorSmallShrineWood" || decorKey === "decorSmallShrineSnow" || decorKey === "decorSmallShrinePurple" || decorKey === "decorSnowLampBlue" || decorKey === "decorSnowLampGold" || decorKey === "decorSnowLampPurple";
          const labeledBannerDecor = decorKey === "decorBannerHelp" || decorKey === "decorBannerDanger" || decorKey === "decorBannerCaution" || decorKey === "decorBannerNoWinners";
          const wideDecor = labeledBannerDecor || decorKey === "decorRopePosts" || decorKey === "decorRopeLanterns" || decorKey === "decorSignWood" || decorKey === "decorSignRune";
          decor.x = wx + (labeledBannerDecor ? -20 : wideDecor ? -8 : decorKey.startsWith("decorLantern") ? 2 : -2);
          decor.y = wy - (labeledBannerDecor ? 46 : tallDecor ? 50 : mediumDecor ? 38 : decorKey.startsWith("decorBrazier") || decorKey.startsWith("decorCampfire") ? 30 : decorKey.startsWith("decorFlowerCrystal") || decorKey.startsWith("decorFlowerPost") ? 31 : 25);
          decor.alpha = biome === "celestialSummit" ? 0.88 : 0.82;
          decor.zIndex = 2;
          front.addChild(decor);
        }
      }

      if ((biome === "pineValley" || biome === "cloudRidge") && hasAsset("bush") && seed % 47 === 0 && lx < chunk.width - 2 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const bush = makeSceneSprite("bush");
        bush.x = wx - 6;
        bush.y = wy - 22;
        bush.alpha = 0.86;
        bush.zIndex = 2;
        front.addChild(bush);
      }

      if (shouldPlaceProceduralTree(biome, seed) && lx > 2 && lx < chunk.width - 4 && canPlaceDecorationSpan(chunk, lx - 1, ly, biome === "pineValley" || biome === "cloudRidge" ? 4 : 3)) {
        const tree = makeProceduralTree(biome, seed);
        tree.x = wx + TILE_SIZE / 2;
        tree.y = wy + 6;
        tree.alpha = biome === "celestialSummit" ? 0.8 : biome === "frozenSpires" ? 0.86 : 0.92;
        tree.zIndex = 0;
        back.addChild(tree);
      }

      if ((biome === "cloudRidge" || biome === "snowfallCliffs") && hasAsset("climbingChain") && seed % 149 === 0) {
        const chain = makeSceneSprite("climbingChain");
        chain.x = wx;
        chain.y = wy - 3;
        chain.alpha = 0.62;
        chain.zIndex = 1;
        back.addChild(chain);
      }

      if (seed % 173 === 0 && lx < chunk.width - 3 && canPlaceDecorationSpan(chunk, lx, ly, 3)) {
        const clusterKey: AssetKey =
          biome === "celestialSummit" && hasAsset("tileClusterSummit") ? "tileClusterSummit" :
          (biome === "snowfallCliffs" || biome === "frozenSpires") && hasAsset("tileClusterSnow") ? "tileClusterSnow" :
          biome === "pineValley" && hasAsset("tileClusterMoss") ? "tileClusterMoss" :
          "tileClusterStone";
        if (hasAsset(clusterKey)) {
          const cluster = makeSceneSprite(clusterKey);
          cluster.x = wx - 7;
          cluster.y = wy - 49;
          cluster.alpha = 0.46;
          cluster.zIndex = -1;
          back.addChild(cluster);
        }
      }

      if ((biome === "cloudRidge" || biome === "snowfallCliffs" || biome === "frozenSpires") && hasAsset("tallPillar") && seed % 197 === 0 && lx < chunk.width - 2 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const pillar = makeSceneSprite("tallPillar");
        pillar.x = wx - 8;
        pillar.y = wy - 54;
        pillar.alpha = 0.42;
        pillar.zIndex = -2;
        back.addChild(pillar);
      }

      if ((biome === "snowfallCliffs" || biome === "frozenSpires") && hasAsset("windZone") && seed % 167 === 0) {
        const wind = makeSceneSprite("windZone");
        wind.x = wx - 24;
        wind.y = wy - 36;
        wind.alpha = 0.52;
        wind.zIndex = 5;
        front.addChild(wind);
      }

      if ((biome === "frozenSpires" || biome === "celestialSummit") && hasAsset("rollingBoulder") && seed % 223 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const boulder = makeSceneSprite("rollingBoulder");
        boulder.x = wx - 4;
        boulder.y = wy - 26;
        boulder.alpha = 0.82;
        boulder.zIndex = 3;
        front.addChild(boulder);
      }

      if (biome === "celestialSummit" && seed % 257 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 3)) {
        const shrine = makeProceduralCheckpointMarker(biome, seed);
        shrine.x = wx + TILE_SIZE;
        shrine.y = wy + 2;
        shrine.alpha = 0.82;
        shrine.zIndex = 2;
        back.addChild(shrine);
      }
    }
  }

  backDecorationLayer.addChild(back);
  decorationLayer.addChild(front);
  chunkDecorations.set(chunk.chunkY, { back, front });
}

function drawTile(
  g: Graphics, tileX: number, tileY: number,
  kind: TileKind, above: TileKind, below: TileKind, chunkIdx: number,
): void {
  const px = tileX * TILE_SIZE, py = tileY * TILE_SIZE;
  // Per-tile pseudo-random seeds (deterministic, no Math.random)
  const h1 = (tileX * 2503 + tileY * 1237) & 0xffff;
  const h2 = (tileX * 3701 + tileY * 809)  & 0xffff;
  const hNorm = Math.min(1, chunkIdx / 28);
  const biome = biomeForChunkY(chunkIdx);
  const snowT = altitude01(chunkIdx, 4, 14);
  const iceT = altitude01(chunkIdx, 10, 16);
  const summitT = altitude01(chunkIdx, 16, 20);
  const grassT = Math.max(0, 1 - snowT);
  const snowCol = lerpColor(0xe9f2ff, 0xf8fbff, summitT);
  const snowShade = lerpColor(0xaac4df, 0xd7e7f6, summitT);
  const stoneCol = lerpColor(lerpColor(PAL.stoneMid, PAL.stoneWorn, snowT * 0.8), 0xd1d9e2, summitT);
  const stoneShade = lerpColor(PAL.stoneShadow, 0x55667f, summitT);

  const hasTop = above === "empty" || above === "hazard" || above === "relic";
  const hasBot = below === "empty" || below === "hazard" || below === "relic";

  if (kind === "oneWay") {
    // ── Floating island platform (main gameplay surface) ──────────────────

    // Outline + body
    g.rect(px, py, TILE_SIZE, TILE_SIZE).fill(stoneShade);
    g.rect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2).fill(stoneCol);

    // Brick mortar seams — staggered rows give classic masonry look
    const stagger = (tileY % 2 === 0) ? 0 : 8;
    g.rect(px + 1, py + 8, TILE_SIZE - 2, 1).fill({ color: stoneShade, alpha: 0.5 });
    const vs1 = px + 1 + ((stagger + 7) % (TILE_SIZE - 2));
    const vs2 = px + 1 + ((stagger + 7 + 8) % (TILE_SIZE - 2));
    g.rect(vs1, py + 1, 1, 7).fill({ color: stoneShade, alpha: 0.38 });
    g.rect(vs2, py + 9, 1, TILE_SIZE - 10).fill({ color: stoneShade, alpha: 0.38 });

    // Subtle top highlight (light from above)
    g.rect(px + 1, py + 1, TILE_SIZE - 2, 1).fill({ color: PAL.stoneLight, alpha: 0.22 + summitT * 0.18 });
    // Right-edge shadow
    g.rect(px + TILE_SIZE - 2, py + 2, 1, TILE_SIZE - 3).fill({ color: stoneShade, alpha: 0.20 });

    // Moss patch (common low, rare high)
    if (grassT > 0.16 && h1 % 3 < 1) {
      const mx = px + 2 + (h1 % 5);
      g.rect(mx, py + 3, 3, 2).fill({ color: PAL.mossGreen, alpha: 0.25 + grassT * 0.75 });
      g.rect(mx, py + 2, 2, 1).fill({ color: PAL.mossBright, alpha: 0.2 + grassT * 0.7 });
    }

    // Altitude rune glow (rare, high chunks only)
    if ((biome === "cloudRidge" || biome === "snowfallCliffs" || biome === "frozenSpires" || biome === "celestialSummit") && (h2 % 9) < 2) {
      g.rect(px + 5 + (h2 % 5), py + 5, 2, 4).fill({ color: PAL.runeGlow, alpha: 0.22 + hNorm * 0.34 });
    }

    // ── Grass top (exposed upper face) ──────────────────────────────────
    if (hasTop) {
      const gCol = lerpColor(PAL.grassTop, PAL.mossBright, Math.min(0.65, hNorm * 0.35));
      if (grassT > 0.18) {
        g.rect(px + 1, py + 1, TILE_SIZE - 2, 4).fill(PAL.soilWarm);
        g.rect(px + 1, py + 1, TILE_SIZE - 2, 2).fill(PAL.grassDark);
        g.rect(px + 1, py + 1, TILE_SIZE - 2, 1).fill(gCol);
        for (let t = 0; t < 4; t++) {
          const tx = px + 1 + t * 4 + (h1 % 3);
          const th = 1 + ((h1 + t * 3) % 2);
          g.rect(tx, py - th, 1, th).fill({ color: gCol, alpha: 0.25 + grassT * 0.75 });
        }
        const fl = (tileX * 11 + tileY * 17) % 37;
        if (grassT > 0.55 && fl < 2) {
          const fcol = fl === 0 ? 0xf4dc6b : 0xbba4ff;
          g.rect(px + 3 + fl * 5, py - 2, 1, 2).fill(lerpColor(PAL.grassDark, gCol, 0.5));
          g.rect(px + 3 + fl * 5, py - 3, 1, 1).fill(fcol);
        }
        if ((h1 % 4) < 2) g.rect(px, py, 1, 3).fill({ color: PAL.mossBright, alpha: 0.18 + grassT * 0.42 });
        if ((h2 % 4) < 2) g.rect(px + TILE_SIZE - 1, py, 1, 3).fill({ color: PAL.mossBright, alpha: 0.18 + grassT * 0.42 });
      }
      if (snowT > 0.12) {
        const capH = 1 + Math.round(snowT * 3);
        g.rect(px + 1, py, TILE_SIZE - 2, capH).fill(snowShade);
        g.rect(px + 2, py, TILE_SIZE - 4, Math.max(1, capH - 1)).fill(snowCol);
        if ((h2 % 4) < 3) g.rect(px + 2 + (h1 % 8), py + capH - 1, 4, 1).fill({ color: 0xffffff, alpha: 0.45 });
      }
    }

    // ── Soil underside with hanging roots ───────────────────────────────
    if (hasBot) {
      g.rect(px + 1, py + TILE_SIZE - 4, TILE_SIZE - 2, 3).fill(lerpColor(PAL.soilDark, stoneShade, snowT));
      g.rect(px + 1, py + TILE_SIZE - 4, TILE_SIZE - 2, 1).fill(lerpColor(PAL.soilWarm, snowShade, snowT));
      if (grassT > 0.25) {
        const rc = 2 + (h1 % 3);
        const rStep = Math.floor((TILE_SIZE - 4) / rc);
        for (let r = 0; r < rc; r++) {
          const rx = px + 2 + r * rStep + (h2 % 3);
          const rlen = 2 + ((h1 + r * 5) % 5);
          g.rect(rx, py + TILE_SIZE, 1, rlen).fill({ color: PAL.soilRoot, alpha: grassT });
          if (rlen >= 4) g.rect(rx - 1, py + TILE_SIZE + rlen - 2, 3, 1).fill({ color: lerpColor(PAL.soilRoot, PAL.soilDark, 0.5), alpha: grassT });
        }
        if ((h2 % 5) < 2) {
          const vx = px + 5 + (h2 % 8);
          const vlen = 4 + (h1 % 5);
          g.rect(vx, py + TILE_SIZE, 2, vlen).fill({ color: PAL.mossGreen, alpha: grassT });
          g.rect(vx, py + TILE_SIZE, 2, 1).fill({ color: PAL.mossBright, alpha: grassT });
        }
      } else if (iceT > 0.25 && (h2 % 5) < 2) {
        const ix = px + 3 + (h2 % 8);
        const il = 3 + (h1 % 5);
        g.poly([ix, py + TILE_SIZE, ix + 2, py + TILE_SIZE + il, ix + 4, py + TILE_SIZE]).fill({ color: snowCol, alpha: 0.72 });
      }
    }

  } else if (kind === "solid") {
    // ── Floor / wall tiles ───────────────────────────────────────────────
    g.rect(px, py, TILE_SIZE, TILE_SIZE).fill(stoneShade);
    g.rect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2).fill(lerpColor(PAL.stoneDark, stoneCol, 0.35));
    g.rect(px + 1, py + 1, TILE_SIZE - 2, 1).fill({ color: PAL.stoneLight, alpha: 0.25 + summitT * 0.18 });
    if (hasTop && snowT > 0.15) {
      g.rect(px + 1, py, TILE_SIZE - 2, 2 + Math.round(snowT * 2)).fill(snowCol);
    }

  } else if (kind === "hazard") {
    // ── Natural mountain spike hazard ───────────────────────────────────
    const spikeCol = lerpColor(0x59646f, snowCol, iceT);
    const spikeShade = lerpColor(PAL.hazardBase, 0x536784, iceT);
    g.rect(px, py + TILE_SIZE - 5, TILE_SIZE, 5).fill(spikeShade);
    g.rect(px, py + TILE_SIZE - 5, TILE_SIZE, 1).fill({ color: PAL.hazardRed, alpha: 0.25 });
    for (let i = 0; i < 3; i++) {
      const sx = px + 2 + i * 5;
      g.poly([sx, py + TILE_SIZE - 5, sx + 2, py + 1, sx + 4, py + TILE_SIZE - 5]).fill(spikeCol);
      g.rect(sx + 1, py + 3, 1, 6).fill({ color: spikeShade, alpha: 0.45 });
      g.rect(sx + 1, py + 1, 1, 1).fill(0xffffff);
    }
  }
}

// ── Jump pad animations ───────────────────────────────────────────────────────

function drawProceduralJumpPad(g: Graphics, pulse: number, multiplier: number): void {
  g.clear();
  const glow = multiplier >= 2 ? PAL.coinGold : PAL.portalGlow;
  const spring = multiplier >= 2 ? 0xffd86a : PAL.portalBlue;
  const lift = Math.round(pulse * 2);

  g.rect(-15, 4, 30, 4).fill(PAL.stoneShadow);
  g.rect(-13, 1, 26, 5).fill(PAL.stoneDark);
  g.rect(-11, 0, 22, 2).fill(PAL.stoneWorn);
  g.rect(-14, 5, 28, 1).fill({ color: PAL.uiInk, alpha: 0.35 });

  for (let i = 0; i < 3; i++) {
    const x = -8 + i * 8;
    g.rect(x, -5 - lift, 2, 8 + lift).fill(spring);
    g.rect(x + 2, -4 - lift, 2, 2).fill({ color: PAL.cloudBright, alpha: 0.7 });
    g.rect(x + 2, -1, 2, 2).fill({ color: PAL.uiInk, alpha: 0.22 });
  }

  g.rect(-12, -9 - lift, 24, 5).fill({ color: glow, alpha: 0.86 });
  g.rect(-10, -11 - lift, 20, 2).fill(PAL.cloudBright);
  g.rect(-8, -7 - lift, 16, 2).fill({ color: PAL.portalBlue, alpha: 0.55 });
  g.rect(-2, -18 - lift, 4, 8).fill({ color: glow, alpha: 0.28 + pulse * 0.28 });
  g.poly([-7, -17 - lift, 0, -25 - lift, 7, -17 - lift]).fill({ color: glow, alpha: 0.22 + pulse * 0.28 });
  if (multiplier >= 2) {
    g.rect(-15, -3 - lift, 3, 3).fill(PAL.coinGold);
    g.rect(12, -3 - lift, 3, 3).fill(PAL.coinGold);
  }
}

function spawnJumpPadAnim(pad: JumpPadSpawn, worldTileY: number): void {
  if (jumpPadAnims.has(pad.id)) return;
  const container = new Container();
  const aura = new Graphics();
  const padGfx = new Graphics();
  const worldX = pad.x * TILE_SIZE + TILE_SIZE / 2;
  const worldY = worldTileY * TILE_SIZE + TILE_SIZE / 2;

  container.x = worldX;
  container.y = worldY;
  container.zIndex = 5;
  container.addChild(aura, padGfx);
  portalLayer.addChild(container);
  jumpPadAnims.set(pad.id, { container, aura, padGfx, pad, worldX, worldY });
}

function updateJumpPadAnims(tSec: number): void {
  for (const anim of jumpPadAnims.values()) {
    const pulse = Math.sin(tSec * 5.4 + anim.pad.x) * 0.5 + 0.5;
    anim.aura.clear();
    anim.aura.ellipse(0, 2, 18 + pulse * 4, 7 + pulse * 1.5)
      .fill({ color: PAL.portalBlue, alpha: 0.13 + pulse * 0.08 });
    anim.aura.ellipse(0, 2, 11 + pulse * 2, 4 + pulse)
      .stroke({ color: PAL.portalGlow, alpha: 0.42 + pulse * 0.24, width: 1 });
    anim.aura.rect(-10, 5, 20, 2).fill({ color: PAL.portalGlow, alpha: 0.18 + pulse * 0.18 });
    anim.aura.rect(-7, -9, 14, 1).fill({ color: PAL.portalGlow, alpha: 0.12 + pulse * 0.2 });
    anim.aura.rect(-1, -12, 2, 7).fill({ color: PAL.portalGlow, alpha: 0.07 + pulse * 0.12 });
    drawProceduralJumpPad(anim.padGfx, pulse, anim.pad.multiplier);
  }
}

function clearJumpPadAnimsForChunk(chunkY: number): void {
  for (const [id, anim] of [...jumpPadAnims.entries()]) {
    const animChunkY = Math.max(0, -Math.floor(anim.worldY / (CHUNK_HEIGHT_TILES * TILE_SIZE)));
    if (animChunkY === chunkY) {
      anim.container.destroy({ children: true });
      jumpPadAnims.delete(id);
    }
  }
}

function applyLocalJumpPads(player: PlayerState): boolean {
  if (player.health <= 0 || player.velocity.y < 0) return false;
  const playerCenterX = player.position.x + PLAYER_WIDTH / 2;
  const playerBottom = player.position.y + PLAYER_HEIGHT;
  for (const chunk of loadedChunks.values()) {
    for (const pad of chunk.jumpPads) {
      const padX = pad.x * TILE_SIZE + TILE_SIZE / 2;
      const padY = (chunk.worldTileY + pad.y) * TILE_SIZE + TILE_SIZE / 2;
      const nearX = Math.abs(playerCenterX - padX) <= TILE_SIZE * 0.85;
      const nearY = playerBottom >= padY - TILE_SIZE * 0.9 && playerBottom <= padY + TILE_SIZE * 0.9;
      if (!nearX || !nearY) continue;
      player.velocity.y = -JUMP_SPEED * Math.max(1, pad.multiplier);
      player.grounded = false;
      player.coyoteTimer = 0;
      player.jumpBufferTimer = 0;
      player.fallStartY = null;
      return true;
    }
  }
  return false;
}

function jumpPadFeedback(wx: number, wy: number, multiplier: number): void {
  spawnRing(wx, wy, PAL.portalBlue);
  spawnWorldPulse(wx, wy, PAL.portalGlow, 64, 0.5, 3);
  spawnFloatingText(wx, wy - 18, `${Math.round(multiplier)}x JUMP`, PAL.portalGlow);
  triggerShake(2.2, -3.5);
}

// ── Relic animations ──────────────────────────────────────────────────────────

function spawnRelicAnim(id: string, tileX: number, tileY: number): void {
  if (relicAnims.has(id)) return;
  const kind = collectibleKindForRelicId(id);
  const visual = collectibleVisual(kind);
  const container = new Container();
  const aura = new Graphics();
  const gfx = new Graphics();
  const sprite = makeSprite("coin");
  const sparkle = hasAsset("collectibleSparkle") ? makeSprite("collectibleSparkle") : null;
  const ring = hasAsset("collectibleRing") ? makeSprite("collectibleRing") : null;
  sprite.anchor.set(0.5);
  sprite.visible = true;
  container.addChild(aura);
  if (ring) {
    ring.anchor.set(0.5);
    ring.alpha = 0.42;
    ring.blendMode = "add";
    ring.tint = visual.color;
    container.addChild(ring);
  }
  if (sparkle) {
    sparkle.anchor.set(0.5);
    sparkle.alpha = 0.55;
    sparkle.blendMode = "add";
    sparkle.tint = visual.color;
    container.addChild(sparkle);
  }
  container.addChild(sprite, gfx);
  container.x = tileX * TILE_SIZE + TILE_SIZE / 2;
  container.y = tileY * TILE_SIZE + TILE_SIZE / 2 + COLLECTIBLE_PLATFORM_Y_OFFSET;
  container.scale.set(COLLECTIBLE_ASSET_SCALE);
  relicLayer.addChild(container);
  relicAnims.set(id, {
    container,
    aura,
    gfx,
    sprite,
    sparkle,
    ring,
    kind,
    auraColor: visual.color,
    frames: collectibleFrames(kind, id, tileX, tileY),
    tileX,
    tileY
  });
}

function updateRelicAnims(tSec: number): void {
  for (const [id, a] of relicAnims) {
    if (collectedRelics.has(id)) {
      a.container.destroy({ children: true });
      relicAnims.delete(id);
      continue;
    }
    const bob   = Math.sin(tSec * 3.0 + a.tileX * 0.8) * 2.5;
    a.container.y = a.tileY * TILE_SIZE + TILE_SIZE / 2 + COLLECTIBLE_PLATFORM_Y_OFFSET + bob;

    const frame  = Math.floor((tSec * 5) % 4);
    const coinW  = frame === 0 ? 8 : frame === 1 ? 5 : frame === 2 ? 2 : 5;
    const cx     = -coinW / 2;
    const pulse = 0.5 + Math.sin(tSec * 4.6 + a.tileX * 0.7 + a.tileY * 0.3) * 0.5;

    a.aura.clear();
    a.aura.circle(0, 0, 14 + pulse * 2).fill({ color: a.auraColor, alpha: 0.12 + pulse * 0.06 });
    a.aura.circle(0, 0, 9 + pulse * 1.5).stroke({ color: a.auraColor, alpha: 0.4 + pulse * 0.18, width: 1 });
    a.aura.circle(0, 0, 5 + pulse).stroke({ color: 0xffffff, alpha: 0.12 + pulse * 0.14, width: 1 });

    if (hasAsset("coin")) {
      a.gfx.clear();
      a.sprite.texture = assetTexture(a.frames[frame % a.frames.length] ?? coinFrameAsset(frame));
      a.sprite.scale.set(1 + Math.sin(tSec * 4.2 + a.tileX) * 0.05);
      if (a.sparkle) {
        a.sparkle.rotation = tSec * 0.8;
        a.sparkle.scale.set(0.72 + Math.sin(tSec * 5 + a.tileY) * 0.08);
        a.sparkle.alpha = 0.28 + Math.sin(tSec * 4.4 + a.tileX) * 0.16;
      }
      if (a.ring) {
        a.ring.rotation = tSec * 0.45 + a.tileX * 0.1;
        a.ring.scale.set(0.72 + Math.sin(tSec * 3.2 + a.tileY) * 0.06);
        a.ring.alpha = 0.24 + Math.sin(tSec * 2.8 + a.tileX) * 0.12;
      }
    } else {
      a.gfx.clear();
      a.gfx.rect(cx - 1, -7, coinW + 2, 14).fill({ color: PAL.coinGlow, alpha: 0.28 });
      a.gfx.rect(cx, -6, coinW, 12).fill(PAL.coinGold);
      if (coinW >= 4) {
        a.gfx.rect(cx, -6, coinW, 2).fill(PAL.coinGlow);
        a.gfx.rect(cx + coinW - 2, -6, 2, 12).fill(PAL.coinShade);
      }
    }
  }
}

// ── Portal animations ─────────────────────────────────────────────────────────

interface PortalAnim {
  container: Container;
  bodyGfx:   Graphics;
  glowGfx:   Graphics;
  worldX:    number;
  worldY:    number;
  tileW:     number;
  isExit:    boolean;
  lastParticleMs: number;
}
const portalAnims = new Map<number, PortalAnim>(); // keyed by chunkY

function drawProceduralPortalArch(body: Graphics, glow: Graphics, hw: number, ph: number, isExit: boolean, tSec: number): void {
  const pulse = Math.sin(tSec * (isExit ? 3.5 : 2.5)) * 0.5 + 0.5;
  const shimmer = Math.sin(tSec * 7.2) * 0.5 + 0.5;
  const energy = isExit ? PAL.portalBlue : PAL.uiHighlight;
  const energy2 = isExit ? PAL.portalGlow : PAL.coinGlow;
  const stone = isExit ? 0x7b6d50 : PAL.stoneDark;
  const stoneLight = isExit ? 0xd6c383 : PAL.stoneWorn;
  const stoneShade = isExit ? 0x4f4260 : PAL.stoneShadow;

  body.clear();
  glow.clear();

  glow.ellipse(0, -ph * 0.48, hw + 18 + pulse * 5, ph + 18 + pulse * 4)
    .fill({ color: energy, alpha: 0.08 + pulse * 0.06 });
  glow.ellipse(0, -ph * 0.48, hw + 9 + pulse * 3, ph + 10 + pulse * 3)
    .stroke({ color: energy2, alpha: 0.32 + pulse * 0.24, width: 2 });

  const innerTop = -ph - 2;
  const innerW = Math.max(12, hw * 2 - 10);
  for (let y = innerTop; y < 0; y += 4) {
    const rowT = (y - innerTop) / Math.max(1, -innerTop);
    const half = Math.round(innerW * (0.36 + rowT * 0.16) + Math.sin(tSec * 2 + y) * 1.5);
    glow.rect(-half, y, half * 2, 4).fill({ color: energy, alpha: 0.28 + pulse * 0.18 + (1 - rowT) * 0.06 });
    if ((y + Math.floor(tSec * 18)) % 12 === 0) {
      glow.rect(-half + 3, y + 1, half * 2 - 6, 1).fill({ color: 0xffffff, alpha: 0.28 + shimmer * 0.18 });
    }
  }

  const coreY = Math.round(-ph * 0.58);
  glow.rect(-2, innerTop + 4, 4, ph - 8).fill({ color: 0xffffff, alpha: 0.2 + pulse * 0.28 });
  glow.rect(-Math.round(hw * 0.48), coreY - 1, Math.round(hw * 0.96), 2).fill({ color: 0xffffff, alpha: 0.2 + pulse * 0.34 });
  glow.poly([0, coreY - 10, 7, coreY, 0, coreY + 10, -7, coreY]).fill({ color: 0xffffff, alpha: 0.38 + pulse * 0.4 });
  glow.poly([0, coreY - 6, 4, coreY, 0, coreY + 6, -4, coreY]).fill({ color: energy2, alpha: 0.74 });

  body.rect(-hw - 18, 0, hw * 2 + 36, 4).fill(stoneShade);
  body.rect(-hw - 13, -4, hw * 2 + 26, 5).fill(stone);
  body.rect(-hw - 9, -7, hw * 2 + 18, 3).fill(stoneLight);
  for (let step = 0; step < 4; step++) {
    const w = hw * 2 + 26 - step * 9;
    body.rect(Math.round(-w / 2), -4 - step * 4, w, 3).fill(step % 2 === 0 ? stoneLight : stone);
    body.rect(Math.round(-w / 2), -2 - step * 4, w, 1).fill({ color: PAL.cloudBright, alpha: 0.22 });
  }

  for (const side of [-1, 1]) {
    const x = side * hw;
    body.rect(x - side * 5, -ph + 3, 10, ph + 3).fill(stoneShade);
    body.rect(x - side * 4, -ph + 1, 7, ph + 4).fill(stone);
    body.rect(x - side * 3, -ph, 3, ph).fill(stoneLight);
    for (let b = 0; b < 5; b++) body.rect(x - side * 5, -ph + 4 + b * 7, 10, 2).fill({ color: stoneShade, alpha: 0.45 });
    body.poly([x - side * 9, -ph - 1, x, -ph - 15, x + side * 9, -ph - 1]).fill(stone);
    body.poly([x - side * 5, -ph - 3, x, -ph - 12, x + side * 5, -ph - 3]).fill(stoneLight);
  }

  for (let i = 0; i < 9; i++) {
    const angle = Math.PI + (i / 8) * Math.PI;
    const x = Math.round(Math.cos(angle) * (hw + 3));
    const y = Math.round(-ph + Math.sin(angle) * (ph * 0.48));
    body.rect(x - 3, y - 2, 6, 5).fill(i % 2 === 0 ? stoneLight : stone);
    body.rect(x - 3, y + 2, 6, 1).fill(stoneShade);
  }

  const moss = isExit ? PAL.canopyLight : PAL.mossBright;
  body.rect(-hw - 8, -ph - 5, hw * 2 + 16, 4).fill(moss);
  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (hw + 7 + (i % 3) * 3);
    const y = -ph + 4 + i * 4;
    body.rect(x, y, 3, 10 + (i % 4) * 3).fill(i % 3 === 0 ? PAL.canopyDark : PAL.canopyMid);
    body.rect(x - side * 3, y + 5, 6, 3).fill(moss);
    if (i % 2 === 0) {
      body.rect(x - side * 2, y + 1, 4, 4).fill(0xff5bd6);
      body.rect(x - side, y + 2, 2, 2).fill(PAL.coinGlow);
    }
  }

  for (let i = 0; i < 10; i++) {
    const a = tSec * 0.9 + (i * Math.PI * 2) / 10;
    const r = hw * 0.8 + ((tSec * 18 + i * 7) % 18);
    const x = Math.round(Math.cos(a) * r);
    const y = Math.round(-ph * 0.52 + Math.sin(a) * r * 0.72);
    glow.rect(x - 1, y - 1, i % 3 === 0 ? 3 : 2, i % 3 === 0 ? 3 : 2)
      .fill({ color: i % 2 === 0 ? energy2 : 0xffffff, alpha: 0.34 + pulse * 0.42 });
  }

  if (pulse > 0.82) {
    const flash = (pulse - 0.82) / 0.18;
    glow.rect(-hw, coreY - 1, hw * 2, 2).fill({ color: 0xffffff, alpha: flash * 0.5 });
    glow.rect(-1, innerTop + 3, 2, ph - 6).fill({ color: 0xffffff, alpha: flash * 0.45 });
  }
}

function spawnPortalAt(chunkY: number, tileX: number, tileY: number, tileW: number, isExit: boolean): void {
  if (portalAnims.has(chunkY)) return;

  const container = new Container();
  const bodyGfx   = new Graphics();
  const glowGfx   = new Graphics();
  container.addChild(glowGfx, bodyGfx);

  const wx = tileX * TILE_SIZE + (tileW * TILE_SIZE) / 2;
  const wy = tileY * TILE_SIZE;
  container.x = wx;
  container.y = wy;
  portalLayer.addChild(container);

  portalAnims.set(chunkY, { container, bodyGfx, glowGfx, worldX: wx, worldY: wy, tileW, isExit, lastParticleMs: 0 });
}

function updatePortals(tSec: number): void {
  for (const a of portalAnims.values()) {
    const hw    = Math.round((a.tileW * TILE_SIZE) * 0.40);
    const ph    = a.isExit ? 32 : 22;
    const col   = a.isExit ? PAL.portalBlue : PAL.uiHighlight;
    drawProceduralPortalArch(a.bodyGfx, a.glowGfx, hw, ph, a.isExit, tSec);

    if (elapsedMs - a.lastParticleMs > (a.isExit ? 80 : 130)) {
      a.lastParticleMs = elapsedMs;
      for (let i = 0; i < (a.isExit ? 3 : 2); i++) {
        const n = midMountainNoise(Math.round(tSec * 10), a.worldX + i * 17, a.worldY, a.isExit ? 211 : 131);
        const angle = ((n % 628) / 100) + tSec * 0.35;
        const radius = hw * 0.42 + (n % 12);
        const sx = a.worldX + Math.cos(angle) * radius;
        const sy = a.worldY - ph * 0.55 + Math.sin(angle) * radius * 0.68;
        const speed = 18 + (n % 28);
        spawnPart(
          sx,
          sy,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed - 12,
          0.45 + (n % 20) / 100,
          n % 4 === 0 ? 0xffffff : col,
          n % 5 === 0 ? 3 : 2,
          -10
        );
      }
    }
  }
}

// ── Character drawing ─────────────────────────────────────────────────────────

function drawPlayerInto(g: Graphics, s: PlayerState, color: number, elapsed: number): void {
  g.clear();
  if (s.invulnerable > 0 && Math.floor(elapsed / 80) % 2 === 1) return;

  const x = Math.round(s.position.x);
  const y = Math.round(s.position.y);
  const fx = s.facing;
  const phase = s.kickPhase;

  let kox = 0;
  if (phase === "windup")   kox = fx * -2;
  else if (phase === "active")   kox = fx *  5;
  else if (phase === "recovery") kox = fx *  2;

  const vy = s.velocity.y;
  const squash  = s.grounded ? Math.min(3, Math.abs(vy) * 0.008) : 0;
  const stretch = vy > 160    ? Math.min(4, (vy - 160) / 80)   : 0;

  const vw = PLAYER_WIDTH  + 4 + Math.round(stretch * 0.4);
  const vh = PLAYER_HEIGHT + 4 - Math.round(squash) + Math.round(stretch);
  const vx = x - 2 + kox;
  const vy2 = y - 2 + Math.round(squash * 0.5);

  // Shadow
  g.ellipse(x + PLAYER_WIDTH / 2, y + PLAYER_HEIGHT + 3, 8 + squash, 3 - squash)
    .fill({ color: 0x000000, alpha: 0.28 });

  // Scarf (secondary motion — trails opposite to movement direction)
  const speed = Math.abs(s.velocity.x);
  const scarfLen = Math.min(11, speed / 14 + (phase === "active" ? 8 : 2));
  const scarfDir = s.velocity.x < -8 ? 1 : s.velocity.x > 8 ? -1 : -fx;
  for (let si = 0; si < 3; si++) {
    const sw2 = scarfLen - si * 3.5;
    if (sw2 <= 0) break;
    g.rect(
      vx + (fx > 0 ? 1 : vw - 3) + scarfDir * si * 3, vy2 + 8 + si,
      Math.round(sw2), 2
    ).fill({ color: si === 0 ? PAL.scarfPrimary : PAL.scarfShade, alpha: 1 - si * 0.28 });
  }

  // Outline
  g.rect(vx - 1, vy2 - 1, vw + 2, vh + 2).fill(PAL.uiInk);
  // Body
  g.rect(vx, vy2, vw, vh).fill(0x485058);
  // Jacket (accent)
  g.rect(vx + 2, vy2 + 8, vw - 4, vh - 16).fill(color);

  // Head
  g.rect(vx + 2, vy2 + 1, vw - 4, 8).fill(PAL.skinLight);
  // Hair
  g.rect(vx + 2, vy2 + 1, vw - 4, 3).fill(PAL.hairDark);
  // Eye
  const eyeX = fx > 0 ? vx + vw - 8 : vx + 3;
  g.rect(eyeX, vy2 + 4, 2, 2).fill(PAL.uiInk);
  g.rect(eyeX + 1, vy2 + 4, 1, 1).fill(0xffffff);

  // Legs — animate when running on ground
  const legAnim = s.grounded && speed > 18;
  const legSwing = legAnim ? Math.sin((elapsed / 80) * Math.sign(s.velocity.x) * fx) * 2 : 0;
  g.rect(vx + 2,       vy2 + vh - 8 + Math.round(Math.max(0,  legSwing)), 4, 7 + Math.round(squash)).fill(PAL.canopyDark);
  g.rect(vx + vw - 6,  vy2 + vh - 8 + Math.round(Math.max(0, -legSwing)), 4, 7 + Math.round(squash)).fill(PAL.canopyDark);

  // Kick foot
  if (phase === "active") {
    const fx2 = fx > 0 ? vx + vw + 1 : vx - 9;
    g.rect(fx2, vy2 + vh - 9, 8, 5).fill(color);
    g.rect(fx2, vy2 + vh - 9, 8, 1).fill(PAL.coinGlow);
  }

  // Kick cooldown bar
  if (s.kickCooldown > 0 || phase !== "idle") {
    const total = KICK_COOLDOWN_SECONDS + KICK_WINDUP_SECONDS + KICK_ACTIVE_SECONDS + KICK_RECOVERY_SECONDS;
    const bw = 18, bx = x + PLAYER_WIDTH / 2 - bw / 2, by = y - 7;
    g.rect(bx, by, bw, 2).fill({ color: PAL.uiInk, alpha: 0.7 });
    const fill = phase !== "idle"
      ? 1 - s.kickTimer / (phase === "windup" ? KICK_WINDUP_SECONDS : phase === "active" ? KICK_ACTIVE_SECONDS : KICK_RECOVERY_SECONDS)
      : 1 - s.kickCooldown / total;
    g.rect(bx, by, Math.round(bw * Math.max(0, fill)), 2).fill(PAL.hazardRed);
  }
}

function makeLabel(name: string): Text {
  return new Text({
    text: name.slice(0, 12),
    style: {
      fill: PAL.uiParchment,
      fontSize: 7,
      fontFamily: "monospace",
      stroke: { color: PAL.uiInk, width: 2 },
    },
  });
}

function createRemoteEntry(player: PlayerState, name: string, serverTime: number): RemoteEntry {
  const ci = playerColorIdx++ % PLAYER_COLORS.length;
  const sprite = makeCharacterSprite(characterForRemote(ci));
  const crownSprite = makeSprite("crown");
  sprite.anchor.set(0.5, playerSpriteAnchorY());
  sprite.alpha = hasPlayerAnimationAssets() ? 0.82 : hasAsset("playerExplorer") ? 0.54 : 0;
  sprite.tint = 0xffffff;
  crownSprite.anchor.set(0.5, 1);
  crownSprite.visible = false;
  const gfx = new Graphics();
  gfx.alpha = hasPlayerAnimationAssets() ? 0.16 : 1;
  const label = makeLabel(name);
  remoteLayer.addChild(sprite, gfx, crownSprite, label);
  return { states: [{ state: player, t: serverTime }], current: player, colorIndex: ci, sprite, crownSprite, gfx, label };
}

// ── Particle system ───────────────────────────────────────────────────────────

interface Particle { gfx: Graphics; vx: number; vy: number; life: number; max: number; gravity: number }
interface WorldPulse { gfx: Graphics; wx: number; wy: number; life: number; max: number; color: number; radius: number; width: number }
interface FloatingText { txt: Text; vx: number; vy: number; life: number; max: number }
const particles:   Particle[] = [];
const partPool:    Graphics[] = [];
const worldPulses: WorldPulse[] = [];
const floatingTexts: FloatingText[] = [];
let fallStreakTimer = 0;

function spawnPart(wx: number, wy: number, vx: number, vy: number, life: number, color: number, size = 2, gravity = 200): void {
  if (particles.length > 220) return;
  const gfx = partPool.pop() ?? new Graphics();
  gfx.clear();
  gfx.rect(0, 0, size, size).fill(color);
  gfx.x = wx; gfx.y = wy; gfx.alpha = 1; gfx.visible = true;
  effectLayer.addChild(gfx);
  particles.push({ gfx, vx, vy, life, max: life, gravity });
}

function spawnWorldPulse(wx: number, wy: number, color: number, radius = 34, life = 0.42, width = 2): void {
  if (worldPulses.length > 24) return;
  const gfx = new Graphics();
  gfx.x = wx;
  gfx.y = wy;
  effectLayer.addChild(gfx);
  worldPulses.push({ gfx, wx, wy, life, max: life, color, radius, width });
}

function spawnFloatingText(wx: number, wy: number, msg: string, color: number): void {
  if (floatingTexts.length > 12) return;
  const txt = new Text({
    text: msg,
    style: {
      fill: color,
      fontFamily: "monospace",
      fontSize: 9,
      fontWeight: "900",
      stroke: { color: PAL.uiInk, width: 2 },
    },
  });
  txt.anchor.set(0.5);
  txt.x = wx;
  txt.y = wy;
  effectLayer.addChild(txt);
  floatingTexts.push({ txt, vx: (Math.random() - 0.5) * 12, vy: -26, life: 0.92, max: 0.92 });
}

function triggerScreenFlash(color: number, life = 0.22): void {
  screenFlashColor = color;
  screenFlashLife = life;
  screenFlashMax = life;
}

function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!;
    p.life -= dt;
    if (p.life <= 0) {
      p.gfx.visible = false;
      effectLayer.removeChild(p.gfx);
      partPool.push(p.gfx);
      particles.splice(i, 1);
      continue;
    }
    p.gfx.x += p.vx * dt;
    p.gfx.y += p.vy * dt;
    p.vy    += p.gravity * dt;
    p.gfx.alpha = p.life / p.max;
  }

  for (let i = worldPulses.length - 1; i >= 0; i--) {
    const p = worldPulses[i]!;
    p.life -= dt;
    if (p.life <= 0) {
      effectLayer.removeChild(p.gfx);
      p.gfx.destroy();
      worldPulses.splice(i, 1);
      continue;
    }
    const t = 1 - p.life / p.max;
    const r = p.radius * (0.25 + t);
    p.gfx.clear();
    p.gfx.circle(0, 0, r).stroke({ color: p.color, alpha: (1 - t) * 0.78, width: p.width });
    p.gfx.circle(0, 0, r * 0.55).stroke({ color: 0xffffff, alpha: (1 - t) * 0.22, width: 1 });
  }

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const f = floatingTexts[i]!;
    f.life -= dt;
    if (f.life <= 0) {
      effectLayer.removeChild(f.txt);
      f.txt.destroy();
      floatingTexts.splice(i, 1);
      continue;
    }
    f.txt.x += f.vx * dt;
    f.txt.y += f.vy * dt;
    f.vy += 18 * dt;
    f.txt.alpha = Math.min(1, f.life / 0.25);
  }

  if (screenFlashLife > 0) {
    screenFlashLife -= dt;
    const alpha = Math.max(0, screenFlashLife / Math.max(0.001, screenFlashMax)) * 0.22;
    screenFlashGfx.clear();
    screenFlashGfx.rect(0, 0, pixi.screen.width, pixi.screen.height).fill({ color: screenFlashColor, alpha });
  } else if (screenFlashGfx.children.length > 0 || screenFlashGfx.width > 0) {
    screenFlashGfx.clear();
  }
}

let ambientTimer = 0;
function spawnAmbientParticles(dt: number): void {
  ambientTimer += dt;
  if (!localPlayer || particles.length > 80) return;
  // Spawn a leaf every ~1.5s from above the visible area
  if (ambientTimer > 1.5) {
    ambientTimer = 0;
    const wx = (Math.random() * WORLD_WIDTH * 0.9) + WORLD_WIDTH * 0.05;
    const wy = localPlayer.position.y - 100 - Math.random() * 80;
    const leafCol = Math.random() < 0.5 ? PAL.leafGreen : PAL.grassTop;
    // Very low gravity, gentle drift — 3–5s life
    spawnPart(wx, wy, (Math.random() - 0.5) * 18, 12 + Math.random() * 8,
      3.0 + Math.random() * 2.0, leafCol, 2, 12);
  }
  // Fireflies: rare, near platform level, glow yellow-green
  if (ambientTimer < 0.05 && Math.random() < 0.3) {
    const wx = (Math.random() * WORLD_WIDTH * 0.8) + WORLD_WIDTH * 0.1;
    const wy = localPlayer.position.y - 20 - Math.random() * 60;
    spawnPart(wx, wy, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4,
      2.5 + Math.random() * 1.5, PAL.coinGlow, 2, 0);
  }
}

function spawnFallStreaks(dt: number): void {
  if (!localPlayer || localPlayer.grounded || localPlayer.velocity.y < 260 || particles.length > 180) {
    fallStreakTimer = 0;
    return;
  }
  fallStreakTimer += dt;
  if (fallStreakTimer < 0.035) return;
  fallStreakTimer = 0;
  const wx = localPlayer.position.x + PLAYER_WIDTH / 2 + (Math.random() - 0.5) * 22;
  const wy = localPlayer.position.y + PLAYER_HEIGHT * 0.35 + Math.random() * 12;
  spawnPart(wx, wy, (Math.random() - 0.5) * 18, -90 - Math.random() * 70, 0.22, PAL.cloudBright, 1, 0);
  if (localPlayer.velocity.y > 340) {
    spawnPart(wx + (Math.random() - 0.5) * 12, wy, (Math.random() - 0.5) * 12, -130, 0.18, PAL.portalGlow, 1, 0);
  }
}

function jumpDust(wx: number, wy: number, facing: number): void {
  spawnWorldPulse(wx, wy - 2, PAL.stoneLight, 18, 0.22, 1);
  for (let i = 0; i < 9; i++)
    spawnPart(wx + i * 2 - 8, wy, (i - 4) * 24 - facing * 12, -30 - Math.random() * 22, 0.22 + Math.random() * 0.08, i % 3 === 0 ? PAL.mossBright : PAL.stoneMid);
}

function landDust(wx: number, wy: number, impactVy: number): void {
  const n = Math.min(16, Math.round(impactVy / 22));
  if (impactVy > 180) spawnWorldPulse(wx, wy - 2, PAL.stoneLight, Math.min(42, impactVy * 0.16), 0.34, impactVy > 260 ? 3 : 2);
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (Math.random() - 0.5) * Math.PI * 0.55;
    const spd = 35 + Math.random() * impactVy * 0.28;
    spawnPart(wx, wy, Math.cos(a) * spd, Math.sin(a) * spd - 18, 0.28, PAL.stoneLight);
  }
}

function kickSpark(wx: number, wy: number, facing: number, color: number): void {
  for (let i = 0; i < 7; i++) {
    const a = (facing > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.9;
    const spd = 75 + Math.random() * 110;
    spawnPart(wx, wy, Math.cos(a) * spd, Math.sin(a) * spd - 28, 0.22, color);
  }
  spawnPart(wx + facing * 4, wy, 0, -8, 0.1, 0xffffff, 4);
}

function coinBurst(wx: number, wy: number): void {
  spawnWorldPulse(wx, wy, PAL.coinGold, 28, 0.38, 2);
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8 - Math.PI / 2;
    spawnPart(wx, wy, Math.cos(a) * 75, Math.sin(a) * 75 - 18, 0.38, PAL.coinGold, 3);
    spawnPart(wx, wy, Math.cos(a) * 38, Math.sin(a) * 38 - 10, 0.24, PAL.coinGlow,  2);
  }
}

function spawnRing(wx: number, wy: number, color: number): void {
  spawnWorldPulse(wx, wy, color, 42, 0.48, 2);
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12;
    spawnPart(wx + Math.cos(a) * 4, wy + Math.sin(a) * 4, Math.cos(a) * 56, Math.sin(a) * 56, 0.38, color, 3);
  }
}

function burst(wx: number, wy: number, color: number): void {
  spawnWorldPulse(wx, wy, color, 36, 0.36, 3);
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    spawnPart(wx + Math.cos(a) * 8, wy + Math.sin(a) * 8, Math.cos(a) * 55, Math.sin(a) * 55 - 18, 0.28, color, 3);
  }
}

function pickupBurst(wx: number, wy: number, pickupType: string | undefined): void {
  const visual = collectibleVisual(pickupType as CollectibleKind | undefined);
  coinBurst(wx, wy);
  spawnWorldPulse(wx, wy, visual.color, 36, 0.44, 2);
  spawnFloatingText(wx, wy - 14, visual.label, visual.color);
}

function checkpointCeremony(chunkY: number): void {
  const chunk = loadedChunks.get(chunkY);
  const wx = chunk
    ? (chunk.entry.x + chunk.entry.width / 2) * TILE_SIZE
    : WORLD_WIDTH / 2;
  const wy = chunk
    ? (chunk.worldTileY + chunk.entry.y) * TILE_SIZE - 4
    : (localPlayer?.position.y ?? 0);
  spawnRing(wx, wy, PAL.portalBlue);
  spawnWorldPulse(wx, wy, PAL.portalGlow, 72, 0.72, 3);
  spawnFloatingText(wx, wy - 42, "CHECKPOINT", PAL.portalGlow);
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.55;
    const spd = 70 + Math.random() * 90;
    spawnPart(wx + (Math.random() - 0.5) * 28, wy, Math.cos(a) * spd, Math.sin(a) * spd, 0.6 + Math.random() * 0.28, i % 3 === 0 ? PAL.portalGlow : PAL.portalBlue, i % 4 === 0 ? 3 : 2, 18);
  }
  triggerShake(2, -2);
  triggerScreenFlash(PAL.portalBlue, 0.18);
}

function damageFeedback(wx: number, wy: number, amount: number): void {
  burst(wx, wy, PAL.hazardRed);
  spawnFloatingText(wx, wy - 12, `-${Math.max(1, Math.round(amount))} HP`, PAL.hazardRed);
  triggerShake(3.5, 2.5);
  triggerScreenFlash(PAL.hazardRed, 0.18);
}

function createEnemyEntry(state: EnemyState): EnemyEntry {
  const sprite = makeSprite(enemyAssetForKind(state.kind));
  sprite.anchor.set(0.5, 1);
  sprite.zIndex = 7;
  const size = assetPixelSize(enemyAssetForKind(state.kind));
  const scale = Math.min(1.15, 34 / Math.max(1, size.height));
  sprite.scale.set(scale);
  const hp = new Graphics();
  hp.zIndex = 8;
  enemyLayer.addChild(sprite, hp);
  return { state, sprite, hp };
}

function updateEnemyEntries(enemies: EnemyState[], tSec: number): void {
  const ids = new Set(enemies.map((e) => e.id));
  for (const [id, entry] of [...enemyEntries.entries()]) {
    if (!ids.has(id)) {
      entry.sprite.destroy();
      entry.hp.destroy();
      enemyEntries.delete(id);
    }
  }

  for (const enemy of enemies) {
    let entry = enemyEntries.get(enemy.id);
    if (!entry) {
      entry = createEnemyEntry(enemy);
      enemyEntries.set(enemy.id, entry);
    }
    entry.state = enemy;
    const bob = enemy.kind === "iceBat" || enemy.kind === "windSpirit"
      ? Math.sin(tSec * 7 + enemy.position.x * 0.03) * 2
      : 0;
    entry.sprite.texture = assetTexture(enemyAssetForKind(enemy.kind));
    entry.sprite.x = Math.round(enemy.position.x + 11);
    entry.sprite.y = Math.round(enemy.position.y + 25 + bob);
    entry.sprite.scale.x = Math.abs(entry.sprite.scale.x) * enemy.facing;
    entry.sprite.alpha = enemy.hurtCooldown > 0 ? 0.68 + Math.sin(tSec * 42) * 0.24 : 0.96;
    entry.sprite.tint = enemy.hurtCooldown > 0 ? 0xffc7c7 : 0xffffff;

    entry.hp.clear();
    if (enemy.health < enemy.maxHealth) {
      const w = 20;
      const x = Math.round(enemy.position.x + 1);
      const y = Math.round(enemy.position.y - 5 + bob);
      entry.hp.rect(x - 1, y - 1, w + 2, 4).fill({ color: 0x100d18, alpha: 0.84 });
      entry.hp.rect(x, y, w, 2).fill({ color: PAL.stoneShadow, alpha: 0.9 });
      entry.hp.rect(x, y, Math.round(w * Math.max(0, enemy.health / enemy.maxHealth)), 2).fill(PAL.hazardRed);
    }
  }
}

function spawnDropAnimations(drops: RelicSpawn[]): void {
  for (const drop of drops) {
    if (!collectedRelics.has(drop.id)) spawnRelicAnim(drop.id, drop.x, drop.y);
  }
}

// ── Camera ────────────────────────────────────────────────────────────────────

function getScale(): number {
  return Math.min(Math.max(Math.max(320, pixi.screen.width) / WORLD_WIDTH, 0.8), 2.5);
}

function updateCamera(dt: number, scale: number): void {
  const renderPos = getLocalRenderPosition();
  if (localPlayer && renderPos) {
    const vh     = Math.max(300, pixi.screen.height) / scale;
    const climbLead = localPlayer.velocity.y < -80 ? -vh * 0.05 : 0;
    const fallPullback = localPlayer.velocity.y > 230 ? Math.min(vh * 0.10, (localPlayer.velocity.y - 230) * 0.14) : 0;
    const attackBias = localPlayer.kickPhase !== "idle" ? localPlayer.facing * 8 : 0;
    const target = renderPos.y + PLAYER_HEIGHT / 2 - vh * 0.30 + climbLead + fallPullback;
    if (cameraSnap) { cameraY = target; cameraSnap = false; }
    else            { cameraY += (target - cameraY) * Math.min(1, dt * 7); }
    shakeX += attackBias * 0.003;
  }

  shakeX *= 0.84; shakeY *= 0.84;
  if (Math.abs(shakeX) < 0.08) shakeX = 0;
  if (Math.abs(shakeY) < 0.08) shakeY = 0;

  worldLayer.scale.set(scale);
  worldLayer.x = Math.round((pixi.screen.width - WORLD_WIDTH * scale) / 2 + shakeX);
  worldLayer.y = Math.round(-cameraY * scale + shakeY);

  updateSkyParallax(cameraY, scale);
}

function triggerShake(sx: number, sy: number): void {
  shakeX = sx * (Math.random() > 0.5 ? 1 : -1);
  shakeY = sy;
}

// ── HUD ───────────────────────────────────────────────────────────────────────

// Draw a pixel-art stone panel at (x, y) with size (w, h) onto Graphics g
function drawHudPanel(g: Graphics, x: number, y: number, w: number, h: number): void {
  // Drop shadow
  g.rect(x + 3, y + 3, w, h).fill({ color: 0x000000, alpha: 0.5 });
  // Dark stone body
  g.rect(x, y, w, h).fill(0x080e18);
  // Outer border — darkest
  g.rect(x, y, w, 2).fill(0x040810);
  g.rect(x, y + h - 2, w, 2).fill(0x040810);
  g.rect(x, y, 2, h).fill(0x040810);
  g.rect(x + w - 2, y, 2, h).fill(0x040810);
  // Inner top-left highlight
  g.rect(x + 2, y + 2, w - 4, 1).fill({ color: 0x2a4060, alpha: 0.7 });
  g.rect(x + 2, y + 2, 1, h - 4).fill({ color: 0x2a4060, alpha: 0.5 });
  // Cyan top accent strip
  g.rect(x + 2, y, w - 4, 1).fill({ color: PAL.uiHighlight, alpha: 0.55 });
  // Moss corner dots
  g.rect(x + 2, y + 2, 3, 3).fill({ color: PAL.mossGreen, alpha: 0.55 });
  g.rect(x + w - 5, y + 2, 3, 3).fill({ color: PAL.mossGreen, alpha: 0.55 });
  g.rect(x + 2, y + h - 5, 3, 3).fill({ color: PAL.canopyDark, alpha: 0.45 });
  g.rect(x + w - 5, y + h - 5, 3, 3).fill({ color: PAL.canopyDark, alpha: 0.45 });
}

// Draw a small pixel-art coin icon at (x, y) - frame 0..3 spin animation
function drawHudCoinIcon(g: Graphics, x: number, y: number, frame: number): void {
  const w = frame === 0 ? 7 : frame === 1 ? 5 : frame === 2 ? 2 : 5;
  const cx = x + Math.round((7 - w) / 2);
  g.rect(cx, y, w, 10).fill(PAL.coinGold);
  if (w >= 4) {
    g.rect(cx, y, w, 2).fill(PAL.coinGlow);
    g.rect(cx + w - 2, y, 2, 10).fill(PAL.coinShade);
  }
  g.rect(cx - 1, y - 1, w + 2, 12).fill({ color: PAL.coinGlow, alpha: 0.2 });
}

// Stable scoreboard row pool — reuse elements to avoid per-frame DOM churn.
const scoreboardRowPool: HTMLElement[] = [];
let lastScoreboardKey = "";

let hudBuilt   = false;
let hudPanelGfx: Graphics;
let hudIconGfx:  Graphics;   // animated icons — cleared each frame
let hudPanelSprite: Sprite | null = null;
let hudCoinSprite: Sprite | null = null;
let hudHeightSprite: Sprite | null = null;
let hudCoinTxt:  Text;
let hudHeightTxt:Text;
let hudHealthTxt:Text;
let hudLevelTxt: Text;
let hudPhaseTxt: Text;
let hudPingTxt:  Text;
let hudRankTxt:  Text;
let lastHudBiome: BiomeId | null = null;

function buildHudPanels(): void {
  if (hudPanelGfx) hudPanelGfx.destroy();
  if (hudPanelSprite) hudPanelSprite.destroy();
  hudPanelGfx = new Graphics();
  hudPanelSprite = null;
  if (hasAsset("hudPanel")) {
    hudPanelSprite = makeSprite("hudPanel");
    hudPanelSprite.x = 2;
    hudPanelSprite.y = 2;
    hudPanelSprite.width = 90;
    hudPanelSprite.height = 78;
    hudLayer.addChildAt(hudPanelSprite, 0);
  } else {
    // Left stat panel — tall enough to include rank and ping rows
    drawHudPanel(hudPanelGfx, 6, 6, 82, 72);
    hudLayer.addChildAt(hudPanelGfx, 0);
  }
}

function ensureHud(): void {
  if (hudBuilt) return;
  hudBuilt = true;
  const base = { fontFamily: "monospace", fontSize: 9 };
  hudCoinTxt   = new Text({ text: "0",    style: { ...base, fill: PAL.coinGold,     fontWeight: "900" } });
  hudHeightTxt = new Text({ text: "0m",   style: { ...base, fill: PAL.uiParchment,  fontSize: 10, fontWeight: "700" } });
  hudHealthTxt = new Text({ text: "HP 5/5", style: { ...base, fill: PAL.hazardRed,   fontSize: 9, fontWeight: "900" } });
  hudLevelTxt  = new Text({ text: "L1",    style: { ...base, fill: PAL.portalBlue,   fontSize: 9, fontWeight: "900" } });
  hudPhaseTxt  = new Text({ text: "",     style: { ...base, fill: PAL.uiHighlight,  fontSize: 11, fontWeight: "900" } });
  hudPingTxt   = new Text({ text: "",     style: { ...base, fill: 0x486878,         fontSize: 8 } });
  hudRankTxt   = new Text({ text: "",     style: { ...base, fill: PAL.uiParchment,  fontSize: 8 } });
  hudIconGfx   = new Graphics();
  hudCoinSprite = hasAsset("coin") ? makeSprite("coin") : null;
  hudHeightSprite = hasAsset("heightArrow") ? makeSprite("heightArrow") : null;
  if (hudCoinSprite) {
    hudCoinSprite.anchor.set(0.5);
    hudCoinSprite.x = 14;
    hudCoinSprite.y = 16;
  }
  if (hudHeightSprite) {
    hudHeightSprite.x = 7;
    hudHeightSprite.y = 24;
    hudHeightSprite.scale.set(0.72);
  }

  hudCoinTxt.x   = 28; hudCoinTxt.y   = 10;
  hudHeightTxt.x = 28; hudHeightTxt.y = 26;
  hudHealthTxt.x = 10; hudHealthTxt.y = 42;
  hudLevelTxt.x  = 54; hudLevelTxt.y  = 42;
  hudPingTxt.x   = 10; hudPingTxt.y   = 66;
  hudRankTxt.x   = 10; hudRankTxt.y   = 58;

  buildHudPanels();
  if (hudCoinSprite) hudLayer.addChild(hudCoinSprite);
  if (hudHeightSprite) hudLayer.addChild(hudHeightSprite);
  hudLayer.addChild(hudIconGfx, hudCoinTxt, hudHeightTxt, hudHealthTxt, hudLevelTxt, hudPhaseTxt, hudPingTxt, hudRankTxt);

  window.addEventListener("resize", () => setTimeout(buildHudPanels, 80));
}

function updateHud(tSec: number): void {
  if (!localPlayer) return;
  ensureHud();

  const hm    = Math.max(0, Math.round(-localPlayer.position.y / 32));
  const coins = localPlayer.coins;

  // Animated coin icon
  hudIconGfx.clear();
  const coinFrame = Math.floor(tSec * 4) % 4;
  if (hudCoinSprite) {
    hudCoinSprite.scale.x = coinFrame === 0 ? 0.72 : coinFrame === 1 ? 0.48 : coinFrame === 2 ? 0.22 : 0.48;
    hudCoinSprite.scale.y = 0.72;
    hudCoinSprite.texture = assetTexture(coinFrameAsset(coinFrame));
    hudCoinSprite.scale.set(0.72);
  } else {
    drawHudCoinIcon(hudIconGfx, 10, 10, coinFrame);
  }
  if (!hudHeightSprite) {
    // Height icon: upward arrow
    hudIconGfx.rect(10, 28, 2, 8).fill(PAL.uiHighlight);
    hudIconGfx.rect(8,  28, 6, 2).fill(PAL.uiHighlight);
    hudIconGfx.rect(9,  26, 4, 2).fill(PAL.uiHighlight);
  }

  hudCoinTxt.text   = String(coins);
  hudHeightTxt.text = `${hm}m`;
  hudHealthTxt.text = `HP ${Math.max(0, Math.ceil(localPlayer.health))}/${localPlayer.maxHealth}`;
  hudLevelTxt.text  = `L${localPlayer.level}`;

  // Rank + ping in lower part of panel
  const rows: Array<{ name: string; h: number; coins: number; local: boolean }> = [];
  if (localPlayerId) rows.push({ name: playerNames.get(localPlayerId) ?? "You", h: hm, coins, local: true });
  for (const [pid, e] of remotePlayers) {
    rows.push({ name: playerNames.get(pid) ?? "?", h: Math.max(0, Math.round(-e.current.position.y / 32)), coins: e.current.coins, local: false });
  }
  rows.sort((a, b) => b.h - a.h);
  const myRank = rows.findIndex((r) => r.local);
  hudRankTxt.text = myRank >= 0 ? `#${myRank + 1} / ${rows.length}` : "";
  hudPingTxt.text = pingMs > 0 ? `${pingMs}ms` : "";
  hudPingTxt.x    = 6 + 82 - hudPingTxt.width - 6;
  hudPingTxt.y    = 66;
  hudRankTxt.y    = 58;

  const currentBiome = biomeForChunkY(Math.max(0, -Math.floor(localPlayer.position.y / (CHUNK_HEIGHT_TILES * TILE_SIZE))));
  if (lastHudBiome !== currentBiome) {
    if (lastHudBiome && matchPhase === "playing") {
      pushNotification(biomeDisplayName(currentBiome), currentBiome === "celestialSummit" ? PAL.coinGold : PAL.portalGlow);
    }
    lastHudBiome = currentBiome;
  }

  // Center phase / biome banner
  const phText = matchPhase === "countdown" ? "GET READY!" : matchPhase === "waiting" ? "WAITING..." : biomeDisplayName(currentBiome);
  hudPhaseTxt.text = phText;
  if (phText) {
    hudPhaseTxt.x = Math.round(pixi.screen.width / 2 - hudPhaseTxt.width / 2);
    hudPhaseTxt.y = 10;
    hudPhaseTxt.alpha = matchPhase === "playing" ? 0.76 : 1;
  }

  // HTML scoreboard — diff-update to avoid per-frame DOM churn causing flash artifacts.
  const scoreKey = rows.map((r) => `${r.name}|${r.h}|${r.coins}|${r.local}`).join(";");
  if (scoreKey !== lastScoreboardKey) {
    lastScoreboardKey = scoreKey;
    // Grow pool if needed.
    while (scoreboardRowPool.length < rows.length) {
      const row = document.createElement("div");
      const rank  = document.createElement("span"); rank.className  = "rank";
      const name_ = document.createElement("span"); name_.className = "name";
      const b     = document.createElement("b");    name_.append(b);
      const stat  = document.createElement("span"); stat.className  = "stat";
      const ht    = document.createElement("strong");
      row.append(rank, name_, stat, ht);
      scoreboard.append(row);
      scoreboardRowPool.push(row);
    }
    // Hide excess rows.
    for (let i = rows.length; i < scoreboardRowPool.length; i++) {
      scoreboardRowPool[i]!.style.display = "none";
    }
    // Update visible rows in-place.
    for (const [i, r] of rows.entries()) {
      const row = scoreboardRowPool[i]!;
      row.style.display = "";
      row.className = `score-row${r.local ? " local" : ""}`;
      (row.children[0] as HTMLElement).textContent = String(i + 1);
      (row.children[1]!.children[0] as HTMLElement).textContent = r.name;
      (row.children[2] as HTMLElement).textContent = `◆${r.coins}`;
      (row.children[3] as HTMLElement).textContent = `${r.h}m`;
    }
  }
}

// ── Notifications ─────────────────────────────────────────────────────────────

interface Notif { _cont: Container; life: number; max: number; vy: number }
const notifs: Notif[] = [];

function pushNotification(msg: string, color: number = PAL.uiParchment): void {
  if (notifs.length > 4) return; // cap
  const txt = new Text({
    text: msg,
    style: { fill: color, fontSize: 10, fontFamily: "monospace", fontWeight: "900" }
  });
  const bg = new Graphics();
  const pw = txt.width + 20, ph = 20;
  drawHudPanel(bg, 0, 0, pw, ph);
  txt.x = 10; txt.y = 5;
  const nc = new Container();
  nc.addChild(bg, txt);
  const sw = pixi.screen.width;
  nc.x = Math.round(sw / 2 - pw / 2);
  nc.y = Math.round(pixi.screen.height * 0.30) - notifs.length * 26;
  hudLayer.addChild(nc);
  notifs.push({ _cont: nc, life: 2.5, max: 2.5, vy: -16 });
}

function updateNotifications(dt: number): void {
  for (let i = notifs.length - 1; i >= 0; i--) {
    const n = notifs[i] as Notif;
    n.life -= dt;
    if (n.life <= 0) {
      if (n._cont) { hudLayer.removeChild(n._cont); n._cont.destroy(); }
      notifs.splice(i, 1);
      continue;
    }
    if (n._cont) {
      n._cont.y += n.vy * dt;
      n.vy *= 0.90;
      n._cont.alpha = n.life < 0.7 ? n.life / 0.7 : Math.min(1, (n.max - n.life) / 0.3);
    }
  }
}

// ── Debug overlay ─────────────────────────────────────────────────────────────

const dbgGfx = new Graphics();
hudLayer.addChild(dbgGfx);

function updateDebug(): void {
  dbgGfx.clear();
  if (!showDebug) return;

  drawHudPanel(dbgGfx, 4, 58, 200, 132);

  const fps = Math.round(pixi.ticker.FPS);
  dbgGfx.rect(8, 64, Math.min(fps * 1.4, 118), 3).fill(fps > 50 ? 0x5dff9c : fps > 30 ? PAL.coinGold : PAL.hazardRed);
  dbgGfx.rect(8, 70, Math.min(pingMs, 118), 3).fill(pingMs < 60 ? 0x5dff9c : pingMs < 120 ? PAL.coinGold : PAL.hazardRed);
  // Adaptive interp delay bar (0–250 ms range)
  dbgGfx.rect(8, 76, Math.round(adaptiveInterpDelayMs / 250 * 118), 3).fill(adaptiveInterpDelayMs < 80 ? 0x5dff9c : adaptiveInterpDelayMs < 150 ? PAL.coinGold : PAL.hazardRed);
  // Jitter bar (0–80 ms range)
  dbgGfx.rect(8, 82, Math.round(Math.min(pingJitterMs, 80) / 80 * 118), 3).fill(pingJitterMs < 20 ? 0x5dff9c : pingJitterMs < 40 ? PAL.coinGold : PAL.hazardRed);

  if (localPlayer) {
    const { x: vx, y: vy } = localPlayer.velocity;
    dbgGfx.rect(8, 88, Math.round(Math.abs(vx) / 300 * 118), 3).fill(vx >= 0 ? PAL.portalBlue : PAL.hazardRed);
    dbgGfx.rect(8, 94, Math.round(Math.abs(vy) / 420 * 118), 3).fill(vy >= 0 ? PAL.coinGold : PAL.canopyLight);
    dbgGfx.rect(8, 100, 6, 6).fill(localPlayer.grounded ? 0x5dff9c : PAL.hazardMag);
    dbgGfx.rect(8, 108, Math.min(Math.max(0, -Math.floor(Math.floor(localPlayer.position.y / TILE_SIZE) / CHUNK_HEIGHT_TILES)) * 6, 120), 3).fill(PAL.mistPale);

    const sc = getScale();
    const bx = Math.round(worldLayer.x + localPlayer.position.x * sc);
    const by = Math.round(worldLayer.y + localPlayer.position.y * sc);
    dbgGfx.rect(bx, by, PLAYER_WIDTH * sc, PLAYER_HEIGHT * sc).stroke({ color: 0x5dff9c, width: 1 });
  }

  dbgGfx.rect(8, 115, 118, 6).fill({ color: PAL.uiParchment, alpha: 0.14 });
  dbgGfx.rect(8, 115, Math.round(predBuf.length * 0.98), 6).fill(PAL.portalBlue);
  dbgGfx.rect(8, 124, Math.min((serverTick % 60) * 2, 118), 3).fill(PAL.stoneMid);
  dbgGfx.rect(8, 130, Math.min(particles.length * 1.5, 118), 3).fill(PAL.canopyLight);
}

// ── Networking ────────────────────────────────────────────────────────────────

function connectRoom(name: string): void {
  if (ws && ws.readyState === WebSocket.CONNECTING) return;
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const configuredUrl = import.meta.env.VITE_WS_URL?.trim();
  const wsUrl = new URL(configuredUrl || `${proto}://${location.host}/ws`);
  wsUrl.searchParams.set("room", "demo");
  ws = new WebSocket(wsUrl.toString());

  ws.addEventListener("open", () => {
    reconnDelay = 1000;
    netStatus.textContent = "Connecting…";
    ws!.send(JSON.stringify({ type: "hello", protocol: PROTOCOL_VERSION, version: GAME_VERSION, name: name.trim() || "Explorer", token: sessionToken ?? undefined }));
    lastPingTime = Date.now();
    ws!.send(JSON.stringify({ type: "ping", clientTime: lastPingTime }));
  });

  ws.addEventListener("message", (ev) => {
    if (typeof ev.data !== "string") return;
    let parsed: unknown;
    try { parsed = JSON.parse(ev.data); } catch { return; }
    if (!isServerMessage(parsed)) return;

    switch (parsed.type) {
      case "welcome":
        // Bootstrap clock from welcome only once; pong NTP updates refine it from then on.
        if (!hasServerClock) updateServerClock(parsed.serverTime - Date.now());
        localPlayerId = parsed.playerId; sessionToken = parsed.sessionToken; matchPhase = parsed.matchPhase;
        // Store our own sanitized name so the scoreboard shows it correctly.
        playerNames.set(localPlayerId, parsed.name);
        if (serverSeed !== parsed.seed) {
          serverSeed = parsed.seed;
          clearWorldChunks();
          for (let cy = 0; cy < INITIAL_CHUNKS_TO_LOAD; cy++) loadChunk(cy);
        }
        netStatus.textContent = `Room: demo | ${localPlayerId.slice(0, 6)}`;
        { const { x, y } = getSpawnPos(); localPlayer = createPlayerState(localPlayerId, x, y); }
        snapLocalVisualToSimulation();
        resetLocalPrediction(); cameraSnap = true;
        break;
      case "resumed":
        if (!hasServerClock) updateServerClock(parsed.serverTime - Date.now());
        localPlayerId = parsed.playerId; matchPhase = parsed.matchPhase;
        netStatus.textContent = "Reconnected.";
        localPlayer = clonePlayerState(parsed.playerState); snapLocalVisualToSimulation(); resetLocalPrediction(); cameraSnap = true;
        break;
      case "snapshot":
        serverTick = parsed.tick; matchPhase = parsed.matchPhase;
        // Reconcile full collected set so late-joiners see correct coin state
        for (const id of parsed.collectedRelics) collectedRelics.add(id);
        for (const ev2 of parsed.events) {
          if (ev2.type === "COIN_COLLECTED") {
            collectedRelics.add(ev2.coinId);
            pickupBurst(ev2.x, ev2.y, ev2.pickupType);
            if (ev2.playerId === localPlayerId) {
              const visual = collectibleVisual(ev2.pickupType);
              pushNotification(visual.notification, visual.color);
            }
          } else if (ev2.type === "PLAYER_KICK_HIT") {
            const target = ev2.targetId === localPlayerId
              ? localPlayer
              : remotePlayers.get(ev2.targetId)?.current ?? null;
            if (target) damageFeedback(target.position.x + PLAYER_WIDTH / 2, target.position.y + PLAYER_HEIGHT * 0.45, 1);
            if (ev2.playerId === localPlayerId) pushNotification("KICK HIT", PAL.hazardGlow);
            else if (ev2.targetId === localPlayerId) pushNotification("KICKED!", PAL.hazardRed);
          } else if (ev2.type === "ENEMY_HIT") {
            damageFeedback(ev2.x, ev2.y, ev2.damage);
            if (ev2.playerId === localPlayerId) pushNotification("NPC HIT", PAL.hazardGlow);
          } else if (ev2.type === "ENEMY_KILLED") {
            burst(ev2.x, ev2.y, PAL.coinGold);
            spawnFloatingText(ev2.x, ev2.y - 14, "DROP", PAL.coinGold);
            spawnDropAnimations(ev2.drops);
            if (ev2.playerId === localPlayerId) pushNotification("NPC DOWN", PAL.coinGold);
          } else if (ev2.type === "JUMP_PAD_TRIGGERED") {
            if (ev2.playerId !== localPlayerId || elapsedMs - lastLocalJumpPadFxMs > 250) {
              jumpPadFeedback(ev2.x, ev2.y, ev2.multiplier);
            }
          } else if (ev2.type === "CHECKPOINT_REACHED" && ev2.playerId === localPlayerId) {
            checkpointCeremony(ev2.chunkY);
            pushNotification("CHECKPOINT REACHED", PAL.portalGlow);
          } else if (ev2.type === "PLAYER_DIED" && ev2.playerId === localPlayerId) {
            triggerScreenFlash(PAL.hazardRed, 0.22);
            triggerShake(4, 3);
          } else if (ev2.type === "PLAYER_RESPAWNED" && ev2.playerId === localPlayerId) {
            const p = localPlayer;
            if (p) {
              spawnRing(p.position.x + PLAYER_WIDTH / 2, p.position.y + PLAYER_HEIGHT / 2, PAL.portalBlue);
              spawnFloatingText(p.position.x + PLAYER_WIDTH / 2, p.position.y - 10, "RESPAWN", PAL.portalGlow);
            }
          }
        }
        for (const sp of parsed.players) {
          if (sp.id === localPlayerId) reconcileLocalPlayer(sp, parsed.lastProcessedSeq[sp.id] ?? -1);
          else updateRemotePlayer(sp, parsed.serverTime);
        }
        updateEnemyEntries(parsed.enemies ?? [], elapsedMs / 1000);
        { const ids = new Set(parsed.players.map((p) => p.id));
          for (const pid of remotePlayers.keys()) {
            if (!ids.has(pid)) { const e = remotePlayers.get(pid); if (e) { e.sprite.destroy(); e.crownSprite.destroy(); e.gfx.destroy(); e.label.destroy(); } remotePlayers.delete(pid); }
          }
        }
        break;
      case "chunk": {
        // Always replace locally-generated chunk with authoritative server version
        destroyChunkVisuals(parsed.chunk.chunkY);
        loadedChunks.set(parsed.chunk.chunkY, parsed.chunk);
        renderChunk(parsed.chunk);
        break;
      }
      case "playerJoined":
        if (parsed.player.id !== localPlayerId) {
          playerNames.set(parsed.player.id, parsed.name);
          const existing = remotePlayers.get(parsed.player.id);
          if (existing) {
            // Snapshot arrived before playerJoined — reuse existing entry, update label
            existing.label.text = parsed.name.slice(0, 12);
          } else {
            remotePlayers.set(parsed.player.id, createRemoteEntry(parsed.player, parsed.name, estimatedServerTime()));
          }
          pushNotification(`${parsed.name} joined`, PAL.uiCyan);
        }
        break;
      case "playerLeft":
        { const name2 = playerNames.get(parsed.playerId) ?? "Player"; const e = remotePlayers.get(parsed.playerId); if (e) { e.sprite.destroy(); e.crownSprite.destroy(); e.gfx.destroy(); e.label.destroy(); } remotePlayers.delete(parsed.playerId); playerNames.delete(parsed.playerId); pushNotification(`${name2} left`, PAL.uiGray); }
        break;
      case "pong": {
        const rtt = Date.now() - parsed.clientTime;
        pingMs = rtt;
        addPingSample(rtt);
        // NTP-style: account for one-way transit so the offset isn't biased by RTT.
        const offsetMs = parsed.serverTime - (parsed.clientTime + rtt / 2);
        updateServerClock(offsetMs);
        break;
      }
      case "matchPhase":
        matchPhase = parsed.phase;
        if (parsed.phase === "countdown") pushNotification("GET READY!", PAL.uiParchment);
        else if (parsed.phase === "playing") pushNotification("GO!", PAL.coinGold);
        break;
    }
  });

  ws.addEventListener("close", () => { netStatus.textContent = `Disconnected. Retrying in ${reconnDelay / 1000}s…`; schedReconn(name); });
  ws.addEventListener("error", () => { netStatus.textContent = "Server unavailable. Local mode active."; });
}

function schedReconn(name: string): void {
  if (reconnTimeout) return;
  reconnTimeout = setTimeout(() => { reconnTimeout = null; reconnDelay = Math.min(reconnDelay * 2, 30_000); connectRoom(name); }, reconnDelay);
}

function sendInput(inp: PlayerInput): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || !localPlayerId) return;
  ws.send(JSON.stringify({ type: "input", playerId: localPlayerId, input: inp }));
}

function shouldPredictLocalMovement(): boolean {
  return localPlayer !== null;
}

function maybePing(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (Date.now() - lastPingTime > 1000) { lastPingTime = Date.now(); ws.send(JSON.stringify({ type: "ping", clientTime: lastPingTime })); }
}

function addPingSample(rtt: number): void {
  pingSamples.push(rtt);
  if (pingSamples.length > PING_HISTORY_SIZE) pingSamples.shift();
  if (pingSamples.length >= 2) {
    const mean = pingSamples.reduce((a, b) => a + b, 0) / pingSamples.length;
    // Use 90th-percentile deviation as jitter to be resilient against occasional spikes.
    const devs = pingSamples.map((v) => Math.abs(v - mean)).sort((a, b) => a - b);
    pingJitterMs = devs[Math.floor(devs.length * 0.9)] ?? devs[devs.length - 1] ?? 0;
  }
  // Smoothed RTT: grow fast on worsening, shrink slowly on recovery.
  const alpha = rtt > smoothedRttMs ? 0.35 : 0.08;
  smoothedRttMs += (rtt - smoothedRttMs) * alpha;
}

function updateServerClock(offsetMs: number): void {
  if (!hasServerClock) {
    serverTimeOffsetMs = offsetMs;
    hasServerClock = true;
  } else {
    // Absorb clock-ahead quickly (prevents render time jumping forward),
    // shrink slowly (avoids oscillation when offset improves).
    const alpha = offsetMs > serverTimeOffsetMs ? 0.20 : 0.05;
    serverTimeOffsetMs += (offsetMs - serverTimeOffsetMs) * alpha;
  }
}

function updateAdaptiveInterpDelay(): void {
  if (!hasServerClock || pingSamples.length < 2) return;
  // Target: half the smoothed RTT + p90 jitter + one snapshot interval as safety margin.
  // Using smoothedRttMs (not raw pingMs) avoids reacting to individual spike RTTs.
  const target = smoothedRttMs * 0.5 + pingJitterMs * 1.5 + SNAPSHOT_INTERVAL_MS;
  const clamped = Math.max(MIN_INTERP_DELAY_MS, Math.min(MAX_INTERP_DELAY_MS, target));
  // Grow fast when network worsens, shrink slowly when it recovers.
  const alpha = clamped > adaptiveInterpDelayMs ? 0.20 : 0.03;
  adaptiveInterpDelayMs += (clamped - adaptiveInterpDelayMs) * alpha;
}

function estimatedServerTime(): number {
  return Date.now() + serverTimeOffsetMs;
}

function reqChunks(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || !localPlayer) return;
  const window = currentChunkWindow();
  if (!window) return;
  for (let cy = window.min; cy <= window.max; cy++) {
    if (!loadedChunks.has(cy)) ws.send(JSON.stringify({ type: "requestChunk", chunkY: cy }));
  }
}

// ── Reconciliation & remote interpolation ────────────────────────────────────

function reconcileLocalPlayer(ss: PlayerState, lastSeq: number): void {
  if (!localPlayer) { localPlayer = clonePlayerState(ss); snapLocalVisualToSimulation(); cameraSnap = true; return; }
  const healthDelta = localPlayer.health - ss.health;
  if (healthDelta > 0) {
    damageFeedback(ss.position.x + PLAYER_WIDTH / 2, ss.position.y + PLAYER_HEIGHT * 0.45, healthDelta);
  }
  if (lastSeq < 0) {
    if (Math.hypot(ss.position.x - localPlayer.position.x, ss.position.y - localPlayer.position.y) > RECONCILIATION_TOLERANCE_PX * 4)
      { localPlayer = clonePlayerState(ss); snapLocalVisualToSimulation(); cameraSnap = true; }
    resetLocalPrediction();
    return;
  }
  const idx = predBuf.findIndex((e) => e.seq === lastSeq);
  if (idx < 0) { localPlayer = clonePlayerState(ss); snapLocalVisualToSimulation(); resetLocalPrediction(); cameraSnap = true; return; }
  const pred = predBuf[idx]; if (!pred) return;
  const correction = Math.hypot(ss.position.x - pred.state.position.x, ss.position.y - pred.state.position.y);
  if (correction > RECONCILIATION_TOLERANCE_PX) {
    const snapVisual = correction > LOCAL_VISUAL_SNAP_THRESHOLD_PX || ss.invulnerable > 0;
    localPlayer = clonePlayerState(ss);
    for (let i = idx + 1; i < predBuf.length; i++) {
      const e = predBuf[i]; if (!e) continue;
      const { player: next } = stepPlayer(localPlayer, e.input, tileMap, PHYSICS_STEP_SECONDS);
      localPlayer = next;
    }
    if (snapVisual) snapLocalVisualToSimulation();
  }
  predBuf.splice(0, idx + 1);
}

function updateRemotePlayer(s: PlayerState, serverTime: number): void {
  let e = remotePlayers.get(s.id);
  if (!e) {
    e = createRemoteEntry(s, playerNames.get(s.id) ?? "?", serverTime);
    e.states.length = 0;
    remotePlayers.set(s.id, e);
  }
  e.states.push({ state: s, t: serverTime });
  if (e.states.length > 20) e.states.shift();
}

function interpRemotes(): void {
  const rt = estimatedServerTime() - adaptiveInterpDelayMs;
  // Adaptive extrapolation cap scales with RTT so high-ping clients project further.
  const extrapCapMs = Math.max(80, Math.min(pingMs * 0.5 + SNAPSHOT_INTERVAL_MS, 250));

  for (const e of remotePlayers.values()) {
    const { states } = e;
    if (states.length === 0) continue;
    if (states.length === 1) { e.current = states[0]!.state; continue; }
    const first = states[0]!;
    const last  = states[states.length - 1]!;

    if (rt <= first.t) { e.current = first.state; continue; }

    if (rt >= last.t) {
      // Physics-based dead-reckoning: run shared stepPlayer() for the missing time.
      // This correctly applies gravity and collisions instead of naive linear drift.
      const extrapolateMs = Math.min(rt - last.t, extrapCapMs);
      const steps = Math.round((extrapolateMs / 1000) / PHYSICS_STEP_SECONDS);
      let extState = last.state;
      const dri: PlayerInput = {
        left:         last.state.velocity.x < -10,
        right:        last.state.velocity.x >  10,
        jumpPressed:  false,
        jumpHeld:     last.state.velocity.y < 0,
        drop:         false,
        kick:         false,
        sequence:     0,
      };
      for (let i = 0; i < Math.min(steps, 8); i++) {
        extState = stepPlayer(extState, dri, tileMap, PHYSICS_STEP_SECONDS).player;
      }
      e.current = extState;
      continue;
    }

    // Standard linear interpolation between two bracketing snapshots.
    let bf = first, af = last;
    for (let i = 0; i < states.length - 1; i++) {
      if (states[i]!.t <= rt && states[i + 1]!.t >= rt) { bf = states[i]!; af = states[i + 1]!; break; }
    }
    const span = af.t - bf.t;
    const t = span > 0 ? Math.min(1, (rt - bf.t) / span) : 1;
    e.current = {
      ...af.state,
      position: {
        x: bf.state.position.x + (af.state.position.x - bf.state.position.x) * t,
        y: bf.state.position.y + (af.state.position.y - bf.state.position.y) * t,
      },
    };
  }
}

// Draw a small pixel-art crown above a player position
function drawCrown(g: Graphics, cx: number, cy: number, color: number): void {
  // Base band
  g.rect(cx - 5, cy - 2, 10, 4).fill(PAL.coinGold);
  g.rect(cx - 5, cy - 2, 10, 1).fill(PAL.coinGlow);
  // Three points
  g.rect(cx - 5, cy - 6, 2, 4).fill(PAL.coinGold);
  g.rect(cx - 1, cy - 8, 2, 6).fill(PAL.coinGold);
  g.rect(cx + 3, cy - 6, 2, 4).fill(PAL.coinGold);
  // Gem on top middle point
  g.rect(cx, cy - 8, 1, 2).fill(color);
  // Dark outline
  g.rect(cx - 6, cy - 9, 1, 8).fill({ color: PAL.uiInk, alpha: 0.5 });
  g.rect(cx + 5,  cy - 9, 1, 8).fill({ color: PAL.uiInk, alpha: 0.5 });
}

// ── Draw actors ───────────────────────────────────────────────────────────────

function drawActors(): void {
  interpRemotes();

  // Find leader (highest world height = lowest y position)
  let leaderY = Infinity, leaderId: string | null = null;
  if (localPlayer && localPlayerId) {
    leaderY = localPlayer.position.y;
    leaderId = localPlayerId;
  }
  for (const [pid, e] of remotePlayers) {
    if (e.current.position.y < leaderY) { leaderY = e.current.position.y; leaderId = pid; }
  }

  for (const [pid, e] of remotePlayers) {
    const col = PLAYER_COLORS[e.colorIndex % PLAYER_COLORS.length]!;
    const characterId = characterForRemote(e.colorIndex);
    e.sprite.visible = hasAsset("playerExplorer") && !(e.current.invulnerable > 0 && Math.floor(elapsedMs / 80) % 2 === 1);
    if (hasCharacterAnimationAssets(characterId)) e.sprite.texture = playerAnimationTexture(e.current, elapsedMs, characterId) ?? assetTexture(fallbackPlayerAnimationAsset(e.current, elapsedMs));
    e.sprite.x = Math.round(e.current.position.x + PLAYER_WIDTH / 2);
    e.sprite.y = Math.round(e.current.position.y + PLAYER_HEIGHT + 2);
    e.sprite.scale.x = (e.current.facing < 0 ? -1 : 1) * playerSpriteScale();
    e.sprite.scale.y = playerSpriteScale();
    e.sprite.tint = 0xffffff;
    drawPlayerInto(e.gfx, e.current, col, elapsedMs);
    e.label.x = Math.round(e.current.position.x + PLAYER_WIDTH / 2 - e.label.width / 2);
    e.label.y = Math.round(e.current.position.y - 16);
    e.crownSprite.visible = hasAsset("crown") && pid === leaderId;
    e.crownSprite.x = Math.round(e.current.position.x + PLAYER_WIDTH / 2);
    e.crownSprite.y = Math.round(e.current.position.y - 10);
    if (pid === leaderId && !hasAsset("crown")) drawCrown(e.gfx, Math.round(e.current.position.x + PLAYER_WIDTH / 2), Math.round(e.current.position.y) - 12, col);
  }

  if (localPlayer) {
    const renderPos = getLocalRenderPosition();
    const renderState = renderPos ? { ...localPlayer, position: renderPos } : localPlayer;
    localSprite.visible = hasAsset("playerExplorer") && !(renderState.invulnerable > 0 && Math.floor(elapsedMs / 80) % 2 === 1);
    if (hasPlayerAnimationAssets()) localSprite.texture = playerAnimationTexture(renderState, elapsedMs) ?? assetTexture(fallbackPlayerAnimationAsset(renderState, elapsedMs));
    localSprite.x = Math.round(renderState.position.x + PLAYER_WIDTH / 2);
    localSprite.y = Math.round(renderState.position.y + PLAYER_HEIGHT + 2);
    localSprite.scale.x = (renderState.facing < 0 ? -1 : 1) * playerSpriteScale();
    localSprite.scale.y = playerSpriteScale();
    localSprite.tint = 0xffffff;
    drawPlayerInto(localGfx, renderState, PLAYER_COLORS[0]!, elapsedMs);
    localCrownSprite.visible = hasAsset("crown") && localPlayerId === leaderId;
    localCrownSprite.x = Math.round((renderPos?.x ?? localPlayer.position.x) + PLAYER_WIDTH / 2);
    localCrownSprite.y = Math.round((renderPos?.y ?? localPlayer.position.y) - 10);
    if (localPlayerId === leaderId && !hasAsset("crown"))
      drawCrown(localGfx, Math.round((renderPos?.x ?? localPlayer.position.x) + PLAYER_WIDTH / 2), Math.round(renderPos?.y ?? localPlayer.position.y) - 12, PLAYER_COLORS[0]!);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

for (let cy = 0; cy < INITIAL_CHUNKS_TO_LOAD; cy++) loadChunk(cy);
respawnLocal();
joinBtn.addEventListener("click", () => connectRoom(nameInput.value.trim() || "Explorer"));

// ── Ticker ────────────────────────────────────────────────────────────────────

pixi.ticker.add((ticker) => {
  const dtMs = ticker.deltaMS;
  const dt   = Math.min(dtMs / 1000, 1 / 30);
  elapsedMs += dtMs;
  const tSec  = elapsedMs / 1000;
  const scale = getScale();

  ensureChunksAhead();
  reqChunks();
  maybePing();
  updateAdaptiveInterpDelay();
  updateParticles(dt);
  updateMidMountainCrumble(dt);
  updateBiomeFlutters(tSec);
  updateProceduralLianas(tSec);
  updateProceduralFlora(tSec);
  spawnAmbientParticles(dt);
  spawnFallStreaks(dt);
  updateHazardTelegraphs(tSec);
  updateJumpPadAnims(tSec);
  updateRelicAnims(tSec);
  updatePortals(tSec);
  updateNotifications(dt);

  // Slow horizontal cloud drift — rebuild when offset exceeds screen width
  cloudDriftFar   += dt * 6;
  cloudDriftMid   += dt * 11;
  cloudDriftFront += dt * 18;
  if (cloudDriftFar > pixi.screen.width + 80) {
    cloudDriftFar = 0; cloudDriftMid = 0; cloudDriftFront = 0;
    buildSkyStatic(pixi.screen.width, pixi.screen.height);
  }

  if (localPlayer && shouldPredictLocalMovement()) {
    const frameInput = captureInput();
    queuedJumpPressed = queuedJumpPressed || frameInput.jumpPressed;
    queuedKickPressed = queuedKickPressed || frameInput.kick;
    predictionAccumulatorSeconds = Math.min(
      predictionAccumulatorSeconds + dt,
      MAX_PREDICTION_ACCUMULATOR_SECONDS
    );

    let predictionSteps = 0;
    while (
      localPlayer &&
      predictionSteps < MAX_PREDICTION_STEPS_PER_FRAME &&
      predictionAccumulatorSeconds + PREDICTION_STEP_EPSILON >= PHYSICS_STEP_SECONDS
    ) {
      predictionAccumulatorSeconds -= PHYSICS_STEP_SECONDS;
      predictionSteps++;

      const inp = createPredictionInput(frameInput);
      const wasGrounded = localPlayer.grounded;
      const wasVelY = localPlayer.velocity.y;
      const wasHealth = localPlayer.health;
      const wasKickPhase = localPlayer.kickPhase;
      const willJump = inp.jumpPressed && (localPlayer.grounded || localPlayer.coyoteTimer > 0);
      const { player: next } = stepPlayer(localPlayer, inp, tileMap, PHYSICS_STEP_SECONDS);
      const hitJumpPad = applyLocalJumpPads(next);

      if (willJump && wasGrounded) jumpDust(next.position.x + PLAYER_WIDTH / 2, next.position.y + PLAYER_HEIGHT, next.facing);
      if (hitJumpPad && elapsedMs - lastLocalJumpPadFxMs > 250) {
        lastLocalJumpPadFxMs = elapsedMs;
        jumpPadFeedback(next.position.x + PLAYER_WIDTH / 2, next.position.y + PLAYER_HEIGHT, 5);
      }

      const justLanded = !wasGrounded && next.grounded && wasVelY > 55;
      if (justLanded) {
        landDust(next.position.x + PLAYER_WIDTH / 2, next.position.y + PLAYER_HEIGHT, wasVelY);
        triggerShake(wasVelY > 200 ? 3 : 1.5, wasVelY > 200 ? 2.5 : 1.2);
      }

      if (wasKickPhase !== "active" && next.kickPhase === "active") {
        kickSpark(
          next.position.x + (next.facing > 0 ? PLAYER_WIDTH + 4 : -4),
          next.position.y + PLAYER_HEIGHT * 0.7,
          next.facing, PLAYER_COLORS[0]!
        );
      }

      if (next.health < wasHealth) {
        damageFeedback(next.position.x + PLAYER_WIDTH / 2, next.position.y + PLAYER_HEIGHT * 0.45, wasHealth - next.health);
      }

      if (isPlayerDead(next)) {
        burst(next.position.x + PLAYER_WIDTH / 2, next.position.y, PAL.hazardRed);
        localPlayer = next;
        respawnLocal();
        break;
      }

      localPlayer = next;
      if (predBuf.length >= 120) predBuf.shift();
      predBuf.push({ seq: inp.sequence, input: inp, state: clonePlayerState(next) });
      sendInput(inp);
    }
  } else {
    jumpEdge = false;
    kickEdge = false;
    queuedJumpPressed = false;
    queuedKickPressed = false;
    predictionAccumulatorSeconds = 0;
  }

  updateLocalVisualPosition(dt);
  updateCamera(dt, scale);
  drawActors();
  updateHud(tSec);
  updateDebug();
});
