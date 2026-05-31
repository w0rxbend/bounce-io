import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";

export type SplashPlatformNode = {
  id: string;
  x: number;
  y: number;
  width: number;
};

export type SplashJumpPath = {
  from: string;
  to: string;
  durationMs: number;
  waitMs: number;
  arcHeight: number;
};

export type SplashActor<SkinId extends string = string> = {
  id: string;
  skinId: SkinId;
  currentPathIndex: number;
  elapsedMs: number;
  paths: SplashJumpPath[];
};

type SplashAnimationState = "idle" | "jump" | "run" | "hit";
type SplashActorPhase = "idle" | "prep" | "jump" | "land";

export interface MenuSplashBackgroundOptions<SkinId extends string = string> {
  skinIds: readonly SkinId[];
  selectedSkinId: () => SkinId;
  makeActorSprite?: (skinId: SkinId) => Sprite | null;
  getActorTexture?: (skinId: SkinId, state: SplashAnimationState, elapsedMs: number) => Texture | null;
}

interface RuntimeSplashActor<SkinId extends string> extends SplashActor<SkinId> {
  container: Container;
  shadow: Graphics;
  body: Graphics;
  sprite: Sprite | null;
  color: number;
  facing: 1 | -1;
  lastPhase: SplashActorPhase;
  visualScale: number;
}

interface SplashDust {
  sprite: Sprite;
  active: boolean;
  lifeMs: number;
  maxLifeMs: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface SplashCloud {
  container: Container;
  baseX: number;
  y: number;
  width: number;
  speed: number;
}

const PREP_MS = 180;
const LAND_MS = 220;
const CACHE_OPTIONS = { antialias: false, resolution: 1, scaleMode: "nearest" as const };
const ACTOR_COLORS = [0xf3c64b, 0x48d6ff, 0x5dff9c, 0xff9f4a] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function mixColor(a: number, b: number, t: number): number {
  const c = clamp(t, 0, 1);
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (Math.round(mix(ar, br, c)) << 16) | (Math.round(mix(ag, bg, c)) << 8) | Math.round(mix(ab, bb, c));
}

function disableEvents(node: { eventMode?: string }): void {
  node.eventMode = "none";
}

export class MenuSplashBackground<SkinId extends string = string> extends Container {
  private readonly options: MenuSplashBackgroundOptions<SkinId>;
  private readonly sky = new Graphics();
  private readonly cloudLayer = new Container();
  private readonly platformLayer = new Container();
  private readonly dustLayer = new Container();
  private readonly actorLayer = new Container();
  private readonly shade = new Graphics();
  private readonly actors: RuntimeSplashActor<SkinId>[] = [];
  private readonly dustPool: SplashDust[] = [];
  private readonly clouds: SplashCloud[] = [];
  private nodes = new Map<string, SplashPlatformNode>();
  private screenWidth = 0;
  private screenHeight = 0;
  private selectedSkinId: SkinId;

  constructor(options: MenuSplashBackgroundOptions<SkinId>) {
    super({ label: "MenuSplashBackground", sortableChildren: false });
    this.options = options;
    this.selectedSkinId = options.selectedSkinId();
    this.eventMode = "none";
    this.interactiveChildren = false;

    for (const layer of [this.sky, this.cloudLayer, this.platformLayer, this.dustLayer, this.actorLayer, this.shade]) {
      disableEvents(layer);
    }

    this.addChild(this.sky, this.cloudLayer, this.platformLayer, this.dustLayer, this.actorLayer, this.shade);
    this.createDustPool();
    this.createActors();
  }

  layout(width: number, height: number): void {
    const sw = Math.max(1, Math.round(width));
    const sh = Math.max(1, Math.round(height));
    if (sw === this.screenWidth && sh === this.screenHeight) return;
    this.screenWidth = sw;
    this.screenHeight = sh;
    this.hitArea = new Rectangle(0, 0, sw, sh);
    this.rebuildSky(sw, sh);
    this.rebuildClouds(sw, sh);
    this.rebuildPlatforms(sw, sh);
    this.repositionActors();
  }

