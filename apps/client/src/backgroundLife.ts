import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";

export type BackgroundLifeQuality = "high" | "medium" | "low";

export interface BackgroundLifeConfig {
  enabled: boolean;
  maxBirds: number;
  maxMonsters: number;
  maxPlanes: number;
  spawnRate: number;
  parallaxFactor: number;
  quality: BackgroundLifeQuality;
}

type BackgroundLifeKind = "bird" | "monster" | "plane" | "smoke";

interface TextureRenderer {
  generateTexture(options: {
    target: Container;
    frame?: Rectangle;
    resolution?: number;
    antialias?: boolean;
    defaultAnchor?: { x: number; y: number };
  }): Texture;
}

interface BackgroundLifeEntity {
  sprite: Sprite;
  kind: BackgroundLifeKind;
  variant: number;
  active: boolean;
  x: number;
  baseY: number;
  speedX: number;
  bobAmplitude: number;
  bobSpeed: number;
  phase: number;
  frameRate: number;
  lifeMs: number;
  maxLifeMs: number;
  lastSmokeMs: number;
}

interface QualityScale {
  birds: number;
  monsters: number;
  planes: number;
  spawn: number;
  smoke: boolean;
}

interface ActiveCaps {
  birds: number;
  monsters: number;
  planes: number;
  smoke: number;
}

const QUALITY_SCALES: Record<BackgroundLifeQuality, QualityScale> = {
  high: { birds: 1, monsters: 1, planes: 1, spawn: 1, smoke: true },
  medium: { birds: 0.72, monsters: 0.55, planes: 0.55, spawn: 0.72, smoke: true },
  low: { birds: 0.45, monsters: 0, planes: 0, spawn: 0.45, smoke: false },
};

const DEFAULT_CONFIG: BackgroundLifeConfig = {
  enabled: true,
  maxBirds: 12,
  maxMonsters: 4,
  maxPlanes: 3,
  spawnRate: 0.34,
  parallaxFactor: 0.18,
  quality: "high",
};

const CULL_MARGIN = 92;
const TARGET_FRAME_MS = 1000 / 58;

export class BackgroundLifeSystem {
  readonly layer: Container;

  private readonly renderer: TextureRenderer;
  private readonly config: BackgroundLifeConfig;
  private readonly birdFrames: Texture[] = [];
  private readonly monsterFrames: Texture[] = [];
  private readonly planeFrames: Texture[] = [];
  private readonly airshipFrames: Texture[] = [];
  private readonly smokeFrames: Texture[] = [];
  private readonly active: BackgroundLifeEntity[] = [];
  private readonly pool: BackgroundLifeEntity[] = [];
  private spawnAccumulator = 0;
  private seededInitialView = false;
  private adaptiveScale = 1;
  private lowFpsMs = 0;
  private stableFpsMs = 0;
  private birdCount = 0;
  private monsterCount = 0;
  private planeCount = 0;
  private smokeCount = 0;
  private readonly caps: ActiveCaps = { birds: 0, monsters: 0, planes: 0, smoke: 0 };

  constructor(renderer: TextureRenderer, layer: Container, config: Partial<BackgroundLifeConfig> = {}) {
    this.renderer = renderer;
    this.layer = layer;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.layer.sortableChildren = false;
    this.layer.cullable = true;
    this.createTextures();
  }

  setQuality(quality: BackgroundLifeQuality): void {
    this.config.quality = quality;
  }

  update(deltaMS: number, cameraX: number, cameraY: number, viewportWidth: number, viewportHeight: number): void {
    if (!this.config.enabled) {
      this.releaseAll();
      this.layer.visible = false;
      return;
    }

    this.layer.visible = true;
    this.layer.x = Math.round(-cameraX * this.config.parallaxFactor);
    this.layer.y = Math.round(-cameraY * this.config.parallaxFactor);

    this.updateAdaptiveScale(deltaMS);
    this.updateCurrentCaps();
    this.enforceCaps(this.caps);

    if (!this.seededInitialView && viewportWidth > 0 && viewportHeight > 0) {
      this.seededInitialView = true;
      this.seedInitialView(this.caps, viewportWidth, viewportHeight);
    }

    const dt = Math.min(deltaMS, 1000 / 30) / 1000;
    this.spawnAccumulator += dt * this.config.spawnRate * QUALITY_SCALES[this.config.quality].spawn * this.adaptiveScale;
    while (this.spawnAccumulator >= 1) {
      this.spawnAccumulator -= 1;
      this.spawnAmbient(this.caps, viewportWidth, viewportHeight);
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const entity = this.active[i]!;
      entity.lifeMs += deltaMS;
      entity.x += entity.speedX * dt;
      entity.phase += entity.bobSpeed * dt;

      const bobY = Math.sin(entity.phase) * entity.bobAmplitude;
      entity.sprite.x = Math.round(entity.x);
      entity.sprite.y = Math.round(entity.baseY + bobY);

      this.updateTextureFrame(entity);

      const visualX = entity.sprite.x + this.layer.x;
      const visualY = entity.sprite.y + this.layer.y;
      const offscreen =
        visualX < -CULL_MARGIN ||
        visualX > viewportWidth + CULL_MARGIN ||
        visualY < -CULL_MARGIN ||
        visualY > viewportHeight + CULL_MARGIN ||
        entity.lifeMs >= entity.maxLifeMs;

      if (entity.kind === "plane" && QUALITY_SCALES[this.config.quality].smoke) {
        this.maybeSpawnSmoke(entity, this.caps, viewportWidth, viewportHeight);
      }

      if (offscreen) this.releaseEntity(i);
    }
  }

