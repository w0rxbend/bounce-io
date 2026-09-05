import assert from "node:assert/strict";
import test from "node:test";
import type { SkillCard } from "@skybound/shared";
import { nextSkillChoiceIndex, skillChoiceDenial, skillChoiceLabel } from "../../apps/client/src/skillChoiceSemantics.js";

const card: SkillCard = {
  id: "air_control", name: "Aerial Control", description: "Steer more precisely while airborne.", icon: "AIR",
  rarity: "rare", category: "mobility", currentStacks: 1, maxStacks: 4, coinCost: 7,
};

test("semantic skill labels expose full card state and affordability", () => {
  assert.equal(skillChoiceLabel(card, 3, 1), "2. Aerial Control. rare mobility. Steer more precisely while airborne. Stack 1 to 2 of 4. Costs 7 coins. Not enough coins.");
  assert.match(skillChoiceLabel(card, 7, 0), /Available\.$/);
  assert.equal(skillChoiceDenial(card, 3), "Need 7 coins for Aerial Control; you have 3.");
});

test("semantic skill focus navigation wraps and supports boundaries", () => {
  assert.equal(nextSkillChoiceIndex(0, 3, "previous"), 2);
  assert.equal(nextSkillChoiceIndex(2, 3, "next"), 0);
  assert.equal(nextSkillChoiceIndex(1, 3, "first"), 0);
  assert.equal(nextSkillChoiceIndex(1, 3, "last"), 2);
});
