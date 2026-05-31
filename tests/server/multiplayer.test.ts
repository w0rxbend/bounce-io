import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlayerState,
  stepPlayer,
} from "../../packages/shared/src/physics.js";
import {
  generateVerticalChunk,
  createMultiChunkTileMap,
} from "../../packages/shared/src/generation.js";
import { isClientMessage, isServerMessage } from "../../packages/shared/src/validation.js";
import { PROTOCOL_VERSION, GAME_VERSION, TILE_SIZE, CHUNK_HEIGHT_TILES, PLAYER_HEIGHT, PLAYER_WIDTH } from "../../packages/shared/src/constants.js";
import type { PlayerInput, PlayerState, MatchEvent, RelicId } from "../../packages/shared/src/types.js";

// ── Inline room simulation helpers ────────────────────────────────────────────
// These mirror the server's room logic as pure functions so we can test
// coin collection, input ordering, and state management without a real WS server.

interface SimRoom {
  seed: number;
  collectedRelics: Set<RelicId>;
  pendingEvents: MatchEvent[];
  players: Map<string, PlayerState>;
  lastProcessedSeq: Map<string, number>;
}

function makeRoom(): SimRoom {
  return {
    seed: 42,
    collectedRelics: new Set(),
    pendingEvents: [],
    players: new Map(),
    lastProcessedSeq: new Map(),
  };
}

function joinRoom(room: SimRoom, id: string, x = 192, y = -100): PlayerState {
  const p = createPlayerState(id, x, y);
  room.players.set(id, p);
  room.lastProcessedSeq.set(id, -1);
  return p;
}

// Mirrors checkRelicCollection from the server
function checkRelicCollection(
  room: SimRoom,
  playerId: string,
  player: PlayerState,
  relics: Array<{ id: RelicId; worldX: number; worldY: number }>
): void {
  for (const relic of relics) {
    if (room.collectedRelics.has(relic.id)) continue;
    const dx = player.position.x + PLAYER_WIDTH / 2 - relic.worldX;
    const dy = player.position.y + PLAYER_HEIGHT / 2 - relic.worldY;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
      room.collectedRelics.add(relic.id);
      player.coins += 1;
      room.pendingEvents.push({
        type: "COIN_COLLECTED",
        playerId,
        coinId: relic.id,
        value: 1,
        x: relic.worldX,
        y: relic.worldY,
      });
    }
  }
}

function mergePendingInput(previous: PlayerInput | null, next: PlayerInput): PlayerInput {
  if (!previous) return next;
  return {
    ...next,
    jumpPressed: previous.jumpPressed || next.jumpPressed,
    kick: previous.kick || next.kick
  };
}