  destroy(): void {
    this.releaseAll();
    for (const texture of this.birdFrames) texture.destroy(true);
    for (const texture of this.monsterFrames) texture.destroy(true);
    for (const texture of this.planeFrames) texture.destroy(true);
    for (const texture of this.airshipFrames) texture.destroy(true);
    for (const texture of this.smokeFrames) texture.destroy(true);
  }

  private createTextures(): void {
    for (let frame = 0; frame < 3; frame++) {
      this.birdFrames.push(this.textureFromGraphics(48, 18, (g) => drawBirdFlock(g, frame)));
      this.monsterFrames.push(this.textureFromGraphics(54, 30, (g) => drawFlyingMonster(g, frame)));
      this.smokeFrames.push(this.textureFromGraphics(10, 10, (g) => drawSmokePuff(g, frame)));
    }
    for (let frame = 0; frame < 2; frame++) {
      this.planeFrames.push(this.textureFromGraphics(50, 20, (g) => drawTinyPlane(g, frame)));
      this.airshipFrames.push(this.textureFromGraphics(62, 26, (g) => drawAirship(g, frame)));
    }
  }

  private textureFromGraphics(width: number, height: number, draw: (graphics: Graphics) => void): Texture {
    const graphics = new Graphics();
    draw(graphics);
    const texture = this.renderer.generateTexture({
      target: graphics,
      frame: new Rectangle(0, 0, width, height),
      resolution: 1,
      antialias: false,
      defaultAnchor: { x: 0.5, y: 0.5 },
    });
    graphics.destroy();
    return texture;
  }

  private createEntity(): BackgroundLifeEntity {
    const sprite = new Sprite(Texture.EMPTY);
    sprite.anchor.set(0.5);
    sprite.roundPixels = true;
    sprite.eventMode = "none";
    sprite.cullable = true;
    return {
      sprite,
      kind: "bird",
      variant: 0,
      active: false,
      x: 0,
      baseY: 0,
      speedX: 0,
      bobAmplitude: 0,
      bobSpeed: 0,
      phase: 0,
      frameRate: 1,
      lifeMs: 0,
      maxLifeMs: 1,
      lastSmokeMs: 0,
    };
  }

  private acquireEntity(): BackgroundLifeEntity {
    const entity = this.pool.pop() ?? this.createEntity();
    entity.active = true;
    entity.lifeMs = 0;
    this.layer.addChild(entity.sprite);
    this.active.push(entity);
    return entity;
  }

  private releaseAll(): void {
    for (let i = this.active.length - 1; i >= 0; i--) this.releaseEntity(i);
  }

  private releaseEntity(index: number): void {
    const entity = this.active[index];
    if (!entity) return;

    if (entity.kind === "bird") this.birdCount--;
    else if (entity.kind === "monster") this.monsterCount--;
    else if (entity.kind === "plane") this.planeCount--;
    else this.smokeCount--;

    const lastIndex = this.active.length - 1;
    if (index !== lastIndex) this.active[index] = this.active[lastIndex]!;
    this.active.pop();

    this.layer.removeChild(entity.sprite);
    entity.sprite.visible = false;
    entity.sprite.alpha = 0;
    entity.sprite.texture = Texture.EMPTY;
    entity.active = false;
    this.pool.push(entity);
  }

