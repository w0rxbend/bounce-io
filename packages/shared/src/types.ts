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

export interface GeneratedChunk {
  seed: number;
  chunkY: number;
  width: number;
  height: number;
  worldTileY: number;
  tiles: TileKind[];
  platforms: PlatformSpan[];
  entry: PlatformSpan;
  exit: PlatformSpan;
  relics: RelicSpawn[];
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
  // Highest chunk entry reached; server-authoritative respawn anchor
  checkpointChunkY: number;
  // Authoritative score
  coins: number;
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
  | "PLAYER_FINISHED"
  | "MATCH_COUNTDOWN_STARTED"
  | "MATCH_STARTED"
  | "MATCH_ENDED";

export type MatchEvent =
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
  | { type: "COIN_COLLECTED";       playerId: PlayerId; coinId: RelicId; value: number; x: number; y: number }
  | { type: "MATCH_COUNTDOWN_STARTED"; countdownMs: number }
  | { type: "MATCH_STARTED" }
  | { type: "MATCH_ENDED" };
