import { GAME_VERSION, PROTOCOL_VERSION } from "./constants.js";
import type { EnemyState, GeneratedChunk, MatchEvent, PlayerId, PlayerInput, PlayerState, RelicId, RoomPhase, SessionToken } from "./types.js";

export type ClientMessage =
  | {
      type: "hello";
      protocol: typeof PROTOCOL_VERSION;
      version: typeof GAME_VERSION;
      name: string;
      token?: SessionToken;
    }
  | {
      type: "input";
      playerId: PlayerId;
      input: PlayerInput;
    }
  | {
      type: "requestChunk";
      chunkY: number;
    }
  | {
      type: "ping";
      clientTime: number;
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
      serverTime: number;
      matchPhase: RoomPhase;
      players: PlayerState[];
      enemies?: EnemyState[];
      collectedRelics: RelicId[];
      events: MatchEvent[];
      lastProcessedSeq: Record<PlayerId, number>;
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
