package game

import "math"

const (
	skillLongReachPerStack               = 0.15
	skillMaxHitRangeMultiplier           = 1.75
	skillHeavyHitPerStack                = 0.10
	skillMaxAtkMultiplier                = 1.75
	skillQuickStrikePerStack             = 0.08
	skillMinAttackCooldownMultiplier     = 0.65
	skillProtectiveAuraReductionPerStack = 0.08
	skillMaxDamageReduction              = 0.50
	skillShieldBase                      = 25.0
	skillShieldPerStack                  = 15.0
	skillShieldRegenPerSecond            = 5.0
	skillShieldRegenDelayMs              = 3000.0
	skillSpringLegsPerStack              = 0.10
	skillMaxJumpMultiplier               = 1.40
	skillAirControlPerStack              = 0.12
	skillMaxAirControlMultiplier         = 1.50
	skillDashBaseCooldownMs              = 1800.0
	skillDashCooldownReductionPerStack   = 0.12
	skillPickupRadiusPerStack            = 0.25
	skillMaxPickupRadiusMultiplier       = 2.5
	skillXPCollectibleBonusPerStack      = 0.20
	skillKillXPBonusPerStack             = 0.15
	skillStaminaCooldownPerStack         = 0.06
	skillMaxStaminaCooldownReduction     = 0.30
	skillWindResistancePerStack          = 0.10
	skillMaxWindResistance               = 0.50
	skillHighJumpPerStack                = 0.07
	skillShieldCoreBase                  = 12.0
	skillShieldCorePerStack              = 10.0
	skillShieldCoreRegenPerStack         = 0.8
	skillGoldKeeperChancePerStack        = 0.10
	skillMaxGoldKeeperChance             = 0.45
)

// skillRarityCoinCost mirrors SKILL_RARITY_COIN_COST in
// packages/shared/src/skills.ts: common cards stay free (XP-driven
// level-ups pick them at no cost), rare/epic cards also cost coins.
var skillRarityCoinCost = map[string]int{
	"common": 0,
	"rare":   40,
	"epic":   90,
}

type skillDefinition struct {
	id          string
	name        string
	category    string
	rarity      string
	description string
	icon        string
	maxStacks   int
	weight      int
	branch      string
	tier        int
	unlockLevel int
	requires    []SkillPrerequisite
}

func skill(id, name, category, rarity, description, icon string, maxStacks, weight int, branch string, tier, unlockLevel int, requires ...SkillPrerequisite) skillDefinition {
	return skillDefinition{id: id, name: name, category: category, rarity: rarity, description: description, icon: icon, maxStacks: maxStacks, weight: weight, branch: branch, tier: tier, unlockLevel: unlockLevel, requires: requires}
}

