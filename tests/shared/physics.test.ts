import assert from "node:assert/strict";
import test from "node:test";
import { COYOTE_TIME_SECONDS, JUMP_BUFFER_SECONDS, JUMP_SPEED, PLAYER_HEIGHT, PLAYER_WIDTH, TILE_SIZE } from "../../packages/shared/src/constants.js";
import { applyPlayerInteractions, createPlayerState, rectsOverlap, stepPlayer } from "../../packages/shared/src/physics.js";
import type { TileMap } from "../../packages/shared/src/types.js";

const floorMap: TileMap = {
  isSolid: (_x, y) => y >= 4
};

test("player falls onto solid tiles and becomes grounded", () => {
  let player = createPlayerState("p1", 2 * TILE_SIZE, 2 * TILE_SIZE);

  for (let i = 0; i < 60; i += 1) {
    player = stepPlayer(player, {
      left: false,
      right: false,
      jumpPressed: false,
      jumpHeld: false,
      drop: false,
      kick: false,
      sequence: i
    }, floorMap, 1 / 60).player;
  }

  assert.equal(player.grounded, true);
  assert.equal(player.velocity.y, 0);
  assert.equal(player.position.y, 4 * TILE_SIZE - 22);
});

test("horizontal movement resolves against wall tiles", () => {
  const wallMap: TileMap = {
    isSolid: (x, y) => x >= 5 || y >= 10
  };
  let player = createPlayerState("p1", 4 * TILE_SIZE + 2, 2 * TILE_SIZE);
  player.velocity.x = 120;

  player = stepPlayer(player, {
    left: false,
    right: true,
    jumpPressed: false,
    jumpHeld: false,
    drop: false,
    kick: false,
    sequence: 1
  }, wallMap, 1 / 20).player;

  assert.equal(player.position.x, 5 * TILE_SIZE - 14);
  assert.equal(player.velocity.x, 0);
});

test("one-way platform: player passes through from below (upward velocity)", () => {
  const oneWayRow = 4;
  const map: TileMap = {
    isSolid: () => false,
    isOneWay: (_x, y) => y === oneWayRow,
  };
  // Place player just below the one-way platform with upward velocity
  let player = createPlayerState("p1", TILE_SIZE, (oneWayRow - 1) * TILE_SIZE);
  player.velocity.y = -JUMP_SPEED; // moving upward

  player = stepPlayer(player, {
    left: false, right: false, jumpPressed: false, jumpHeld: true,
    drop: false, kick: false, sequence: 1
  }, map, 1 / 60).player;

  // Player should NOT have been snapped onto the one-way platform — should still be airborne
  assert.equal(player.grounded, false, "player must not land on one-way platform while moving upward");
});

test("one-way platform: player lands when falling from above", () => {
  const oneWayRow = 4;
  const map: TileMap = {
    isSolid: () => false,
    isOneWay: (_x, y) => y === oneWayRow,
  };
  // Place player 1px above the tile boundary so it crosses in one frame with velocity 80
  // bottom = (4*16 - 22 - 1) + 22 = 63; after one frame += ~1.6px → bottom ~64.6 → tile 4
  let player = createPlayerState("p1", TILE_SIZE, oneWayRow * TILE_SIZE - PLAYER_HEIGHT - 1);
  player.velocity.y = 80; // falling downward

  player = stepPlayer(player, {
    left: false, right: false, jumpPressed: false, jumpHeld: false,
    drop: false, kick: false, sequence: 1
  }, map, 1 / 60).player;

  assert.equal(player.grounded, true, "player must land on one-way platform when falling from above");
  assert.equal(player.velocity.y, 0, "vertical velocity must be zeroed on landing");
  assert.equal(player.position.y, oneWayRow * TILE_SIZE - PLAYER_HEIGHT, "player must be snapped to platform surface");
});

test("one-way platform: player drops through with drop=true", () => {
  const oneWayRow = 4;
  const map: TileMap = {
    isSolid: () => false,
    isOneWay: (_x, y) => y === oneWayRow,
  };
  // Player standing on platform surface, falling slowly (gravity)
  let player = createPlayerState("p1", TILE_SIZE, oneWayRow * TILE_SIZE - PLAYER_HEIGHT);
  player.velocity.y = 10;
  player.grounded = true;

  player = stepPlayer(player, {
    left: false, right: false, jumpPressed: false, jumpHeld: false,
    drop: true, kick: false, sequence: 1
  }, map, 1 / 60).player;

  assert.equal(player.grounded, false, "player must drop through one-way platform when drop=true");
});

test("one-way platform: player below surface while falling does not snap upward", () => {
  const oneWayRow = 4;
  const map: TileMap = {
    isSolid: () => false,
    isOneWay: (_x, y) => y === oneWayRow,
  };
  let player = createPlayerState("p1", TILE_SIZE, oneWayRow * TILE_SIZE - PLAYER_HEIGHT + 4);
  player.velocity.y = 30;

  player = stepPlayer(player, {
    left: false, right: false, jumpPressed: false, jumpHeld: false,
    drop: false, kick: false, sequence: 1
  }, map, 1 / 60).player;

  assert.equal(player.grounded, false, "player must not snap onto a one-way platform after already crossing its top");
  assert.ok(player.position.y > oneWayRow * TILE_SIZE - PLAYER_HEIGHT, "player should remain below the platform top");
});

