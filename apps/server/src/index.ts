import { createNodeWebSocket } from "@hono/node-ws";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { WSContext } from "hono/ws";
import {
  CHUNK_HEIGHT_TILES,
  CHUNK_WIDTH_TILES,
  MATCH_COUNTDOWN_SECONDS,
  MATCH_TIMEOUT_SECONDS,
  MIN_PLAYERS_TO_START,
  PHYSICS_STEP_SECONDS,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PROTOCOL_VERSION,
  RECONNECT_TIMEOUT_SECONDS,
  RESPAWN_INVULNERABILITY_SECONDS,
  SERVER_TICK_RATE,
  SNAPSHOT_RATE,
  TILE_SIZE
} from "@skybound/shared";
import {
  applyPlayerInteractions,
  createPlayerState,
  createMultiChunkTileMap,
  generateVerticalChunk,
  stepPlayer,
  verifyChunkReachability
} from "@skybound/shared";
import { isClientMessage } from "@skybound/shared";
import type {
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
            seed: room.seed
          }));

          // Send chunk 0 to new player
          const chunk0 = room.chunks.get(0);
          if (chunk0) {
            ws.send(JSON.stringify({ type: "chunk", chunk: chunk0 }));
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
const server = serve({ fetch: app.fetch, port });
injectWebSocket(server);
console.log(`Skybound Relics server listening on http://localhost:${port}`);

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
      loaded = true;
    }
  }
  if (loaded) room.tileMapDirty = true;
}

function getSpawnY(room: ServerRoom, chunkY: number): number {
  const chunk = room.chunks.get(chunkY);
  if (!chunk) return -TILE_SIZE;
  return (chunk.worldTileY + chunk.entry.y) * TILE_SIZE - 22; // 22 = PLAYER_HEIGHT
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

  if (room.phase === "playing") {
    const elapsed = (now - room.countdownEndMs) / 1000;
    if (elapsed > MATCH_TIMEOUT_SECONDS) {
      endMatch(room);
    }
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

      // Death detection: fell more than one chunk below the player's current chunk floor
      const currentChunkFloor = (-playerChunkY * CHUNK_HEIGHT_TILES + CHUNK_HEIGHT_TILES) * TILE_SIZE;
      if (next.position.y > currentChunkFloor && next.invulnerable <= 0) {
        respawnPlayer(room, pid, next);
        room.pendingEvents.push({ type: "PLAYER_DIED", playerId: pid });
        room.pendingEvents.push({ type: "PLAYER_RESPAWNED", playerId: pid });
      }

      // Relic collection only during active match
      if (room.phase === "playing") checkRelicCollection(room, pid, next);

      // Finish detection (reached exit of a high chunk)
      if (room.phase === "playing" && playerChunkY >= 5) {
        const chunk = room.chunks.get(playerChunkY);
        if (chunk) {
          const exitPx = (chunk.worldTileY + chunk.exit.y) * TILE_SIZE;
          if (next.position.y <= exitPx + 4) {
            room.pendingEvents.push({ type: "PLAYER_FINISHED", playerId: pid });
            endMatch(room);
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
    for (const p of activePlayers) {
      room.players.set(p.id, p);
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
  player.position.x = spawnX;
  player.position.y = spawnY;
  player.velocity.x = 0;
  player.velocity.y = 0;
  player.grounded = false;
  player.coyoteTimer = 0;
  player.jumpBufferTimer = 0;
  player.kickPhase = "idle";
  player.kickTimer = 0;
  player.kickCooldown = 0;
  player.kickInvulnerable = 0;
  player.invulnerable = RESPAWN_INVULNERABILITY_SECONDS;
  player.checkpointChunkY = checkpointChunkY;
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
        player.coins += 1;
        room.pendingEvents.push({
          type: "COIN_COLLECTED",
          playerId,
          coinId: relic.id,
          value: 1,
          x: worldX,
          y: worldY
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
