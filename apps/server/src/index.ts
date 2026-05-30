import { createNodeWebSocket } from "@hono/node-ws";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { WSContext } from "hono/ws";
import {
  CHUNK_HEIGHT_TILES,
  CHUNK_WIDTH_TILES,
  JUMP_SPEED,
  MATCH_COUNTDOWN_SECONDS,
  MIN_PLAYERS_TO_START,
  PHYSICS_STEP_SECONDS,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PROTOCOL_VERSION,
  RECONNECT_TIMEOUT_SECONDS,
  SERVER_TICK_RATE,
  SNAPSHOT_RATE,
  TILE_SIZE
} from "@skybound/shared";
import {
  applyDamage,
  applyCollectible,
  applyPlayerInteractions,
  collectibleKindForRelicId,
  createPlayerState,
  createMultiChunkTileMap,
  generateVerticalChunk,
  isPlayerDead,
  respawnPlayerState,
  stepPlayer,
  verifyChunkReachability
} from "@skybound/shared";
import { isClientMessage } from "@skybound/shared";
import type {
  EnemyKind,
  EnemySpawn,
  EnemyState,
  GeneratedChunk,
  MatchEvent,
  PlayerInput,
  PlayerState,
  RoomPhase,
  SessionToken,
  TileMap
} from "@skybound/shared";

const SNAPSHOT_EVERY_N_TICKS = Math.round(SERVER_TICK_RATE / SNAPSHOT_RATE);
const MAX_INPUTS_PER_TICK = 3;
const MAX_QUEUED_INPUTS = 24;
const MAX_MESSAGE_BYTES = 1024;
const SPAWN_X_BASE = Math.floor(CHUNK_WIDTH_TILES / 2) * TILE_SIZE;

// ── Session ───────────────────────────────────────────────────────────────────

interface Session {
  playerId: string;
  token: SessionToken;
  name: string;
  ws: WSContext | null;
  disconnectedAt: number | null;
  inputsThisTick: number;
  lastReceivedSeq: number;
  lastProcessedSeq: number;
  lastInput: PlayerInput;
  inputQueue: PlayerInput[];
}

// ── Room ──────────────────────────────────────────────────────────────────────

interface ServerRoom {
  id: string;
  seed: number;
  phase: RoomPhase;
  sessions: Map<string, Session>;
  players: Map<string, PlayerState>;
  collectedRelics: Set<string>;
  chunks: Map<number, GeneratedChunk>;
  enemies: Map<string, EnemyState>;
  tick: number;
  matchStartTick: number;
  countdownEndMs: number;
  pendingEvents: MatchEvent[];
  loopInterval: ReturnType<typeof setInterval> | null;
  accumulatedMs: number;
  lastTickTime: number;
  tileMapDirty: boolean;
  tileMapCache: TileMap | null;
}

// ── Global state ──────────────────────────────────────────────────────────────

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
const rooms = new Map<string, ServerRoom>();
const tokenToRoom = new Map<SessionToken, string>(); // token → roomId

// ── HTTP ──────────────────────────────────────────────────────────────────────

app.get("/", (c) =>
  c.json({
    name: "Skybound Relics",
    version: "0.1.0",
    protocol: PROTOCOL_VERSION,
    rooms: rooms.size,
    websocket: "/ws?room=demo&name=Explorer"
  })
);

// ── WebSocket ─────────────────────────────────────────────────────────────────