  setSelectedSkinId(skinId: SkinId): void {
    if (this.selectedSkinId === skinId) return;
    this.selectedSkinId = skinId;
    const hero = this.actors[0];
    if (hero) this.setActorSkin(hero, skinId);
  }

  update(dtMs: number, elapsedSec: number): void {
    const boundedDt = Math.min(Math.max(dtMs, 0), 1000 / 20);
    this.layout(this.screenWidth, this.screenHeight);
    this.updateClouds(elapsedSec);
    for (const actor of this.actors) this.updateActor(actor, boundedDt, elapsedSec * 1000);
    this.updateDust(boundedDt);
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    for (const dust of this.dustPool) dust.active = false;
    this.actors.length = 0;
    this.dustPool.length = 0;
    this.clouds.length = 0;
    this.nodes.clear();
    super.destroy(options ?? { children: true });
  }

  private createDustPool(): void {
    for (let i = 0; i < 28; i++) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.visible = false;
      sprite.tint = i % 2 === 0 ? 0xd7c08a : 0x8c7654;
      sprite.width = 3;
      sprite.height = 2;
      disableEvents(sprite);
      this.dustLayer.addChild(sprite);
      this.dustPool.push({
        sprite,
        active: false,
        lifeMs: 0,
        maxLifeMs: 1,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      });
    }
  }

  private createActors(): void {
    const skinIds = this.options.skinIds.length > 0 ? this.options.skinIds : [this.selectedSkinId];
    const actorSpecs: Array<{ id: string; skin: SkinId; color: number; delay: number; paths: SplashJumpPath[] }> = [
      {
        id: "splash-hero",
        skin: this.selectedSkinId,
        color: ACTOR_COLORS[0],
        delay: 120,
        paths: [
          { from: "left-low", to: "mid-low", durationMs: 760, waitMs: 760, arcHeight: 96 },
          { from: "mid-low", to: "mid-high", durationMs: 720, waitMs: 620, arcHeight: 118 },
          { from: "mid-high", to: "right-high", durationMs: 820, waitMs: 700, arcHeight: 104 },
          { from: "right-high", to: "right-low", durationMs: 680, waitMs: 580, arcHeight: 82 },
          { from: "right-low", to: "left-low", durationMs: 980, waitMs: 900, arcHeight: 118 },
        ],
      },
      {
        id: "splash-rival-a",
        skin: skinIds[2 % skinIds.length]!,
        color: ACTOR_COLORS[1],
        delay: 900,
        paths: [
          { from: "right-low", to: "center-ledge", durationMs: 700, waitMs: 850, arcHeight: 86 },
          { from: "center-ledge", to: "left-high", durationMs: 820, waitMs: 720, arcHeight: 116 },
          { from: "left-high", to: "left-low", durationMs: 640, waitMs: 760, arcHeight: 88 },
          { from: "left-low", to: "right-low", durationMs: 930, waitMs: 900, arcHeight: 112 },
        ],
      },
      {
        id: "splash-rival-b",
        skin: skinIds[5 % skinIds.length]!,
        color: ACTOR_COLORS[2],
        delay: 1560,
        paths: [
          { from: "left-high", to: "mid-high", durationMs: 680, waitMs: 780, arcHeight: 82 },
          { from: "mid-high", to: "center-ledge", durationMs: 720, waitMs: 650, arcHeight: 94 },
          { from: "center-ledge", to: "right-high", durationMs: 760, waitMs: 820, arcHeight: 104 },
          { from: "right-high", to: "left-high", durationMs: 960, waitMs: 980, arcHeight: 122 },
        ],
      },
      {
        id: "splash-rival-c",
        skin: skinIds[8 % skinIds.length]!,
        color: ACTOR_COLORS[3],
        delay: 2160,
        paths: [
          { from: "mid-low", to: "right-low", durationMs: 640, waitMs: 920, arcHeight: 76 },
          { from: "right-low", to: "right-high", durationMs: 720, waitMs: 700, arcHeight: 104 },
          { from: "right-high", to: "mid-high", durationMs: 740, waitMs: 900, arcHeight: 92 },
          { from: "mid-high", to: "mid-low", durationMs: 600, waitMs: 820, arcHeight: 80 },
        ],
      },
    ];

    for (const spec of actorSpecs) {
      const container = new Container();
      const shadow = new Graphics();
      const body = new Graphics();
      disableEvents(container);
      disableEvents(shadow);
      disableEvents(body);
      container.addChild(shadow, body);
      this.actorLayer.addChild(container);
      const actor: RuntimeSplashActor<SkinId> = {
        id: spec.id,
        skinId: spec.skin,
        currentPathIndex: 0,
        elapsedMs: spec.delay,
        paths: spec.paths,
        container,
        shadow,
        body,
        sprite: null,
        color: spec.color,
        facing: 1,
        lastPhase: "idle",
        visualScale: 1,
      };
      this.setActorSkin(actor, spec.skin);
      this.actors.push(actor);
    }
  }

