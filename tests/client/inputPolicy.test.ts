import assert from "node:assert/strict";
import test from "node:test";
import { movementInputPolicy } from "../../apps/client/src/inputPolicy.js";

const online = { spectator: false, hasLocalPlayer: true, mode: "online" as const, connected: true, matchPlaying: true };

test("online skill choices continue simulation with neutral controls", () => {
  assert.equal(movementInputPolicy({ ...online, modalActive: false }), "live");
  assert.equal(movementInputPolicy({ ...online, modalActive: true }), "neutral");
});

test("local choices pause their owned simulation", () => {
  assert.equal(movementInputPolicy({ ...online, mode: "local", modalActive: true }), "pause");
  assert.equal(movementInputPolicy({ ...online, mode: "local", modalActive: false }), "live");
});

test("spectator, disconnected, and non-playing online states pause prediction", () => {
  assert.equal(movementInputPolicy({ ...online, spectator: true, modalActive: false }), "pause");
  assert.equal(movementInputPolicy({ ...online, connected: false, modalActive: false }), "pause");
  assert.equal(movementInputPolicy({ ...online, matchPlaying: false, modalActive: false }), "pause");
});