app.get(
  "/ws",
  upgradeWebSocket((c) => {
    const roomId = c.req.query("room") ?? "demo";
    let room: ServerRoom | undefined;
    let session: Session | undefined;

    return {
      onOpen: (_event, ws) => {
        // Defer hello; just store ws ref
        // Session is created when "hello" is received
        void ws; // captured in closure below
        // We store a temporary reference; session creation happens in onMessage
        const tempSession = { ws };
        void tempSession;
      },

      onMessage: (event, ws) => {
        const raw = event.data;
        if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) {
          ws.send(JSON.stringify({ type: "error", code: "TOO_LARGE", message: "message too large" }));
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          ws.send(JSON.stringify({ type: "error", code: "PARSE_ERROR", message: "invalid JSON" }));
          return;
        }

        if (!isClientMessage(parsed)) {
          ws.send(JSON.stringify({ type: "error", code: "UNKNOWN_TYPE", message: "unknown or malformed message" }));
          return;
        }

        // ── hello ────────────────────────────────────────────────────────────
        if (parsed.type === "hello") {
          if (session) {
            ws.send(JSON.stringify({ type: "error", code: "ALREADY_JOINED", message: "session already joined" }));
            return;
          }

          const existingToken = parsed.token;

          // Reconnect attempt
          if (existingToken) {
            const existingRoomId = tokenToRoom.get(existingToken);
            if (existingRoomId) {
              const existingRoom = rooms.get(existingRoomId);
              if (existingRoom) {
                const existingSession = [...existingRoom.sessions.values()].find(
                  (s) => s.token === existingToken
                );
                if (existingSession && existingSession.disconnectedAt === null) {
                  ws.send(JSON.stringify({ type: "error", code: "ALREADY_CONNECTED", message: "session already active" }));
                  ws.close();
                  return;
                }
                if (existingSession && existingSession.disconnectedAt !== null) {
                  const elapsed = (Date.now() - existingSession.disconnectedAt) / 1000;
                  if (elapsed <= RECONNECT_TIMEOUT_SECONDS) {
                    existingSession.ws = ws;
                    existingSession.disconnectedAt = null;
                    room = existingRoom;
                    session = existingSession;

                    const playerState = existingRoom.players.get(existingSession.playerId);
                    ws.send(JSON.stringify({
                      type: "resumed",
                      playerId: existingSession.playerId,
                      serverTime: Date.now(),
                      matchPhase: existingRoom.phase,
                      playerState: playerState ?? createPlayerState(existingSession.playerId, SPAWN_X_BASE, 0)
                    }));

                    existingRoom.pendingEvents.push({
                      type: "PLAYER_RECONNECTED",
                      playerId: existingSession.playerId
                    });
                    return;
                  }
                }
              }
            }
          }

          // New join
          room = getOrCreateRoom(roomId);

          if (room.phase === "finished" || room.phase === "closed") {
            ws.send(JSON.stringify({ type: "error", code: "MATCH_OVER", message: "match already finished" }));
            return;
          }

          if (room.sessions.size >= 8) {
            ws.send(JSON.stringify({ type: "error", code: "ROOM_FULL", message: "room is full" }));
            ws.close();
            return;
          }

          const playerId = crypto.randomUUID();
          const token = crypto.randomUUID() as SessionToken;

          tokenToRoom.set(token, roomId);

          session = {
            playerId,
            token,
            name: sanitizeName(parsed.name),
            ws,
            disconnectedAt: null,
            inputsThisTick: 0,
            lastReceivedSeq: -1,
            lastProcessedSeq: -1,
            lastInput: idleInput(-1),
            inputQueue: []
          };

          room.sessions.set(playerId, session);

          // Spawn on entry platform of chunk 0
          ensureChunksLoaded(room, 0);
          const spawnY = getSpawnY(room, 0);
          const playerState = createPlayerState(playerId, SPAWN_X_BASE, spawnY);
          room.players.set(playerId, playerState);

          ws.send(JSON.stringify({
            type: "welcome",
            playerId,
            sessionToken: token,
            serverTime: Date.now(),
            tickRate: SERVER_TICK_RATE,
            matchPhase: room.phase,
            seed: room.seed,
            name: session.name,
          }));

          // Send chunk 0 to new player
          const chunk0 = room.chunks.get(0);
          if (chunk0) {
            ws.send(JSON.stringify({ type: "chunk", chunk: chunk0 }));
          }

          // Send existing players to the new joiner so they see correct names immediately
          for (const [existingId, existingSess] of room.sessions) {
            if (existingId === playerId || existingSess.disconnectedAt !== null) continue;
            const existingPlayer = room.players.get(existingId);
            if (existingPlayer) {
              ws.send(JSON.stringify({ type: "playerJoined", player: existingPlayer, name: existingSess.name }));
            }
          }

          room.pendingEvents.push({ type: "PLAYER_JOINED", playerId });

          broadcastToOthers(room, playerId, {
            type: "playerJoined",
            player: playerState,
            name: session.name
          });

          // Auto-start countdown only from waiting phase
          if (room.sessions.size >= MIN_PLAYERS_TO_START && room.phase === "waiting") {
            startCountdown(room);
          }

          // Late join during active match: send current chunks so player can render
          if (room.phase === "countdown" || room.phase === "playing") {
            for (const [, chunk] of room.chunks) {
              ws.send(JSON.stringify({ type: "chunk", chunk }));
            }
          }

          return;
        }

        // All messages below require an active session
        if (!session || !room) {
          ws.send(JSON.stringify({ type: "error", code: "NOT_JOINED", message: "send hello first" }));
          return;
        }

        // ── ping ─────────────────────────────────────────────────────────────
        if (parsed.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", clientTime: parsed.clientTime, serverTime: Date.now() }));
          return;
        }

        // ── requestChunk ─────────────────────────────────────────────────────
        if (parsed.type === "requestChunk") {
          const chunkY = parsed.chunkY;
          if (!Number.isInteger(chunkY) || chunkY < 0 || chunkY > 200) return;
          const player = room.players.get(session.playerId);
          const currentChunkY = player
            ? Math.max(0, -Math.floor(player.position.y / TILE_SIZE / CHUNK_HEIGHT_TILES))
            : 0;
          if (chunkY > currentChunkY + 6) {
            ws.send(JSON.stringify({ type: "error", code: "CHUNK_TOO_FAR", message: "chunk request too far ahead" }));
            return;
          }
          ensureChunksLoaded(room, chunkY);
          const chunk = room.chunks.get(chunkY);
          if (chunk) {
            ws.send(JSON.stringify({ type: "chunk", chunk }));
          }
          return;
        }

        // ── input ─────────────────────────────────────────────────────────────
        if (parsed.type === "input") {
          // Verify this input belongs to the connected session
          if (parsed.playerId !== session.playerId) return;

          // Anti-cheat: rate limit
          if (session.inputsThisTick >= MAX_INPUTS_PER_TICK) return;

          const inp = parsed.input;

          // Anti-cheat: reject old, duplicate, or out-of-order pending sequence
          if (inp.sequence <= session.lastProcessedSeq || inp.sequence <= session.lastReceivedSeq) return;

          session.inputsThisTick++;
          session.lastReceivedSeq = inp.sequence;

          session.inputQueue.push(inp);
          if (session.inputQueue.length > MAX_QUEUED_INPUTS) {
            session.inputQueue.splice(0, session.inputQueue.length - MAX_QUEUED_INPUTS);
          }
          return;
        }
      },

      onClose: () => {
        if (!session || !room) return;
        session.ws = null;
        session.disconnectedAt = Date.now();

        room.pendingEvents.push({ type: "PLAYER_DISCONNECTED", playerId: session.playerId });

        broadcastToAll(room, { type: "playerLeft", playerId: session.playerId });

        // Don't delete immediately — allow 30s reconnect window
        // Cleanup happens in the tick loop when timeout expires
      }
    };
  })
);

