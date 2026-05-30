import { Application, Assets, Container, Graphics, Sprite, Text, Texture, TextureStyle } from "pixi.js";
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
const CHUNKS_KEEP_BEHIND    = 2;     // chunks to keep below player before culling

const ASSET_URLS = {
  bgMountainPanorama: "/assets/environment/backgrounds/mountain_panorama.png",
  bgMountainWide: "/assets/environment/backgrounds/mountain_wide.png",
  bgMountainWide2: "/assets/environment/backgrounds/mountain_wide_alt.png",
  bgMountainTall: "/assets/environment/backgrounds/mountain_tall.png",
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
  decorRopeGateWood: "/assets/environment/decorations/rope_gate_wood.png",
  decorRopeGateLit: "/assets/environment/decorations/rope_gate_lit.png",
  decorRopeGateIce: "/assets/environment/decorations/rope_gate_ice.png",
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
  floatingIsland: "/assets/environment/platforms/platform_moss_top_inner.png",
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
  mossPlatformRoots: "/assets/environment/platforms/platform_moss_bottom_inner.png",
  mossPlatformRunes: "/assets/environment/platforms/platform_stone_body_inner.png",
  mossPlatform: "/assets/environment/platforms/platform_moss_top_inner.png",
  mossPlatformCracked: "/assets/environment/platformVariants/platform_crumble_top_inner.png",
  mossPlatformOverhang: "/assets/environment/platforms/platform_moss_outer_left.png",
  mossPlatformFlowers: "/assets/environment/platforms/platform_moss_top_inner.png",
  mushroomCluster: "/assets/environment/vegetation/mushroom_cluster_1.png",
  pebbleCluster: "/assets/environment/vegetation/pebble_cluster_1.png",
  rockCap: "/assets/environment/rocks/stone_cap_1.png",
  rockCluster: "/assets/environment/rocks/rock_cluster_plain_1.png",
  rockClusterMoss: "/assets/environment/rocks/rock_cluster_moss_1.png",
  rockSpire: "/assets/environment/rocks/rock_spire_1.png",
  midMountainPineCap: "/assets/environment/midMountains/pine_cap.png",
  midMountainPineBody: "/assets/environment/midMountains/pine_body.png",
  midMountainPineLeft: "/assets/environment/midMountains/pine_left.png",
  midMountainPineRight: "/assets/environment/midMountains/pine_right.png",
  midMountainPineBottom: "/assets/environment/midMountains/pine_bottom.png",
  midMountainCloudCap: "/assets/environment/midMountains/cloud_cap.png",
  midMountainCloudBody: "/assets/environment/midMountains/cloud_body.png",
  midMountainCloudLeft: "/assets/environment/midMountains/cloud_left.png",
  midMountainCloudRight: "/assets/environment/midMountains/cloud_right.png",
  midMountainCloudBottom: "/assets/environment/midMountains/cloud_bottom.png",
  midMountainSnowCap: "/assets/environment/midMountains/snow_cap.png",
  midMountainSnowBody: "/assets/environment/midMountains/snow_body.png",
  midMountainSnowLeft: "/assets/environment/midMountains/snow_left.png",
  midMountainSnowRight: "/assets/environment/midMountains/snow_right.png",
  midMountainSnowBottom: "/assets/environment/midMountains/snow_bottom.png",
  midMountainFrozenCap: "/assets/environment/midMountains/frozen_cap.png",
  midMountainFrozenBody: "/assets/environment/midMountains/frozen_body.png",
  midMountainFrozenLeft: "/assets/environment/midMountains/frozen_left.png",
  midMountainFrozenRight: "/assets/environment/midMountains/frozen_right.png",
  midMountainFrozenBottom: "/assets/environment/midMountains/frozen_bottom.png",
  midMountainSummitCap: "/assets/environment/midMountains/summit_cap.png",
  midMountainSummitBody: "/assets/environment/midMountains/summit_body.png",
  midMountainSummitLeft: "/assets/environment/midMountains/summit_left.png",
  midMountainSummitRight: "/assets/environment/midMountains/summit_right.png",
  midMountainSummitBottom: "/assets/environment/midMountains/summit_bottom.png",
  snowPlatform: "/assets/environment/platformVariants/platform_snow_top_inner.png",
  snowIciclePlatform: "/assets/environment/platformVariants/platform_snow_bottom_inner.png",
  frozenPlatform: "/assets/environment/platformVariants/platform_ice_top_inner.png",
  iceDarkPlatform: "/assets/environment/platformVariants/platform_ice_body_inner.png",
  summitPlatform: "/assets/environment/platformVariants/platform_summit_top_inner.png",
  summitGoldPlatform: "/assets/environment/platformVariants/platform_summit_body_inner.png",
  crumblingPlatform: "/assets/environment/platformVariants/platform_crumble_top_inner.png",
  greenTrianglePlatform: "/assets/environment/platforms/platform_moss_bottom_inner.png",
  mossThinPlatform: "/assets/environment/platforms/platform_moss_top_inner.png",
  stoneBrokenPlatform: "/assets/environment/platforms/platform_stone_top_inner.png",
  tallPillar: "/assets/environment/platforms/platform_stone_body_inner.png",
  brokenCliff: "/assets/environment/platforms/platform_stone_bottom_inner.png",
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
  jumpPad: "/assets/environment/relicShrines/jump_pad_1.png",
  climbingChain: "/assets/environment/ladders/climbing_chain.png",
  relicShrine: "/assets/environment/relicShrines/relic_shrine_1.png",
  ancientBeacon: "/assets/environment/relicShrines/ancient_beacon_1.png",
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
  portalArch: "/assets/environment/effects/portal_arch_1.png",
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
  stoneLedge: "/assets/environment/platforms/platform_stone_top_inner.png",
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

type MidMountainTileRole = "cap" | "body" | "left" | "right" | "bottom";
type PlatformPartRole =
  | "top_left" | "top_inner" | "top_right"
  | "body_left" | "body_inner" | "body_right"
  | "bottom_left" | "bottom_inner" | "bottom_right"
  | "outer_left" | "outer_right";

function midMountainTileAsset(biome: BiomeId, role: MidMountainTileRole): AssetKey {
  const keysByBiome: Record<BiomeId, Record<MidMountainTileRole, AssetKey>> = {
    pineValley: {
      cap: "midMountainPineCap",
      body: "midMountainPineBody",
      left: "midMountainPineLeft",
      right: "midMountainPineRight",
      bottom: "midMountainPineBottom",
    },
    cloudRidge: {
      cap: "midMountainCloudCap",
      body: "midMountainCloudBody",
      left: "midMountainCloudLeft",
      right: "midMountainCloudRight",
      bottom: "midMountainCloudBottom",
    },
    snowfallCliffs: {
      cap: "midMountainSnowCap",
      body: "midMountainSnowBody",
      left: "midMountainSnowLeft",
      right: "midMountainSnowRight",
      bottom: "midMountainSnowBottom",
    },
    frozenSpires: {
      cap: "midMountainFrozenCap",
      body: "midMountainFrozenBody",
      left: "midMountainFrozenLeft",
      right: "midMountainFrozenRight",
      bottom: "midMountainFrozenBottom",
    },
    celestialSummit: {
      cap: "midMountainSummitCap",
      body: "midMountainSummitBody",
      left: "midMountainSummitLeft",
      right: "midMountainSummitRight",
      bottom: "midMountainSummitBottom",
    },
  };
  return keysByBiome[biome][role];
}

function midMountainTint(biome: BiomeId): number {
  if (biome === "pineValley") return 0x5a6a64;
  if (biome === "cloudRidge") return 0x526879;
  if (biome === "snowfallCliffs") return 0x546b80;
  if (biome === "frozenSpires") return 0x4d6684;
  return 0x626878;
}

function midMountainAlpha(biome: BiomeId): number {
  if (biome === "pineValley") return 0.48;
  if (biome === "cloudRidge") return 0.5;
  if (biome === "snowfallCliffs") return 0.52;
  if (biome === "frozenSpires") return 0.54;
  return 0.5;
}

function platformPartAsset(biome: BiomeId, role: PlatformPartRole, seed = 0): AssetKey {
  const theme: "moss" | "stone" | "snow" | "ice" | "summit" | "crumble" =
    biome === "pineValley" ? "moss" :
    biome === "cloudRidge" ? "stone" :
    biome === "snowfallCliffs" ? (seed % 11 === 0 ? "crumble" : "snow") :
    biome === "frozenSpires" ? (seed % 9 === 0 ? "crumble" : "ice") :
    "summit";
  const folder = theme === "moss" || theme === "stone" ? "environment/platforms" : "environment/platformVariants";
  return `${folder}/platform_${theme}_${role}.png`;
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
  sprite: Sprite | null;
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
  if (loadedChunks.has(cy)) return;
  const chunk = generateVerticalChunk({ seed: serverSeed, chunkY: cy });
  loadedChunks.set(cy, chunk);
  renderChunk(chunk);
}

function ensureChunksAhead(): void {
  if (!localPlayer) return;
  const pTileY  = Math.floor(localPlayer.position.y / TILE_SIZE);
  const pChunkY = Math.max(0, -Math.floor(pTileY / CHUNK_HEIGHT_TILES));
  for (let cy = 0; cy <= pChunkY + 3; cy++) loadChunk(cy);

  // Cull chunks that are too far below — they will never be needed again.
  const disposeBelow = Math.max(0, pChunkY - CHUNKS_KEEP_BEHIND);
  if (disposeBelow > 0) {
    for (const cy of [...loadedChunks.keys()]) {
      if (cy < disposeBelow) {
        destroyChunkVisuals(cy);
        loadedChunks.delete(cy);
      }
    }
  }
}

function regenerateWorld(): void {
  clearWorldChunks();
  for (let cy = 0; cy <= 3; cy++) loadChunk(cy);
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

  // Mountain panorama — cover the screen, bottom-anchored so the valley shows at
  // ground level and snowy peaks emerge as the player climbs. Falls back to the
  // AI ruins panorama if the mountain asset hasn't loaded yet.
  aiPanoramaBack.removeChildren();
  if (hasAsset("bgMountainPanorama")) {
    const mSprite = makeSprite("bgMountainPanorama");
    const texW = Math.max(1, mSprite.texture.width);
    const texH = Math.max(1, mSprite.texture.height);
    // Scale so the image covers the full screen width.
    const mScale = Math.max(sw / texW, sh / texH);
    const mW = texW * mScale;
    const mH = texH * mScale;
    mSprite.scale.set(mScale);
    mSprite.x = Math.round((sw - mW) / 2);
    // Anchor at bottom: valley floor sits at the ground-level screen bottom.
    mSprite.y = Math.round(sh - mH);
    mSprite.alpha = 1;
    aiPanoramaBack.addChild(mSprite);
  } else {
    addCoverBackdrop(aiPanoramaBack, "aiForestRuinsPanorama", sw, sh, 0.42);
  }

  skyArchesBack.removeChildren();
  addWideBackdrop(skyArchesBack, "bgSkyArches", sw, sh * 0.28, 0.12);
  for (const [i, key] of uniqueAssetKeys(folderAssetKeys("environment/mountainBackgrounds")).entries()) {
    addWideBackdrop(skyArchesBack, key, sw, sh * (0.18 + i * 0.12), 0.1);
  }

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
      island.scale.set(sc);
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
      cloud.scale.set(0.38 + (i % 3) * 0.08);
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
      cloud.scale.set(0.72 + (i % 3) * 0.12);
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
      cloud.scale.set(1.05 + (i % 2) * 0.25);
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
  const placed = new Map<string, { sprite: Sprite; priority: number }>();

  const roleForMass = (offset: number, half: number, isTop: boolean, isBottom: boolean): MidMountainTileRole => {
    if (offset === -half) return "left";
    if (offset === half) return "right";
    if (isTop) return "cap";
    if (isBottom) return "bottom";
    return "body";
  };

  const placeTile = (lx: number, ly: number, role: MidMountainTileRole, priority = 0): void => {
    if (lx < 0 || lx >= chunk.width || ly < 0 || ly >= chunk.height) return;
    const key = midMountainTileAsset(biome, role);
    if (!hasAsset(key)) return;
    const placedKey = `${lx}:${ly}`;
    const existing = placed.get(placedKey);
    if (existing && existing.priority >= priority) return;
    if (existing) {
      target.removeChild(existing.sprite);
      existing.sprite.destroy();
    }
    const tile = makeSprite(key);
    tile.x = lx * TILE_SIZE;
    tile.y = (baseTileY + ly) * TILE_SIZE;
    tile.alpha = midMountainAlpha(biome);
    tile.tint = midMountainTint(biome);
    tile.zIndex = -6 + priority;
    target.addChild(tile);
    placed.set(placedKey, { sprite: tile, priority });
  };

  // A quiet second-layer spine gives depth without reading as playable terrain.
  // Keep it narrower and lower-contrast than the foreground tile platforms.
  const phase = chunk.chunkY * 0.83;
  for (let ly = 0; ly < chunk.height; ly++) {
    const sway = Math.round(Math.sin(phase + ly * 0.42) * 2.2 + Math.sin(phase * 1.7 + ly * 0.19) * 1.1);
    const center = Math.round(chunk.width * 0.5) + sway;
    const half = 2 + ((chunk.chunkY + Math.floor(ly / 3)) % 3 === 0 ? 1 : 0);
    for (let ox = -half; ox <= half; ox++) {
      placeTile(center + ox, ly, roleForMass(ox, half, ly === 0, ly === chunk.height - 1), 0);
    }
  }

  // Sparse buttresses under major platforms imply support. They start below
  // the gameplay surface so landing edges stay visually dominant.
  for (const platform of chunk.platforms) {
    if (platform.width < 5) continue;
    const seed = platformSeed(chunk, platform, 601);
    if (seed % 3 === 0) continue;
    const center = Math.round(platform.x + platform.width / 2);
    const depth = Math.min(6, Math.max(3, 2 + (seed % 5)));
    const half = platform.width >= 8 ? 2 : 1;
    for (let dy = 1; dy <= depth; dy++) {
      const ly = platform.y + dy;
      if (ly >= chunk.height) break;
      const rowHalf = Math.max(1, half - Math.floor(dy / 4));
      for (let ox = -rowHalf; ox <= rowHalf; ox++) {
        placeTile(center + ox, ly, roleForMass(ox, rowHalf, false, dy === depth), 1);
      }
    }
  }
}

function composePlatformPartLayer(chunk: GeneratedChunk, target: Container, biome: BiomeId): void {
  const baseTileY = chunk.worldTileY;
  const addPart = (key: AssetKey, tileX: number, tileY: number, zIndex: number): void => {
    if (!hasAsset(key)) return;
    const part = makeSprite(key);
    part.x = tileX * TILE_SIZE;
    part.y = tileY * TILE_SIZE;
    part.zIndex = zIndex;
    part.alpha = 0.98;
    target.addChild(part);
  };

  for (const platform of chunk.platforms) {
    const seed = (chunk.chunkY * 92821 + platform.x * 3701 + platform.y * 809 + platform.width * 97) >>> 0;
    const visualDepth =
      biome === "pineValley" ? 2 :
      biome === "cloudRidge" ? 2 :
      biome === "snowfallCliffs" ? 2 :
      biome === "frozenSpires" ? 3 :
      2;

    const roleFor = (row: "top" | "body" | "bottom", localX: number): PlatformPartRole => {
      if (platform.width <= 1) return `${row}_inner` as PlatformPartRole;
      if (localX === 0) return `${row}_left` as PlatformPartRole;
      if (localX === platform.width - 1) return `${row}_right` as PlatformPartRole;
      return `${row}_inner` as PlatformPartRole;
    };

    const topTileY = baseTileY + platform.y;
    for (let lx = 0; lx < platform.width; lx++) {
      const tileX = platform.x + lx;
      addPart(platformPartAsset(biome, roleFor("top", lx), seed), tileX, topTileY, 2);
    }

    if (visualDepth > 1) {
      for (let dy = 1; dy < visualDepth; dy++) {
        const row: "body" | "bottom" = dy === visualDepth - 1 ? "bottom" : "body";
        for (let lx = 0; lx < platform.width; lx++) {
          const tileX = platform.x + lx;
          addPart(platformPartAsset(biome, roleFor(row, lx), seed), tileX, topTileY + dy, 1);
        }
      }
    }

    if (platform.x > 0) {
      addPart(platformPartAsset(biome, "outer_left", seed), platform.x - 1, topTileY, 1);
    }
    if (platform.x + platform.width < chunk.width) {
      addPart(platformPartAsset(biome, "outer_right", seed), platform.x + platform.width, topTileY, 1);
    }
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
    return [...common, "environment/snowTrees", "environment/snowTiles", "environment/ruinTiles"];
  }
  return [...common, "environment/relicShrines", "environment/snowTiles", "environment/ruinTiles", "environment/terrainTiles"];
}

function folderChoiceForBiome(biome: BiomeId, seed: number): AssetKey | null {
  const folders = biomeDecorationFolders(biome);
  const folder = folders[Math.abs(seed) % folders.length]!;
  const keys = folderAssetKeys(folder);
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
  sprite.scale.set(scale);
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

function chooseAssetFromFolders(folders: string[], seed: number): AssetKey | null {
  const keys = uniqueAssetKeys(folders.flatMap((folder) => folderAssetKeys(folder)));
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
  sprite.scale.set(fitScale * (options.scaleMultiplier ?? 1));
  sprite.alpha = options.alpha ?? 0.86;
  sprite.zIndex = options.zIndex ?? 2;
  if (typeof options.tint === "number") sprite.tint = options.tint;
  if (options.addBlend) sprite.blendMode = "add";
  target.addChild(sprite);
  return sprite;
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
    return ["environment/snowTrees", "environment/rocks", "environment/ruinTiles", "environment/decorations", "environment/lanterns", "environment/crystals"];
  }
  if (biome === "frozenSpires") {
    return ["environment/snowTrees", "environment/rocks", "environment/decorations", "environment/crystals", "environment/particleEffects"];
  }
  return ["environment/relicShrines", "environment/decorations", "environment/crystals", "environment/structures", "environment/lights", "environment/banners"];
}

function biomeSmallPropFolders(biome: BiomeId): string[] {
  if (biome === "pineValley") return ["environment/flora", "environment/vegetation", "environment/rocks"];
  if (biome === "cloudRidge") return ["environment/flora", "environment/rocks", "environment/clouds", "environment/crystals"];
  if (biome === "snowfallCliffs") return ["environment/rocks", "environment/snowTrees", "environment/lanterns", "environment/crystals"];
  if (biome === "frozenSpires") return ["environment/rocks", "environment/crystals", "environment/particleEffects", "environment/hazards"];
  return ["environment/crystals", "environment/decorations", "environment/lights", "environment/banners"];
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
  const mountainKeys = uniqueAssetKeys([
    "bgMountainTall",
    "bgMountainWide",
    "bgMountainWide2",
    "bgSkyArches",
    ...folderAssetKeys("environment/mountainBackgrounds"),
  ]);

  if (chunk.chunkY % 2 === 0 && mountainKeys.length > 0) {
    const key = mountainKeys[seed % mountainKeys.length]!;
    const mountain = placeSceneSprite(back, key, WORLD_WIDTH * (0.24 + (seed % 36) / 80), chunkTop + CHUNK_HEIGHT_TILES * TILE_SIZE + 18, seed, {
      maxWidth: 210,
      maxHeight: 150,
      alpha: biome === "pineValley" ? 0.16 : biome === "celestialSummit" ? 0.1 : 0.13,
      zIndex: -8,
      xJitter: 18,
      scaleMultiplier: biome === "celestialSummit" ? 0.82 : 1,
    });
    if (mountain && biome === "celestialSummit") mountain.tint = 0xddefff;
  }

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

  placeLandmark(
    chunk.entry,
    31,
    chooseAssetFromFolders(["environment/banners", "environment/lanterns", "environment/lights"], platformSeed(chunk, chunk.entry, 31)) ??
      chooseAsset(["decorBannerGreen", "decorLanternGold", "lanternCyan"], chunk.chunkY, "lanternCyan"),
    4,
    0.9
  );

  placeLandmark(
    chunk.exit,
    79,
    biome === "celestialSummit"
      ? chooseAsset(["ancientBeacon", "relicShrine", "decorPedestalGold"], platformSeed(chunk, chunk.exit, 79), "relicShrine")
      : chooseAssetFromFolders(["environment/relicShrines", "environment/crystals", "environment/banners"], platformSeed(chunk, chunk.exit, 79)) ??
        chooseAsset(["crystalMarker", "decorPedestalBlue", "decorBannerBlue"], chunk.chunkY, "crystalMarker"),
    3,
    0.82
  );

  for (const platform of chunk.platforms) {
    const seed = platformSeed(chunk, platform, 503);
    const topY = platformTopY(chunk, platform);
    if (platform.width >= 5 && seed % 3 !== 1) {
      const mainKey = chooseAssetFromFolders(mainFolders, seed);
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
      const smallKey = chooseAssetFromFolders(smallFolders, seed >> 2);
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
          const hazard = makeSprite(hazardKey);
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
        const grass = makeSprite("grassClump");
        grass.x = wx + (seed % 5);
        grass.y = wy - 12;
        grass.alpha = 0.9;
        grass.zIndex = 2;
        front.addChild(grass);
      }

      if ((biome === "pineValley" || biome === "cloudRidge") && hasAsset("flowerPatch") && seed % 19 === 0) {
        const flower = makeSprite("flowerPatch");
        flower.x = wx;
        flower.y = wy - 13;
        flower.alpha = 0.92;
        flower.zIndex = 3;
        front.addChild(flower);
      }

      if ((biome === "pineValley" || biome === "cloudRidge") && hasAsset("leafCluster") && seed % 11 === 0) {
        const leaves = makeSprite("leafCluster");
        leaves.x = wx + (seed % 4);
        leaves.y = wy - 14;
        leaves.alpha = 0.84;
        leaves.zIndex = 2;
        front.addChild(leaves);
      }

      if (biome !== "celestialSummit" && hasAsset("vineHanging") && seed % 17 === 0) {
        const vine = makeSprite("vineHanging");
        vine.x = wx + (seed % 6);
        vine.y = wy + TILE_SIZE - 2;
        vine.alpha = 0.78;
        vine.zIndex = 1;
        front.addChild(vine);
      }

      if (hasAsset("pebbleCluster") && seed % 29 === 0) {
        const pebbles = makeSprite("pebbleCluster");
        pebbles.x = wx + (seed % 6);
        pebbles.y = wy + 3;
        pebbles.alpha = 0.72;
        pebbles.zIndex = 2;
        front.addChild(pebbles);
      }

      if (hasAsset("rockCap") && seed % 89 === 0) {
        const cap = makeSprite("rockCap");
        cap.x = wx - 2;
        cap.y = wy - 9;
        cap.alpha = 0.82;
        cap.zIndex = 2;
        front.addChild(cap);
      }

      if (hasAsset("rockCluster") && seed % 127 === 0 && lx < chunk.width - 3 && canPlaceDecorationSpan(chunk, lx, ly, 3)) {
        const rocks = makeSprite(seed % 2 === 0 && hasAsset("rockClusterMoss") ? "rockClusterMoss" : "rockCluster");
        rocks.x = wx - 6;
        rocks.y = wy - 25;
        rocks.alpha = 0.74;
        rocks.zIndex = 0;
        back.addChild(rocks);
      }

      if (hasAsset("rockSpire") && seed % 193 === 0 && lx < chunk.width - 3 && canPlaceDecorationSpan(chunk, lx, ly, 3)) {
        const spire = makeSprite("rockSpire");
        spire.x = wx - 5;
        spire.y = wy - 27;
        spire.alpha = 0.68;
        spire.zIndex = 0;
        back.addChild(spire);
      }

      if ((biome === "pineValley" || biome === "cloudRidge") && hasAsset("reedGrassWheat") && seed % 31 === 0) {
        const reeds = makeSprite(seed % 3 === 0 && hasAsset("reedGrassYellow") ? "reedGrassYellow" : "reedGrassWheat");
        reeds.x = wx - 3;
        reeds.y = wy - 27;
        reeds.alpha = 0.84;
        reeds.zIndex = 3;
        front.addChild(reeds);
      }

      if ((biome === "pineValley" || biome === "cloudRidge") && hasAsset("wildflowerMixed") && seed % 37 === 0) {
        const flowers = makeSprite(seed % 5 === 0 && hasAsset("wildflowerPink") ? "wildflowerPink" : seed % 7 === 0 && hasAsset("wildflowerYellow") ? "wildflowerYellow" : "wildflowerMixed");
        flowers.x = wx - 3;
        flowers.y = wy - 19;
        flowers.alpha = 0.9;
        flowers.zIndex = 3;
        front.addChild(flowers);
      }

      if (biome === "pineValley" && hasAsset("flowerPink") && seed % 61 === 0) {
        const flower = makeSprite("flowerPink");
        flower.x = wx - 3;
        flower.y = wy - 27;
        flower.alpha = 0.82;
        flower.zIndex = 3;
        front.addChild(flower);
      }

      if (hasAsset("runeStone") && chunk.chunkY >= 8 && seed % 53 === 0) {
        const rune = makeSprite("runeStone");
        rune.x = wx;
        rune.y = wy;
        rune.alpha = 0.86;
        rune.zIndex = 2;
        front.addChild(rune);
      }

      if (hasAsset("signpost") && seed % 83 === 0) {
        const sign = makeSprite("signpost");
        sign.x = wx;
        sign.y = wy - 20;
        sign.alpha = 0.9;
        sign.zIndex = 3;
        front.addChild(sign);
      }

      if (hasAsset("fence") && seed % 97 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const fence = makeSprite("fence");
        fence.x = wx;
        fence.y = wy - 12;
        fence.alpha = 0.86;
        fence.zIndex = 2;
        front.addChild(fence);
      }

      if (biome !== "celestialSummit" && hasAsset("ropeBridge") && seed % 181 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 3)) {
        const bridge = makeSprite("ropeBridge");
        bridge.x = wx;
        bridge.y = wy - 8;
        bridge.alpha = 0.72;
        bridge.zIndex = 1;
        front.addChild(bridge);
      }

      if (hasAsset("lanternCyan") && chunk.chunkY >= 3 && seed % 67 === 0) {
        const lantern = makeSprite("lanternCyan");
        lantern.x = wx;
        lantern.y = wy - 22;
        lantern.alpha = 0.9;
        lantern.zIndex = 4;
        front.addChild(lantern);
      }

      if (hasAsset("stump") && seed % 109 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const stump = makeSprite("stump");
        stump.x = wx - 4;
        stump.y = wy - 20;
        stump.alpha = 0.86;
        stump.zIndex = 2;
        front.addChild(stump);
      }

      if (hasAsset("mushroomCluster") && seed % 43 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const mushrooms = makeSprite("mushroomCluster");
        mushrooms.x = wx - 3;
        mushrooms.y = wy - 17;
        mushrooms.alpha = 0.88;
        mushrooms.zIndex = 3;
        front.addChild(mushrooms);
      }

      if (hasAsset("ruinArchFragment") && seed % 113 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const arch = makeSprite("ruinArchFragment");
        arch.x = wx - 6;
        arch.y = wy - 28;
        arch.alpha = 0.58;
        arch.zIndex = 0;
        back.addChild(arch);
      }

      if (hasAsset("ruinColumn") && seed % 157 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const column = makeSprite("ruinColumn");
        column.x = wx - 4;
        column.y = wy - 36;
        column.alpha = 0.78;
        column.zIndex = 1;
        front.addChild(column);
      }

      if (hasAsset("crystalMarker") && chunk.chunkY >= 4 && seed % 131 === 0) {
        const crystal = makeSprite("crystalMarker");
        crystal.x = wx;
        crystal.y = wy - 20;
        crystal.alpha = 0.86;
        crystal.zIndex = 3;
        front.addChild(crystal);
      }

      if (seed % 137 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const decorChoices: AssetKey[] =
          biome === "pineValley" ? ["decorBannerGreen", "decorSignWood", "decorLanternGold", "decorRopePosts", "decorFlowerCrystalGreen", "decorCampfireWarm", "decorTripodRed", "decorRopeGateWood", "decorCrateStackWood", "decorBarrelStackWood", "decorSmallShrineWood", "decorFlowerPostPink"] :
          biome === "cloudRidge" ? ["decorBannerBlue", "decorLanternBlue", "decorPedestalBlue", "decorSignRune", "decorRopeLanterns", "decorCampfireBlue", "decorTripodBlue", "decorRopeGateLit", "decorCrateStackRune", "decorCrystalTotemBlue", "decorFlowerPostWhite"] :
          biome === "snowfallCliffs" ? ["decorPedestalBlue", "decorBrazierBlue", "decorFlowerCrystalBlue", "decorSkeletonMarker", "decorCampfireBlue", "decorRopeGateIce", "decorStatueSnow", "decorSmallShrineSnow", "decorSnowLampBlue", "decorCrystalTotemBlue", "decorFlowerPostBlue"] :
          biome === "frozenSpires" ? ["decorBrazierBlue", "decorFlowerCrystalPurple", "decorSkeletonMarker", "decorLanternBlue", "decorTripodPurple", "decorRopeGateIce", "decorStatueSnow", "decorSnowLampPurple", "decorCrystalTotemPurple", "decorSmallShrinePurple"] :
          ["decorBannerGold", "decorPedestalGold", "decorBrazierGold", "decorLanternGreen", "decorFlowerCrystalBlue", "decorCampfireGreen", "decorRopeGateLit", "decorStatueStone", "decorSnowLampGold", "decorCrystalTotemGreen", "decorSmallShrineSnow"];
        let decorKey = decorChoices[(seed >> 5) % decorChoices.length]!;
        if (!hasAsset(decorKey)) decorKey = "decorSignWood";
        if (hasAsset(decorKey)) {
          const decor = makeSprite(decorKey);
          const tallDecor = decorKey === "decorBannerBlue" || decorKey === "decorBannerGold" || decorKey === "decorBannerGreen" || decorKey === "decorPedestalBlue" || decorKey === "decorPedestalGreen" || decorKey === "decorPedestalGold" || decorKey === "decorSkeletonMarker" || decorKey === "decorStatueStone" || decorKey === "decorStatueSnow" || decorKey === "decorCrystalTotemBlue" || decorKey === "decorCrystalTotemGreen" || decorKey === "decorCrystalTotemPurple";
          const mediumDecor = decorKey === "decorTripodRed" || decorKey === "decorTripodBlue" || decorKey === "decorTripodPurple" || decorKey === "decorSmallShrineWood" || decorKey === "decorSmallShrineSnow" || decorKey === "decorSmallShrinePurple" || decorKey === "decorSnowLampBlue" || decorKey === "decorSnowLampGold" || decorKey === "decorSnowLampPurple";
          const wideDecor = decorKey === "decorRopePosts" || decorKey === "decorRopeLanterns" || decorKey === "decorRopeGateWood" || decorKey === "decorRopeGateLit" || decorKey === "decorRopeGateIce" || decorKey === "decorSignWood" || decorKey === "decorSignRune";
          decor.x = wx + (wideDecor ? -8 : decorKey.startsWith("decorLantern") ? 2 : -2);
          decor.y = wy - (tallDecor ? 50 : mediumDecor ? 38 : decorKey.startsWith("decorBrazier") || decorKey.startsWith("decorCampfire") ? 30 : decorKey.startsWith("decorFlowerCrystal") || decorKey.startsWith("decorFlowerPost") ? 31 : 25);
          decor.alpha = biome === "celestialSummit" ? 0.88 : 0.82;
          decor.zIndex = 2;
          front.addChild(decor);
        }
      }

      if ((biome === "pineValley" || biome === "cloudRidge") && hasAsset("bush") && seed % 47 === 0 && lx < chunk.width - 2 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const bush = makeSprite("bush");
        bush.x = wx - 6;
        bush.y = wy - 22;
        bush.alpha = 0.86;
        bush.zIndex = 2;
        front.addChild(bush);
      }

      if ((biome === "pineValley" || biome === "cloudRidge" || biome === "snowfallCliffs") && hasAsset("tree") && seed % 139 === 0 && lx > 2 && lx < chunk.width - 4 && canPlaceDecorationSpan(chunk, lx - 1, ly, 4)) {
        const treeKey: AssetKey =
          biome === "snowfallCliffs" && hasAsset("snowTree") ? "snowTree" :
          biome === "cloudRidge" && hasAsset("bentPine") ? "bentPine" :
          "tree";
        const tree = makeSprite(treeKey);
        tree.anchor.set(0.5, 1);
        tree.x = wx + TILE_SIZE / 2;
        tree.y = wy + 6;
        tree.alpha = 0.72;
        tree.zIndex = 0;
        back.addChild(tree);
      }

      if ((biome === "cloudRidge" || biome === "snowfallCliffs") && hasAsset("climbingChain") && seed % 149 === 0) {
        const chain = makeSprite("climbingChain");
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
          const cluster = makeSprite(clusterKey);
          cluster.x = wx - 7;
          cluster.y = wy - 49;
          cluster.alpha = 0.46;
          cluster.zIndex = -1;
          back.addChild(cluster);
        }
      }

      if ((biome === "cloudRidge" || biome === "snowfallCliffs" || biome === "frozenSpires") && hasAsset("tallPillar") && seed % 197 === 0 && lx < chunk.width - 2 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const pillar = makeSprite("tallPillar");
        pillar.x = wx - 8;
        pillar.y = wy - 54;
        pillar.alpha = 0.42;
        pillar.zIndex = -2;
        back.addChild(pillar);
      }

      if ((biome === "snowfallCliffs" || biome === "frozenSpires") && hasAsset("windZone") && seed % 167 === 0) {
        const wind = makeSprite("windZone");
        wind.x = wx - 24;
        wind.y = wy - 36;
        wind.alpha = 0.52;
        wind.zIndex = 5;
        front.addChild(wind);
      }

      if ((biome === "frozenSpires" || biome === "celestialSummit") && hasAsset("rollingBoulder") && seed % 223 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 2)) {
        const boulder = makeSprite("rollingBoulder");
        boulder.x = wx - 4;
        boulder.y = wy - 26;
        boulder.alpha = 0.82;
        boulder.zIndex = 3;
        front.addChild(boulder);
      }

      if (biome === "celestialSummit" && hasAsset("relicShrine") && seed % 257 === 0 && canPlaceDecorationSpan(chunk, lx, ly, 3)) {
        const shrine = makeSprite(seed % 2 === 0 && hasAsset("ancientBeacon") ? "ancientBeacon" : "relicShrine");
        shrine.anchor.set(0.5, 1);
        shrine.x = wx + TILE_SIZE;
        shrine.y = wy + 2;
        shrine.alpha = 0.9;
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

function spawnJumpPadAnim(pad: JumpPadSpawn, worldTileY: number): void {
  if (jumpPadAnims.has(pad.id)) return;
  const container = new Container();
  const aura = new Graphics();
  const sprite = hasAsset("jumpPad") ? makeSprite("jumpPad") : null;
  const worldX = pad.x * TILE_SIZE + TILE_SIZE / 2;
  const worldY = worldTileY * TILE_SIZE + TILE_SIZE / 2;

  container.x = worldX;
  container.y = worldY;
  container.zIndex = 5;
  container.addChild(aura);
  if (sprite) {
    sprite.anchor.set(0.5);
    sprite.y = 1;
    sprite.blendMode = "normal";
    container.addChild(sprite);
  }
  portalLayer.addChild(container);
  jumpPadAnims.set(pad.id, { container, aura, sprite, pad, worldX, worldY });
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
    if (anim.sprite) {
      anim.sprite.y = 2 + Math.sin(tSec * 4.2 + anim.pad.y) * 1.2;
      anim.sprite.scale.set(0.9 + pulse * 0.06);
      anim.sprite.tint = 0xffffff;
    }
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
  container.y = tileY * TILE_SIZE + TILE_SIZE / 2;
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
    a.container.y = a.tileY * TILE_SIZE + TILE_SIZE / 2 + bob;

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
  archSprite: Sprite | null;
  worldX:    number;
  worldY:    number;
  tileW:     number;
  isExit:    boolean;
}
const portalAnims = new Map<number, PortalAnim>(); // keyed by chunkY

function spawnPortalAt(chunkY: number, tileX: number, tileY: number, tileW: number, isExit: boolean): void {
  if (portalAnims.has(chunkY)) return;

  const container = new Container();
  const bodyGfx   = new Graphics();
  const glowGfx   = new Graphics();
  const archSprite = hasAsset("portalArch") ? makeSprite("portalArch") : null;
  if (archSprite) {
    archSprite.anchor.set(0.5, 1);
    archSprite.y = 2;
    container.addChild(glowGfx, archSprite);
  } else {
    container.addChild(bodyGfx, glowGfx);
  }

  const wx = tileX * TILE_SIZE + (tileW * TILE_SIZE) / 2;
  const wy = tileY * TILE_SIZE;
  container.x = wx;
  container.y = wy;
  portalLayer.addChild(container);

  const hw = Math.round((tileW * TILE_SIZE) * 0.40);  // portal half-width
  const ph = isExit ? 32 : 22;  // portal arch height

  if (archSprite) {
    const desiredH = ph + 12;
    const scale = desiredH / 64;
    archSprite.scale.set(scale);
  } else {
    // Static body — ancient stone arch
    // Left pillar
    bodyGfx.rect(-hw - 5, -ph, 5, ph).fill(PAL.stoneDark);
    bodyGfx.rect(-hw - 4, -ph - 1, 4, 3).fill(PAL.stoneWorn); // cap stone
    bodyGfx.rect(-hw - 5, -ph, 1, ph).fill({ color: PAL.stoneLight, alpha: 0.12 }); // pillar highlight
    // Moss on left pillar
    bodyGfx.rect(-hw - 5, -ph + 6, 3, 2).fill(PAL.mossGreen);
    bodyGfx.rect(-hw - 4, -ph + 14, 4, 2).fill(PAL.mossBright);

    // Right pillar
    bodyGfx.rect(hw, -ph, 5, ph).fill(PAL.stoneDark);
    bodyGfx.rect(hw, -ph - 1, 4, 3).fill(PAL.stoneWorn);
    bodyGfx.rect(hw + 4, -ph, 1, ph).fill({ color: PAL.stoneShadow, alpha: 0.18 });
    bodyGfx.rect(hw + 1, -ph + 8, 3, 2).fill(PAL.mossGreen);

    // Lintel (top crossbar)
    bodyGfx.rect(-hw - 5, -ph - 4, hw * 2 + 10, 5).fill(PAL.stoneDark);
    bodyGfx.rect(-hw - 4, -ph - 5, hw * 2 + 8, 2).fill(PAL.stoneWorn);
    // Rune glow on lintel
    bodyGfx.rect(-3, -ph - 4, 6, 3).fill({ color: PAL.runeGlow, alpha: 0.5 });
    if (isExit) {
      bodyGfx.rect(-8, -ph - 4, 4, 3).fill({ color: PAL.runeGlow, alpha: 0.3 });
      bodyGfx.rect(4,  -ph - 4, 4, 3).fill({ color: PAL.runeGlow, alpha: 0.3 });
    }

    // Hanging vines from lintel
    for (let v = 0; v < 3; v++) {
      const vx = -hw + 4 + v * Math.round(hw * 0.7);
      const vlen = 5 + v * 3;
      bodyGfx.rect(vx, -ph + 1, 1, vlen).fill(PAL.mossGreen);
      bodyGfx.rect(vx - 1, -ph + vlen - 2, 3, 1).fill(PAL.canopyMid);
    }
  }

  portalAnims.set(chunkY, { container, bodyGfx, glowGfx, archSprite, worldX: wx, worldY: wy, tileW, isExit });
}

function updatePortals(tSec: number): void {
  for (const a of portalAnims.values()) {
    const g     = a.glowGfx;
    const hw    = Math.round((a.tileW * TILE_SIZE) * 0.40);
    const ph    = a.isExit ? 32 : 22;
    const pulse = Math.sin(tSec * (a.isExit ? 3.5 : 2.5)) * 0.5 + 0.5;
    const col   = a.isExit ? PAL.portalBlue : PAL.uiHighlight;

    g.clear();

    // Glow fill inside arch
    const gAlpha = (a.isExit ? 0.22 : 0.14) + pulse * (a.isExit ? 0.14 : 0.08);
    g.rect(-hw + 1, -ph + 1, hw * 2 - 2, ph - 2).fill({ color: col, alpha: gAlpha });

    // Inner bright column
    const bw = a.isExit ? 6 : 4;
    g.rect(-Math.floor(bw / 2), -ph + 2, bw, ph - 4)
      .fill({ color: col, alpha: 0.18 + pulse * 0.22 });

    // Horizontal scan lines (magical energy)
    for (let r = 0; r < (a.isExit ? 6 : 4); r++) {
      const ry = -ph + 4 + r * Math.round((ph - 6) / (a.isExit ? 6 : 4));
      const scanOffset = Math.sin(tSec * 2.2 + r * 1.1) * (hw * 0.3);
      g.rect(Math.round(scanOffset) - 5, ry, 10, 1)
        .fill({ color: col, alpha: 0.28 + pulse * 0.15 });
    }

    // Orbiting rune dots
    const orbs = a.isExit ? 5 : 3;
    for (let o = 0; o < orbs; o++) {
      const angle = tSec * (a.isExit ? 1.8 : 1.2) + (o * Math.PI * 2) / orbs;
      const r = (hw * 0.55) + pulse * 2;
      const ox = Math.round(Math.cos(angle) * r);
      const oy = Math.round(Math.sin(angle) * r * 0.55 - ph * 0.5);
      g.rect(ox - 1, oy - 1, 2, 2).fill({ color: col, alpha: 0.7 + pulse * 0.3 });
    }

    // Bright center flash on exit portal
    if (a.isExit && pulse > 0.85) {
      g.rect(-2, -Math.round(ph * 0.55), 4, 4).fill({ color: 0xffffff, alpha: (pulse - 0.85) * 5 });
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
          for (let cy = 0; cy <= 3; cy++) loadChunk(cy);
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
  const ci = Math.max(0, -Math.floor(Math.floor(localPlayer.position.y / TILE_SIZE) / CHUNK_HEIGHT_TILES));
  for (let cy = ci; cy <= ci + 3; cy++) if (!loadedChunks.has(cy)) ws.send(JSON.stringify({ type: "requestChunk", chunkY: cy }));
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

for (let cy = 0; cy <= 3; cy++) loadChunk(cy);
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
