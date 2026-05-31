import { GAME_VERSION, PROTOCOL_VERSION } from "./constants.js";
import type { SkillCardOffer } from "./skills.js";
import type { CollectibleState, EnemyState, GeneratedChunk, MatchEvent, PlayerId, PlayerInput, PlayerState, RelicId, RoomPhase, SessionToken } from "./types.js";

export type SnapshotEntity = {
  id: PlayerId;
  skinId?: string;
  type: string;
  kind: string;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  facing: -1 | 1;
  grounded?: boolean;
  kickPhase?: PlayerState["kickPhase"];
  kickTimer?: number;
  invulnerable?: number;
  health?: number;
  coins?: number;
  maxHealth?: number;
  shield?: number;
  maxShield?: number;
  hitRange?: number;
  selectedSkills?: Record<string, number>;
};

export type PlayerEntityFrame = {
  id: PlayerId;
  s?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  f: -1 | 1;
  g: boolean;
  k?: PlayerState["kickPhase"];
  kt?: number;
  iv?: number;
  h: number;
  c: number;
  mh?: number;
  sh?: number;
  ms?: number;
  hr?: number;
  sk?: Record<string, number>;
};

export type ClientMessage =
  | {
      type: "hello";
      protocol: typeof PROTOCOL_VERSION;
      version: typeof GAME_VERSION;
      name: string;
      skinId?: string;
      token?: SessionToken;
    }
  | {
      type: "input";
      playerId: PlayerId;
      inputSeq?: number;
      clientTime?: number;
      input: PlayerInput;
    }
  | {
      type: "requestChunk";
      chunkY: number;
    }
  | {
      type: "viewport";
      minChunkY: number;
      maxChunkY: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      visibleWidth: number;
      visibleHeight: number;
      zoom: number;
    }
  | {
      type: "ping";
      clientTime: number;
    }
  | {
      type: "pickup_collectible";
      collectibleId: string;
    }
  | {
      type: "select_skill_card";
      offerId: string;
      cardId: string;
    };

export type ServerMessage =
  | {
      type: "welcome";
      playerId: PlayerId;
      sessionToken: SessionToken;
      serverTime: number;
      tickRate: number;
      matchPhase: RoomPhase;
      seed: number;
      name: string;
    }
  | {
      type: "resumed";
      playerId: PlayerId;
      serverTime: number;
      matchPhase: RoomPhase;
      playerState: PlayerState;
    }
  | {
      type: "snapshot";
      tick: number;
      serverTick: number;
      snapshotSeq: number;
      serverTime: number;
      matchPhase: RoomPhase;
      ackInputSeq: number;
      players: PlayerState[];
      entities: SnapshotEntity[];
      playerEntities?: PlayerEntityFrame[];
      enemies?: EnemyState[];
      collectibles?: CollectibleState[];
      collectedRelics: RelicId[];
      events: MatchEvent[];
      lastProcessedSeq: Record<PlayerId, number>;
    }
  | {
      type: "events";
      serverTick: number;
      snapshotSeq: number;
      serverTime: number;
      events: MatchEvent[];
    }
  | {
      type: "relicState";
      serverTime: number;
      collectedRelics: RelicId[];
    }
  | {
      type: "matchPhase";
      phase: RoomPhase;
      countdownMs?: number;
    }
  | {
      type: "chunk";
      chunk: GeneratedChunk;
    }
  | {
      type: "playerJoined";
      player: PlayerState;
      name: string;
    }
  | {
      type: "playerLeft";
      playerId: PlayerId;
    }
  | {
      type: "skill_card_offer";
      offer: SkillCardOffer;
    }
  | {
      type: "skill_applied";
      playerId: PlayerId;
      skillId: string;
      newStats: Partial<PlayerState>;
    }
  | {
      type: "player_stats";
      playerId: PlayerId;
      stats: Partial<PlayerState>;
    }
  | {
      type: "pong";
      clientTime: number;
      serverTime: number;
    }
  | {
      type: "error";
      code: string;
      message: string;
    };

export type NetworkMessage = ClientMessage | ServerMessage;
