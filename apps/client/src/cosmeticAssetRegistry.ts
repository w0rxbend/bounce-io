import { Assets, type Texture } from "pixi.js";
import type { BodyRigPartTexture, BodyRigTextures } from "./bodyRig";
import type { BodyPartSlot, CosmeticManifestSkin, CosmeticPartManifest, ParsedCosmeticManifest, PlayerCosmetics } from "./cosmetics";

type CosmeticPartName = "head" | "torso" | "chest" | "neck" | "arm" | "hand" | "leg" | "foot";
type TextureLoader = (url: string) => Promise<Texture>;
type RetryScheduler = (callback: () => void, delayMs: number) => void;

const RETRY_COOLDOWN_MS = 5_000;
const MAX_AUTOMATIC_RETRIES = 3;

export class CosmeticAssetRegistry {
  private readonly loader: TextureLoader;
  private readonly now: () => number;
  private readonly scheduleRetry: RetryScheduler;
  private generation = 0;
  private readonly metadata = new Map<string, CosmeticPartManifest>();
  private readonly ready = new Map<string, BodyRigPartTexture>();
  private readonly inFlight = new Map<string, Promise<boolean>>();
  private readonly failedAt = new Map<string, number>();
  private readonly retryAttempts = new Map<string, number>();
  private readonly listeners = new Set<(skinIds: ReadonlySet<string>) => void>();
  private readonly pendingNotificationIds = new Set<string>();
  private notificationQueued = false;

  constructor(
    loader: TextureLoader = (url) => Assets.load<Texture>(url),
    now: () => number = () => Date.now(),
    scheduleRetry: RetryScheduler = (callback, delayMs) => { globalThis.setTimeout(callback, delayMs); },
  ) {
    this.loader = loader;
    this.now = now;
    this.scheduleRetry = scheduleRetry;
  }

  install(manifest: ParsedCosmeticManifest): void {
    this.generation += 1;
    this.metadata.clear();
    this.ready.clear();
    this.inFlight.clear();
    this.failedAt.clear();
    this.retryAttempts.clear();
    for (const skin of manifest.skins) {
      for (const [part, meta] of Object.entries(skin.parts)) this.metadata.set(this.key(skin.id, part), meta);
    }
  }

  getPart(skinId: string, part: CosmeticPartName): BodyRigPartTexture | undefined {
    return this.ready.get(this.key(skinId, part));
  }

  getLoadout(cosmetics: PlayerCosmetics): BodyRigTextures {
    return {
      head: this.getPart(cosmetics.head, "head"), neck: this.getPart(cosmetics.head, "neck"),
      torso: this.getPart(cosmetics.torso, "torso"), chest: this.getPart(cosmetics.torso, "chest"),
      arm: this.getPart(cosmetics.arms, "arm"), hand: this.getPart(cosmetics.arms, "hand"),
      leg: this.getPart(cosmetics.legs, "leg"), foot: this.getPart(cosmetics.legs, "foot"),
    };
  }

  async ensureLoadout(cosmetics: PlayerCosmetics): Promise<void> {
    await this.ensureKeys([
      [cosmetics.head, "head"], [cosmetics.head, "neck"],
      [cosmetics.torso, "torso"], [cosmetics.torso, "chest"],
      [cosmetics.arms, "arm"], [cosmetics.arms, "hand"],
      [cosmetics.legs, "leg"], [cosmetics.legs, "foot"],
    ] as Array<[string, CosmeticPartName]>);
  }

  async ensurePickerParts(slot: BodyPartSlot, skinIds: readonly string[]): Promise<void> {
    const part: CosmeticPartName = slot === "head" ? "head" : slot === "torso" ? "torso" : slot === "arms" ? "arm" : "leg";
    await this.ensureKeys(skinIds.map((skinId) => [skinId, part]));
  }

  retryPart(skinId: string, part: CosmeticPartName): Promise<void> {
    const key = this.key(skinId, part);
    this.failedAt.delete(key);
    this.retryAttempts.delete(key);
    return this.ensureKeys([[skinId, part]]);
  }

  subscribe(listener: (skinIds: ReadonlySet<string>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private key(skinId: string, part: string): string {
    return `${skinId}/${part}`;
  }

  private async ensureKeys(entries: Array<[string, CosmeticPartName]>): Promise<void> {
    const generation = this.generation;
    const results = await Promise.allSettled(entries.map(([skinId, part]) => this.loadPart(skinId, part, generation)));
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (result?.status === "fulfilled" && result.value) this.queueNotification(entries[index]![0]);
    }
  }

  private loadPart(skinId: string, part: CosmeticPartName, generation: number): Promise<boolean> {
    const key = this.key(skinId, part);
    if (this.ready.has(key)) return Promise.resolve(false);
    const failedAt = this.failedAt.get(key);
    if (failedAt !== undefined && this.now() - failedAt < RETRY_COOLDOWN_MS) return Promise.resolve(false);
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const meta = this.metadata.get(key);
    if (!meta) return Promise.resolve(false);
    const promise = this.loader(meta.png).then((texture) => {
      if (generation !== this.generation) return false;
      if (texture.width !== meta.width || texture.height !== meta.height) throw new Error(`cosmetic ${key} dimensions do not match its manifest`);
      this.ready.set(key, { texture, width: meta.width, height: meta.height, pivot: meta.pivot });
      this.failedAt.delete(key);
      this.retryAttempts.delete(key);
      return true;
    }).catch(() => {
      if (generation === this.generation) {
        this.failedAt.set(key, this.now());
        const attempt = (this.retryAttempts.get(key) ?? 0) + 1;
        this.retryAttempts.set(key, attempt);
        if (attempt <= MAX_AUTOMATIC_RETRIES) {
          this.scheduleRetry(() => {
            if (generation !== this.generation || this.ready.has(key)) return;
            this.failedAt.delete(key);
            void this.ensureKeys([[skinId, part]]);
          }, RETRY_COOLDOWN_MS);
        }
      }
      return false;
    }).finally(() => {
      if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  private queueNotification(skinId: string): void {
    this.pendingNotificationIds.add(skinId);
    if (this.notificationQueued) return;
    this.notificationQueued = true;
    queueMicrotask(() => {
      this.notificationQueued = false;
      if (this.pendingNotificationIds.size === 0) return;
      const ids = new Set(this.pendingNotificationIds);
      this.pendingNotificationIds.clear();
      for (const listener of this.listeners) listener(ids);
    });
  }
}
