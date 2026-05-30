import { KICK_RANGE_PX, MELEE_ATTACK_COOLDOWN_SECONDS, PLAYER_BASE_AIR_CONTROL, PLAYER_BASE_ATTACK_SPEED, PLAYER_BASE_DAMAGE, PLAYER_BASE_JUMP_POWER } from "./constants.js";
import type { PlayerId, PlayerState } from "./types.js";

export type SkillCategory = "attack" | "defense" | "mobility" | "utility";
export type SkillRarity = "common" | "rare" | "epic";

export interface SkillCardDefinition {
  id: string;
  name: string;
  category: SkillCategory;
  rarity: SkillRarity;
  description: string;
  icon: string;
  maxStacks: number;
  weight: number;
}

export interface SkillCard {
  id: string;
  name: string;
  category: SkillCategory;
  rarity: SkillRarity;
  description: string;
  icon: string;
  maxStacks: number;
  currentStacks: number;
}

export interface SkillCardOffer {
  offerId: string;
  playerId: PlayerId;
  cards: SkillCard[];
}

export const SKILL_BALANCE = {
  longReachPerStack: 0.15,
  maxHitRangeMultiplier: 1.75,
  heavyHitPerStack: 0.10,
  maxAtkMultiplier: 1.75,
  quickStrikePerStack: 0.08,
  minAttackCooldownMultiplier: 0.65,
  protectiveAuraReductionPerStack: 0.08,
  maxDamageReduction: 0.50,
  shieldBase: 25,
  shieldPerStack: 15,
  shieldRegenPerSecond: 5,
  shieldRegenDelayMs: 3000,
  springLegsPerStack: 0.10,
  maxJumpMultiplier: 1.40,
  airControlPerStack: 0.12,
  maxAirControlMultiplier: 1.50,
  dashBaseCooldownMs: 1800,
  dashCooldownReductionPerStack: 0.12,
  pickupRadiusPerStack: 0.25,
  maxPickupRadiusMultiplier: 2.5,
  xpCollectibleBonusPerStack: 0.20,
  killXpBonusPerStack: 0.15,
} as const;

export const SKILL_REGISTRY: readonly SkillCardDefinition[] = [
  { id: "long_reach", name: "Long Reach", category: "attack", rarity: "common", description: "Hit range +15%.", icon: "ARC", maxStacks: 5, weight: 16 },
  { id: "heavy_hit", name: "Heavy Hit", category: "attack", rarity: "common", description: "ATK damage +10%.", icon: "FIST", maxStacks: 5, weight: 16 },
  { id: "quick_strike", name: "Quick Strike", category: "attack", rarity: "rare", description: "Attack cooldown -8%.", icon: "SPD", maxStacks: 4, weight: 11 },
  { id: "shockwave_hit", name: "Shockwave Hit", category: "attack", rarity: "epic", description: "Every few hits emits a pixel shockwave.", icon: "WAVE", maxStacks: 4, weight: 6 },
  { id: "protective_aura", name: "Protective Aura", category: "defense", rarity: "common", description: "Incoming damage -8%.", icon: "AURA", maxStacks: 4, weight: 14 },
  { id: "energy_shield", name: "Energy Shield", category: "defense", rarity: "rare", description: "Adds a regenerating shield before HP.", icon: "SHLD", maxStacks: 5, weight: 11 },
  { id: "last_stand", name: "Last Stand", category: "defense", rarity: "rare", description: "Low HP grants extra damage reduction.", icon: "LAST", maxStacks: 4, weight: 9 },
  { id: "spring_legs", name: "Spring Legs", category: "mobility", rarity: "common", description: "Jump power +10%.", icon: "JUMP", maxStacks: 4, weight: 14 },
  { id: "air_control", name: "Air Control", category: "mobility", rarity: "common", description: "Air steering +12%.", icon: "WIND", maxStacks: 4, weight: 13 },
  { id: "double_jump", name: "Double Jump", category: "mobility", rarity: "epic", description: "Unlocks an extra air jump.", icon: "DBL", maxStacks: 3, weight: 6 },
  { id: "dash", name: "Dash", category: "mobility", rarity: "epic", description: "Unlocks a short horizontal dash.", icon: "DASH", maxStacks: 4, weight: 6 },
  { id: "xp_magnet", name: "XP Magnet", category: "utility", rarity: "common", description: "Pickup radius +25%.", icon: "MAG", maxStacks: 4, weight: 14 },
  { id: "dark_harvest", name: "Dark Harvest", category: "utility", rarity: "rare", description: "XP collectibles give +20% XP.", icon: "XP+", maxStacks: 4, weight: 10 },
  { id: "vital_growth", name: "Vital Growth", category: "utility", rarity: "common", description: "Max HP +15.", icon: "HP+", maxStacks: 6, weight: 12 },
  { id: "battle_learning", name: "Battle Learning", category: "utility", rarity: "rare", description: "Enemy kill XP +15%.", icon: "BOOK", maxStacks: 4, weight: 10 },
] as const;

