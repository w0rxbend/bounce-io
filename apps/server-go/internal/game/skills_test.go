package game

import "testing"

func TestApplySkillToPlayerFreeCommonCardNeedsNoCoins(t *testing.T) {
	player := CreatePlayerState("p1", 0, 0)
	player.Level = 2
	player.Coins = 0

	if !applySkillToPlayer(&player, "long_reach") {
		t.Fatalf("expected free common card to apply with 0 coins")
	}
	if player.Coins != 0 {
		t.Fatalf("expected coins unchanged for a free card, got %d", player.Coins)
	}
	if skillStacks(player, "long_reach") != 1 {
		t.Fatalf("expected skill stack to increase")
	}
}

func TestApplySkillToPlayerRareCardRequiresCoins(t *testing.T) {
	player := CreatePlayerState("p1", 0, 0)
	player.Level = 5
	player.SelectedSkills["stamina"] = 2
	player.Coins = 10 // less than quick_strike's rare cost

	if applySkillToPlayer(&player, "quick_strike") {
		t.Fatalf("expected rare card to be rejected without enough coins")
	}
	if skillStacks(player, "quick_strike") != 0 {
		t.Fatalf("expected no stack gained when rejected for insufficient coins")
	}
	if player.Coins != 10 {
		t.Fatalf("expected coins unchanged on rejection, got %d", player.Coins)
	}
}

func TestApplySkillToPlayerDeductsCoinsForRareAndEpicCards(t *testing.T) {
	player := CreatePlayerState("p1", 0, 0)
	player.Level = 9
	player.SelectedSkills["stamina"] = 2
	player.SelectedSkills["high_jump"] = 3
	player.Coins = 200

	if !applySkillToPlayer(&player, "quick_strike") { // rare, costs 40
		t.Fatalf("expected rare card to apply with enough coins")
	}
	if player.Coins != 160 {
		t.Fatalf("expected 40 coins deducted for a rare card, got balance %d", player.Coins)
	}

	if !applySkillToPlayer(&player, "double_jump") { // epic, costs 90
		t.Fatalf("expected epic card to apply with enough coins")
	}
	if player.Coins != 70 {
		t.Fatalf("expected 90 more coins deducted for an epic card, got balance %d", player.Coins)
	}
}

func TestSkillCardFromDefinitionCarriesCoinCostByRarity(t *testing.T) {
	player := CreatePlayerState("p1", 0, 0)
	def, ok := skillByID("long_reach") // common
	if !ok {
		t.Fatalf("expected long_reach to exist in registry")
	}
	if card := skillCardFromDefinition(player, def); card.CoinCost != 0 {
		t.Fatalf("expected common card coinCost 0, got %d", card.CoinCost)
	}

	rareDef, ok := skillByID("quick_strike")
	if !ok {
		t.Fatalf("expected quick_strike to exist in registry")
	}
	if card := skillCardFromDefinition(player, rareDef); card.CoinCost != skillRarityCoinCost["rare"] {
		t.Fatalf("expected rare card coinCost %d, got %d", skillRarityCoinCost["rare"], card.CoinCost)
	}
}