  private updateAdaptiveScale(deltaMS: number): void {
    if (deltaMS > TARGET_FRAME_MS * 1.24) {
      this.lowFpsMs += deltaMS;
      this.stableFpsMs = 0;
    } else if (deltaMS < TARGET_FRAME_MS * 1.08) {
      this.stableFpsMs += deltaMS;
      this.lowFpsMs = Math.max(0, this.lowFpsMs - deltaMS * 0.35);
    } else {
      this.lowFpsMs = Math.max(0, this.lowFpsMs - deltaMS * 0.2);
      this.stableFpsMs = Math.max(0, this.stableFpsMs - deltaMS * 0.2);
    }

    if (this.lowFpsMs > 1800) {
      this.adaptiveScale = Math.max(0.35, this.adaptiveScale - 0.18);
      this.lowFpsMs = 0;
    } else if (this.stableFpsMs > 5000) {
      this.adaptiveScale = Math.min(1, this.adaptiveScale + 0.08);
      this.stableFpsMs = 0;
    }
  }

  private updateCurrentCaps(): void {
    const quality = QUALITY_SCALES[this.config.quality];
    const scale = this.adaptiveScale;
    this.caps.birds = Math.max(1, Math.round(this.config.maxBirds * quality.birds * scale));
    this.caps.monsters = Math.max(0, Math.round(this.config.maxMonsters * quality.monsters * scale));
    this.caps.planes = Math.max(0, Math.round(this.config.maxPlanes * quality.planes * scale));
    this.caps.smoke = quality.smoke ? Math.max(2, Math.round(this.config.maxPlanes * 3 * quality.planes * scale)) : 0;
  }