  private setActorSkin(actor: RuntimeSplashActor<SkinId>, skinId: SkinId): void {
    actor.skinId = skinId;
    if (actor.sprite) {
      actor.sprite.destroy();
      actor.sprite = null;
    }
    const sprite = this.options.makeActorSprite?.(skinId) ?? null;
    if (sprite) {
      sprite.anchor.set(0.5, 1);
      sprite.alpha = 0.92;
      disableEvents(sprite);
      actor.sprite = sprite;
      actor.container.addChild(sprite);
    }
  }

  private rebuildSky(sw: number, sh: number): void {
    this.sky.clear();
    const bands = 12;
    for (let i = 0; i < bands; i++) {
      const y = Math.round((i / bands) * sh);
      const nextY = Math.ceil(((i + 1) / bands) * sh);
      const t = i / Math.max(1, bands - 1);
      const color = mixColor(0x4f7fa6, 0x091426, t);
      this.sky.rect(0, y, sw, nextY - y + 1).fill(color);
    }
    this.sky.rect(0, Math.round(sh * 0.52), sw, Math.ceil(sh * 0.48)).fill({ color: 0x122018, alpha: 0.42 });
    for (let i = 0; i < 20; i++) {
      const x = (i * 157 + 31) % sw;
      const y = 18 + ((i * 71) % Math.max(1, Math.round(sh * 0.28)));
      this.sky.rect(x, y, i % 3 === 0 ? 2 : 1, 1).fill({ color: 0xe8eeff, alpha: 0.28 + (i % 4) * 0.08 });
    }
    this.shade.clear();
    this.shade.rect(0, 0, sw, sh).fill({ color: 0x020403, alpha: 0.18 });
    this.shade.rect(0, 0, sw, Math.round(sh * 0.22)).fill({ color: 0xe8f0f8, alpha: 0.05 });
    this.shade.rect(0, Math.round(sh * 0.64), sw, Math.ceil(sh * 0.36)).fill({ color: 0x020403, alpha: 0.18 });
  }

  private rebuildClouds(sw: number, sh: number): void {
    this.cloudLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.clouds.length = 0;
    const specs = [
      { x: 0.08, y: 0.13, w: 90, speed: 7, alpha: 0.22 },
      { x: 0.37, y: 0.21, w: 122, speed: 5, alpha: 0.18 },
      { x: 0.72, y: 0.16, w: 106, speed: 8, alpha: 0.2 },
      { x: 0.20, y: 0.35, w: 76, speed: 12, alpha: 0.13 },
      { x: 0.84, y: 0.31, w: 84, speed: 11, alpha: 0.14 },
    ];
    for (const spec of specs) {
      const container = new Container();
      disableEvents(container);
      const cloud = new Graphics();
      disableEvents(cloud);
      this.drawCloud(cloud, 0, 0, Math.round(spec.w * clamp(sw / 900, 0.75, 1.35)), spec.alpha);
      cloud.cacheAsTexture(CACHE_OPTIONS);
      container.addChild(cloud);
      container.y = Math.round(sh * spec.y);
      this.cloudLayer.addChild(container);
      this.clouds.push({
        container,
        baseX: Math.round(sw * spec.x),
        y: container.y,
        width: Math.round(spec.w * clamp(sw / 900, 0.75, 1.35)),
        speed: spec.speed,
      });
    }
  }

