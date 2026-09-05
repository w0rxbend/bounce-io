export interface CombatSemanticState {
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  stunned: boolean;
  attackReady: boolean;
  dashUnlocked: boolean;
  dashReady: boolean;
}

export interface CombatAnnouncement { message: string; assertive: boolean }

export class CombatSemanticTracker {
  private previous: CombatSemanticState | null = null;
  private pendingHealthLoss = 0;
  private pendingShieldLoss = 0;
  private lastDamageAt = -Infinity;

  reset(): void {
    this.previous = null;
    this.pendingHealthLoss = 0;
    this.pendingShieldLoss = 0;
    this.lastDamageAt = -Infinity;
  }

  update(current: CombatSemanticState, nowMs: number): CombatAnnouncement[] {
    const announcements: CombatAnnouncement[] = [];
    const previous = this.previous;
    this.previous = { ...current };
    if (!previous) return announcements;

    const died = previous.health > 0 && current.health <= 0;
    const respawned = previous.health <= 0 && current.health > 0;
    if (died) {
      this.pendingHealthLoss = 0;
      this.pendingShieldLoss = 0;
      announcements.push({ message: "Defeated. Respawning.", assertive: true });
      return announcements;
    }
    if (respawned) announcements.push({ message: `Respawned. Health ${Math.ceil(current.health)} of ${Math.ceil(current.maxHealth)}.`, assertive: false });

    if (current.health < previous.health) {
      this.pendingHealthLoss += previous.health - current.health;
      this.lastDamageAt = nowMs;
    }
    if (current.shield < previous.shield) {
      this.pendingShieldLoss += previous.shield - current.shield;
      this.lastDamageAt = nowMs;
    }
    if (previous.shield > 0 && current.shield <= 0) announcements.push({ message: "Shield broken.", assertive: true });
    if (!previous.stunned && current.stunned) announcements.push({ message: "Stunned.", assertive: true });
    if (!previous.attackReady && current.attackReady) announcements.push({ message: "Attack ready.", assertive: false });
    if (current.dashUnlocked && !previous.dashReady && current.dashReady) announcements.push({ message: "Dash ready.", assertive: false });

    if (nowMs - this.lastDamageAt >= 350) {
      if (this.pendingHealthLoss > 0) {
        announcements.push({ message: `Lost ${Math.ceil(this.pendingHealthLoss)} health. ${Math.ceil(current.health)} of ${Math.ceil(current.maxHealth)} remaining.`, assertive: true });
      } else if (this.pendingShieldLoss > 0 && current.shield > 0) {
        announcements.push({ message: `Shield absorbed ${Math.ceil(this.pendingShieldLoss)} damage.`, assertive: false });
      }
      this.pendingHealthLoss = 0;
      this.pendingShieldLoss = 0;
    }
    return announcements;
  }
}

export function combatSemanticSummary(state: CombatSemanticState): string {
  const shield = state.maxShield > 0 ? `Shield ${Math.ceil(state.shield)} of ${Math.ceil(state.maxShield)}. ` : "";
  const attack = state.attackReady ? "Attack ready." : "Attack recharging.";
  const dash = !state.dashUnlocked ? "Dash locked." : state.dashReady ? "Dash ready." : "Dash recharging.";
  const condition = state.health <= 0 ? "Defeated." : state.stunned ? "Stunned." : "";
  return `${shield}${attack} ${dash} ${condition}`.trim();
}