var skillRegistry = []skillDefinition{
	skill("stamina", "Stamina", "attack", "common", "Fight recovery and punch cooldown -6%.", "STM", 5, 22, "stamina", 1, 2),
	skill("long_reach", "Long Reach", "attack", "common", "Hit range +15%.", "ARC", 5, 14, "stamina", 1, 2),
	skill("heavy_hit", "Heavy Hit", "attack", "common", "ATK damage +10%.", "FIST", 5, 13, "stamina", 1, 3),
	skill("quick_strike", "Quick Strike", "attack", "rare", "Attack cooldown -8% beyond Stamina.", "SPD", 4, 10, "stamina", 2, 5, SkillPrerequisite{SkillID: "stamina", Stacks: 2}),
	skill("shockwave_hit", "Shockwave Hit", "attack", "epic", "Every few hits emits a pixel shockwave.", "WAVE", 4, 5, "stamina", 3, 9, SkillPrerequisite{SkillID: "heavy_hit", Stacks: 2}),
	skill("wind_resistance", "Wind Resistance", "mobility", "common", "Wind force -10% and steadier aerial movement.", "GUST", 5, 22, "wind", 1, 2),
	skill("air_control", "Air Control", "mobility", "rare", "Air steering +12%.", "WIND", 4, 11, "wind", 2, 5, SkillPrerequisite{SkillID: "wind_resistance", Stacks: 2}),
	skill("high_jump", "High Jump", "mobility", "common", "Jump power +7%.", "UP", 5, 22, "jump", 1, 2),
	skill("spring_legs", "Spring Legs", "mobility", "rare", "Jump power +10% beyond High Jump.", "JUMP", 4, 10, "jump", 2, 5, SkillPrerequisite{SkillID: "high_jump", Stacks: 2}),
	skill("double_jump", "Double Jump", "mobility", "epic", "Unlocks an extra air jump.", "DBL", 1, 6, "jump", 3, 8, SkillPrerequisite{SkillID: "high_jump", Stacks: 3}),
	skill("dash", "Dash", "mobility", "epic", "Unlocks a short horizontal dash; stacks reduce its cooldown.", "DASH", 4, 6, "jump", 3, 9, SkillPrerequisite{SkillID: "spring_legs", Stacks: 2}),
	skill("shield", "Shield", "defense", "common", "Adds a small regenerating shield.", "SHD", 5, 22, "shield", 1, 2),
	skill("protective_aura", "Protective Aura", "defense", "common", "Incoming damage -8%.", "AURA", 4, 12, "shield", 1, 3),
	skill("energy_shield", "Energy Shield", "defense", "rare", "Greatly improves shield capacity and regeneration.", "SHLD", 5, 10, "shield", 2, 5, SkillPrerequisite{SkillID: "shield", Stacks: 2}),
	skill("last_stand", "Last Stand", "defense", "epic", "Low HP grants extra damage reduction.", "LAST", 4, 6, "shield", 3, 8, SkillPrerequisite{SkillID: "protective_aura", Stacks: 2}),
	skill("gold_keeper", "Gold Keeper", "utility", "common", "Chance for bonus coins and an extra enemy drop +10%.", "GOLD", 5, 22, "fortune", 1, 2),
	skill("xp_magnet", "XP Magnet", "utility", "common", "Pickup radius +25%.", "MAG", 4, 12, "fortune", 1, 3),
	skill("vital_growth", "Vital Growth", "utility", "common", "Max HP +15.", "HP+", 6, 10, "fortune", 1, 4),
	skill("dark_harvest", "Dark Harvest", "utility", "rare", "XP collectibles give +20% XP.", "XP+", 4, 9, "fortune", 2, 5, SkillPrerequisite{SkillID: "gold_keeper", Stacks: 2}),
	skill("battle_learning", "Battle Learning", "utility", "rare", "Enemy kill XP +15%.", "BOOK", 4, 9, "fortune", 2, 6, SkillPrerequisite{SkillID: "xp_magnet", Stacks: 2}),
}

func skillByID(id string) (skillDefinition, bool) {
	for _, skill := range skillRegistry {
		if skill.id == id {
			return skill, true
		}
	}
	return skillDefinition{}, false
}

func ensurePlayerSkillState(player *PlayerState) {
	if player.HitRange <= 0 {
		player.HitRange = KickRangePX
	}
	if player.AttackCooldownMs <= 0 {
		player.AttackCooldownMs = KickCooldownSeconds * 1000
	}
	if player.ShieldRegenDelayMs <= 0 {
		player.ShieldRegenDelayMs = skillShieldRegenDelayMs
	}
	if player.JumpPowerMultiplier <= 0 {
		player.JumpPowerMultiplier = 1
	}
	if player.AirControlMultiplier <= 0 {
		player.AirControlMultiplier = 1
	}
	if player.DashCooldownMs <= 0 {
		player.DashCooldownMs = skillDashBaseCooldownMs
	}
	if player.PickupRadius <= 0 {
		player.PickupRadius = PickupRadius
	}
	if player.XPGainMultiplier <= 0 {
		player.XPGainMultiplier = 1
	}
	if player.KillXPMultiplier <= 0 {
		player.KillXPMultiplier = 1
	}
	player.WindResistance = math.Max(0, player.WindResistance)
	player.BonusCollectibleChance = math.Max(0, player.BonusCollectibleChance)
	if player.SelectedSkills == nil {
		player.SelectedSkills = map[string]int{}
	}
}

func skillStacks(player PlayerState, skillID string) int {
	if player.SelectedSkills == nil {
		return 0
	}
	return max(0, player.SelectedSkills[skillID])
}

func goldKeeperBonus(player PlayerState, rewardKey string) int {
	if player.BonusCollectibleChance <= 0 {
		return 0
	}
	threshold := uint32(math.Round(math.Min(1, player.BonusCollectibleChance) * 10000))
	if HashString("gold:"+player.ID+":"+rewardKey)%10000 < threshold {
		return 1
	}
	return 0
}