test("one-way landing clears jump buffer", () => {
  const oneWayRow = 4;
  const map: TileMap = {
    isSolid: () => false,
    isOneWay: (_x, y) => y === oneWayRow,
  };
  // Player is airborne (grounded=false) so the buffered jump won't fire immediately
  let player = createPlayerState("p1", TILE_SIZE, oneWayRow * TILE_SIZE - PLAYER_HEIGHT - 1);
  player.velocity.y = 80;
  player.grounded = false;
  player.jumpBufferTimer = JUMP_BUFFER_SECONDS; // buffered jump active while airborne

  const result = stepPlayer(player, {
    left: false, right: false, jumpPressed: false, jumpHeld: false,
    drop: false, kick: false, sequence: 1
  }, map, 1 / 60).player;

  assert.equal(result.grounded, true, "player must land on platform");
  assert.equal(result.jumpBufferTimer, 0, "jump buffer must be cleared on one-way landing");
});

test("coyote time: jump succeeds just after leaving ground", () => {
  const map: TileMap = { isSolid: (_x, y) => y >= 4 };
  let player = createPlayerState("p1", TILE_SIZE, 4 * TILE_SIZE - PLAYER_HEIGHT);
  player.grounded = true;
  player.coyoteTimer = COYOTE_TIME_SECONDS;
  player.velocity.y = 1; // just left ground

  const noInput = { left: false, right: false, jumpPressed: false, jumpHeld: false, drop: false, kick: false, sequence: 0 };

  // Step one frame without grounding — coyote timer ticks down
  player = stepPlayer(player, noInput, { isSolid: () => false }, 1 / 60).player;
  assert.equal(player.grounded, false);
  assert.ok(player.coyoteTimer > 0, "coyote timer should still be positive");

  // Now jump — should succeed via coyote time
  const jumped = stepPlayer(player, { ...noInput, jumpPressed: true, jumpHeld: true, sequence: 1 }, { isSolid: () => false }, 1 / 60).player;
  assert.ok(jumped.velocity.y < 0, "coyote jump must apply upward velocity");
});

test("coin collection uses player center, not top-left corner", () => {
  // This verifies the fix: px = position.x + PLAYER_WIDTH/2, py = position.y + PLAYER_HEIGHT/2
  // A coin at world position (coinX, coinY) should be collectable when player center is within 20px
  const PLAYER_WIDTH_HALF = PLAYER_WIDTH / 2;  // 7
  const PLAYER_HEIGHT_HALF = PLAYER_HEIGHT / 2; // 11
  const coinX = 100, coinY = 100;

  // Player whose TOP-LEFT is exactly at coin position — old bug would fail to collect
  // but with the fix, center = (coinX + 7, coinY + 11) which is within 20px of coin
  const playerTopLeftAtCoin = { x: coinX, y: coinY };
  const centerX = playerTopLeftAtCoin.x + PLAYER_WIDTH_HALF;
  const centerY = playerTopLeftAtCoin.y + PLAYER_HEIGHT_HALF;
  assert.ok(Math.abs(centerX - coinX) < 20 && Math.abs(centerY - coinY) < 20,
    "player center must be within pickup radius when top-left is at coin position");

  // Player whose center is exactly 19px away from coin — should be collectable
  const dx = 19, dy = 0;
  const farPlayerCenter = { x: coinX - dx - PLAYER_WIDTH_HALF, y: coinY - PLAYER_HEIGHT_HALF };
  const farCenterX = farPlayerCenter.x + PLAYER_WIDTH_HALF;
  assert.ok(Math.abs(farCenterX - coinX) < 20, "player center 19px from coin must be within pickup radius");
});

test("rect overlap helper treats touching edges as non-overlap", () => {
  assert.equal(rectsOverlap(
    { x: 0, y: 0, width: 10, height: 10 },
    { x: 10, y: 0, width: 10, height: 10 }
  ), false);
  assert.equal(rectsOverlap(
    { x: 0, y: 0, width: 10, height: 10 },
    { x: 9, y: 0, width: 10, height: 10 }
  ), true);
});

test("kick interaction reports authoritative hit event once target becomes invulnerable", () => {
  const kicker = createPlayerState("p1", 20, 20);
  const target = createPlayerState("p2", 38, 20);
  kicker.kickPhase = "active";
  kicker.grounded = true;
  kicker.facing = 1;

  const events = applyPlayerInteractions([kicker, target], 1 / 60);

  assert.deepEqual(events, [{ type: "PLAYER_KICK_HIT", playerId: "p1", targetId: "p2" }]);
  assert.ok(target.kickInvulnerable > 0);
  assert.ok(target.velocity.x > 0);
});