// Mirrors server input sequence check
function applyInput(
  room: SimRoom,
  playerId: string,
  seq: number
): "accepted" | "rejected" {
  const lastSeq = room.lastProcessedSeq.get(playerId) ?? -1;
  if (seq <= lastSeq) return "rejected";
  room.lastProcessedSeq.set(playerId, seq);
  return "accepted";
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("player state initialises with coins = 0", () => {
  const p = createPlayerState("p1", 0, 0);
  assert.equal(p.coins, 0);
  assert.equal(p.health, 5);
  assert.equal(p.level, 1);
});

test("player joins room with correct initial state", () => {
  const room = makeRoom();
  const p = joinRoom(room, "p1");
  assert.ok(room.players.has("p1"));
  assert.equal(p.coins, 0);
  assert.equal(room.lastProcessedSeq.get("p1"), -1);
});

test("duplicate player ID is overwritten (server should prevent; sim covers state isolation)", () => {
  const room = makeRoom();
  joinRoom(room, "p1");
  const p2 = joinRoom(room, "p1"); // same id
  assert.equal(room.players.size, 1);
  assert.equal(room.players.get("p1"), p2);
});

test("input sequence ordering: old inputs are rejected", () => {
  const room = makeRoom();
  joinRoom(room, "p1");

  assert.equal(applyInput(room, "p1", 0),  "accepted");
  assert.equal(applyInput(room, "p1", 1),  "accepted");
  assert.equal(applyInput(room, "p1", 5),  "accepted");
  assert.equal(applyInput(room, "p1", 4),  "rejected"); // stale
  assert.equal(applyInput(room, "p1", 5),  "rejected"); // duplicate
  assert.equal(applyInput(room, "p1", 6),  "accepted");
});

test("coin is collected exactly once even with two simultaneous collectors", () => {
  const room = makeRoom();
  const p1 = joinRoom(room, "p1", 100, 100);
  const p2 = joinRoom(room, "p2", 100, 100); // same position

  const relics = [{ id: "relic:0:0" as RelicId, worldX: 100, worldY: 100 }];

  checkRelicCollection(room, "p1", p1, relics);
  checkRelicCollection(room, "p2", p2, relics); // p2 tries after p1

  assert.equal(room.collectedRelics.size, 1);
  assert.equal(p1.coins, 1);
  assert.equal(p2.coins, 0); // p2 did not collect

  const coinEvents = room.pendingEvents.filter((e) => e.type === "COIN_COLLECTED");
  assert.equal(coinEvents.length, 1);
  const ev = coinEvents[0]!;
  assert.equal(ev.type, "COIN_COLLECTED");
  if (ev.type === "COIN_COLLECTED") {
    assert.equal(ev.playerId, "p1");
    assert.equal(ev.coinId, "relic:0:0");
    assert.equal(ev.value, 1);
  }
});

test("coin does not reappear after being collected", () => {
  const room = makeRoom();
  const p1 = joinRoom(room, "p1", 100, 100);

  const relics = [{ id: "relic:0:0" as RelicId, worldX: 100, worldY: 100 }];
  checkRelicCollection(room, "p1", p1, relics);
  checkRelicCollection(room, "p1", p1, relics); // same player walks over again

  assert.equal(p1.coins, 1); // still 1, not 2
  assert.equal(room.pendingEvents.filter((e) => e.type === "COIN_COLLECTED").length, 1);
});

test("two players each collect different coins independently", () => {
  const room = makeRoom();
  const p1 = joinRoom(room, "p1", 50, 50);
  const p2 = joinRoom(room, "p2", 200, 200);

  const relics = [
    { id: "relic:0:0" as RelicId, worldX: 50, worldY: 50 },
    { id: "relic:0:1" as RelicId, worldX: 200, worldY: 200 },
  ];

  checkRelicCollection(room, "p1", p1, relics);
  checkRelicCollection(room, "p2", p2, relics);

  assert.equal(p1.coins, 1);
  assert.equal(p2.coins, 1);
  assert.equal(room.collectedRelics.size, 2);
});

test("out-of-range player cannot collect distant coin", () => {
  const room = makeRoom();
  const p1 = joinRoom(room, "p1", 0, 0);

  const relics = [{ id: "relic:0:0" as RelicId, worldX: 500, worldY: 500 }];
  checkRelicCollection(room, "p1", p1, relics);

  assert.equal(p1.coins, 0);
  assert.equal(room.collectedRelics.size, 0);
});

test("malformed input messages are rejected by isClientMessage", () => {
  // Missing required fields
  assert.equal(isClientMessage({ type: "input", playerId: "p1" }), false);
  assert.equal(isClientMessage({ type: "input", playerId: "p1", input: {} }), false);

  // Negative sequence
  assert.equal(isClientMessage({
    type: "input", playerId: "p1",
    input: { left: false, right: false, jumpPressed: false, jumpHeld: false, drop: false, kick: false, sequence: -1 }
  }), false);

  // Unknown type
  assert.equal(isClientMessage({ type: "fakePosition", x: 9999, y: 9999 }), false);

  // Fake coin collection
  assert.equal(isClientMessage({ type: "coinCollected", coinId: "relic:0:0" }), false);

  // Fake win event
  assert.equal(isClientMessage({ type: "matchFinished", winner: "p1" }), false);
});

test("hello message with wrong protocol version is rejected", () => {
  assert.equal(isClientMessage({
    type: "hello",
    protocol: PROTOCOL_VERSION + 1, // wrong version
    version: GAME_VERSION,
    name: "hacker"
  }), false);
});

test("valid hello message passes validation", () => {
  assert.equal(isClientMessage({
    type: "hello",
    protocol: PROTOCOL_VERSION,
    version: GAME_VERSION,
    name: "runner"
  }), true);
});

test("valid hello with session token passes validation", () => {
  assert.equal(isClientMessage({
    type: "hello",
    protocol: PROTOCOL_VERSION,
    version: GAME_VERSION,
    name: "runner",
    token: "abc-123-def"
  }), true);
});

test("viewport interest message validates bounded chunk window", () => {
  assert.equal(isClientMessage({
    type: "viewport",
    minChunkY: 2,
    maxChunkY: 8,
    x1: 0,
    y1: -1200,
    x2: 576,
    y2: 120,
    visibleWidth: 960,
    visibleHeight: 540,
    zoom: 1.5,
  }), true);
  assert.equal(isClientMessage({
    type: "viewport",
    minChunkY: 8,
    maxChunkY: 2,
    x1: 0,
    y1: -1200,
    x2: 576,
    y2: 120,
    visibleWidth: 960,
    visibleHeight: 540,
    zoom: 1.5,
  }), false);
});

test("snapshot message validates correctly including coins in player state", () => {
  const playerState = createPlayerState("p1", 100, -50);
  playerState.grounded = true;
  playerState.coins = 3;

  assert.equal(isServerMessage({
    type: "snapshot",
    tick: 60,
    serverTick: 60,
    snapshotSeq: 1,
    serverTime: Date.now(),
    matchPhase: "playing",
    ackInputSeq: 42,
    players: [playerState],
    entities: [{
      id: "p1",
      type: "player",
      kind: "player",
      position: playerState.position,
      velocity: playerState.velocity,
      facing: playerState.facing,
      grounded: playerState.grounded,
    }],
    collectedRelics: ["relic:0:0", "relic:1:2"],
    events: [],
    lastProcessedSeq: { p1: 42 }
  }), true);
});

test("reliable events message validates separately from snapshots", () => {
  assert.equal(isServerMessage({
    type: "events",
    serverTick: 60,
    snapshotSeq: 2,
    serverTime: Date.now(),
    events: [{ type: "PLAYER_KICK_HIT", playerId: "p1", targetId: "p2" }]
  }), true);
});

test("relic state message validates collected relic sync", () => {
  assert.equal(isServerMessage({
    type: "relicState",
    serverTime: Date.now(),
    collectedRelics: ["relic:0:0", "relic:1:2"]
  }), true);
});

test("welcome message requires deterministic seed", () => {
  assert.equal(isServerMessage({
    type: "welcome",
    playerId: "p1",
    sessionToken: "token",
    serverTime: Date.now(),
    tickRate: 60,
    matchPhase: "waiting",
    seed: 123
  }), true);

  assert.equal(isServerMessage({
    type: "welcome",
    playerId: "p1",
    sessionToken: "token",
    serverTime: Date.now(),
    tickRate: 60,
    matchPhase: "waiting"
  }), false);
});

test("pending input merge preserves jump and kick edges from same tick", () => {
  const base: PlayerInput = {
    left: false, right: false, jumpPressed: true, jumpHeld: true,
    drop: false, kick: false, sequence: 10
  };
  const next: PlayerInput = {
    left: false, right: true, jumpPressed: false, jumpHeld: false,
    drop: false, kick: true, sequence: 11
  };
  const merged = mergePendingInput(base, next);
  assert.equal(merged.sequence, 11);
  assert.equal(merged.right, true);
  assert.equal(merged.jumpPressed, true);
  assert.equal(merged.kick, true);
});

test("snapshot with negative coins fails validation", () => {
  const badState = { ...createPlayerState("p1", 0, 0), coins: -1 };
  assert.equal(isServerMessage({
    type: "snapshot",
    tick: 1, serverTick: 1, snapshotSeq: 1, serverTime: Date.now(), matchPhase: "playing", ackInputSeq: -1,
    players: [badState], entities: [], collectedRelics: [], events: [], lastProcessedSeq: {}
  }), false);
});

test("chunk generation produces relics with stable IDs across regeneration", () => {
  const a = generateVerticalChunk({ seed: 42, chunkY: 1 });
  const b = generateVerticalChunk({ seed: 42, chunkY: 1 });
  assert.deepEqual(a.relics.map((r) => r.id), b.relics.map((r) => r.id));
});

test("physics simulation preserves coins field through stepPlayer", () => {
  const chunk = generateVerticalChunk({ seed: 1, chunkY: 0 });
  const tileMap = createMultiChunkTileMap(new Map([[0, chunk]]));

  const player = createPlayerState("p1", 192, 0);
  player.coins = 5;

  const noInput = {
    left: false, right: false, jumpPressed: false, jumpHeld: false,
    drop: false, kick: false, sequence: 0
  };

  const { player: next } = stepPlayer(player, noInput, tileMap, 1 / 60);
  assert.equal(next.coins, 5, "stepPlayer must not reset coins");
});

test("physics simulation preserves checkpoint respawn anchor through stepPlayer", () => {
  const chunk = generateVerticalChunk({ seed: 1, chunkY: 0 });
  const tileMap = createMultiChunkTileMap(new Map([[0, chunk]]));

  const player = createPlayerState("p1", 192, 0);
  player.checkpointChunkY = 3;

  const { player: next } = stepPlayer(player, {
    left: false, right: false, jumpPressed: false, jumpHeld: false,
    drop: false, kick: false, sequence: 0
  }, tileMap, 1 / 60);

  assert.equal(next.checkpointChunkY, 3, "stepPlayer must preserve checkpointChunkY");
});

test("disconnect-then-reconnect: lastProcessedSeq persists in room state", () => {
  const room = makeRoom();
  joinRoom(room, "p1");

  applyInput(room, "p1", 10);
  applyInput(room, "p1", 20);
  assert.equal(room.lastProcessedSeq.get("p1"), 20);

  // Simulate reconnect: player rejoins, seq tracking must not reset
  // (server retains seq in session; new session starts fresh but old rejected)
  // Here we verify the room map still holds correct seq
  assert.equal(room.lastProcessedSeq.get("p1"), 20);
  assert.ok(applyInput(room, "p1", 15) === "rejected"); // below 20
  assert.ok(applyInput(room, "p1", 21) === "accepted");
});

test("room loop stops on close: closed flag prevents further processing", () => {
  // Simulate the server's closed-room guard: `if (room.phase === "closed") return`
  let ticksRun = 0;

  function tickRoom(phase: string): void {
    if (phase === "closed") return;
    ticksRun++;
  }

  tickRoom("playing");
  tickRoom("playing");
  tickRoom("closed");
  tickRoom("closed");

  assert.equal(ticksRun, 2, "ticks must not run after room is closed");
});

test("WORLD_CHUNK relics are within chunk bounds", () => {
  for (let cy = 0; cy < 5; cy++) {
    const chunk = generateVerticalChunk({ seed: 999, chunkY: cy });
    for (const relic of chunk.relics) {
      assert.ok(relic.x >= 0 && relic.x < chunk.width,
        `relic.x=${relic.x} out of bounds in chunkY=${cy}`);
      assert.ok(relic.y >= 0 && relic.y < chunk.height,
        `relic.y=${relic.y} out of bounds in chunkY=${cy}`);
    }
  }
});
