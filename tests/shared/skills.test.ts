import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerState } from "../../packages/shared/src/physics.js";
import { applySkillToPlayer, generateSkillCardOffer, goldKeeperBonus, recalculateSkillDerivedStats, SKILL_BY_ID, SKILL_RARITY_COIN_COST } from "../../packages/shared/src/skills.js";

test("common skill cards are free and don't touch coin balance", () => {
  const player = createPlayerState("p1", 0, 0);
  player.level = 2;
  player.coins = 0;
  const definition = SKILL_BY_ID.get("stamina")!;

  assert.equal(applySkillToPlayer(player, definition.id), true);
  assert.equal(player.coins, 0);
  assert.equal(player.selectedSkills[definition.id], 1);
});

test("rare/epic skill cards require enough coins and are rejected without them", () => {
  const player = createPlayerState("p1", 0, 0);
  player.level = 5;
  player.selectedSkills.stamina = 2;
  const definition = SKILL_BY_ID.get("quick_strike")!;
  player.coins = SKILL_RARITY_COIN_COST.rare - 1;

  assert.equal(applySkillToPlayer(player, definition.id), false);
  assert.equal(player.coins, SKILL_RARITY_COIN_COST.rare - 1, "coins must not be deducted on rejection");
  assert.equal(player.selectedSkills[definition.id] ?? 0, 0);
});

test("rare/epic skill cards deduct their coin cost when affordable", () => {
  const player = createPlayerState("p1", 0, 0);
  player.level = 9;
  player.selectedSkills.stamina = 2;
  player.selectedSkills.high_jump = 3;
  const rare = SKILL_BY_ID.get("quick_strike")!;
  const epic = SKILL_BY_ID.get("double_jump")!;
  player.coins = SKILL_RARITY_COIN_COST.rare + SKILL_RARITY_COIN_COST.epic;

  assert.equal(applySkillToPlayer(player, rare.id), true);
  assert.equal(player.coins, SKILL_RARITY_COIN_COST.epic);
  assert.equal(applySkillToPlayer(player, epic.id), true);
  assert.equal(player.coins, 0);
});

test("skill card offers carry the correct coinCost per rarity", () => {
  const player = createPlayerState("p1", 0, 0);
  player.level = 2;
  const offer = generateSkillCardOffer(player, "offer-1", "seed-1");
  assert.ok(offer, "expected an offer to be generated for a fresh player");
  for (const card of offer!.cards) {
    assert.equal(card.coinCost, SKILL_RARITY_COIN_COST[card.rarity]);
  }
});

test("tiered cards stay locked until both level and branch prerequisites are met", () => {
  const player = createPlayerState("p1", 0, 0);
  player.level = 8;
  player.coins = 500;

  assert.equal(applySkillToPlayer(player, "double_jump"), false);
  player.selectedSkills.high_jump = 3;
  assert.equal(applySkillToPlayer(player, "double_jump"), true);
});

test("the five core branches provide bounded, distinct progression", () => {
  const player = createPlayerState("p1", 0, 0);
  player.level = 20;
  Object.assign(player.selectedSkills, {
    stamina: 5,
    wind_resistance: 5,
    high_jump: 5,
    shield: 5,
    gold_keeper: 5,
  });
  recalculateSkillDerivedStats(player);

  assert.equal(player.attackCooldownMs, 560);
  assert.equal(player.windResistance, 0.5);
  assert.ok(player.jumpPowerMultiplier > 1 && player.jumpPowerMultiplier <= 1.75);
  assert.equal(player.maxShield, 52);
  assert.equal(player.shieldRegenPerSecond, 4);
  assert.equal(player.bonusCollectibleChance, 0.45);
  assert.equal(goldKeeperBonus(player, "same-reward"), goldKeeperBonus(player, "same-reward"));
});

test("an offer starts with an affordable choice when stronger cards are unlocked", () => {
  const player = createPlayerState("p1", 0, 0);
  player.level = 9;
  player.coins = 0;
  Object.assign(player.selectedSkills, { stamina: 2, high_jump: 3, shield: 2 });
  const offer = generateSkillCardOffer(player, "offer-affordable", "seed-affordable");

  assert.ok(offer);
  assert.equal(offer!.cards[0]!.coinCost, 0);
});
