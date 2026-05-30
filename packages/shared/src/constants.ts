export const GAME_VERSION = "0.1.0";

export const TILE_SIZE = 16;
export const CHUNK_WIDTH_TILES = 36;
export const CHUNK_HEIGHT_TILES = 18;
export const CHECKPOINT_PORTAL_WIDTH_TILES = 4;

// Hitbox from BALANCE_TABLES.md (14×22 inside 24×32 sprite)
export const PLAYER_WIDTH = 14;
export const PLAYER_HEIGHT = 22;

export const PHYSICS_STEP_SECONDS = 1 / 60;
export const MAX_DELTA_SECONDS = 1 / 15;

// Movement — aligned with BALANCE_TABLES.md
export const MOVE_ACCELERATION = 1200;
export const GROUND_FRICTION = 1450;
export const AIR_ACCELERATION = 760;
export const MAX_RUN_SPEED = 150;
export const GRAVITY = 820;
export const JUMP_SPEED = 315;
export const MAX_FALL_SPEED = 420;
export const COYOTE_TIME_SECONDS = 0.09;
export const JUMP_BUFFER_SECONDS = 0.10;
export const SHORT_HOP_CUTOFF = 0.45;

// Derived: max jump height = JUMP_SPEED² / (2 × GRAVITY) ≈ 60.5 px ≈ 3.78 tiles
// MAX_REACHABLE_VERTICAL_GAP_TILES = 3 gives 12+ px of margin over the 48 px gap
export const MAX_REACHABLE_VERTICAL_GAP_TILES = 3;
export const MAX_REACHABLE_HORIZONTAL_GAP_TILES = 6;
export const MIN_PLATFORM_WIDTH_TILES = 3;
export const MAX_PLATFORM_WIDTH_TILES = 7;

// Player interaction — passive push
export const PLAYER_PUSH_FORCE = 800;          // px/s² applied when AABBs overlap
export const PLAYER_MAX_PUSH_VELOCITY = 120;    // px/s cap on push-induced velocity change
export const AIR_PUSH_FACTOR = 0.35;            // fraction of push force when airborne

// Player combat/progression
export const PLAYER_MAX_HEALTH = 5;
export const PLAYER_BASE_DAMAGE = 1;
export const PLAYER_BASE_ATTACK_SPEED = 1;
export const PLAYER_BASE_JUMP_POWER = 1;
export const PLAYER_BASE_AIR_CONTROL = 1;
export const PLAYER_BASE_KNOCKBACK_RESISTANCE = 0;
export const PLAYER_BASE_MOVEMENT_SPEED = 1;
export const RELICS_PER_LEVEL = 5;
export const CRYSTALS_PER_MOVEMENT_TIER = 3;
export const FATAL_FALL_DISTANCE_PX = 6 * 32;
export const HIT_STUN_SECONDS = 0.16;
export const HAZARD_HIT_INVULNERABLE_SECONDS = 0.85;
export const MELEE_ATTACK_COOLDOWN_SECONDS = 0.80;

// Kick system
export const KICK_WINDUP_SECONDS = 0.10;
export const KICK_ACTIVE_SECONDS = 0.08;
export const KICK_RECOVERY_SECONDS = 0.22;
export const KICK_COOLDOWN_SECONDS = MELEE_ATTACK_COOLDOWN_SECONDS;
export const KICK_RANGE_PX = 20;               // distance in front of kicker
export const KICK_FORCE_GROUND = 260;           // px/s impulse, both grounded
export const KICK_FORCE_AIR = 160;              // px/s impulse, airborne kicker/target
export const KICK_HIT_INVULNERABLE_SECONDS = 0.35;

// Respawn & match
export const RESPAWN_INVULNERABILITY_SECONDS = 1.25;
export const RECONCILIATION_TOLERANCE_PX = 6;

// Server timing
export const SERVER_TICK_RATE = 60;             // Hz
export const SNAPSHOT_RATE = 20;                // Hz (every 3rd tick)
export const RECONNECT_TIMEOUT_SECONDS = 30;
export const MIN_PLAYERS_TO_START = 1;
export const MATCH_COUNTDOWN_SECONDS = 3;
export const MATCH_TIMEOUT_SECONDS = 180;

export const PROTOCOL_VERSION = 2;
