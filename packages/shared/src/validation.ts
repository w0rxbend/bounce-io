import { GAME_VERSION, PROTOCOL_VERSION } from "./constants.js";
import type { ClientMessage, NetworkMessage, ServerMessage } from "./protocol.js";
import type { GeneratedChunk, KickPhase, MatchEvent, PlatformSpan, PlayerInput, PlayerState, RelicSpawn, TileKind } from "./types.js";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isTileKind(value: unknown): value is TileKind {
  return value === "empty" ||
    value === "solid" ||
    value === "oneWay" ||
    value === "hazard" ||
    value === "relic";
}

function isKickPhase(value: unknown): value is KickPhase {
  return value === "idle" || value === "windup" || value === "active" || value === "recovery";
}

function isPlatformSpan(value: unknown): value is PlatformSpan {
  return isRecord(value) &&
    isInteger(value.x) &&
    isInteger(value.y) &&
    isInteger(value.width) &&
    (value.width as number) > 0;
}

function isRelicSpawn(value: unknown): value is RelicSpawn {
  return isRecord(value) &&
    isString(value.id) &&
    isInteger(value.x) &&
    isInteger(value.y);
}

export function isPlayerInput(value: unknown): value is PlayerInput {
  return isRecord(value) &&
    isBoolean(value.left) &&
    isBoolean(value.right) &&
    isBoolean(value.jumpPressed) &&
    isBoolean(value.jumpHeld) &&
    isBoolean(value.drop) &&
    isBoolean(value.kick) &&
    isInteger(value.sequence) &&
    (value.sequence as number) >= 0;
}

export function isPlayerState(value: unknown): value is PlayerState {
  if (!isRecord(value) || !isString(value.id) || !isRecord(value.position) || !isRecord(value.velocity)) {
    return false;
  }
  return isFiniteNumber(value.position.x) &&
    isFiniteNumber(value.position.y) &&
    isFiniteNumber(value.velocity.x) &&
    isFiniteNumber(value.velocity.y) &&
    (value.facing === -1 || value.facing === 1) &&
    isBoolean(value.grounded) &&
    isFiniteNumber(value.coyoteTimer) &&
    isFiniteNumber(value.jumpBufferTimer) &&
    isFiniteNumber(value.kickCooldown) &&
    isKickPhase(value.kickPhase) &&
    isFiniteNumber(value.kickTimer) &&
    isFiniteNumber(value.kickInvulnerable) &&
    isFiniteNumber(value.invulnerable) &&
    isInteger(value.checkpointChunkY) &&
    (value.checkpointChunkY as number) >= 0 &&
    isInteger(value.coins) &&
    (value.coins as number) >= 0;
}

export function isGeneratedChunk(value: unknown): value is GeneratedChunk {
  if (!isRecord(value)) return false;
  const width = value.width;
  const height = value.height;
  return isInteger(value.seed) &&
    isInteger(value.chunkY) &&
    isInteger(width) &&
    isInteger(height) &&
    isInteger(value.worldTileY) &&
    Array.isArray(value.tiles) &&
    (value.tiles as unknown[]).length === (width as number) * (height as number) &&
    (value.tiles as unknown[]).every(isTileKind) &&
    Array.isArray(value.platforms) &&
    (value.platforms as unknown[]).every(isPlatformSpan) &&
    isPlatformSpan(value.entry) &&
    isPlatformSpan(value.exit) &&
    Array.isArray(value.relics) &&
    (value.relics as unknown[]).every(isRelicSpawn);
}

function isMatchEvent(value: unknown): value is MatchEvent {
  return isRecord(value) && isString(value.type);
}

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!isRecord(value) || !isString(value.type)) return false;

  switch (value.type) {
    case "hello":
      return value.protocol === PROTOCOL_VERSION &&
        value.version === GAME_VERSION &&
        isString(value.name) &&
        (value.token === undefined || isString(value.token));
    case "input":
      return isString(value.playerId) && isPlayerInput(value.input);
    case "requestChunk":
      return isInteger(value.chunkY);
    case "ping":
      return isFiniteNumber(value.clientTime);
    default:
      return false;
  }
}

export function isServerMessage(value: unknown): value is ServerMessage {
  if (!isRecord(value) || !isString(value.type)) return false;

  switch (value.type) {
    case "welcome":
      return isString(value.playerId) &&
        isString(value.sessionToken) &&
        isFiniteNumber(value.serverTime) &&
        isFiniteNumber(value.tickRate) &&
        isString(value.matchPhase) &&
        isInteger(value.seed);
    case "resumed":
      return isString(value.playerId) &&
        isFiniteNumber(value.serverTime) &&
        isString(value.matchPhase) &&
        isPlayerState(value.playerState);
    case "snapshot":
      return isInteger(value.tick) &&
        isFiniteNumber(value.serverTime) &&
        isString(value.matchPhase) &&
        Array.isArray(value.players) &&
        (value.players as unknown[]).every(isPlayerState) &&
        Array.isArray(value.collectedRelics) &&
        (value.collectedRelics as unknown[]).every(isString) &&
        Array.isArray(value.events) &&
        (value.events as unknown[]).every(isMatchEvent) &&
        isRecord(value.lastProcessedSeq);
    case "matchPhase":
      return isString(value.phase);
    case "chunk":
      return isGeneratedChunk(value.chunk);
    case "playerJoined":
      return isPlayerState(value.player) && isString(value.name);
    case "playerLeft":
      return isString(value.playerId);
    case "pong":
      return isFiniteNumber(value.clientTime) && isFiniteNumber(value.serverTime);
    case "error":
      return isString(value.code) && isString(value.message);
    default:
      return false;
  }
}

export function isNetworkMessage(value: unknown): value is NetworkMessage {
  return isClientMessage(value) || isServerMessage(value);
}
