export type EntityId = string;
export type PlayerId = string;
export type RelicId = string;
export type SessionToken = string;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TileKind = "empty" | "solid" | "oneWay" | "hazard" | "relic";

export interface Tile {
  kind: TileKind;
}

export interface PlatformSpan {
  x: number;
  y: number;
  width: number;
}

export interface RelicSpawn {
  id: RelicId;
  x: number;
  y: number;
}

export type EnemyKind =
  | "goblin"
  | "goblinScout"
  | "goblinChief"
  | "archer"
  | "iceBat"
  | "skeleton"
  | "skeletonArmored"
  | "yeti"
  | "iceGolem"
  | "windSpirit";

export interface EnemySpawn {
  id: EntityId;
  kind: EnemyKind;
  x: number;
  y: number;
}

export interface JumpPadSpawn {
  id: EntityId;
  x: number;
  y: number;
  multiplier: number;
}

export interface TriggerBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PortalSpawn {
  id: EntityId;
  regionId: string;
  chunkY: number;
  x: number;
  y: number;
  width: number;
  style: string;
  checkpoint: boolean;
  trigger: TriggerBox;
}

export interface LandmarkSpawn {
  id: EntityId;
  regionId: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hidden: boolean;
}

export interface RouteBranch {
  id: string;
  kind: "safe" | "risk" | "relic" | "hidden" | string;
  label: string;
  hidden: boolean;
  reward: number;
  nodes: Vec2[];
}

export interface WindZoneSpawn {
  id: EntityId;
  x: number;
  y: number;
  width: number;
  height: number;
  direction: -1 | 1;
  strength: number;
}

export type CollectibleKind =
  | "relic"
  | "blueCrystal"
  | "greenCrystal"
  | "purpleCrystal"
  | "smallHeart"
  | "bigHeart";

export type HazardKind =
  | "spikeTrap"
  | "fallingIcicle"
  | "windGust"
  | "crumblingPlatform"
  | "lightningRune";

export interface GeneratedChunk {
  seed: number;
  chunkY: number;
  width: number;
  height: number;
  worldTileY: number;
  regionId?: string;
  regionIndex?: number;
  regionName?: string;
  checkpoint?: boolean;
  tiles: TileKind[];
  platforms: PlatformSpan[];
  entry: PlatformSpan;
  exit: PlatformSpan;
  portal?: PortalSpawn;
  landmarks?: LandmarkSpawn[];
  routes?: RouteBranch[];
  relics: RelicSpawn[];
  enemies: EnemySpawn[];
  jumpPads: JumpPadSpawn[];
  windZones: WindZoneSpawn[];
}

export interface EnemyState {
  id: EntityId;
  kind: EnemyKind;
  position: Vec2;
  velocity: Vec2;
  facing: -1 | 1;
  health: number;
  maxHealth: number;
  chunkY: number;
  patrolMinX: number;
  patrolMaxX: number;
  platformY: number;
  attackCooldown: number;
  hurtCooldown: number;
}

export type KickPhase = "idle" | "windup" | "active" | "recovery";

export interface PlayerInput {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  drop: boolean;
  kick: boolean;
  sequence: number;
}

export interface PlayerState {
  id: PlayerId;
  skinId?: string;
  position: Vec2;
  velocity: Vec2;
  facing: -1 | 1;
  grounded: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  // Kick
  kickCooldown: number;
  kickPhase: KickPhase;
  kickTimer: number;
  kickInvulnerable: number;
  // Respawn invulnerability
  invulnerable: number;
  stunTimer: number;
  // Highest chunk entry reached; server-authoritative respawn anchor
  checkpointChunkY: number;
  // Authoritative score
  coins: number;
  // Health, combat and progression
  health: number;
  maxHealth: number;
  damage: number;
  attackSpeed: number;
  jumpPower: number;
  airControl: number;
  knockbackResistance: number;
  movementSpeed: number;
  level: number;
  relics: number;
  crystals: number;
  relicFragments: number;
  fallStartY: number | null;
}

export interface CollisionHit {
  normal: Vec2;
  tileX: number;
  tileY: number;
  kind: TileKind;
}

export interface StepResult {
  player: PlayerState;
  hits: CollisionHit[];
}

export interface TileMap {
  isSolid(tileX: number, tileY: number): boolean;
  isOneWay?(tileX: number, tileY: number): boolean;
  getTile?(tileX: number, tileY: number): TileKind;
}

export type RoomPhase = "waiting" | "countdown" | "playing" | "finished" | "closed";

export type MatchEventType =
  | "PLAYER_JOINED"
  | "PLAYER_LEFT"
  | "PLAYER_DISCONNECTED"
  | "PLAYER_RECONNECTED"
  | "PLAYER_DIED"
  | "PLAYER_RESPAWNED"
  | "COIN_COLLECTED"
  | "CHECKPOINT_REACHED"
  | "PLAYER_KICK_STARTED"
  | "PLAYER_KICK_HIT"
  | "ENEMY_HIT"
  | "ENEMY_KILLED"
  | "JUMP_PAD_TRIGGERED"
  | "PLAYER_FINISHED"
  | "MATCH_COUNTDOWN_STARTED"
  | "MATCH_STARTED"
  | "MATCH_ENDED";

export interface MatchEventMetadata {
  eventId?: string;
  serverTick?: number;
  snapshotSeq?: number;
}

export type MatchEventPayload =
  | { type: "PLAYER_JOINED";        playerId: PlayerId }
  | { type: "PLAYER_LEFT";          playerId: PlayerId }
  | { type: "PLAYER_DISCONNECTED";  playerId: PlayerId }
  | { type: "PLAYER_RECONNECTED";   playerId: PlayerId }
  | { type: "PLAYER_DIED";          playerId: PlayerId }
  | { type: "PLAYER_RESPAWNED";     playerId: PlayerId }
  | { type: "PLAYER_FINISHED";      playerId: PlayerId }
  | { type: "CHECKPOINT_REACHED";   playerId: PlayerId; chunkY: number }
  | { type: "PLAYER_KICK_STARTED";  playerId: PlayerId }
  | { type: "PLAYER_KICK_HIT";      playerId: PlayerId; targetId: PlayerId }
  | { type: "ENEMY_HIT";            playerId: PlayerId; enemyId: EntityId; x: number; y: number; damage: number }
  | { type: "ENEMY_KILLED";         playerId: PlayerId; enemyId: EntityId; x: number; y: number; drops: RelicSpawn[] }
  | { type: "JUMP_PAD_TRIGGERED";   playerId: PlayerId; padId: EntityId; x: number; y: number; multiplier: number }
  | { type: "COIN_COLLECTED";       playerId: PlayerId; coinId: RelicId; value: number; x: number; y: number; pickupType?: CollectibleKind }
  | { type: "MATCH_COUNTDOWN_STARTED"; countdownMs: number }
  | { type: "MATCH_STARTED" }
  | { type: "MATCH_ENDED" };

export type MatchEvent = MatchEventMetadata & MatchEventPayload;
