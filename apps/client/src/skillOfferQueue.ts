export interface IdentifiedSkillOffer {
  offerId: string;
}

export type OfferArrival<T> =
  | { kind: "ready"; offer: T }
  | { kind: "queued" }
  | { kind: "ignored" };

/**
 * Coordinates server offers independently from their visual presentation.
 * A current offer is owned by the modal; this queue owns only future and
 * completed IDs so reconnect resends cannot replace or double-submit it.
 */
export class SkillOfferQueue<T extends IdentifiedSkillOffer> {
  private readonly queued: T[] = [];
  private readonly queuedIds = new Set<string>();
  private readonly submittedIds = new Set<string>();
  private readonly submittedOrder: string[] = [];

  constructor(private readonly historyLimit = 64) {}

  receive(offer: T, activeOfferId: string | null): OfferArrival<T> {
    if (offer.offerId === activeOfferId || this.queuedIds.has(offer.offerId) || this.submittedIds.has(offer.offerId)) {
      return { kind: "ignored" };
    }
    if (activeOfferId !== null) {
      this.queued.push(offer);
      this.queuedIds.add(offer.offerId);
      return { kind: "queued" };
    }
    return { kind: "ready", offer };
  }

  next(): T | undefined {
    const offer = this.queued.shift();
    if (offer) this.queuedIds.delete(offer.offerId);
    return offer;
  }

  markSubmitted(offerId: string): boolean {
    if (this.submittedIds.has(offerId)) return false;
    this.submittedIds.add(offerId);
    this.submittedOrder.push(offerId);
    while (this.submittedOrder.length > Math.max(1, this.historyLimit)) {
      this.submittedIds.delete(this.submittedOrder.shift()!);
    }
    return true;
  }

  clear(): void {
    this.queued.length = 0;
    this.queuedIds.clear();
    this.submittedIds.clear();
    this.submittedOrder.length = 0;
  }

  get pendingCount(): number {
    return this.queued.length;
  }
}