  private enforceCaps(caps: ActiveCaps): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const entity = this.active[i]!;
      if (
        (entity.kind === "bird" && this.birdCount > caps.birds) ||
        (entity.kind === "monster" && this.monsterCount > caps.monsters) ||
        (entity.kind === "plane" && this.planeCount > caps.planes) ||
        (entity.kind === "smoke" && this.smokeCount > caps.smoke)
      ) {
        this.releaseEntity(i);
      }
    }
  }

  private seedInitialView(caps: ActiveCaps, viewportWidth: number, viewportHeight: number): void {
    const birdSeedCount = Math.min(caps.birds, Math.max(2, Math.round(caps.birds * 0.55)));
    for (let i = 0; i < birdSeedCount; i++) this.spawnBird(caps, viewportWidth, viewportHeight, true);
    if (caps.monsters > 0) this.spawnMonster(caps, viewportWidth, viewportHeight, true);
    if (caps.planes > 0) this.spawnPlane(caps, viewportWidth, viewportHeight, true);
  }

  private spawnAmbient(caps: ActiveCaps, viewportWidth: number, viewportHeight: number): void {
    const roll = Math.random();
    if (roll < 0.62) this.spawnBird(caps, viewportWidth, viewportHeight, false);
    else if (roll < 0.82) this.spawnMonster(caps, viewportWidth, viewportHeight, false);
    else this.spawnPlane(caps, viewportWidth, viewportHeight, false);
  }

  private spawnBird(caps: ActiveCaps, viewportWidth: number, viewportHeight: number, inView: boolean): boolean {
    if (this.birdCount >= caps.birds) return false;
    const entity = this.acquireEntity();
    this.birdCount++;
    this.setupEntity(entity, "bird", viewportWidth, viewportHeight, inView);
    entity.sprite.texture = this.birdFrames[0]!;
    entity.sprite.alpha = 0.24 + Math.random() * 0.12;
    const scale = 0.52 + Math.random() * 0.5;
    entity.sprite.scale.set(entity.speedX >= 0 ? scale : -scale, scale);
    entity.frameRate = 7 + Math.random() * 4;
    return true;
  }

  private spawnMonster(caps: ActiveCaps, viewportWidth: number, viewportHeight: number, inView: boolean): boolean {
    if (this.monsterCount >= caps.monsters) return false;
    const entity = this.acquireEntity();
    this.monsterCount++;
    this.setupEntity(entity, "monster", viewportWidth, viewportHeight, inView);
    entity.sprite.texture = this.monsterFrames[0]!;
    entity.sprite.alpha = 0.22 + Math.random() * 0.14;
    const scale = 0.55 + Math.random() * 0.52;
    entity.sprite.scale.set(entity.speedX >= 0 ? scale : -scale, scale);
    entity.frameRate = 4 + Math.random() * 2.2;
    return true;
  }

  private spawnPlane(caps: ActiveCaps, viewportWidth: number, viewportHeight: number, inView: boolean): boolean {
    if (this.planeCount >= caps.planes) return false;
    const entity = this.acquireEntity();
    this.planeCount++;
    this.setupEntity(entity, "plane", viewportWidth, viewportHeight, inView);
    entity.variant = Math.random() < 0.48 ? 1 : 0;
    entity.sprite.texture = entity.variant === 1 ? this.airshipFrames[0]! : this.planeFrames[0]!;
    entity.sprite.alpha = 0.28 + Math.random() * 0.14;
    const scale = entity.variant === 1 ? 0.58 + Math.random() * 0.34 : 0.48 + Math.random() * 0.3;
    entity.sprite.scale.set(entity.speedX >= 0 ? scale : -scale, scale);
    entity.frameRate = entity.variant === 1 ? 1.4 : 3;
    return true;
  }

  private setupEntity(
    entity: BackgroundLifeEntity,
    kind: Exclude<BackgroundLifeKind, "smoke">,
    viewportWidth: number,
    viewportHeight: number,
    inView: boolean,
  ): void {
    const direction = Math.random() < 0.5 ? -1 : 1;
    const layerX = this.layer.x;
    const layerY = this.layer.y;
    const spawnX = inView
      ? Math.random() * viewportWidth
      : direction > 0
        ? -CULL_MARGIN - Math.random() * 70
        : viewportWidth + CULL_MARGIN + Math.random() * 70;
    const altitude = viewportHeight * (0.08 + Math.random() * 0.78);
    const speedBase = kind === "bird" ? 9 : kind === "monster" ? 15 : 20;
    const speedVariance = kind === "bird" ? 15 : kind === "monster" ? 18 : 22;

    entity.kind = kind;
    entity.variant = 0;
    entity.x = Math.round(spawnX - layerX);
    entity.baseY = Math.round(altitude - layerY);
    entity.speedX = direction * (speedBase + Math.random() * speedVariance);
    entity.bobAmplitude = kind === "bird" ? 2 + Math.random() * 3 : 4 + Math.random() * 6;
    entity.bobSpeed = kind === "plane" ? 0.8 + Math.random() * 0.7 : 1.4 + Math.random() * 1.2;
    entity.phase = Math.random() * Math.PI * 2;
    entity.maxLifeMs = kind === "bird" ? 28_000 : kind === "monster" ? 36_000 : 42_000;
    entity.lastSmokeMs = -400 - Math.random() * 400;
    entity.sprite.visible = true;
    entity.sprite.rotation = kind === "plane" ? (Math.random() - 0.5) * 0.045 : 0;
  }

  private maybeSpawnSmoke(entity: BackgroundLifeEntity, caps: ActiveCaps, viewportWidth: number, viewportHeight: number): void {
    if (this.smokeCount >= caps.smoke) return;
    if (entity.variant !== 0) return;
    if (entity.lifeMs - entity.lastSmokeMs < 520) return;
    const visualX = entity.sprite.x + this.layer.x;
    const visualY = entity.sprite.y + this.layer.y;
    if (visualX < 0 || visualX > viewportWidth || visualY < 0 || visualY > viewportHeight) return;

    entity.lastSmokeMs = entity.lifeMs;
    const smoke = this.acquireEntity();
    this.smokeCount++;
    smoke.kind = "smoke";
    smoke.variant = 0;
    smoke.x = entity.x - Math.sign(entity.speedX) * 18;
    smoke.baseY = entity.baseY + 3;
    smoke.speedX = entity.speedX * 0.22;
    smoke.bobAmplitude = 1;
    smoke.bobSpeed = 1.2;
    smoke.phase = entity.phase;
    smoke.frameRate = 3.2;
    smoke.lifeMs = 0;
    smoke.maxLifeMs = 1500;
    smoke.sprite.texture = this.smokeFrames[0]!;
    smoke.sprite.visible = true;
    smoke.sprite.alpha = 0.15;
    smoke.sprite.rotation = 0;
    smoke.sprite.scale.set(0.75);
  }

  private updateTextureFrame(entity: BackgroundLifeEntity): void {
    if (entity.kind === "bird") {
      const frame = Math.floor(entity.lifeMs * 0.001 * entity.frameRate) % this.birdFrames.length;
      entity.sprite.texture = this.birdFrames[frame]!;
    } else if (entity.kind === "monster") {
      const frame = Math.floor(entity.lifeMs * 0.001 * entity.frameRate) % this.monsterFrames.length;
      entity.sprite.texture = this.monsterFrames[frame]!;
      entity.sprite.rotation = Math.sin(entity.phase * 0.7) * 0.035;
    } else if (entity.kind === "plane") {
      if (entity.variant === 1) {
        const frame = Math.floor(entity.lifeMs * 0.001 * entity.frameRate) % this.airshipFrames.length;
        entity.sprite.texture = this.airshipFrames[frame]!;
      } else {
        const frame = Math.floor(entity.lifeMs * 0.001 * entity.frameRate) % this.planeFrames.length;
        entity.sprite.texture = this.planeFrames[frame]!;
      }
    } else {
      const frame = Math.min(this.smokeFrames.length - 1, Math.floor((entity.lifeMs / entity.maxLifeMs) * this.smokeFrames.length));
      entity.sprite.texture = this.smokeFrames[frame]!;
      entity.sprite.alpha = 0.15 * (1 - entity.lifeMs / entity.maxLifeMs);
      const scale = 0.75 + (entity.lifeMs / entity.maxLifeMs) * 0.55;
      entity.sprite.scale.set(scale);
    }
  }
}

