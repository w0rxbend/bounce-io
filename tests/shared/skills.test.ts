import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerState } from "../../packages/shared/src/physics.js";
import { applySkillToPlayer, generateSkillCardOffer, SKILL_BY_ID, SKILL_RARITY_COIN_COST } from "../../packages/shared/src/skills.js";

test("common skill cards are free and don't touch coin balance", () => {
  const player = createPlayerState("p1", 0, 0);
  player.coins = 0;
  const definition = [...SKILL_BY_ID.values()].find((skill) => skill.rarity === "common")!;

  assert.equal(applySkillToPlayer(player, definition.id), true);
  assert.equal(player.coins, 0);
  assert.equal(player.selectedSkills[definition.id], 1);
});

test("rare/epic skill cards require enough coins and are rejected without them", () => {
  const player = createPlayerState("p1", 0, 0);
  const definition = [...SKILL_BY_ID.values()].find((skill) => skill.rarity === "rare")!;
  player.coins = SKILL_RARITY_COIN_COST.rare - 1;

  assert.equal(applySkillToPlayer(player, definition.id), false);
  assert.equal(player.coins, SKILL_RARITY_COIN_COST.rare - 1, "coins must not be deducted on rejection");
  assert.equal(player.selectedSkills[definition.id] ?? 0, 0);
});

test("rare/epic skill cards deduct their coin cost when affordable", () => {
  const player = createPlayerState("p1", 0, 0);
  const rare = [...SKILL_BY_ID.values()].find((skill) => skill.rarity === "rare")!;
  const epic = [...SKILL_BY_ID.values()].find((skill) => skill.rarity === "epic")!;
  player.coins = SKILL_RARITY_COIN_COST.rare + SKILL_RARITY_COIN_COST.epic;

  assert.equal(applySkillToPlayer(player, rare.id), true);
  assert.equal(player.coins, SKILL_RARITY_COIN_COST.epic);
  assert.equal(applySkillToPlayer(player, epic.id), true);
  assert.equal(player.coins, 0);
});

test("skill card offers carry the correct coinCost per rarity", () => {
  const player = createPlayerState("p1", 0, 0);
  const offer = generateSkillCardOffer(player, "offer-1", "seed-1");
  assert.ok(offer, "expected an offer to be generated for a fresh player");
  for (const card of offer!.cards) {
    assert.equal(card.coinCost, SKILL_RARITY_COIN_COST[card.rarity]);
  }
});
