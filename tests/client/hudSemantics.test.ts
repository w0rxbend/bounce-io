import assert from "node:assert/strict";
import test from "node:test";
import { CombatSemanticTracker, combatSemanticSummary, type CombatSemanticState } from "../../apps/client/src/hudSemantics.js";

const base: CombatSemanticState = { health: 5, maxHealth: 5, shield: 3, maxShield: 3, stunned: false, attackReady: true, dashUnlocked: true, dashReady: true };

test("combat semantics announce transitions without per-frame repetition", () => {
  const tracker = new CombatSemanticTracker();
  assert.deepEqual(tracker.update(base, 0), []);
  assert.deepEqual(tracker.update({ ...base, health: 4, shield: 1 }, 10), []);
  assert.deepEqual(tracker.update({ ...base, health: 4, shield: 1 }, 200), []);
  const damage = tracker.update({ ...base, health: 4, shield: 1 }, 400);
  assert.ok(damage.some((event) => event.message === "Lost 1 health. 4 of 5 remaining."));
  assert.deepEqual(tracker.update({ ...base, health: 4, shield: 1 }, 500), []);
});

test("combat semantics prioritize shield break, stun, death and respawn", () => {
  const tracker = new CombatSemanticTracker();
  tracker.update(base, 0);
  const broken = tracker.update({ ...base, shield: 0, stunned: true }, 10);
  assert.ok(broken.some((event) => event.message === "Shield broken." && event.assertive));
  assert.ok(broken.some((event) => event.message === "Stunned." && event.assertive));
  assert.deepEqual(tracker.update({ ...base, health: 0, shield: 0 }, 20), [{ message: "Defeated. Respawning.", assertive: true }]);
  assert.deepEqual(tracker.update(base, 30), [{ message: "Respawned. Health 5 of 5.", assertive: false }]);
});

test("combat summary exposes shield and action availability", () => {
  assert.equal(combatSemanticSummary({ ...base, attackReady: false, dashReady: false }), "Shield 3 of 3. Attack recharging. Dash recharging.");
});
