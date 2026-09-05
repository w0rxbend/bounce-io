import type { SkillCard } from "@skybound/shared";

export function skillChoiceLabel(card: SkillCard, coins: number, index: number): string {
  const nextStack = Math.min(card.maxStacks, card.currentStacks + 1);
  const cost = card.coinCost > 0 ? `Costs ${card.coinCost} coins.` : "Free.";
  const availability = card.coinCost <= coins ? "Available." : "Not enough coins.";
  const classification = card.branch
    ? `${card.rarity}, ${card.branch} branch, tier ${card.tier ?? 1}.`
    : `${card.rarity} ${card.category}.`;
  return `${index + 1}. ${card.name}. ${classification} ${card.description} Stack ${card.currentStacks} to ${nextStack} of ${card.maxStacks}. ${cost} ${availability}`;
}

export function skillChoiceDenial(card: SkillCard, coins: number): string {
  return `Need ${card.coinCost} coins for ${card.name}; you have ${coins}.`;
}

export function nextSkillChoiceIndex(current: number, count: number, key: "previous" | "next" | "first" | "last"): number {
  if (count <= 0) return -1;
  if (key === "first") return 0;
  if (key === "last") return count - 1;
  return (current + count + (key === "previous" ? -1 : 1)) % count;
}