  private rebuildPlatforms(sw: number, sh: number): void {
    this.platformLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.nodes.clear();
    const scale = clamp(Math.min(sw / 900, sh / 620), 0.7, 1.18);
    const specs = [
      { id: "left-low", cx: 0.16, cy: 0.69, w: 136 },
      { id: "mid-low", cx: 0.42, cy: 0.62, w: 154 },
      { id: "right-low", cx: 0.72, cy: 0.70, w: 142 },
      { id: "left-high", cx: 0.26, cy: 0.39, w: 116 },
      { id: "mid-high", cx: 0.52, cy: 0.34, w: 126 },
      { id: "right-high", cx: 0.82, cy: 0.47, w: 118 },
      { id: "center-ledge", cx: 0.61, cy: 0.52, w: 98 },
    ];

    for (const spec of specs) {
      const width = Math.round(spec.w * scale);
      const x = Math.round(clamp(sw * spec.cx - width / 2, 14, sw - width - 14));
      const y = Math.round(clamp(sh * spec.cy, 74, sh - 68));
      const node = { id: spec.id, x, y, width };
      this.nodes.set(node.id, node);
      const platform = new Graphics();
      disableEvents(platform);
      this.drawPlatform(platform, node, Math.round(34 * scale), specs.indexOf(spec));
      platform.cacheAsTexture(CACHE_OPTIONS);
      this.platformLayer.addChild(platform);
    }
  }

  private repositionActors(): void {
    for (const actor of this.actors) {
      const path = actor.paths[actor.currentPathIndex] ?? actor.paths[0];
      const node = path ? this.nodes.get(path.from) : null;
      if (!node) continue;
      actor.container.x = Math.round(node.x + node.width / 2);
      actor.container.y = Math.round(node.y - 1);
    }
  }

  private updateClouds(elapsedSec: number): void {
    const sw = Math.max(1, this.screenWidth);
    for (const cloud of this.clouds) {
      const span = sw + cloud.width + 80;
      cloud.container.x = Math.round(((cloud.baseX + elapsedSec * cloud.speed) % span) - cloud.width - 40);
      cloud.container.y = cloud.y + Math.round(Math.sin(elapsedSec * 0.35 + cloud.width) * 2);
    }
  }

  private updateActor(actor: RuntimeSplashActor<SkinId>, dtMs: number, elapsedMs: number): void {
    const path = actor.paths[actor.currentPathIndex] ?? actor.paths[0];
    if (!path) return;
    actor.elapsedMs += dtMs;
    let cycleMs = path.waitMs + PREP_MS + path.durationMs + LAND_MS;
    while (actor.elapsedMs >= cycleMs) {
      actor.elapsedMs -= cycleMs;
      actor.currentPathIndex = (actor.currentPathIndex + 1) % actor.paths.length;
      actor.lastPhase = "idle";
      cycleMs = (actor.paths[actor.currentPathIndex]?.waitMs ?? 0) + PREP_MS + (actor.paths[actor.currentPathIndex]?.durationMs ?? 0) + LAND_MS;
    }

    const activePath = actor.paths[actor.currentPathIndex]!;
    const from = this.nodes.get(activePath.from);
    const to = this.nodes.get(activePath.to);
    if (!from || !to) return;

    const fromX = from.x + from.width / 2;
    const fromY = from.y - 1;
    const toX = to.x + to.width / 2;
    const toY = to.y - 1;
    let x = fromX;
    let y = fromY;
    let phase: SplashActorPhase = "idle";
    let scaleX = 1;
    let scaleY = 1;
    let animation: SplashAnimationState = "idle";
    const t = actor.elapsedMs;

    if (t < activePath.waitMs) {
      const idleBounce = Math.sin((elapsedMs + actor.color) * 0.004) * 1.5;
      y += idleBounce;
      if (activePath.waitMs - t < 210 && (actor.currentPathIndex + actor.id.length) % 2 === 0) {
        animation = "hit";
        scaleX = 1.08;
        scaleY = 0.96;
        x += actor.facing * 3;
      }
    } else if (t < activePath.waitMs + PREP_MS) {
      phase = "prep";
      const p = smoothstep((t - activePath.waitMs) / PREP_MS);
      y += Math.round(p * 5);
      scaleX = 1 + p * 0.16;
      scaleY = 1 - p * 0.16;
    } else if (t < activePath.waitMs + PREP_MS + activePath.durationMs) {
      phase = "jump";
      animation = "jump";
      const p = (t - activePath.waitMs - PREP_MS) / activePath.durationMs;
      const ease = smoothstep(p);
      x = mix(fromX, toX, ease);
      y = mix(fromY, toY, ease) - Math.sin(Math.PI * p) * activePath.arcHeight;
      scaleX = 0.94;
      scaleY = 1.08;
      actor.facing = toX >= fromX ? 1 : -1;
    } else {
      phase = "land";
      x = toX;
      y = toY;
      const p = 1 - (t - activePath.waitMs - PREP_MS - activePath.durationMs) / LAND_MS;
      scaleX = 1 + Math.max(0, p) * 0.12;
      scaleY = 1 - Math.max(0, p) * 0.1;
      if (actor.lastPhase !== "land") this.spawnDust(x, y, actor.color);
    }

    actor.container.x = Math.round(x);
    actor.container.y = Math.round(y);
    this.drawActor(actor, animation, elapsedMs, scaleX, scaleY);
    actor.lastPhase = phase;
  }

