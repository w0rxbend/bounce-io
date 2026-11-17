import assert from "node:assert/strict";
import test from "node:test";
import { JUMP_SPEED, PHYSICS_STEP_SECONDS, createPlayerState, stepPlayer, type TileMap } from "@skybound/shared";
import { neutralRemoteInput, remoteRenderState } from "../../apps/client/src/remoteMotion.js";

const emptyMap: TileMap = { isSolid: () => false };
const hazardMap: TileMap = { isSolid: () => false, getTile: () => "hazard" };

test("remote extrapolation coasts with neutral input", () => {
  const coasting = createPlayerState("remote", 32, 32);
  coasting.grounded = false;
  coasting.velocity.x = 40;
  coasting.velocity.y = -JUMP_SPEED;
  const input = neutralRemoteInput();
  assert.equal(input.left, false);
  assert.equal(input.right, false);
  assert.equal(input.jumpHeld, false);
  const neutral = stepPlayer(coasting, input, emptyMap, PHYSICS_STEP_SECONDS).player;
  const held = stepPlayer(coasting, { ...input, right: true, jumpHeld: true }, emptyMap, PHYSICS_STEP_SECONDS).player;
  assert.ok(neutral.velocity.x < held.velocity.x);
  assert.ok(neutral.velocity.y > held.velocity.y);
});

test("extrapolated render state does not take simulated hazard health", () => {
  const authoritative = createPlayerState("remote", 0, 0);
  authoritative.health = 3;
  authoritative.invulnerable = 0;
  const simulated = stepPlayer(authoritative, neutralRemoteInput(), hazardMap, PHYSICS_STEP_SECONDS).player;
  assert.ok(simulated.health < authoritative.health);
  const rendered = remoteRenderState(authoritative, simulated);
  assert.equal(rendered.health, authoritative.health);
  assert.equal(rendered.invulnerable, authoritative.invulnerable);
});