// ── Server ────────────────────────────────────────────────────────────────────

const port = Number(process.env["PORT"] ?? 8787);
const hostname = process.env["HOST"] ?? "0.0.0.0";
const server = serve({ fetch: app.fetch, port, hostname });
injectWebSocket(server);
console.log(`Skybound Relics server listening on http://${hostname}:${port}`);

function shutdown(signal: NodeJS.Signals): void {
  console.log(`Received ${signal}; shutting down Skybound Relics server`);
  for (const room of [...rooms.values()]) {
    closeRoom(room);
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

// ── Room management ───────────────────────────────────────────────────────────

function getOrCreateRoom(id: string): ServerRoom {
  const existing = rooms.get(id);
  if (existing) return existing;

  const seed = hashString(id);
  const room: ServerRoom = {
    id,
    seed,
    phase: "waiting",
    sessions: new Map(),
    players: new Map(),
    collectedRelics: new Set(),
    chunks: new Map(),
    enemies: new Map(),
    tick: 0,
    matchStartTick: 0,
    countdownEndMs: 0,
    pendingEvents: [],
    loopInterval: null,
    accumulatedMs: 0,
    lastTickTime: Date.now(),
    tileMapDirty: true,
    tileMapCache: null
  };

  ensureChunksLoaded(room, 0);
  ensureChunksLoaded(room, 1);

  room.loopInterval = setInterval(() => tickRoom(room), 1000 / SERVER_TICK_RATE);
  rooms.set(id, room);
  return room;
}

function ensureChunksLoaded(room: ServerRoom, upToChunkY: number): void {
  let loaded = false;
  for (let cy = 0; cy <= upToChunkY + 2; cy++) {
    if (!room.chunks.has(cy)) {
      const chunk = generateVerticalChunk({ seed: room.seed, chunkY: cy });
      const issues = verifyChunkReachability(chunk);
      if (issues.length > 0) {
        console.warn(`[room ${room.id}] chunk ${cy} reachability issues:`, issues.map(i => i.reason));
      }
      room.chunks.set(cy, chunk);
      hydrateEnemiesForChunk(room, chunk);
      loaded = true;
    }
  }
  if (loaded) room.tileMapDirty = true;
}

function enemyStats(kind: EnemyKind): { health: number; speed: number; damage: number; cooldown: number } {
  switch (kind) {
    case "goblinChief": return { health: 4, speed: 24, damage: 1, cooldown: 0.8 };
    case "archer": return { health: 2, speed: 14, damage: 1, cooldown: 1.2 };
    case "iceBat": return { health: 2, speed: 30, damage: 1, cooldown: 0.75 };
    case "skeleton": return { health: 3, speed: 16, damage: 1, cooldown: 0.95 };
    case "skeletonArmored": return { health: 5, speed: 13, damage: 1, cooldown: 1.0 };
    case "iceGolem": return { health: 6, speed: 12, damage: 2, cooldown: 1.35 };
    case "windSpirit": return { health: 3, speed: 28, damage: 1, cooldown: 0.85 };
    case "yeti": return { health: 9, speed: 18, damage: 2, cooldown: 1.2 };
    case "goblinScout":
    case "goblin":
    default:
      return { health: 2, speed: 22, damage: 1, cooldown: 0.9 };
  }
}

function findEnemyPlatform(chunk: GeneratedChunk, spawn: EnemySpawn) {
  return chunk.platforms.find((p) => p.y === spawn.y + 1 && spawn.x >= p.x && spawn.x < p.x + p.width);
}

function hydrateEnemiesForChunk(room: ServerRoom, chunk: GeneratedChunk): void {
  for (const spawn of chunk.enemies) {
    if (room.enemies.has(spawn.id)) continue;
    const platform = findEnemyPlatform(chunk, spawn);
    if (!platform) continue;
    const stats = enemyStats(spawn.kind);
    const x = spawn.x * TILE_SIZE - 10;
    const platformY = (chunk.worldTileY + platform.y) * TILE_SIZE;
    room.enemies.set(spawn.id, {
      id: spawn.id,
      kind: spawn.kind,
      position: { x, y: platformY - 24 },
      velocity: { x: stats.speed * (spawn.x % 2 === 0 ? 1 : -1), y: 0 },
      facing: spawn.x % 2 === 0 ? 1 : -1,
      health: stats.health,
      maxHealth: stats.health,
      chunkY: chunk.chunkY,
      patrolMinX: platform.x * TILE_SIZE + 2,
      patrolMaxX: (platform.x + platform.width) * TILE_SIZE - 22,
      platformY,
      attackCooldown: 0.35 + (spawn.x % 5) * 0.08,
      hurtCooldown: 0
    });
  }
}

function getSpawnY(room: ServerRoom, chunkY: number): number {
  const chunk = room.chunks.get(chunkY);
  if (!chunk) return -TILE_SIZE;
  return (chunk.worldTileY + chunk.entry.y) * TILE_SIZE - 22; // 22 = PLAYER_HEIGHT
}

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function playerKickHitsEnemy(player: PlayerState, enemy: EnemyState): boolean {
  if (player.kickPhase !== "active" || enemy.hurtCooldown > 0 || enemy.health <= 0) return false;
  const rangeX = player.facing > 0 ? player.position.x : player.position.x - 20;
  return rectsOverlap(rangeX, player.position.y - 4, PLAYER_WIDTH + 20, PLAYER_HEIGHT + 8, enemy.position.x, enemy.position.y, 22, 24);
}

function enemyTouchesPlayer(enemy: EnemyState, player: PlayerState): boolean {
  return rectsOverlap(enemy.position.x + 2, enemy.position.y + 3, 18, 21, player.position.x, player.position.y, PLAYER_WIDTH, PLAYER_HEIGHT);
}

function makeEnemyDrops(room: ServerRoom, enemy: EnemyState): Array<{ id: string; x: number; y: number }> {
  const count = enemy.kind === "yeti" || enemy.kind === "iceGolem" ? 2 : 1;
  const tileX = Math.max(1, Math.min(CHUNK_WIDTH_TILES - 2, Math.round((enemy.position.x + 11) / TILE_SIZE)));
  const tileY = Math.round((enemy.position.y + 14) / TILE_SIZE);
  const suffixes = enemy.kind === "yeti" || enemy.kind === "iceGolem"
    ? ["relic", "jump"]
    : enemy.kind === "archer" || enemy.kind === "skeletonArmored"
      ? ["relic"]
      : ["heart"];
  const drops: Array<{ id: string; x: number; y: number }> = [];
  const chunk = room.chunks.get(enemy.chunkY);
  for (let i = 0; i < count; i++) {
    const id = `drop:${enemy.id}:${suffixes[i % suffixes.length]}:${room.tick}:${i}`;
    drops.push({ id, x: tileX + i, y: tileY });
    if (chunk) chunk.relics.push({ id, x: tileX + i, y: tileY });
  }
  return drops;
}

function simulateEnemies(room: ServerRoom, players: PlayerState[], dt: number): void {
  for (const enemy of [...room.enemies.values()]) {
    const chunk = room.chunks.get(enemy.chunkY);
    if (!chunk || enemy.health <= 0) continue;
    const stats = enemyStats(enemy.kind);
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
    enemy.hurtCooldown = Math.max(0, enemy.hurtCooldown - dt);

    let target: PlayerState | null = null;
    let targetDist = Infinity;
    for (const player of players) {
      if (player.health <= 0) continue;
      const dx = (player.position.x + PLAYER_WIDTH / 2) - (enemy.position.x + 11);
      const dy = (player.position.y + PLAYER_HEIGHT / 2) - (enemy.position.y + 12);
      const dist = Math.abs(dx) + Math.abs(dy) * 1.35;
      if (dist < targetDist && dist < 95) {
        target = player;
        targetDist = dist;
      }
    }

    if (target && Math.abs(target.position.y - enemy.position.y) < 42) {
      enemy.facing = target.position.x + PLAYER_WIDTH / 2 >= enemy.position.x + 11 ? 1 : -1;
      enemy.velocity.x = enemy.facing * stats.speed * 1.15;
    }

    enemy.position.x += enemy.velocity.x * dt;
    if (enemy.position.x <= enemy.patrolMinX) {
      enemy.position.x = enemy.patrolMinX;
      enemy.velocity.x = Math.abs(enemy.velocity.x || stats.speed);
      enemy.facing = 1;
    } else if (enemy.position.x >= enemy.patrolMaxX) {
      enemy.position.x = enemy.patrolMaxX;
      enemy.velocity.x = -Math.abs(enemy.velocity.x || stats.speed);
      enemy.facing = -1;
    }

    enemy.position.y = enemy.platformY - (enemy.kind === "iceBat" || enemy.kind === "windSpirit" ? 30 : 24);
    if (enemy.kind === "iceBat" || enemy.kind === "windSpirit") {
      enemy.position.y += Math.sin((room.tick + enemy.chunkY * 19) * 0.12) * 5;
    }

    for (const player of players) {
      if (player.health <= 0) continue;
      if (playerKickHitsEnemy(player, enemy)) {
        const damage = Math.max(1, player.damage);
        enemy.health = Math.max(0, enemy.health - damage);
        enemy.hurtCooldown = 0.28;
        enemy.velocity.x = player.facing * stats.speed;
        room.pendingEvents.push({
          type: "ENEMY_HIT",
          playerId: player.id,
          enemyId: enemy.id,
          x: enemy.position.x + 11,
          y: enemy.position.y + 12,
          damage
        });
        if (enemy.health <= 0) {
          const drops = makeEnemyDrops(room, enemy);
          room.enemies.delete(enemy.id);
          room.pendingEvents.push({
            type: "ENEMY_KILLED",
            playerId: player.id,
            enemyId: enemy.id,
            x: enemy.position.x + 11,
            y: enemy.position.y + 12,
            drops
          });
          break;
        }
        continue;
      }

      if (enemy.health > 0 && enemy.attackCooldown <= 0 && enemyTouchesPlayer(enemy, player)) {
        const dir = player.position.x + PLAYER_WIDTH / 2 >= enemy.position.x + 11 ? 1 : -1;
        applyDamage(player, stats.damage, dir * (enemy.kind === "yeti" || enemy.kind === "iceGolem" ? 190 : 125), -70, 0.16);
        player.invulnerable = Math.max(player.invulnerable, 0.42);
        enemy.attackCooldown = stats.cooldown;
      }
    }
  }
}

function applyJumpPads(room: ServerRoom, player: PlayerState): void {
  if (player.health <= 0 || player.velocity.y < 0) return;
  const playerCenterX = player.position.x + PLAYER_WIDTH / 2;
  const playerBottom = player.position.y + PLAYER_HEIGHT;

  for (const chunk of room.chunks.values()) {
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
      room.pendingEvents.push({
        type: "JUMP_PAD_TRIGGERED",
        playerId: player.id,
        padId: pad.id,
        x: padX,
        y: padY,
        multiplier: pad.multiplier
      });
      return;
    }
  }
}

// ── Game loop ─────────────────────────────────────────────────────────────────

function tickRoom(room: ServerRoom): void {
  if (room.phase === "closed") return;

  const now = Date.now();
  room.tick++;

  // Reset per-tick input counters
  for (const s of room.sessions.values()) {
    s.inputsThisTick = 0;
  }

  // Clean up timed-out disconnected sessions
  for (const [pid, s] of room.sessions) {
    if (s.disconnectedAt !== null) {
      const elapsed = (now - s.disconnectedAt) / 1000;
      if (elapsed > RECONNECT_TIMEOUT_SECONDS) {
        room.sessions.delete(pid);
        room.players.delete(pid);
        tokenToRoom.delete(s.token);
        room.pendingEvents.push({ type: "PLAYER_LEFT", playerId: pid });
      }
    }
  }

  // Close empty rooms (including waiting-phase rooms to prevent interval leak)
  if (room.sessions.size === 0) {
    closeRoom(room);
    return;
  }

  // ── Phase transitions ─────────────────────────────────────────────────────

  if (room.phase === "countdown" && now >= room.countdownEndMs) {
    room.phase = "playing";
    room.matchStartTick = room.tick;
    room.pendingEvents.push({ type: "MATCH_STARTED" });
    broadcastToAll(room, { type: "matchPhase", phase: "playing" });
  }

  // ── Physics simulation ────────────────────────────────────────────────────

  if (room.phase === "playing") {
    if (room.tileMapDirty || room.tileMapCache === null) {
      room.tileMapCache = createMultiChunkTileMap(room.chunks);
      room.tileMapDirty = false;
    }
    const tileMap = room.tileMapCache;
    const activePlayers: PlayerState[] = [];

    for (const [pid, session] of room.sessions) {
      if (session.disconnectedAt !== null) continue;
      const player = room.players.get(pid);
      if (!player) continue;

      const input = consumeQueuedInput(session);

      const previousKickPhase = player.kickPhase;
      const { player: next } = stepPlayer(player, input, tileMap, PHYSICS_STEP_SECONDS);
      applyJumpPads(room, next);
      if (previousKickPhase === "idle" && next.kickPhase === "windup") {
        room.pendingEvents.push({ type: "PLAYER_KICK_STARTED", playerId: pid });
      }

      // Ensure chunks ahead of this player are loaded
      const playerChunkY = Math.max(0, -Math.floor(next.position.y / TILE_SIZE / CHUNK_HEIGHT_TILES));
      ensureChunksLoaded(room, playerChunkY + 2);
      if (playerChunkY > next.checkpointChunkY) {
        next.checkpointChunkY = playerChunkY;
        room.pendingEvents.push({ type: "CHECKPOINT_REACHED", playerId: pid, chunkY: playerChunkY });
      }

      // Death detection: shared physics marks fatal falls, hazards and combat as health <= 0.
      if (isPlayerDead(next)) {
        respawnPlayer(room, pid, next);
        room.pendingEvents.push({ type: "PLAYER_DIED", playerId: pid });
        room.pendingEvents.push({ type: "PLAYER_RESPAWNED", playerId: pid });
      }

      // Relic collection only during active match
      if (room.phase === "playing") checkRelicCollection(room, pid, next);

      // Apex detection — player reached the exit of a high chunk; record milestone, keep playing
      if (room.phase === "playing" && playerChunkY >= 5) {
        const chunk = room.chunks.get(playerChunkY);
        if (chunk) {
          const exitPx = (chunk.worldTileY + chunk.exit.y) * TILE_SIZE;
          if (next.position.y <= exitPx + 4 && playerChunkY > next.checkpointChunkY) {
            room.pendingEvents.push({ type: "CHECKPOINT_REACHED", playerId: pid, chunkY: playerChunkY });
          }
        }
      }

      room.players.set(pid, next);
      activePlayers.push(next);
    }

    // Player interactions: push + kick
    const interactionEvents = applyPlayerInteractions(activePlayers, PHYSICS_STEP_SECONDS);
    for (const event of interactionEvents) {
      room.pendingEvents.push(event);
    }
    simulateEnemies(room, activePlayers, PHYSICS_STEP_SECONDS);
    for (const p of activePlayers) {
      if (isPlayerDead(p)) {
        respawnPlayer(room, p.id, p);
        room.pendingEvents.push({ type: "PLAYER_DIED", playerId: p.id });
        room.pendingEvents.push({ type: "PLAYER_RESPAWNED", playerId: p.id });
      }
      room.players.set(p.id, p);
    }
  }

  // ── Chunk disposal — evict chunks far below every player's checkpoint ────────
  {
    const CHUNKS_KEEP_BEHIND_SERVER = 2;
    let minCheckpoint = Infinity;
    for (const [pid, s] of room.sessions) {
      if (s.disconnectedAt !== null) continue;
      const p = room.players.get(pid);
      if (p) minCheckpoint = Math.min(minCheckpoint, p.checkpointChunkY);
    }
    if (minCheckpoint !== Infinity && minCheckpoint > CHUNKS_KEEP_BEHIND_SERVER) {
      const disposeBelow = minCheckpoint - CHUNKS_KEEP_BEHIND_SERVER;
      for (const cy of [...room.chunks.keys()]) {
        if (cy < disposeBelow) {
          for (const [enemyId, enemy] of room.enemies) {
            if (enemy.chunkY === cy) room.enemies.delete(enemyId);
          }
          room.chunks.delete(cy);
          room.tileMapDirty = true;
        }
      }
    }
  }

  // ── Snapshot broadcast (every N ticks = 20 Hz) ────────────────────────────

  if (room.tick % SNAPSHOT_EVERY_N_TICKS === 0) {
    const players = [...room.players.entries()]
      .filter(([pid]) => room.sessions.get(pid)?.disconnectedAt === null)
      .map(([, p]) => p);
    const lastProcessedSeq: Record<string, number> = {};
    for (const [pid, s] of room.sessions) {
      if (s.disconnectedAt === null) lastProcessedSeq[pid] = s.lastProcessedSeq;
    }

    broadcastToAll(room, {
      type: "snapshot",
      tick: room.tick,
      serverTime: now,
      matchPhase: room.phase,
      players,
      enemies: [...room.enemies.values()],
      collectedRelics: [...room.collectedRelics],
      events: room.pendingEvents.splice(0),
      lastProcessedSeq
    });
  }
}

function respawnPlayer(room: ServerRoom, playerId: string, player: PlayerState): void {
  const checkpointChunkY = Math.max(0, player.checkpointChunkY);
  ensureChunksLoaded(room, checkpointChunkY);
  const checkpointChunk = room.chunks.get(checkpointChunkY);
  const spawnX = checkpointChunk
    ? (checkpointChunk.entry.x + Math.floor(checkpointChunk.entry.width / 2)) * TILE_SIZE - PLAYER_WIDTH / 2
    : SPAWN_X_BASE;
  const spawnY = getSpawnY(room, checkpointChunkY);
  respawnPlayerState(player, spawnX, spawnY, checkpointChunkY);
  room.players.set(playerId, player);
}

function checkRelicCollection(room: ServerRoom, playerId: string, player: PlayerState): void {
  const px = player.position.x + PLAYER_WIDTH / 2;
  const py = player.position.y + PLAYER_HEIGHT / 2;

  for (const chunk of room.chunks.values()) {
    for (const relic of chunk.relics) {
      if (room.collectedRelics.has(relic.id)) continue;

      const worldY = (chunk.worldTileY + relic.y) * TILE_SIZE + TILE_SIZE / 2;
      const worldX = relic.x * TILE_SIZE + TILE_SIZE / 2;

      if (Math.abs(px - worldX) < 20 && Math.abs(py - worldY) < 20) {
        room.collectedRelics.add(relic.id);
        const pickupType = collectibleKindForRelicId(relic.id);
        applyCollectible(player, pickupType);
        player.coins += 1;
        room.pendingEvents.push({
          type: "COIN_COLLECTED",
          playerId,
          coinId: relic.id,
          value: 1,
          x: worldX,
          y: worldY,
          pickupType
        });
      }
    }
  }
}

function chunk0EntryY(room: ServerRoom): number {
  const chunk = room.chunks.get(0);
  return chunk ? chunk.worldTileY + chunk.entry.y : CHUNK_HEIGHT_TILES - 2;
}

function startCountdown(room: ServerRoom): void {
  room.phase = "countdown";
  room.countdownEndMs = Date.now() + MATCH_COUNTDOWN_SECONDS * 1000;
  room.pendingEvents.push({ type: "MATCH_COUNTDOWN_STARTED", countdownMs: MATCH_COUNTDOWN_SECONDS * 1000 });
  broadcastToAll(room, {
    type: "matchPhase",
    phase: "countdown",
    countdownMs: MATCH_COUNTDOWN_SECONDS * 1000
  });
}

function endMatch(room: ServerRoom): void {
  if (room.phase === "finished" || room.phase === "closed") return;
  room.phase = "finished";
  room.pendingEvents.push({ type: "MATCH_ENDED" });
  broadcastToAll(room, { type: "matchPhase", phase: "finished" });
  // Cleanup after 15 seconds
  setTimeout(() => closeRoom(room), 15_000);
}

function closeRoom(room: ServerRoom): void {
  room.phase = "closed";
  if (room.loopInterval !== null) {
    clearInterval(room.loopInterval);
    room.loopInterval = null;
  }
  for (const s of room.sessions.values()) {
    tokenToRoom.delete(s.token);
  }
  rooms.delete(room.id);
}

// ── Broadcast helpers ─────────────────────────────────────────────────────────

function broadcastToAll(room: ServerRoom, payload: unknown): void {
  const encoded = JSON.stringify(payload);
  for (const s of room.sessions.values()) {
    if (s.ws && s.disconnectedAt === null) {
      try { s.ws.send(encoded); } catch { /* connection closed */ }
    }
  }
}

function broadcastToOthers(room: ServerRoom, excludeId: string, payload: unknown): void {
  const encoded = JSON.stringify(payload);
  for (const [pid, s] of room.sessions) {
    if (pid !== excludeId && s.ws && s.disconnectedAt === null) {
      try { s.ws.send(encoded); } catch { /* connection closed */ }
    }
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function sanitizeName(value: string): string {
  return value.replace(/[^\w \-]/g, "").slice(0, 16).trim() || "Explorer";
}

function consumeQueuedInput(session: Session): PlayerInput {
  while (session.inputQueue.length > 0) {
    const next = session.inputQueue.shift();
    if (!next || next.sequence <= session.lastProcessedSeq) continue;
    session.lastProcessedSeq = next.sequence;
    session.lastInput = next;
    return next;
  }

  return {
    ...session.lastInput,
    jumpPressed: false,
    kick: false,
    sequence: session.lastProcessedSeq
  };
}

function idleInput(sequence: number): PlayerInput {
  return {
    left: false,
    right: false,
    jumpPressed: false,
    jumpHeld: false,
    drop: false,
    kick: false,
    sequence
  };
}

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