  private drawActor(actor: RuntimeSplashActor<SkinId>, animation: SplashAnimationState, elapsedMs: number, scaleX: number, scaleY: number): void {
    const baseScale = clamp(Math.min(this.screenWidth / 900, this.screenHeight / 620), 0.72, 1.08);
    actor.visualScale = baseScale;
    actor.shadow.clear();
    actor.shadow.ellipse(0, 2, 12 * baseScale * scaleX, 3 * baseScale).fill({ color: 0x000000, alpha: 0.24 });

    if (actor.sprite) {
      const texture = this.options.getActorTexture?.(actor.skinId, animation, elapsedMs) ?? null;
      if (texture) actor.sprite.texture = texture;
      actor.sprite.visible = true;
      actor.body.visible = false;
      const spriteScale = 0.5 * baseScale;
      actor.sprite.scale.set(actor.facing * spriteScale * scaleX, spriteScale * scaleY);
      actor.sprite.y = 1;
      return;
    }

    actor.body.visible = true;
    actor.body.scale.set(actor.facing * baseScale * scaleX, baseScale * scaleY);
    actor.body.clear();
    actor.body.rect(-7, -18, 14, 16).fill(0x16202d);
    actor.body.rect(-5, -16, 10, 10).fill(actor.color);
    actor.body.rect(-6, -29, 12, 11).fill(0xffd090);
    actor.body.rect(-7, -31, 14, 5).fill(0x281a10);
    actor.body.rect(-8, -16, 4, 10).fill(0x16202d);
    actor.body.rect(4, -16, 4, 10).fill(0x16202d);
    if (animation === "hit") {
      actor.body.rect(actor.facing > 0 ? 6 : -14, -15, 10, 4).fill(actor.color);
      actor.body.rect(actor.facing > 0 ? 15 : -17, -16, 3, 3).fill(0xffe870);
    }
    actor.body.rect(-5, -2, 4, 8).fill(0x26354a);
    actor.body.rect(2, -2, 4, 8).fill(0x26354a);
    actor.body.rect(actor.facing > 0 ? 2 : -4, -24, 2, 2).fill(0x06100a);
    actor.body.rect(-8, -21, 16, 3).fill({ color: 0xb83020, alpha: 0.9 });
  }