export const SKILL_BY_ID = new Map(SKILL_REGISTRY.map((skill) => [skill.id, skill]));

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function diminishingBonus(stacks: number, firstStackValue: number, decay: number): number {
  let total = 0;
  for (let i = 0; i < stacks; i += 1) total += firstStackValue / (1 + i * decay);
  return total;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextSeed(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function random01(seedRef: { value: number }): number {
  seedRef.value = nextSeed(seedRef.value);
  return seedRef.value / 0x1_0000_0000;
}

export function ensurePlayerSkillState(player: PlayerState): void {
  player.hitRange = Number.isFinite(player.hitRange) ? player.hitRange : KICK_RANGE_PX;
  player.attackCooldownMs = Number.isFinite(player.attackCooldownMs) ? player.attackCooldownMs : MELEE_ATTACK_COOLDOWN_SECONDS * 1000;
  player.damageReduction = Number.isFinite(player.damageReduction) ? player.damageReduction : 0;
  player.shield = Number.isFinite(player.shield) ? player.shield : 0;
  player.maxShield = Number.isFinite(player.maxShield) ? player.maxShield : 0;
  player.shieldRegenPerSecond = Number.isFinite(player.shieldRegenPerSecond) ? player.shieldRegenPerSecond : 0;
  player.shieldRegenDelayMs = Number.isFinite(player.shieldRegenDelayMs) ? player.shieldRegenDelayMs : SKILL_BALANCE.shieldRegenDelayMs;
  player.lastDamageAt = Number.isFinite(player.lastDamageAt) ? player.lastDamageAt : 0;
  player.shieldRegenCooldownMs = Number.isFinite(player.shieldRegenCooldownMs) ? player.shieldRegenCooldownMs : 0;
  player.jumpPowerMultiplier = Number.isFinite(player.jumpPowerMultiplier) ? player.jumpPowerMultiplier : 1;
  player.airControlMultiplier = Number.isFinite(player.airControlMultiplier) ? player.airControlMultiplier : 1;
  player.extraJumps = Number.isFinite(player.extraJumps) ? player.extraJumps : 0;
  player.extraJumpsUsed = Number.isFinite(player.extraJumpsUsed) ? player.extraJumpsUsed : 0;
  player.dashUnlocked = !!player.dashUnlocked;
  player.dashCooldownMs = Number.isFinite(player.dashCooldownMs) ? player.dashCooldownMs : SKILL_BALANCE.dashBaseCooldownMs;
  player.dashCooldownRemainingMs = Number.isFinite(player.dashCooldownRemainingMs) ? player.dashCooldownRemainingMs : 0;
  player.dashTimerMs = Number.isFinite(player.dashTimerMs) ? player.dashTimerMs : 0;
  player.pickupRadius = Number.isFinite(player.pickupRadius) ? player.pickupRadius : 24;
  player.xpGainMultiplier = Number.isFinite(player.xpGainMultiplier) ? player.xpGainMultiplier : 1;
  player.killXpMultiplier = Number.isFinite(player.killXpMultiplier) ? player.killXpMultiplier : 1;
  player.selectedSkills = player.selectedSkills && typeof player.selectedSkills === "object" ? player.selectedSkills : {};
  player.shockwaveCounter = Number.isFinite(player.shockwaveCounter) ? player.shockwaveCounter : 0;
}

export function skillStacks(player: PlayerState, skillId: string): number {
  ensurePlayerSkillState(player);
  return Math.max(0, Math.floor(player.selectedSkills[skillId] ?? 0));
}

export function recalculateSkillDerivedStats(player: PlayerState): void {
  ensurePlayerSkillState(player);
  const longReach = skillStacks(player, "long_reach");
  const heavyHit = skillStacks(player, "heavy_hit");
  const quickStrike = skillStacks(player, "quick_strike");
  const protectiveAura = skillStacks(player, "protective_aura");
  const energyShield = skillStacks(player, "energy_shield");
  const springLegs = skillStacks(player, "spring_legs");
  const airControl = skillStacks(player, "air_control");
  const doubleJump = skillStacks(player, "double_jump");
  const dash = skillStacks(player, "dash");
  const xpMagnet = skillStacks(player, "xp_magnet");
  const darkHarvest = skillStacks(player, "dark_harvest");
  const battleLearning = skillStacks(player, "battle_learning");

  const baseDamage = Math.min(1.45, PLAYER_BASE_DAMAGE + diminishingBonus(player.relicFragments, 0.035, 0.32));
  const baseAttackSpeed = Math.min(1.28, PLAYER_BASE_ATTACK_SPEED + diminishingBonus(player.relicFragments, 0.014, 0.36));
  const baseJumpPower = Math.min(1.22, PLAYER_BASE_JUMP_POWER + diminishingBonus(player.crystals, 0.018, 0.42));
  const baseAirControl = Math.min(1.1, PLAYER_BASE_AIR_CONTROL + diminishingBonus(player.crystals, 0.007, 0.5));

  player.hitRange = Math.round(KICK_RANGE_PX * Math.min(SKILL_BALANCE.maxHitRangeMultiplier, 1 + longReach * SKILL_BALANCE.longReachPerStack));
  const atkMultiplier = Math.min(SKILL_BALANCE.maxAtkMultiplier, 1 + heavyHit * SKILL_BALANCE.heavyHitPerStack);
  player.damage = baseDamage * atkMultiplier;
  const cooldownMultiplier = Math.max(SKILL_BALANCE.minAttackCooldownMultiplier, 1 - quickStrike * SKILL_BALANCE.quickStrikePerStack);
  player.attackCooldownMs = MELEE_ATTACK_COOLDOWN_SECONDS * 1000 * cooldownMultiplier;
  player.attackSpeed = Math.max(baseAttackSpeed, baseAttackSpeed / cooldownMultiplier);
  player.damageReduction = Math.min(SKILL_BALANCE.maxDamageReduction, protectiveAura * SKILL_BALANCE.protectiveAuraReductionPerStack);
  if (energyShield > 0) {
    const maxShield = SKILL_BALANCE.shieldBase + Math.max(0, energyShield - 1) * SKILL_BALANCE.shieldPerStack;
    player.maxShield = maxShield;
    player.shield = clamp(player.shield, 0, maxShield);
    if (player.shield <= 0 && player.lastDamageAt === 0) player.shield = maxShield;
    player.shieldRegenPerSecond = SKILL_BALANCE.shieldRegenPerSecond;
    player.shieldRegenDelayMs = SKILL_BALANCE.shieldRegenDelayMs;
  } else {
    player.maxShield = 0;
    player.shield = 0;
    player.shieldRegenPerSecond = 0;
  }
  player.jumpPowerMultiplier = Math.min(SKILL_BALANCE.maxJumpMultiplier, 1 + springLegs * SKILL_BALANCE.springLegsPerStack);
  player.airControlMultiplier = Math.min(SKILL_BALANCE.maxAirControlMultiplier, 1 + airControl * SKILL_BALANCE.airControlPerStack);
  player.jumpPower = baseJumpPower * player.jumpPowerMultiplier;
  player.airControl = baseAirControl * player.airControlMultiplier;
  player.extraJumps = doubleJump > 0 ? 1 : 0;
  player.dashUnlocked = dash > 0;
  player.dashCooldownMs = SKILL_BALANCE.dashBaseCooldownMs * Math.max(0.45, 1 - Math.max(0, dash - 1) * SKILL_BALANCE.dashCooldownReductionPerStack);
  player.pickupRadius = 24 * Math.min(SKILL_BALANCE.maxPickupRadiusMultiplier, 1 + xpMagnet * SKILL_BALANCE.pickupRadiusPerStack);
  player.xpGainMultiplier = 1 + darkHarvest * SKILL_BALANCE.xpCollectibleBonusPerStack;
  player.killXpMultiplier = 1 + battleLearning * SKILL_BALANCE.killXpBonusPerStack;
}

export function applySkillToPlayer(player: PlayerState, skillId: string): boolean {
  const definition = SKILL_BY_ID.get(skillId);
  if (!definition) return false;
  ensurePlayerSkillState(player);
  const current = skillStacks(player, skillId);
  if (current >= definition.maxStacks) return false;
  player.selectedSkills[skillId] = current + 1;
  if (skillId === "vital_growth") {
    player.maxHealth += 15;
    player.health = Math.min(player.maxHealth, player.health + 15);
  }
  recalculateSkillDerivedStats(player);
  return true;
}

function availableSkills(player: PlayerState): SkillCardDefinition[] {
  ensurePlayerSkillState(player);
  return SKILL_REGISTRY.filter((skill) => skillStacks(player, skill.id) < skill.maxStacks);
}

function toCard(player: PlayerState, definition: SkillCardDefinition): SkillCard {
  return {
    id: definition.id,
    name: definition.name,
    category: definition.category,
    rarity: definition.rarity,
    description: definition.description,
    icon: definition.icon,
    maxStacks: definition.maxStacks,
    currentStacks: skillStacks(player, definition.id),
  };
}

export function generateSkillCardOffer(player: PlayerState, offerId: string, seedInput: string | number): SkillCardOffer | null {
  ensurePlayerSkillState(player);
  const pool = availableSkills(player);
  if (pool.length === 0) return null;
  const seedRef = { value: typeof seedInput === "number" ? seedInput >>> 0 : hashString(seedInput) };
  const chosen: SkillCardDefinition[] = [];
  const categories = new Set<SkillCategory>();

  while (chosen.length < Math.min(3, pool.length)) {
    const remaining = pool.filter((skill) => !chosen.some((card) => card.id === skill.id));
    const varied = remaining.filter((skill) => !categories.has(skill.category));
    const source = varied.length > 0 ? varied : remaining;
    const totalWeight = source.reduce((sum, skill) => sum + skill.weight, 0);
    let pick = random01(seedRef) * totalWeight;
    let selected = source[source.length - 1]!;
    for (const skill of source) {
      pick -= skill.weight;
      if (pick <= 0) {
        selected = skill;
        break;
      }
    }
    chosen.push(selected);
    categories.add(selected.category);
  }

  return {
    offerId,
    playerId: player.id,
    cards: chosen.map((definition) => toCard(player, definition)),
  };
}

export function pendingSkillVisuals(player: PlayerState): {
  shield: boolean;
  aura: boolean;
  dash: boolean;
  doubleJump: boolean;
  xpAura: boolean;
} {
  return {
    shield: skillStacks(player, "energy_shield") > 0,
    aura: skillStacks(player, "protective_aura") > 0 || skillStacks(player, "last_stand") > 0,
    dash: skillStacks(player, "dash") > 0,
    doubleJump: skillStacks(player, "double_jump") > 0,
    xpAura: skillStacks(player, "xp_magnet") > 0 || skillStacks(player, "dark_harvest") > 0,
  };
}
