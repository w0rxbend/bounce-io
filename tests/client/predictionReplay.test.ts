import assert from "node:assert/strict";
import test from "node:test";
import { PHYSICS_STEP_SECONDS, createPlayerState, stepPlayer } from "@skybound/shared";
import { withReplayedState } from "../../apps/client/src/predictionReplay.js";

test("replay stores the corrected player for the next ack", () => {
  const authoritative = createPlayerState("local", 0, 0);
  authoritative.grounded = true;
  const input = {
    left: false,
    right: true,
    jumpPressed: false,
    jumpHeld: false,
    drop: false,
    kick: false,
    sequence: 2,
  };
  const stale = createPlayerState("local", 200, 0);
  const entry = { seq: 2, input, state: stale };
  const replayed = stepPlayer(authoritative, input, { isSolid: (_x, y) => y >= 20 }, PHYSICS_STEP_SECONDS).player;
  const stored = withReplayedState(entry, replayed);
  const nextAckError = Math.hypot(replayed.position.x - stored.state.position.x, replayed.position.y - stored.state.position.y);
  const staleError = Math.hypot(replayed.position.x - stale.position.x, replayed.position.y - stale.position.y);
  assert.ok(nextAckError < 0.001);
  assert.ok(staleError > 72);
  assert.equal(entry.state.position.x, 200);
});