  private spawnDust(x: number, y: number, tint: number): void {
    for (let i = 0; i < 5; i++) {
      const dust = this.dustPool.find((particle) => !particle.active);
      if (!dust) return;
      const dir = i - 2;
      dust.active = true;
      dust.lifeMs = 0;
      dust.maxLifeMs = 280 + i * 22;
      dust.x = x + dir * 2;
      dust.y = y + 2;
      dust.vx = dir * 12;
      dust.vy = -10 - (i % 2) * 8;
      dust.sprite.visible = true;
      dust.sprite.tint = i === 2 ? tint : i % 2 === 0 ? 0xd7c08a : 0x8c7654;
      dust.sprite.alpha = 0.48;
      dust.sprite.width = i % 2 === 0 ? 4 : 3;
      dust.sprite.height = 2;
      dust.sprite.x = Math.round(dust.x);
      dust.sprite.y = Math.round(dust.y);
    }
  }

  private updateDust(dtMs: number): void {
    for (const dust of this.dustPool) {
      if (!dust.active) continue;
      dust.lifeMs += dtMs;
      if (dust.lifeMs >= dust.maxLifeMs) {
        dust.active = false;
        dust.sprite.visible = false;
        continue;
      }
      const dt = dtMs / 1000;
      dust.x += dust.vx * dt;
      dust.y += dust.vy * dt;
      dust.vy += 34 * dt;
      dust.sprite.x = Math.round(dust.x);
      dust.sprite.y = Math.round(dust.y);
      dust.sprite.alpha = 0.5 * (1 - dust.lifeMs / dust.maxLifeMs);
    }
  }

  private drawCloud(g: Graphics, x: number, y: number, width: number, alpha: number): void {
    const h = Math.max(6, Math.round(width / 6));
    g.rect(x, y + h * 2, width, h * 2).fill({ color: 0xe8f0f8, alpha });
    g.rect(x + 3, y + h, width - 6, h * 2).fill({ color: 0xe8f0f8, alpha });
    g.rect(x + Math.round(width * 0.08), y + Math.round(h * 0.5), Math.round(width * 0.28), h).fill({ color: 0xf0e8d8, alpha });
    g.rect(x + Math.round(width * 0.35), y, Math.round(width * 0.36), Math.round(h * 1.5)).fill({ color: 0xe8f0f8, alpha });
    g.rect(x + Math.round(width * 0.70), y + Math.round(h * 0.7), Math.round(width * 0.22), h).fill({ color: 0xa8c0d8, alpha: alpha * 0.75 });
    g.rect(x + 6, y + h * 4 - 2, width - 12, 3).fill({ color: 0x6888b8, alpha: alpha * 0.62 });
  }

  private drawPlatform(g: Graphics, node: SplashPlatformNode, height: number, index: number): void {
    const x = node.x;
    const y = node.y;
    const w = node.width;
    const grassH = 8;
    g.rect(x + 6, y, w - 12, grassH).fill(0x87c95a);
    g.rect(x + 2, y + 6, w - 4, 5).fill(0x9fd66d);
    g.rect(x, y + 11, w, 7).fill(0x5b3c24);
    g.rect(x + 5, y + 18, w - 10, height - 14).fill(0x372315);
    g.rect(x + 10, y + 18, w - 20, 4).fill(0x6b4a31);
    g.rect(x + 7, y + height - 4, w - 14, 3).fill({ color: 0x182514, alpha: 0.7 });

    const stones = Math.max(4, Math.floor(w / 22));
    for (let i = 0; i < stones; i++) {
      const px = x + 8 + i * Math.max(14, Math.floor(w / stones));
      g.rect(px, y + 16 + (i % 2), 5, 5).fill(0x23150d);
      if ((i + index) % 2 === 0) g.rect(px + 3, y + 24, 3, 8 + (i % 3) * 4).fill({ color: 0x182514, alpha: 0.86 });
    }

    if (index % 2 === 0) {
      g.rect(x + 18, y - 4, 4, 4).fill(0xff6fcf);
      g.rect(x + 22, y - 2, 2, 2).fill(0xefe8c9);
    }
    if (index % 3 !== 0) {
      g.rect(x + w - 30, y - 3, 4, 4).fill(0xffd86a);
      g.rect(x + w - 25, y - 2, 6, 3).fill(0x9fd66d);
    }
  }
}