function drawBirdFlock(g: Graphics, frame: number): void {
  const color = 0x152b45;
  const wing = frame === 0 ? -3 : frame === 1 ? 0 : 3;
  drawBird(g, 7, 10, wing, color);
  drawBird(g, 17, 6, -wing, color);
  drawBird(g, 29, 12, wing, color);
  drawBird(g, 39, 8, -wing, color);
  drawBird(g, 24, 4, frame === 1 ? -2 : 2, 0x213b5a);
}

function drawBird(g: Graphics, x: number, y: number, wing: number, color: number): void {
  g.rect(x, y, 2, 1).fill(color);
  g.poly([x + 1, y, x - 5, y + wing, x - 4, y + wing + 1]).fill(color);
  g.poly([x + 1, y, x + 7, y + wing, x + 6, y + wing + 1]).fill(color);
}

function drawFlyingMonster(g: Graphics, frame: number): void {
  const body = 0x26324f;
  const wing = 0x1b2440;
  const accent = 0x5a426f;
  const flap = frame === 0 ? -4 : frame === 1 ? 2 : 5;
  g.rect(23, 13, 12, 6).fill(body);
  g.rect(35, 14, 7, 3).fill(body);
  g.rect(40, 13, 2, 2).fill(accent);
  g.rect(17, 15, 7, 3).fill(body);
  g.rect(14, 16, 4, 2).fill(accent);
  g.poly([25, 14, 5, 7 + flap, 13, 18, 25, 18]).fill(wing);
  g.poly([33, 14, 52, 7 + flap, 45, 18, 32, 18]).fill(wing);
  g.rect(27, 19, 2, 4).fill(0x1a1e32);
  g.rect(33, 19, 2, 4).fill(0x1a1e32);
}

function drawTinyPlane(g: Graphics, frame: number): void {
  const outline = 0x203144;
  const body = 0x7b6b54;
  const wing = 0xb87936;
  const prop = frame === 0 ? 0xddd0a8 : 0x7b6b54;
  g.rect(12, 10, 27, 4).fill(outline);
  g.rect(15, 9, 21, 3).fill(body);
  g.rect(18, 6, 20, 3).fill(wing);
  g.rect(17, 14, 22, 3).fill(wing);
  g.rect(39, 8, 4, 7).fill(outline);
  g.rect(8, 10, 5, 3).fill(prop);
  g.rect(6, 8, 1, 7).fill(prop);
  g.rect(21, 8, 2, 1).fill(0xbed5d8);
}

function drawAirship(g: Graphics, frame: number): void {
  const hull = 0xb9aa81;
  const shade = 0x77684d;
  const cabin = 0x4a4d55;
  const fin = frame === 0 ? 0x8f876e : 0x77684d;
  g.ellipse(31, 10, 24, 7).fill(hull);
  g.rect(13, 13, 36, 3).fill(shade);
  g.rect(27, 18, 16, 4).fill(cabin);
  g.rect(23, 16, 2, 6).fill(shade);
  g.rect(45, 16, 2, 6).fill(shade);
  g.rect(50, 8, 6, 4).fill(fin);
  g.rect(9, 10, 4, 2).fill(0xddd2a2);
  g.rect(30, 19, 3, 1).fill(0x9ed8ff);
  g.rect(36, 19, 3, 1).fill(0x9ed8ff);
}

function drawSmokePuff(g: Graphics, frame: number): void {
  const alpha = frame === 0 ? 0.8 : frame === 1 ? 0.48 : 0.24;
  const color = frame === 0 ? 0xc1c5be : frame === 1 ? 0xa8b2b4 : 0x8090a0;
  g.rect(3, 3, 4, 4).fill({ color, alpha });
  g.rect(2, 4, 2, 2).fill({ color, alpha: alpha * 0.8 });
  g.rect(6, 2, 2, 2).fill({ color, alpha: alpha * 0.65 });
}