func recalculateSkillDerivedStats(player *PlayerState) {
	ensurePlayerSkillState(player)
	longReach := skillStacks(*player, "long_reach")
	heavyHit := skillStacks(*player, "heavy_hit")
	quickStrike := skillStacks(*player, "quick_strike")
	stamina := skillStacks(*player, "stamina")
	protectiveAura := skillStacks(*player, "protective_aura")
	energyShield := skillStacks(*player, "energy_shield")
	shieldCore := skillStacks(*player, "shield")
	windResistance := skillStacks(*player, "wind_resistance")
	highJump := skillStacks(*player, "high_jump")
	springLegs := skillStacks(*player, "spring_legs")
	airControl := skillStacks(*player, "air_control")
	doubleJump := skillStacks(*player, "double_jump")
	dash := skillStacks(*player, "dash")
	xpMagnet := skillStacks(*player, "xp_magnet")
	darkHarvest := skillStacks(*player, "dark_harvest")
	battleLearning := skillStacks(*player, "battle_learning")
	goldKeeper := skillStacks(*player, "gold_keeper")

	baseDamage := float64(1 + player.RelicFragments/8)
	atkMultiplier := math.Min(skillMaxAtkMultiplier, 1+float64(heavyHit)*skillHeavyHitPerStack)
	player.Damage = max(1, int(math.Round(baseDamage*atkMultiplier)))
	baseAttackSpeed := math.Min(3, 1+float64(player.RelicFragments)*0.014)
	staminaReduction := math.Min(skillMaxStaminaCooldownReduction, float64(stamina)*skillStaminaCooldownPerStack)
	cooldownMultiplier := math.Max(skillMinAttackCooldownMultiplier, 1-staminaReduction-float64(quickStrike)*skillQuickStrikePerStack)
	player.AttackCooldownMs = KickCooldownSeconds * 1000 * cooldownMultiplier
	player.AttackSpeed = math.Max(baseAttackSpeed, baseAttackSpeed/cooldownMultiplier)
	player.HitRange = KickRangePX * math.Min(skillMaxHitRangeMultiplier, 1+float64(longReach)*skillLongReachPerStack)
	player.DamageReduction = math.Min(skillMaxDamageReduction, float64(protectiveAura)*skillProtectiveAuraReductionPerStack)
	if shieldCore > 0 || energyShield > 0 {
		coreShield := 0.0
		if shieldCore > 0 {
			coreShield = skillShieldCoreBase + float64(max(0, shieldCore-1))*skillShieldCorePerStack
		}
		maxShield := coreShield + float64(energyShield)*skillShieldPerStack
		player.MaxShield = maxShield
		if player.Shield <= 0 && player.LastDamageAt == 0 {
			player.Shield = maxShield
		}
		player.Shield = math.Max(0, math.Min(player.Shield, maxShield))
		player.ShieldRegenPerSec = float64(shieldCore)*skillShieldCoreRegenPerStack + float64(energyShield)*skillShieldRegenPerSecond
		player.ShieldRegenDelayMs = skillShieldRegenDelayMs
	} else {
		player.Shield = 0
		player.MaxShield = 0
		player.ShieldRegenPerSec = 0
	}
	player.JumpPowerMultiplier = math.Min(skillMaxJumpMultiplier, 1+float64(highJump)*skillHighJumpPerStack+float64(springLegs)*skillSpringLegsPerStack)
	player.AirControlMultiplier = math.Min(skillMaxAirControlMultiplier, 1+float64(airControl)*skillAirControlPerStack)
	player.JumpPower = math.Min(1.8, 1+float64(player.Crystals/3)*0.06) * player.JumpPowerMultiplier
	player.AirControl = math.Min(2, 1+float64(player.Crystals/3)*0.05) * player.AirControlMultiplier
	if doubleJump > 0 {
		player.ExtraJumps = 1
	} else {
		player.ExtraJumps = 0
	}
	player.DashUnlocked = dash > 0
	player.DashCooldownMs = skillDashBaseCooldownMs * math.Max(0.45, 1-float64(max(0, dash-1))*skillDashCooldownReductionPerStack)
	player.PickupRadius = PickupRadius * math.Min(skillMaxPickupRadiusMultiplier, 1+float64(xpMagnet)*skillPickupRadiusPerStack)
	player.XPGainMultiplier = 1 + float64(darkHarvest)*skillXPCollectibleBonusPerStack
	player.KillXPMultiplier = 1 + float64(battleLearning)*skillKillXPBonusPerStack
	player.WindResistance = math.Min(skillMaxWindResistance, float64(windResistance)*skillWindResistancePerStack)
	player.BonusCollectibleChance = math.Min(skillMaxGoldKeeperChance, float64(goldKeeper)*skillGoldKeeperChancePerStack)
}

func applySkillToPlayer(player *PlayerState, skillID string) bool {
	def, ok := skillByID(skillID)
	if !ok {
		return false
	}
	ensurePlayerSkillState(player)
	current := skillStacks(*player, skillID)
	if current >= def.maxStacks || player.Level < def.unlockLevel || !skillPrerequisitesMet(*player, def) {
		return false
	}
	coinCost := skillRarityCoinCost[def.rarity]
	if coinCost > 0 && player.Coins < coinCost {
		return false
	}
	if coinCost > 0 {
		player.Coins -= coinCost
	}
	player.SelectedSkills[skillID] = current + 1
	if skillID == "vital_growth" {
		player.MaxHealth += 15
		player.Health = min(player.MaxHealth, player.Health+15)
	}
	recalculateSkillDerivedStats(player)
	return true
}

func skillPrerequisitesMet(player PlayerState, def skillDefinition) bool {
	for _, requirement := range def.requires {
		if skillStacks(player, requirement.SkillID) < requirement.Stacks {
			return false
		}
	}
	return true
}

func availableSkillDefinitions(player PlayerState) []skillDefinition {
	out := []skillDefinition{}
	for _, skill := range skillRegistry {
		if player.Level >= skill.unlockLevel && skillStacks(player, skill.id) < skill.maxStacks && skillPrerequisitesMet(player, skill) {
			out = append(out, skill)
		}
	}
	return out
}

func skillCardFromDefinition(player PlayerState, def skillDefinition) SkillCard {
	return SkillCard{
		ID:            def.id,
		Name:          def.name,
		Category:      def.category,
		Rarity:        def.rarity,
		Description:   def.description,
		Icon:          def.icon,
		MaxStacks:     def.maxStacks,
		CurrentStacks: skillStacks(player, def.id),
		CoinCost:      skillRarityCoinCost[def.rarity],
		Branch:        def.branch,
		Tier:          def.tier,
		UnlockLevel:   def.unlockLevel,
		Requires:      def.requires,
	}
}

func nextSkillSeed(seed uint32) uint32 {
	return seed*1664525 + 1013904223
}

func generateSkillCardOffer(player PlayerState, offerID string, seed uint32) (SkillCardOffer, bool) {
	ensurePlayerSkillState(&player)
	pool := availableSkillDefinitions(player)
	if len(pool) == 0 {
		return SkillCardOffer{}, false
	}
	chosen := []skillDefinition{}
	usedCategories := map[string]struct{}{}
	for len(chosen) < 3 && len(chosen) < len(pool) {
		remaining := []skillDefinition{}
		for _, skill := range pool {
			duplicate := false
			for _, selected := range chosen {
				if selected.id == skill.id {
					duplicate = true
					break
				}
			}
			if !duplicate {
				remaining = append(remaining, skill)
			}
		}
		if len(chosen) == 0 {
			affordable := []skillDefinition{}
			for _, candidate := range remaining {
				if skillRarityCoinCost[candidate.rarity] <= player.Coins {
					affordable = append(affordable, candidate)
				}
			}
			if len(affordable) > 0 {
				remaining = affordable
			}
		}
		source := []skillDefinition{}
		for _, skill := range remaining {
			if _, ok := usedCategories[skill.category]; !ok {
				source = append(source, skill)
			}
		}
		if len(source) == 0 {
			source = remaining
		}
		totalWeight := 0
		for _, skill := range source {
			totalWeight += skill.weight
		}
		seed = nextSkillSeed(seed)
		pick := int(seed % uint32(max(1, totalWeight)))
		selected := source[len(source)-1]
		for _, skill := range source {
			pick -= skill.weight
			if pick < 0 {
				selected = skill
				break
			}
		}
		chosen = append(chosen, selected)
		usedCategories[selected.category] = struct{}{}
	}
	cards := make([]SkillCard, 0, len(chosen))
	for _, def := range chosen {
		cards = append(cards, skillCardFromDefinition(player, def))
	}
	return SkillCardOffer{OfferID: offerID, PlayerID: player.ID, Cards: cards}, true
}

func skillStatsPayload(player PlayerState) map[string]any {
	return map[string]any{
		"hp":                     player.Health,
		"maxHp":                  player.MaxHealth,
		"xp":                     player.Relics,
		"level":                  player.Level,
		"atk":                    player.Damage,
		"damage":                 player.Damage,
		"attackSpeed":            player.AttackSpeed,
		"hitRange":               player.HitRange,
		"attackCooldownMs":       player.AttackCooldownMs,
		"damageReduction":        player.DamageReduction,
		"shield":                 player.Shield,
		"maxShield":              player.MaxShield,
		"jumpPower":              player.JumpPower,
		"airControl":             player.AirControl,
		"extraJumps":             player.ExtraJumps,
		"dashUnlocked":           player.DashUnlocked,
		"pickupRadius":           player.PickupRadius,
		"xpGainMultiplier":       player.XPGainMultiplier,
		"killXpMultiplier":       player.KillXPMultiplier,
		"windResistance":         player.WindResistance,
		"bonusCollectibleChance": player.BonusCollectibleChance,
		"selectedSkills":         player.SelectedSkills,
	}
}
