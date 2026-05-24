import { Application, Container, Graphics, Text, TextureStyle } from "pixi.js";
import {
  CHUNK_HEIGHT_TILES,
  CHUNK_WIDTH_TILES,
  GAME_VERSION,
  KICK_ACTIVE_SECONDS,
  KICK_COOLDOWN_SECONDS,
  KICK_RECOVERY_SECONDS,
  KICK_WINDUP_SECONDS,
  PHYSICS_STEP_SECONDS,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PROTOCOL_VERSION,
  RECONCILIATION_TOLERANCE_PX,
  TILE_SIZE,
} from "@skybound/shared";
import {
  createMultiChunkTileMap,
  createPlayerState,
  generateVerticalChunk,
  stepPlayer,
} from "@skybound/shared";
import { isServerMessage } from "@skybound/shared";
import type { GeneratedChunk, PlayerInput, PlayerState, TileKind } from "@skybound/shared";
import "./styles.css";

// ── Palette ───────────────────────────────────────────────────────────────────

const PAL = {
  // Sky — warm atmospheric gradient
  skyGround:    0x4a7040,  // warm forest green-blue near ground
  skyMid:       0x2a4e88,  // deep warm mid-sky blue
  skyDeep:      0x18305a,  // darker upper atmosphere
  skySpace:     0x080e1e,  // near-space deep indigo
  starBright:   0xe8eeff,
  // Distant world
  mountainFar:  0x28385a,
  mountainMid:  0x384870,
  ruinsDark:    0x222e48,
  islandFar:    0x304068,  // far floating islands
  // Clouds — warm soft white tones
  cloudFar:     0x6888b8,  // distant hazy blue-gray
  cloudMid:     0xa8c0d8,  // medium soft blue-white
  cloudBright:  0xe8f0f8,  // near bright white (almost white)
  cloudShadow:  0x8898b8,  // cloud underside shadow
  cloudWarm:    0xf0e8d8,  // warm sunlit cloud top
  // Atmospheric haze
  mistPale:     0xc8e0e0,
  skyHaze:      0x90c0d8,  // horizon haze
  // Terrain — warm sandstone & earth tones
  stoneShadow:  0x28221a,  // warm dark outline shadow
  stoneDark:    0x504030,  // dark warm stone face
  stoneMid:     0x907858,  // warm sandstone (replaces cool gray)
  stoneLight:   0xc8a878,  // light sandstone highlight
  stoneWorn:    0x6a5840,  // worn stone variant
  stoneRuin:    0x606858,  // cool worn ruin stone
  // Soil & earth
  soilWarm:     0x7a5030,  // warm topsoil
  soilDark:     0x402818,  // deep soil underside
  soilRoot:     0x583a20,  // root / bark
  // Vegetation — rich & vibrant
  grassTop:     0x90d838,  // bright fresh grass
  grassDark:    0x3a7818,  // grass shadow / base
  canopyDark:   0x1a3818,
  canopyMid:    0x2e6840,
  canopyLight:  0x6ac840,  // bright canopy
  mossGreen:    0x489030,  // moss mid
  mossBright:   0x68c040,  // bright moss highlight
  barkMid:      0x6a4820,
  leafGreen:    0x78d050,  // vegetation leaf
  // Hazard
  hazardRed:    0xe84030,
  hazardGlow:   0xffa060,
  hazardBase:   0x3a1a10,
  hazardMag:    0xb82060,
  // Coin / relic
  coinGold:     0xf8c830,
  coinShade:    0xb07020,
  coinGlow:     0xffe870,
  // Portal / magic
  portalBlue:   0x40d8f8,
  portalGlow:   0xa0f0ff,
  runeGlow:     0x30c8c0,  // magical rune cyan-teal
  // Character
  skinLight:    0xffd090,
  hairDark:     0x281a10,
  scarfPrimary: 0xb83020,
  scarfShade:   0x701818,
  // UI
  uiInk:        0x1c1f2a,
  uiParchment:  0xf4e8c8,
  uiHighlight:  0x40c8d0,
  uiCyan:       0x40c8d0,
  uiGray:       0x6a8aaf,
} as const;

const PLAYER_COLORS = [
  0xf3c64b, 0x48d6ff, 0x9b6dff, 0x5dff9c,
  0xff6b6b, 0xff9f4a, 0xe8c8ff, 0x69a969,
] as const;

const WORLD_WIDTH = CHUNK_WIDTH_TILES * TILE_SIZE; // 384px
const INTERP_DELAY_MS = 100;

// ── HTML shell ────────────────────────────────────────────────────────────────

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("Missing #app root");

appRoot.innerHTML = `
  <main class="shell">
    <section class="game-wrap"></section>
    <aside class="side">
      <div class="brand"><h1>Skybound Relics</h1>
        <p>Race upward. Collect coins. Kick rivals off ledges.</p></div>
      <div class="panel join">
        <h2>Room</h2>
        <input id="player-name" value="Explorer" maxlength="16" aria-label="Player name"/>
        <button id="join-room">Join Room</button>
        <p id="net-status">Local mode — server optional.</p>
      </div>
      <div class="panel"><h2>Controls</h2>
        <div class="controls">
          <div class="key">A / D — run</div><div class="key">Space — jump</div>
          <div class="key">S — drop through</div><div class="key">F — kick</div>
          <div class="key">F1 — debug</div><div class="key">F2 — respawn</div>
        </div>
      </div>
      <div class="panel"><h2>Players</h2><div id="scoreboard"></div></div>
    </aside>
  </main>`;

const gameWrap  = appRoot.querySelector<HTMLElement>(".game-wrap")!;
const netStatus = appRoot.querySelector<HTMLElement>("#net-status")!;
const joinBtn   = appRoot.querySelector<HTMLButtonElement>("#join-room")!;
const nameInput = appRoot.querySelector<HTMLInputElement>("#player-name")!;
const scoreboard = appRoot.querySelector<HTMLElement>("#scoreboard")!;

// ── PixiJS init ───────────────────────────────────────────────────────────────

TextureStyle.defaultOptions.scaleMode = "nearest";

const pixi = new Application();
await pixi.init({
  resizeTo: gameWrap,
  backgroundAlpha: 0,
  antialias: false,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
  roundPixels: true,
});
pixi.canvas.style.imageRendering = "pixelated";
gameWrap.prepend(pixi.canvas);

// ── Layer hierarchy ───────────────────────────────────────────────────────────
// skyLayer    — screen-space parallax bg (not inside worldLayer)
// worldLayer  — world-space (camera-transformed)
//   chunkLayer  — static tile Graphics per loaded chunk
//   relicLayer  — animated coin containers
//   remoteLayer — opponent sprites (persistent Graphics per player)
//   localLayer  — local player sprite
//   effectLayer — particles
// hudLayer    — screen-space UI overlay

const skyLayer    = new Container();
const worldLayer  = new Container();
const chunkLayer  = new Container();
const portalLayer = new Container();
const relicLayer  = new Container();
const remoteLayer = new Container();
const localLayer  = new Container();
const effectLayer = new Container();
const hudLayer    = new Container();

worldLayer.addChild(chunkLayer, portalLayer, relicLayer, remoteLayer, localLayer, effectLayer);
pixi.stage.addChild(skyLayer, worldLayer, hudLayer);

// ── State ─────────────────────────────────────────────────────────────────────

let localPlayer: PlayerState | null = null;
let localVisualPosition: { x: number; y: number } | null = null;
let localPlayerId: string | null = null;
let sessionToken: string | null = null;
let serverSeed = 0x5eed_babe; // updated from welcome message to match server chunks

const loadedChunks   = new Map<number, GeneratedChunk>();
const chunkGraphics  = new Map<number, Graphics>();
const tileMap        = createMultiChunkTileMap(loadedChunks);
const collectedRelics = new Set<string>();

interface RelicAnim { container: Container; gfx: Graphics; tileX: number; tileY: number }
const relicAnims = new Map<string, RelicAnim>();

interface RemoteEntry {
  states: Array<{ state: PlayerState; t: number }>;
  current: PlayerState;
  colorIndex: number;
  gfx: Graphics;
  label: Text;
}
const remotePlayers  = new Map<string, RemoteEntry>();
const playerNames    = new Map<string, string>();
let   playerColorIdx = 1; // 0 = local (gold)

interface PredEntry { seq: number; input: PlayerInput; state: PlayerState }
const predBuf: PredEntry[] = [];
let   localSeq = 0;
let   predictionAccumulatorSeconds = 0;
let   queuedJumpPressed = false;
let   queuedKickPressed = false;

const MAX_PREDICTION_STEPS_PER_FRAME = 3;
const MAX_PREDICTION_ACCUMULATOR_SECONDS = PHYSICS_STEP_SECONDS * MAX_PREDICTION_STEPS_PER_FRAME;
const PREDICTION_STEP_EPSILON = 0.000_001;
const LOCAL_VISUAL_CORRECTION_RATE = 18;
const LOCAL_VISUAL_SNAP_THRESHOLD_PX = 72;
const REMOTE_MAX_EXTRAPOLATION_MS = 80;
const SERVER_CLOCK_SMOOTHING = 0.12;

let ws: WebSocket | null = null;
let pingMs        = 0;
let lastPingTime  = 0;
let serverTimeOffsetMs = 0;
let hasServerClock = false;
let serverTick    = 0;
let matchPhase    = "waiting";
let reconnDelay   = 1000;
let reconnTimeout: ReturnType<typeof setTimeout> | null = null;

let cameraY   = 0;
let cameraSnap = true;
let showDebug  = false;
let elapsedMs  = 0;

// Camera shake
let shakeX = 0, shakeY = 0;

// Cloud horizontal drift offsets (px/s)
let cloudDriftFar   = 0;
let cloudDriftMid   = 0;
let cloudDriftFront = 0;

// Pre-allocated persistent graphics for local player
const localGfx = new Graphics();
localLayer.addChild(localGfx);

// ── Input ─────────────────────────────────────────────────────────────────────

const held: Record<string, boolean> = {};
let jumpEdge = false, kickEdge = false;

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  held[e.code] = true;
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") { jumpEdge = true; e.preventDefault(); }
  if (e.code === "KeyF") kickEdge = true;
  if (e.code === "F1") { showDebug = !showDebug; e.preventDefault(); }
  if (e.code === "F2") respawnLocal();
  if (e.code === "F3") regenerateWorld();
});
window.addEventListener("keyup", (e) => { held[e.code] = false; });

type FrameInput = Omit<PlayerInput, "sequence">;

function captureInput(): FrameInput {
  const inp: FrameInput = {
    left:        !!held["ArrowLeft"]  || !!held["KeyA"],
    right:       !!held["ArrowRight"] || !!held["KeyD"],
    jumpPressed: jumpEdge,
    jumpHeld:    !!held["Space"] || !!held["ArrowUp"] || !!held["KeyW"],
    drop:        !!held["ArrowDown"]  || !!held["KeyS"],
    kick:        kickEdge,
  };
  jumpEdge = false; kickEdge = false;
  return inp;
}

function createPredictionInput(frameInput: FrameInput): PlayerInput {
  const inp: PlayerInput = {
    ...frameInput,
    jumpPressed: queuedJumpPressed,
    kick: queuedKickPressed,
    sequence: localSeq++,
  };
  queuedJumpPressed = false;
  queuedKickPressed = false;
  return inp;
}

function clonePlayerState(state: PlayerState): PlayerState {
  return {
    ...state,
    position: { ...state.position },
    velocity: { ...state.velocity },
  };
}

function snapLocalVisualToSimulation(): void {
  localVisualPosition = localPlayer
    ? { x: localPlayer.position.x, y: localPlayer.position.y }
    : null;
}

function updateLocalVisualPosition(dt: number): void {
  if (!localPlayer) {
    localVisualPosition = null;
    return;
  }

  if (!localVisualPosition || cameraSnap) {
    snapLocalVisualToSimulation();
    return;
  }

  const dx = localPlayer.position.x - localVisualPosition.x;
  const dy = localPlayer.position.y - localVisualPosition.y;
  const correction = Math.hypot(dx, dy);
  if (correction > LOCAL_VISUAL_SNAP_THRESHOLD_PX) {
    snapLocalVisualToSimulation();
    return;
  }

  const alpha = 1 - Math.exp(-LOCAL_VISUAL_CORRECTION_RATE * dt);
  localVisualPosition.x += dx * alpha;
  localVisualPosition.y += dy * alpha;
}

function getLocalRenderPosition(): { x: number; y: number } | null {
  if (!localPlayer) return null;
  return localVisualPosition ?? localPlayer.position;
}

function resetLocalPrediction(): void {
  predBuf.length = 0;
  predictionAccumulatorSeconds = 0;
  queuedJumpPressed = false;
  queuedKickPressed = false;
}

// ── World management ──────────────────────────────────────────────────────────

function loadChunk(cy: number): void {
  if (loadedChunks.has(cy)) return;
  const chunk = generateVerticalChunk({ seed: serverSeed, chunkY: cy });
  loadedChunks.set(cy, chunk);
  renderChunk(chunk);
}

function ensureChunksAhead(): void {
  if (!localPlayer) return;
  const pTileY  = Math.floor(localPlayer.position.y / TILE_SIZE);
  const pChunkY = Math.max(0, -Math.floor(pTileY / CHUNK_HEIGHT_TILES));
  for (let cy = 0; cy <= pChunkY + 3; cy++) loadChunk(cy);
}

function regenerateWorld(): void {
  clearWorldChunks();
  for (let cy = 0; cy <= 3; cy++) loadChunk(cy);
  respawnLocal();
}

function clearWorldChunks(): void {
  loadedChunks.clear();
  for (const g of chunkGraphics.values()) g.destroy();
  chunkGraphics.clear();
  chunkLayer.removeChildren();
  for (const a of relicAnims.values()) a.container.destroy();
  relicAnims.clear();
  for (const a of portalAnims.values()) a.container.destroy();
  portalAnims.clear();
}

function destroyChunkVisuals(chunkY: number): void {
  const oldGfx = chunkGraphics.get(chunkY);
  if (oldGfx) {
    oldGfx.destroy();
    chunkGraphics.delete(chunkY);
  }

  const relicPrefix = `relic:${chunkY}:`;
  for (const [id, anim] of [...relicAnims.entries()]) {
    if (id.startsWith(relicPrefix)) {
      anim.container.destroy();
      relicAnims.delete(id);
    }
  }

  const portal = portalAnims.get(chunkY);
  if (portal) {
    portal.container.destroy();
    portalAnims.delete(chunkY);
  }
}

function getSpawnPos(): { x: number; y: number } {
  const chunk = loadedChunks.get(0);
  if (!chunk) return { x: WORLD_WIDTH / 2 - PLAYER_WIDTH / 2, y: -PLAYER_HEIGHT };
  return {
    x: (chunk.entry.x + Math.floor(chunk.entry.width / 2)) * TILE_SIZE - PLAYER_WIDTH / 2,
    y: (chunk.worldTileY + chunk.entry.y) * TILE_SIZE - PLAYER_HEIGHT,
  };
}

function respawnLocal(): void {
  if (!localPlayerId) { localPlayerId = "local"; playerNames.set("local", nameInput.value || "Explorer"); }
  const { x, y } = getSpawnPos();
  localPlayer = createPlayerState(localPlayerId, x, y);
  snapLocalVisualToSimulation();
  resetLocalPrediction();
  cameraSnap = true;
  spawnRing(x + PLAYER_WIDTH / 2, y + PLAYER_HEIGHT / 2, PAL.portalBlue);
}

// ── Sky parallax ──────────────────────────────────────────────────────────────

const skyBgGfx    = new Graphics();
const sunGlowGfx  = new Graphics();
const starsGfx    = new Graphics();
const islandsFar  = new Container();
const towersCont  = new Container();
const cloudsFar   = new Container();
const cloudsMid   = new Container();
const cloudsFront = new Container();
skyLayer.addChild(skyBgGfx, sunGlowGfx, starsGfx, islandsFar, towersCont, cloudsFar, cloudsMid, cloudsFront);

function lerpColor(a: number, b: number, t: number): number {
  const c = Math.max(0, Math.min(1, t));
  const r = Math.round(((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * c);
  const g = Math.round(((a >>  8) & 0xff) + (((b >>  8) & 0xff) - ((a >>  8) & 0xff)) * c);
  const v = Math.round(( a        & 0xff) + (( b        & 0xff) - ( a        & 0xff)) * c);
  return (r << 16) | (g << 8) | v;
}

// Draw a pixel-art puffy cloud shape at (cx, cy) with width w
function drawPixelCloud(g: Graphics, cx: number, cy: number, w: number, bright: number, shadow: number, alpha = 1): void {
  const h = Math.max(6, Math.round(w / 5));
  // Bottom base (widest)
  g.rect(cx,              cy + h * 2, w,              h * 2).fill({ color: bright, alpha });
  // Mid body
  g.rect(cx + 2,          cy + h,     w - 4,          h * 2).fill({ color: bright, alpha });
  // Top bumps (three rounded domes)
  g.rect(cx + Math.round(w * 0.08), cy + Math.round(h * 0.4),  Math.round(w * 0.32), Math.round(h * 1.3)).fill({ color: bright, alpha });
  g.rect(cx + Math.round(w * 0.36), cy,                         Math.round(w * 0.36), Math.round(h * 1.6)).fill({ color: bright, alpha });
  g.rect(cx + Math.round(w * 0.72), cy + Math.round(h * 0.6),  Math.round(w * 0.22), Math.round(h * 1.1)).fill({ color: bright, alpha });
  // Underside shadow strip
  g.rect(cx + 3, cy + h * 4 - 2, w - 6, 3).fill({ color: shadow, alpha: alpha * 0.5 });
}

// Draw a small floating island silhouette for bg layers
function drawBgIsland(g: Graphics, ix: number, iy: number, w: number, h: number, col: number): void {
  g.rect(ix,      iy,     w,     h    ).fill(col);
  g.rect(ix + 2,  iy + h, w - 4, 2   ).fill(lerpColor(col, 0x000000, 0.35));
  g.rect(ix + 5,  iy + h + 2, w - 10, 2).fill(lerpColor(col, 0x000000, 0.55));
  // Tiny grass top
  g.rect(ix,      iy,     w,     2).fill(lerpColor(col, 0x60a020, 0.6));
  // Tiny tree silhouettes (2px wide each)
  const treeH = 3 + w % 4;
  g.rect(ix + Math.round(w * 0.2), iy - treeH, 2, treeH).fill(lerpColor(col, 0x204010, 0.4));
  g.rect(ix + Math.round(w * 0.7), iy - treeH + 1, 2, treeH - 1).fill(lerpColor(col, 0x204010, 0.3));
}

function buildSkyStatic(sw: number, sh: number): void {
  // Stars (visible at high altitude)
  starsGfx.clear();
  for (let i = 0; i < 100; i++) {
    const sx = (i * 7919 + 1031) % sw;
    const sy = (i * 4231 +  571) % Math.round(sh * 3.0) - sh;
    const big = i % 7 === 0;
    starsGfx.rect(sx, sy, big ? 2 : 1, big ? 2 : 1)
      .fill({ color: PAL.starBright, alpha: big ? 0.9 : 0.42 });
  }

  // Sun glow (warm golden circle, lower-right quadrant)
  sunGlowGfx.clear();
  const sunX = sw * 0.72, sunY = sh * 0.88;
  for (let r = 7; r >= 1; r--) {
    sunGlowGfx.circle(sunX, sunY, r * 32).fill({ color: 0xf8e080, alpha: r * 0.025 });
  }
  sunGlowGfx.circle(sunX, sunY, 18).fill({ color: 0xfff8c0, alpha: 0.45 });
  sunGlowGfx.circle(sunX, sunY, 8).fill({ color: 0xfffff0, alpha: 0.8 });

  // Distant floating island silhouettes
  islandsFar.removeChildren();
  const ig = new Graphics();
  for (let i = 0; i < 12; i++) {
    const ix = ((i * 89 + 23) % (sw + 60)) - 30;
    const iy = sh * 0.45 + (i * 61 % Math.round(sh * 0.35));
    const iw = 20 + (i * 37 % 55);
    const ih = 6 + (i * 23 % 12);
    drawBgIsland(ig, ix, iy, iw, ih, PAL.islandFar);
  }
  islandsFar.addChild(ig);

  // Ancient tower silhouettes
  towersCont.removeChildren();
  const tg = new Graphics();
  for (let i = 0; i < 7; i++) {
    const tx = ((i * 113 + 41) % (sw + 80)) - 30;
    const th = sh * (0.15 + (i * 43 % 60) / 300);
    const tw = 10 + i * 5;
    tg.rect(tx,      sh * 0.9 - th, tw,     th    ).fill(PAL.ruinsDark);
    // Tower top / spire
    tg.poly([tx + 1, sh * 0.9 - th, tx + Math.round(tw / 2), sh * 0.9 - th - 10, tx + tw - 1, sh * 0.9 - th]).fill(PAL.ruinsDark);
    // Battlements
    for (let b = 0; b < 3; b++) tg.rect(tx + b * Math.floor(tw / 3), sh * 0.9 - th - 5, Math.floor(tw / 4), 5).fill(PAL.ruinsDark);
    // Window glow
    tg.rect(tx + Math.round(tw * 0.3), sh * 0.9 - th * 0.55, 3, 5).fill({ color: PAL.portalBlue, alpha: 0.14 });
  }
  towersCont.addChild(tg);

  // Far clouds (thin, hazy, distant)
  cloudsFar.removeChildren();
  const cfg = new Graphics();
  for (let i = 0; i < 10; i++) {
    const cw = 36 + (i * 53 % 80);
    const cx = ((i * 97 + 17) % (sw + 80)) - 40;
    const cy = sh * 0.06 + (i * 79 % Math.round(sh * 0.70));
    drawPixelCloud(cfg, cx, cy, cw, PAL.cloudMid, PAL.cloudFar, 0.42);
  }
  cloudsFar.addChild(cfg);

  // Mid clouds (medium, puffier, warmer)
  cloudsMid.removeChildren();
  const cmg = new Graphics();
  for (let i = 0; i < 7; i++) {
    const cw = 70 + (i * 61 % 90);
    const cx = ((i * 137 + 53) % (sw + 120)) - 50;
    const cy = sh * 0.04 + (i * 103 % Math.round(sh * 0.68));
    drawPixelCloud(cmg, cx, cy, cw, PAL.cloudMid, PAL.cloudShadow, 0.60);
  }
  cloudsMid.addChild(cmg);

  // Front clouds (large, detailed, warm sunlit)
  cloudsFront.removeChildren();
  const cfg2 = new Graphics();
  for (let i = 0; i < 5; i++) {
    const cw = 110 + (i * 71 % 100);
    const cx = ((i * 173 + 31) % (sw + 160)) - 60;
    const cy = sh * 0.02 + (i * 127 % Math.round(sh * 0.72));
    // Warm sunlit top, cool shadow underneath
    drawPixelCloud(cfg2, cx, cy, cw, PAL.cloudWarm, PAL.cloudShadow, 0.72);
    // Subtle warm highlight on topmost bump
    cfg2.rect(cx + Math.round(cw * 0.38), cy, Math.round(cw * 0.24), 2)
      .fill({ color: 0xfffff0, alpha: 0.3 });
  }
  cloudsFront.addChild(cfg2);
}

function updateSkyParallax(camY: number, scale: number): void {
  const sw = pixi.screen.width, sh = pixi.screen.height;
  const scrollPx = -camY * scale;
  const heightT  = Math.max(0, -camY / TILE_SIZE);
  const t        = Math.min(1.0, heightT / (CHUNK_HEIGHT_TILES * 20));

  // Sky gradient — 5 bands for smooth depth
  const b = Math.round(sh / 5);
  skyBgGfx.clear();
  skyBgGfx.rect(0,     0, sw, b    ).fill(lerpColor(PAL.skyMid,    PAL.skyDeep,  t));
  skyBgGfx.rect(0,     b, sw, b    ).fill(lerpColor(PAL.skyMid,    PAL.skySpace, t * 0.6));
  skyBgGfx.rect(0, b * 2, sw, b    ).fill(lerpColor(PAL.skyGround, PAL.skyMid,   Math.min(1, t * 1.3)));
  skyBgGfx.rect(0, b * 3, sw, b    ).fill(lerpColor(PAL.skyGround, PAL.skyMid,   0.3 + t * 0.4));
  skyBgGfx.rect(0, b * 4, sw, sh - b * 4).fill(PAL.skyGround);
  // Soft horizon haze strip
  skyBgGfx.rect(0, sh - 6, sw, 6).fill({ color: PAL.skyHaze, alpha: 0.28 - t * 0.25 });

  // Sun glow fades as player climbs into space
  sunGlowGfx.alpha = Math.max(0, 1 - t * 2.2);

  starsGfx.alpha    = Math.min(1, t * 3.0);
  starsGfx.y        = scrollPx * 0.0;
  islandsFar.y      = scrollPx * 0.05;
  towersCont.y      = scrollPx * 0.11;
  cloudsFar.x   = cloudDriftFar;
  cloudsFar.y       = scrollPx * 0.20;
  cloudsMid.x   = cloudDriftMid;
  cloudsMid.y       = scrollPx * 0.34;
  cloudsFront.x = cloudDriftFront;
  cloudsFront.y     = scrollPx * 0.50;
}

buildSkyStatic(pixi.screen.width, pixi.screen.height);
window.addEventListener("resize", () =>
  setTimeout(() => buildSkyStatic(pixi.screen.width, pixi.screen.height), 80)
);

// ── Tile rendering ────────────────────────────────────────────────────────────

function renderChunk(chunk: GeneratedChunk): void {
  const g = new Graphics();
  const baseTileY = chunk.worldTileY;

  for (let ly = 0; ly < chunk.height; ly++) {
    for (let lx = 0; lx < chunk.width; lx++) {
      const kind = chunk.tiles[ly * chunk.width + lx] as TileKind;
      if (kind === "empty" || kind === "relic") continue;
      const above = ly > 0 ? chunk.tiles[(ly - 1) * chunk.width + lx] as TileKind : "empty";
      const below = ly < chunk.height - 1 ? chunk.tiles[(ly + 1) * chunk.width + lx] as TileKind : "solid";
      drawTile(g, lx, baseTileY + ly, kind, above, below, chunk.chunkY);
    }
  }

  chunkLayer.addChild(g);
  chunkGraphics.set(chunk.chunkY, g);

  for (const rel of chunk.relics) {
    if (!collectedRelics.has(rel.id)) spawnRelicAnim(rel.id, rel.x, baseTileY + rel.y);
  }

  // Portal at exit platform (the upward goal for this chunk)
  spawnPortalAt(chunk.chunkY, chunk.exit.x, baseTileY + chunk.exit.y, chunk.exit.width, chunk.chunkY > 0);
}

function drawTile(
  g: Graphics, tileX: number, tileY: number,
  kind: TileKind, above: TileKind, below: TileKind, chunkIdx: number,
): void {
  const px = tileX * TILE_SIZE, py = tileY * TILE_SIZE;
  // Per-tile pseudo-random seeds (deterministic, no Math.random)
  const h1 = (tileX * 2503 + tileY * 1237) & 0xffff;
  const h2 = (tileX * 3701 + tileY * 809)  & 0xffff;
  const hNorm = Math.min(1, chunkIdx / 28);

  const hasTop = above === "empty" || above === "hazard" || above === "relic";
  const hasBot = below === "empty" || below === "hazard" || below === "relic";

  if (kind === "oneWay") {
    // ── Floating island platform (main gameplay surface) ──────────────────

    // Altitude-shifted stone colour: cool sandstone → worn ruins at altitude
    const stoneCol = lerpColor(PAL.stoneMid, PAL.stoneWorn, hNorm * 0.55);

    // Outline + body
    g.rect(px, py, TILE_SIZE, TILE_SIZE).fill(PAL.stoneShadow);
    g.rect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2).fill(stoneCol);

    // Brick mortar seams — staggered rows give classic masonry look
    const stagger = (tileY % 2 === 0) ? 0 : 8;
    g.rect(px + 1, py + 8, TILE_SIZE - 2, 1).fill({ color: PAL.stoneShadow, alpha: 0.5 });
    const vs1 = px + 1 + ((stagger + 7) % (TILE_SIZE - 2));
    const vs2 = px + 1 + ((stagger + 7 + 8) % (TILE_SIZE - 2));
    g.rect(vs1, py + 1, 1, 7).fill({ color: PAL.stoneShadow, alpha: 0.38 });
    g.rect(vs2, py + 9, 1, TILE_SIZE - 10).fill({ color: PAL.stoneShadow, alpha: 0.38 });

    // Subtle top highlight (light from above)
    g.rect(px + 1, py + 1, TILE_SIZE - 2, 1).fill({ color: PAL.stoneLight, alpha: 0.22 });
    // Right-edge shadow
    g.rect(px + TILE_SIZE - 2, py + 2, 1, TILE_SIZE - 3).fill({ color: PAL.stoneShadow, alpha: 0.20 });

    // Moss patch (1 in 3 tiles, position varies)
    if (h1 % 3 < 1) {
      const mx = px + 2 + (h1 % 5);
      g.rect(mx, py + 3, 3, 2).fill(PAL.mossGreen);
      g.rect(mx, py + 2, 2, 1).fill(PAL.mossBright);
    }

    // Altitude rune glow (rare, high chunks only)
    if (hNorm > 0.55 && (h2 % 9) < 2) {
      g.rect(px + 5 + (h2 % 5), py + 5, 2, 4).fill({ color: PAL.runeGlow, alpha: 0.38 + hNorm * 0.25 });
    }

    // ── Grass top (exposed upper face) ──────────────────────────────────
    if (hasTop) {
      const gCol = lerpColor(PAL.grassTop, PAL.mossBright, hNorm * 0.45);
      // Soil backing under grass
      g.rect(px + 1, py + 1, TILE_SIZE - 2, 4).fill(PAL.soilWarm);
      // Grass layer
      g.rect(px + 1, py + 1, TILE_SIZE - 2, 2).fill(PAL.grassDark);
      g.rect(px + 1, py + 1, TILE_SIZE - 2, 1).fill(gCol);
      // Tiny grass tufts above the tile edge
      for (let t = 0; t < 4; t++) {
        const tx = px + 1 + t * 4 + (h1 % 3);
        const th = 1 + ((h1 + t * 3) % 2);
        g.rect(tx, py - th, 1, th).fill(gCol);
      }
      // Occasional tiny flower (-2 to -3 px above tile)
      const fl = (tileX * 11 + tileY * 17) % 23;
      if (fl < 3) {
        const fcol = fl === 0 ? 0xffaabb : fl === 1 ? PAL.coinGold : 0xffffff;
        g.rect(px + 3 + fl * 4, py - 2, 1, 2).fill(lerpColor(PAL.grassDark, gCol, 0.5)); // stem
        g.rect(px + 3 + fl * 4, py - 3, 1, 1).fill(fcol);
      }
      // Moss overflow on edges (gives organic silhouette)
      if ((h1 % 4) < 2) g.rect(px, py, 1, 3).fill({ color: PAL.mossBright, alpha: 0.55 });
      if ((h2 % 4) < 2) g.rect(px + TILE_SIZE - 1, py, 1, 3).fill({ color: PAL.mossBright, alpha: 0.55 });
    }

    // ── Soil underside with hanging roots ───────────────────────────────
    if (hasBot) {
      // Soil underside band
      g.rect(px + 1, py + TILE_SIZE - 4, TILE_SIZE - 2, 3).fill(PAL.soilDark);
      g.rect(px + 1, py + TILE_SIZE - 4, TILE_SIZE - 2, 1).fill(PAL.soilWarm);
      // Hanging roots (2–4 per tile)
      const rc = 2 + (h1 % 3);
      const rStep = Math.floor((TILE_SIZE - 4) / rc);
      for (let r = 0; r < rc; r++) {
        const rx = px + 2 + r * rStep + (h2 % 3);
        const rlen = 2 + ((h1 + r * 5) % 5);
        g.rect(rx, py + TILE_SIZE, 1, rlen).fill(PAL.soilRoot);
        if (rlen >= 4) g.rect(rx - 1, py + TILE_SIZE + rlen - 2, 3, 1).fill(lerpColor(PAL.soilRoot, PAL.soilDark, 0.5));
      }
      // Occasional hanging vine (thicker, 2px wide)
      if ((h2 % 5) < 2) {
        const vx = px + 5 + (h2 % 8);
        const vlen = 4 + (h1 % 5);
        g.rect(vx, py + TILE_SIZE, 2, vlen).fill(PAL.mossGreen);
        g.rect(vx, py + TILE_SIZE, 2, 1).fill(PAL.mossBright);
      }
    }

  } else if (kind === "solid") {
    // ── Floor / wall tiles ───────────────────────────────────────────────
    g.rect(px, py, TILE_SIZE, TILE_SIZE).fill(PAL.stoneShadow);
    g.rect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2).fill(PAL.stoneDark);
    g.rect(px + 1, py + 1, TILE_SIZE - 2, 1).fill({ color: PAL.stoneMid, alpha: 0.25 });

  } else if (kind === "hazard") {
    // ── Stone spike hazard ───────────────────────────────────────────────
    g.rect(px, py + TILE_SIZE - 5, TILE_SIZE, 5).fill(PAL.hazardBase);
    g.rect(px, py + TILE_SIZE - 5, TILE_SIZE, 1).fill({ color: PAL.hazardRed, alpha: 0.5 });
    for (let i = 0; i < 3; i++) {
      const sx = px + 2 + i * 5;
      g.poly([sx, py + TILE_SIZE - 5, sx + 2, py + 1, sx + 4, py + TILE_SIZE - 5]).fill(PAL.hazardRed);
      g.rect(sx + 1, py + 1, 2, 4).fill(PAL.hazardGlow);
      g.rect(sx + 1, py + 1, 1, 1).fill(0xffffff); // tip gleam
    }
  }
}

// ── Relic animations ──────────────────────────────────────────────────────────

function spawnRelicAnim(id: string, tileX: number, tileY: number): void {
  if (relicAnims.has(id)) return;
  const container = new Container();
  const gfx = new Graphics();
  container.addChild(gfx);
  container.x = tileX * TILE_SIZE + TILE_SIZE / 2;
  container.y = tileY * TILE_SIZE + TILE_SIZE / 2;
  relicLayer.addChild(container);
  relicAnims.set(id, { container, gfx, tileX, tileY });
}

function updateRelicAnims(tSec: number): void {
  for (const [id, a] of relicAnims) {
    if (collectedRelics.has(id)) {
      a.container.destroy();
      relicAnims.delete(id);
      continue;
    }
    const bob   = Math.sin(tSec * 3.0 + a.tileX * 0.8) * 2.5;
    a.container.y = a.tileY * TILE_SIZE + TILE_SIZE / 2 + bob;

    const frame  = Math.floor((tSec * 5) % 4);
    const coinW  = frame === 0 ? 8 : frame === 1 ? 5 : frame === 2 ? 2 : 5;
    const cx     = -coinW / 2;

    a.gfx.clear();
    a.gfx.rect(cx - 1, -7, coinW + 2, 14).fill({ color: PAL.coinGlow, alpha: 0.28 });
    a.gfx.rect(cx, -6, coinW, 12).fill(PAL.coinGold);
    if (coinW >= 4) {
      a.gfx.rect(cx, -6, coinW, 2).fill(PAL.coinGlow);
      a.gfx.rect(cx + coinW - 2, -6, 2, 12).fill(PAL.coinShade);
    }
  }
}

// ── Portal animations ─────────────────────────────────────────────────────────

interface PortalAnim {
  container: Container;
  bodyGfx:   Graphics;
  glowGfx:   Graphics;
  worldX:    number;
  worldY:    number;
  tileW:     number;
  isExit:    boolean;
}
const portalAnims = new Map<number, PortalAnim>(); // keyed by chunkY

function spawnPortalAt(chunkY: number, tileX: number, tileY: number, tileW: number, isExit: boolean): void {
  if (portalAnims.has(chunkY)) return;

  const container = new Container();
  const bodyGfx   = new Graphics();
  const glowGfx   = new Graphics();
  container.addChild(bodyGfx, glowGfx);

  const wx = tileX * TILE_SIZE + (tileW * TILE_SIZE) / 2;
  const wy = tileY * TILE_SIZE;
  container.x = wx;
  container.y = wy;
  portalLayer.addChild(container);

  const hw = Math.round((tileW * TILE_SIZE) * 0.40);  // portal half-width
  const ph = isExit ? 32 : 22;  // portal arch height

  // Static body — ancient stone arch
  // Left pillar
  bodyGfx.rect(-hw - 5, -ph, 5, ph).fill(PAL.stoneDark);
  bodyGfx.rect(-hw - 4, -ph - 1, 4, 3).fill(PAL.stoneWorn); // cap stone
  bodyGfx.rect(-hw - 5, -ph, 1, ph).fill({ color: PAL.stoneLight, alpha: 0.12 }); // pillar highlight
  // Moss on left pillar
  bodyGfx.rect(-hw - 5, -ph + 6, 3, 2).fill(PAL.mossGreen);
  bodyGfx.rect(-hw - 4, -ph + 14, 4, 2).fill(PAL.mossBright);

  // Right pillar
  bodyGfx.rect(hw, -ph, 5, ph).fill(PAL.stoneDark);
  bodyGfx.rect(hw, -ph - 1, 4, 3).fill(PAL.stoneWorn);
  bodyGfx.rect(hw + 4, -ph, 1, ph).fill({ color: PAL.stoneShadow, alpha: 0.18 });
  bodyGfx.rect(hw + 1, -ph + 8, 3, 2).fill(PAL.mossGreen);

  // Lintel (top crossbar)
  bodyGfx.rect(-hw - 5, -ph - 4, hw * 2 + 10, 5).fill(PAL.stoneDark);
  bodyGfx.rect(-hw - 4, -ph - 5, hw * 2 + 8, 2).fill(PAL.stoneWorn);
  // Rune glow on lintel
  bodyGfx.rect(-3, -ph - 4, 6, 3).fill({ color: PAL.runeGlow, alpha: 0.5 });
  if (isExit) {
    bodyGfx.rect(-8, -ph - 4, 4, 3).fill({ color: PAL.runeGlow, alpha: 0.3 });
    bodyGfx.rect(4,  -ph - 4, 4, 3).fill({ color: PAL.runeGlow, alpha: 0.3 });
  }

  // Hanging vines from lintel
  for (let v = 0; v < 3; v++) {
    const vx = -hw + 4 + v * Math.round(hw * 0.7);
    const vlen = 5 + v * 3;
    bodyGfx.rect(vx, -ph + 1, 1, vlen).fill(PAL.mossGreen);
    bodyGfx.rect(vx - 1, -ph + vlen - 2, 3, 1).fill(PAL.canopyMid);
  }

  portalAnims.set(chunkY, { container, bodyGfx, glowGfx, worldX: wx, worldY: wy, tileW, isExit });
}

function updatePortals(tSec: number): void {
  for (const a of portalAnims.values()) {
    const g     = a.glowGfx;
    const hw    = Math.round((a.tileW * TILE_SIZE) * 0.40);
    const ph    = a.isExit ? 32 : 22;
    const pulse = Math.sin(tSec * (a.isExit ? 3.5 : 2.5)) * 0.5 + 0.5;
    const col   = a.isExit ? PAL.portalBlue : PAL.uiHighlight;

    g.clear();

    // Glow fill inside arch
    const gAlpha = (a.isExit ? 0.22 : 0.14) + pulse * (a.isExit ? 0.14 : 0.08);
    g.rect(-hw + 1, -ph + 1, hw * 2 - 2, ph - 2).fill({ color: col, alpha: gAlpha });

    // Inner bright column
    const bw = a.isExit ? 6 : 4;
    g.rect(-Math.floor(bw / 2), -ph + 2, bw, ph - 4)
      .fill({ color: col, alpha: 0.18 + pulse * 0.22 });

    // Horizontal scan lines (magical energy)
    for (let r = 0; r < (a.isExit ? 6 : 4); r++) {
      const ry = -ph + 4 + r * Math.round((ph - 6) / (a.isExit ? 6 : 4));
      const scanOffset = Math.sin(tSec * 2.2 + r * 1.1) * (hw * 0.3);
      g.rect(Math.round(scanOffset) - 5, ry, 10, 1)
        .fill({ color: col, alpha: 0.28 + pulse * 0.15 });
    }

    // Orbiting rune dots
    const orbs = a.isExit ? 5 : 3;
    for (let o = 0; o < orbs; o++) {
      const angle = tSec * (a.isExit ? 1.8 : 1.2) + (o * Math.PI * 2) / orbs;
      const r = (hw * 0.55) + pulse * 2;
      const ox = Math.round(Math.cos(angle) * r);
      const oy = Math.round(Math.sin(angle) * r * 0.55 - ph * 0.5);
      g.rect(ox - 1, oy - 1, 2, 2).fill({ color: col, alpha: 0.7 + pulse * 0.3 });
    }

    // Bright center flash on exit portal
    if (a.isExit && pulse > 0.85) {
      g.rect(-2, -Math.round(ph * 0.55), 4, 4).fill({ color: 0xffffff, alpha: (pulse - 0.85) * 5 });
    }
  }
}

// ── Character drawing ─────────────────────────────────────────────────────────

function drawPlayerInto(g: Graphics, s: PlayerState, color: number, elapsed: number): void {
  g.clear();
  if (s.invulnerable > 0 && Math.floor(elapsed / 80) % 2 === 1) return;

  const x = Math.round(s.position.x);
  const y = Math.round(s.position.y);
  const fx = s.facing;
  const phase = s.kickPhase;

  let kox = 0;
  if (phase === "windup")   kox = fx * -2;
  else if (phase === "active")   kox = fx *  5;
  else if (phase === "recovery") kox = fx *  2;

  const vy = s.velocity.y;
  const squash  = s.grounded ? Math.min(3, Math.abs(vy) * 0.008) : 0;
  const stretch = vy > 160    ? Math.min(4, (vy - 160) / 80)   : 0;

  const vw = PLAYER_WIDTH  + 4 + Math.round(stretch * 0.4);
  const vh = PLAYER_HEIGHT + 4 - Math.round(squash) + Math.round(stretch);
  const vx = x - 2 + kox;
  const vy2 = y - 2 + Math.round(squash * 0.5);

  // Shadow
  g.ellipse(x + PLAYER_WIDTH / 2, y + PLAYER_HEIGHT + 3, 8 + squash, 3 - squash)
    .fill({ color: 0x000000, alpha: 0.28 });

  // Scarf (secondary motion — trails opposite to movement direction)
  const speed = Math.abs(s.velocity.x);
  const scarfLen = Math.min(11, speed / 14 + (phase === "active" ? 8 : 2));
  const scarfDir = s.velocity.x < -8 ? 1 : s.velocity.x > 8 ? -1 : -fx;
  for (let si = 0; si < 3; si++) {
    const sw2 = scarfLen - si * 3.5;
    if (sw2 <= 0) break;
    g.rect(
      vx + (fx > 0 ? 1 : vw - 3) + scarfDir * si * 3, vy2 + 8 + si,
      Math.round(sw2), 2
    ).fill({ color: si === 0 ? PAL.scarfPrimary : PAL.scarfShade, alpha: 1 - si * 0.28 });
  }

  // Outline
  g.rect(vx - 1, vy2 - 1, vw + 2, vh + 2).fill(PAL.uiInk);
  // Body
  g.rect(vx, vy2, vw, vh).fill(0x485058);
  // Jacket (accent)
  g.rect(vx + 2, vy2 + 8, vw - 4, vh - 16).fill(color);

  // Head
  g.rect(vx + 2, vy2 + 1, vw - 4, 8).fill(PAL.skinLight);
  // Hair
  g.rect(vx + 2, vy2 + 1, vw - 4, 3).fill(PAL.hairDark);
  // Eye
  const eyeX = fx > 0 ? vx + vw - 8 : vx + 3;
  g.rect(eyeX, vy2 + 4, 2, 2).fill(PAL.uiInk);
  g.rect(eyeX + 1, vy2 + 4, 1, 1).fill(0xffffff);

  // Legs — animate when running on ground
  const legAnim = s.grounded && speed > 18;
  const legSwing = legAnim ? Math.sin((elapsed / 80) * Math.sign(s.velocity.x) * fx) * 2 : 0;
  g.rect(vx + 2,       vy2 + vh - 8 + Math.round(Math.max(0,  legSwing)), 4, 7 + Math.round(squash)).fill(PAL.canopyDark);
  g.rect(vx + vw - 6,  vy2 + vh - 8 + Math.round(Math.max(0, -legSwing)), 4, 7 + Math.round(squash)).fill(PAL.canopyDark);

  // Kick foot
  if (phase === "active") {
    const fx2 = fx > 0 ? vx + vw + 1 : vx - 9;
    g.rect(fx2, vy2 + vh - 9, 8, 5).fill(color);
    g.rect(fx2, vy2 + vh - 9, 8, 1).fill(PAL.coinGlow);
  }

  // Kick cooldown bar
  if (s.kickCooldown > 0 || phase !== "idle") {
    const total = KICK_COOLDOWN_SECONDS + KICK_WINDUP_SECONDS + KICK_ACTIVE_SECONDS + KICK_RECOVERY_SECONDS;
    const bw = 18, bx = x + PLAYER_WIDTH / 2 - bw / 2, by = y - 7;
    g.rect(bx, by, bw, 2).fill({ color: PAL.uiInk, alpha: 0.7 });
    const fill = phase !== "idle"
      ? 1 - s.kickTimer / (phase === "windup" ? KICK_WINDUP_SECONDS : phase === "active" ? KICK_ACTIVE_SECONDS : KICK_RECOVERY_SECONDS)
      : 1 - s.kickCooldown / total;
    g.rect(bx, by, Math.round(bw * Math.max(0, fill)), 2).fill(PAL.hazardRed);
  }
}

function makeLabel(name: string): Text {
  return new Text({
    text: name.slice(0, 12),
    style: {
      fill: PAL.uiParchment,
      fontSize: 7,
      fontFamily: "monospace",
      stroke: { color: PAL.uiInk, width: 2 },
    },
  });
}

// ── Particle system ───────────────────────────────────────────────────────────

interface Particle { gfx: Graphics; vx: number; vy: number; life: number; max: number; gravity: number }
const particles:   Particle[] = [];
const partPool:    Graphics[] = [];

function spawnPart(wx: number, wy: number, vx: number, vy: number, life: number, color: number, size = 2, gravity = 200): void {
  const gfx = partPool.pop() ?? new Graphics();
  gfx.clear();
  gfx.rect(0, 0, size, size).fill(color);
  gfx.x = wx; gfx.y = wy; gfx.alpha = 1; gfx.visible = true;
  effectLayer.addChild(gfx);
  particles.push({ gfx, vx, vy, life, max: life, gravity });
}

function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!;
    p.life -= dt;
    if (p.life <= 0) {
      p.gfx.visible = false;
      effectLayer.removeChild(p.gfx);
      partPool.push(p.gfx);
      particles.splice(i, 1);
      continue;
    }
    p.gfx.x += p.vx * dt;
    p.gfx.y += p.vy * dt;
    p.vy    += p.gravity * dt;
    p.gfx.alpha = p.life / p.max;
  }
}

let ambientTimer = 0;
function spawnAmbientParticles(dt: number): void {
  ambientTimer += dt;
  if (!localPlayer || particles.length > 80) return;
  // Spawn a leaf every ~1.5s from above the visible area
  if (ambientTimer > 1.5) {
    ambientTimer = 0;
    const wx = (Math.random() * WORLD_WIDTH * 0.9) + WORLD_WIDTH * 0.05;
    const wy = localPlayer.position.y - 100 - Math.random() * 80;
    const leafCol = Math.random() < 0.5 ? PAL.leafGreen : PAL.grassTop;
    // Very low gravity, gentle drift — 3–5s life
    spawnPart(wx, wy, (Math.random() - 0.5) * 18, 12 + Math.random() * 8,
      3.0 + Math.random() * 2.0, leafCol, 2, 12);
  }
  // Fireflies: rare, near platform level, glow yellow-green
  if (ambientTimer < 0.05 && Math.random() < 0.3) {
    const wx = (Math.random() * WORLD_WIDTH * 0.8) + WORLD_WIDTH * 0.1;
    const wy = localPlayer.position.y - 20 - Math.random() * 60;
    spawnPart(wx, wy, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4,
      2.5 + Math.random() * 1.5, PAL.coinGlow, 2, 0);
  }
}

function jumpDust(wx: number, wy: number, facing: number): void {
  for (let i = 0; i < 5; i++)
    spawnPart(wx + i * 3 - 6, wy, (i - 2) * 22 - facing * 12, -28 - Math.random() * 18, 0.22, PAL.stoneMid);
}

function landDust(wx: number, wy: number, impactVy: number): void {
  const n = Math.min(10, Math.round(impactVy / 28));
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (Math.random() - 0.5) * Math.PI * 0.55;
    const spd = 35 + Math.random() * impactVy * 0.28;
    spawnPart(wx, wy, Math.cos(a) * spd, Math.sin(a) * spd - 18, 0.28, PAL.stoneLight);
  }
}

function kickSpark(wx: number, wy: number, facing: number, color: number): void {
  for (let i = 0; i < 7; i++) {
    const a = (facing > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.9;
    const spd = 75 + Math.random() * 110;
    spawnPart(wx, wy, Math.cos(a) * spd, Math.sin(a) * spd - 28, 0.22, color);
  }
  spawnPart(wx + facing * 4, wy, 0, -8, 0.1, 0xffffff, 4);
}

function coinBurst(wx: number, wy: number): void {
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8 - Math.PI / 2;
    spawnPart(wx, wy, Math.cos(a) * 75, Math.sin(a) * 75 - 18, 0.38, PAL.coinGold, 3);
    spawnPart(wx, wy, Math.cos(a) * 38, Math.sin(a) * 38 - 10, 0.24, PAL.coinGlow,  2);
  }
}

function spawnRing(wx: number, wy: number, color: number): void {
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12;
    spawnPart(wx + Math.cos(a) * 4, wy + Math.sin(a) * 4, Math.cos(a) * 56, Math.sin(a) * 56, 0.38, color, 3);
  }
}

function burst(wx: number, wy: number, color: number): void {
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    spawnPart(wx + Math.cos(a) * 8, wy + Math.sin(a) * 8, Math.cos(a) * 55, Math.sin(a) * 55 - 18, 0.28, color, 3);
  }
}

// ── Camera ────────────────────────────────────────────────────────────────────

function getScale(): number {
  return Math.min(Math.max(Math.max(320, pixi.screen.width) / WORLD_WIDTH, 0.8), 2.5);
}

function updateCamera(dt: number, scale: number): void {
  const renderPos = getLocalRenderPosition();
  if (localPlayer && renderPos) {
    const vh     = Math.max(300, pixi.screen.height) / scale;
    const target = renderPos.y + PLAYER_HEIGHT / 2 - vh * 0.30;
    if (cameraSnap) { cameraY = target; cameraSnap = false; }
    else            { cameraY += (target - cameraY) * Math.min(1, dt * 7); }
  }

  shakeX *= 0.84; shakeY *= 0.84;
  if (Math.abs(shakeX) < 0.08) shakeX = 0;
  if (Math.abs(shakeY) < 0.08) shakeY = 0;

  worldLayer.scale.set(scale);
  worldLayer.x = Math.round((pixi.screen.width - WORLD_WIDTH * scale) / 2 + shakeX);
  worldLayer.y = Math.round(-cameraY * scale + shakeY);

  updateSkyParallax(cameraY, scale);
}

function triggerShake(sx: number, sy: number): void {
  shakeX = sx * (Math.random() > 0.5 ? 1 : -1);
  shakeY = sy;
}

// ── HUD ───────────────────────────────────────────────────────────────────────

// Draw a pixel-art stone panel at (x, y) with size (w, h) onto Graphics g
function drawHudPanel(g: Graphics, x: number, y: number, w: number, h: number): void {
  // Drop shadow
  g.rect(x + 3, y + 3, w, h).fill({ color: 0x000000, alpha: 0.5 });
  // Dark stone body
  g.rect(x, y, w, h).fill(0x080e18);
  // Outer border — darkest
  g.rect(x, y, w, 2).fill(0x040810);
  g.rect(x, y + h - 2, w, 2).fill(0x040810);
  g.rect(x, y, 2, h).fill(0x040810);
  g.rect(x + w - 2, y, 2, h).fill(0x040810);
  // Inner top-left highlight
  g.rect(x + 2, y + 2, w - 4, 1).fill({ color: 0x2a4060, alpha: 0.7 });
  g.rect(x + 2, y + 2, 1, h - 4).fill({ color: 0x2a4060, alpha: 0.5 });
  // Cyan top accent strip
  g.rect(x + 2, y, w - 4, 1).fill({ color: PAL.uiHighlight, alpha: 0.55 });
  // Moss corner dots
  g.rect(x + 2, y + 2, 3, 3).fill({ color: PAL.mossGreen, alpha: 0.55 });
  g.rect(x + w - 5, y + 2, 3, 3).fill({ color: PAL.mossGreen, alpha: 0.55 });
  g.rect(x + 2, y + h - 5, 3, 3).fill({ color: PAL.canopyDark, alpha: 0.45 });
  g.rect(x + w - 5, y + h - 5, 3, 3).fill({ color: PAL.canopyDark, alpha: 0.45 });
}

// Draw a small pixel-art coin icon at (x, y) - frame 0..3 spin animation
function drawHudCoinIcon(g: Graphics, x: number, y: number, frame: number): void {
  const w = frame === 0 ? 7 : frame === 1 ? 5 : frame === 2 ? 2 : 5;
  const cx = x + Math.round((7 - w) / 2);
  g.rect(cx, y, w, 10).fill(PAL.coinGold);
  if (w >= 4) {
    g.rect(cx, y, w, 2).fill(PAL.coinGlow);
    g.rect(cx + w - 2, y, 2, 10).fill(PAL.coinShade);
  }
  g.rect(cx - 1, y - 1, w + 2, 12).fill({ color: PAL.coinGlow, alpha: 0.2 });
}

let hudBuilt   = false;
let hudPanelGfx: Graphics;
let hudIconGfx:  Graphics;   // animated icons — cleared each frame
let hudCoinTxt:  Text;
let hudHeightTxt:Text;
let hudPhaseTxt: Text;
let hudPingTxt:  Text;
let hudRankTxt:  Text;

function buildHudPanels(): void {
  if (hudPanelGfx) hudPanelGfx.destroy();
  hudPanelGfx = new Graphics();
  // Left stat panel — tall enough to include rank and ping rows
  drawHudPanel(hudPanelGfx, 6, 6, 82, 56);
  hudLayer.addChildAt(hudPanelGfx, 0);
}

function ensureHud(): void {
  if (hudBuilt) return;
  hudBuilt = true;
  const base = { fontFamily: "monospace", fontSize: 9 };
  hudCoinTxt   = new Text({ text: "0",    style: { ...base, fill: PAL.coinGold,     fontWeight: "900" } });
  hudHeightTxt = new Text({ text: "0m",   style: { ...base, fill: PAL.uiParchment,  fontSize: 10, fontWeight: "700" } });
  hudPhaseTxt  = new Text({ text: "",     style: { ...base, fill: PAL.uiHighlight,  fontSize: 11, fontWeight: "900" } });
  hudPingTxt   = new Text({ text: "",     style: { ...base, fill: 0x486878,         fontSize: 8 } });
  hudRankTxt   = new Text({ text: "",     style: { ...base, fill: PAL.uiParchment,  fontSize: 8 } });
  hudIconGfx   = new Graphics();

  hudCoinTxt.x   = 28; hudCoinTxt.y   = 10;
  hudHeightTxt.x = 28; hudHeightTxt.y = 26;
  hudPingTxt.x   = 10; hudPingTxt.y   = 52;
  hudRankTxt.x   = 10; hudRankTxt.y   = 52;

  buildHudPanels();
  hudLayer.addChild(hudIconGfx, hudCoinTxt, hudHeightTxt, hudPhaseTxt, hudPingTxt, hudRankTxt);

  window.addEventListener("resize", () => setTimeout(buildHudPanels, 80));
}

function updateHud(tSec: number): void {
  if (!localPlayer) return;
  ensureHud();

  const hm    = Math.max(0, Math.round(-localPlayer.position.y / 32));
  const coins = localPlayer.coins;

  // Animated coin icon
  hudIconGfx.clear();
  drawHudCoinIcon(hudIconGfx, 10, 10, Math.floor(tSec * 4) % 4);
  // Height icon: upward arrow
  hudIconGfx.rect(10, 28, 2, 8).fill(PAL.uiHighlight);
  hudIconGfx.rect(8,  28, 6, 2).fill(PAL.uiHighlight);
  hudIconGfx.rect(9,  26, 4, 2).fill(PAL.uiHighlight);

  hudCoinTxt.text   = String(coins);
  hudHeightTxt.text = `${hm}m`;

  // Rank + ping in lower part of panel
  const rows: Array<{ name: string; h: number; coins: number; local: boolean }> = [];
  if (localPlayerId) rows.push({ name: playerNames.get(localPlayerId) ?? "You", h: hm, coins, local: true });
  for (const [pid, e] of remotePlayers) {
    rows.push({ name: playerNames.get(pid) ?? "?", h: Math.max(0, Math.round(-e.current.position.y / 32)), coins: e.current.coins, local: false });
  }
  rows.sort((a, b) => b.h - a.h);
  const myRank = rows.findIndex((r) => r.local);
  hudRankTxt.text = myRank >= 0 ? `#${myRank + 1} / ${rows.length}` : "";
  hudPingTxt.text = pingMs > 0 ? `${pingMs}ms` : "";
  hudPingTxt.x    = 6 + 82 - hudPingTxt.width - 6;
  hudPingTxt.y    = 52;
  hudRankTxt.y    = 52;

  // Center phase banner
  const phText = matchPhase === "countdown" ? "GET READY!" : matchPhase === "waiting" ? "WAITING…" : matchPhase === "finished" ? "FINISHED!" : "";
  hudPhaseTxt.text = phText;
  if (phText) {
    hudPhaseTxt.x = Math.round(pixi.screen.width / 2 - hudPhaseTxt.width / 2);
    hudPhaseTxt.y = 10;
  }

  // HTML scoreboard
  scoreboard.replaceChildren();
  for (const [i, r] of rows.entries()) {
    const row = document.createElement("div");
    row.className = `score-row${r.local ? " local" : ""}`;

    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = String(i + 1);

    const name = document.createElement("span");
    name.className = "name";
    const strongName = document.createElement("b");
    strongName.textContent = r.name;
    name.append(strongName);

    const stat = document.createElement("span");
    stat.className = "stat";
    stat.textContent = `◆${r.coins}`;

    const height = document.createElement("strong");
    height.textContent = `${r.h}m`;

    row.append(rank, name, stat, height);
    scoreboard.append(row);
  }
}

// ── Notifications ─────────────────────────────────────────────────────────────

interface Notif { _cont: Container; life: number; max: number; vy: number }
const notifs: Notif[] = [];

function pushNotification(msg: string, color: number = PAL.uiParchment): void {
  if (notifs.length > 4) return; // cap
  const txt = new Text({
    text: msg,
    style: { fill: color, fontSize: 10, fontFamily: "monospace", fontWeight: "900" }
  });
  const bg = new Graphics();
  const pw = txt.width + 20, ph = 20;
  drawHudPanel(bg, 0, 0, pw, ph);
  txt.x = 10; txt.y = 5;
  const nc = new Container();
  nc.addChild(bg, txt);
  const sw = pixi.screen.width;
  nc.x = Math.round(sw / 2 - pw / 2);
  nc.y = Math.round(pixi.screen.height * 0.30) - notifs.length * 26;
  hudLayer.addChild(nc);
  notifs.push({ _cont: nc, life: 2.5, max: 2.5, vy: -16 });
}

function updateNotifications(dt: number): void {
  for (let i = notifs.length - 1; i >= 0; i--) {
    const n = notifs[i] as Notif;
    n.life -= dt;
    if (n.life <= 0) {
      if (n._cont) { hudLayer.removeChild(n._cont); n._cont.destroy(); }
      notifs.splice(i, 1);
      continue;
    }
    if (n._cont) {
      n._cont.y += n.vy * dt;
      n.vy *= 0.90;
      n._cont.alpha = n.life < 0.7 ? n.life / 0.7 : Math.min(1, (n.max - n.life) / 0.3);
    }
  }
}

// ── Debug overlay ─────────────────────────────────────────────────────────────

const dbgGfx = new Graphics();
hudLayer.addChild(dbgGfx);

function updateDebug(): void {
  dbgGfx.clear();
  if (!showDebug) return;

  drawHudPanel(dbgGfx, 4, 58, 200, 118);

  const fps = Math.round(pixi.ticker.FPS);
  dbgGfx.rect(8, 64, Math.min(fps * 1.4, 118), 3).fill(fps > 50 ? 0x5dff9c : fps > 30 ? PAL.coinGold : PAL.hazardRed);
  dbgGfx.rect(8, 70, Math.min(pingMs, 118), 3).fill(pingMs < 60 ? 0x5dff9c : pingMs < 120 ? PAL.coinGold : PAL.hazardRed);

  if (localPlayer) {
    const { x: vx, y: vy } = localPlayer.velocity;
    dbgGfx.rect(8, 76, Math.round(Math.abs(vx) / 300 * 118), 3).fill(vx >= 0 ? PAL.portalBlue : PAL.hazardRed);
    dbgGfx.rect(8, 82, Math.round(Math.abs(vy) / 420 * 118), 3).fill(vy >= 0 ? PAL.coinGold : PAL.canopyLight);
    dbgGfx.rect(8, 88, 6, 6).fill(localPlayer.grounded ? 0x5dff9c : PAL.hazardMag);
    dbgGfx.rect(8, 96, Math.min(Math.max(0, -Math.floor(Math.floor(localPlayer.position.y / TILE_SIZE) / CHUNK_HEIGHT_TILES)) * 6, 120), 3).fill(PAL.mistPale);

    const sc = getScale();
    const bx = Math.round(worldLayer.x + localPlayer.position.x * sc);
    const by = Math.round(worldLayer.y + localPlayer.position.y * sc);
    dbgGfx.rect(bx, by, PLAYER_WIDTH * sc, PLAYER_HEIGHT * sc).stroke({ color: 0x5dff9c, width: 1 });
  }

  dbgGfx.rect(8, 103, 118, 6).fill({ color: PAL.uiParchment, alpha: 0.14 });
  dbgGfx.rect(8, 103, Math.round(predBuf.length * 0.98), 6).fill(PAL.portalBlue);
  dbgGfx.rect(8, 112, Math.min((serverTick % 60) * 2, 118), 3).fill(PAL.stoneMid);
  dbgGfx.rect(8, 118, Math.min(particles.length * 1.5, 118), 3).fill(PAL.canopyLight);
}

// ── Networking ────────────────────────────────────────────────────────────────

function connectRoom(name: string): void {
  if (ws && ws.readyState === WebSocket.CONNECTING) return;
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.hostname}:8787/ws?room=demo`);

  ws.addEventListener("open", () => {
    reconnDelay = 1000;
    netStatus.textContent = "Connecting…";
    ws!.send(JSON.stringify({ type: "hello", protocol: PROTOCOL_VERSION, version: GAME_VERSION, name: name.trim() || "Explorer", token: sessionToken ?? undefined }));
    lastPingTime = Date.now();
    ws!.send(JSON.stringify({ type: "ping", clientTime: lastPingTime }));
  });

  ws.addEventListener("message", (ev) => {
    if (typeof ev.data !== "string") return;
    let parsed: unknown;
    try { parsed = JSON.parse(ev.data); } catch { return; }
    if (!isServerMessage(parsed)) return;

    switch (parsed.type) {
      case "welcome":
        updateServerClock(parsed.serverTime);
        localPlayerId = parsed.playerId; sessionToken = parsed.sessionToken; matchPhase = parsed.matchPhase;
        if (serverSeed !== parsed.seed) {
          serverSeed = parsed.seed;
          clearWorldChunks();
          for (let cy = 0; cy <= 3; cy++) loadChunk(cy);
        }
        netStatus.textContent = `Room: demo | ${localPlayerId.slice(0, 6)}`;
        { const { x, y } = getSpawnPos(); localPlayer = createPlayerState(localPlayerId, x, y); }
        snapLocalVisualToSimulation();
        resetLocalPrediction(); cameraSnap = true;
        break;
      case "resumed":
        updateServerClock(parsed.serverTime);
        localPlayerId = parsed.playerId; matchPhase = parsed.matchPhase;
        netStatus.textContent = "Reconnected.";
        localPlayer = clonePlayerState(parsed.playerState); snapLocalVisualToSimulation(); resetLocalPrediction(); cameraSnap = true;
        break;
      case "snapshot":
        updateServerClock(parsed.serverTime);
        serverTick = parsed.tick; matchPhase = parsed.matchPhase;
        // Reconcile full collected set so late-joiners see correct coin state
        for (const id of parsed.collectedRelics) collectedRelics.add(id);
        for (const ev2 of parsed.events) {
          if (ev2.type === "COIN_COLLECTED") {
            collectedRelics.add(ev2.coinId);
            coinBurst(ev2.x, ev2.y);
            if (ev2.playerId === localPlayerId) pushNotification("RELIC ◆ +1", PAL.coinGold);
          } else if (ev2.type === "PLAYER_KICK_HIT") {
            if (ev2.playerId === localPlayerId) pushNotification("KICK HIT", PAL.hazardGlow);
            else if (ev2.targetId === localPlayerId) pushNotification("KICKED!", PAL.hazardRed);
          } else if (ev2.type === "CHECKPOINT_REACHED" && ev2.playerId === localPlayerId) {
            pushNotification("CHECKPOINT REACHED", PAL.portalGlow);
          }
        }
        for (const sp of parsed.players) {
          if (sp.id === localPlayerId) reconcileLocalPlayer(sp, parsed.lastProcessedSeq[sp.id] ?? -1);
          else updateRemotePlayer(sp, parsed.serverTime);
        }
        { const ids = new Set(parsed.players.map((p) => p.id));
          for (const pid of remotePlayers.keys()) {
            if (!ids.has(pid)) { const e = remotePlayers.get(pid); if (e) { e.gfx.destroy(); e.label.destroy(); } remotePlayers.delete(pid); }
          }
        }
        break;
      case "chunk": {
        // Always replace locally-generated chunk with authoritative server version
        destroyChunkVisuals(parsed.chunk.chunkY);
        loadedChunks.set(parsed.chunk.chunkY, parsed.chunk);
        renderChunk(parsed.chunk);
        break;
      }
      case "playerJoined":
        if (parsed.player.id !== localPlayerId) {
          playerNames.set(parsed.player.id, parsed.name);
          const existing = remotePlayers.get(parsed.player.id);
          if (existing) {
            // Snapshot arrived before playerJoined — reuse existing entry, update label
            existing.label.text = parsed.name.slice(0, 12);
          } else {
            const ci = playerColorIdx++ % PLAYER_COLORS.length;
            const gfx = new Graphics(); const label = makeLabel(parsed.name);
            remoteLayer.addChild(gfx, label);
            remotePlayers.set(parsed.player.id, { states: [{ state: parsed.player, t: estimatedServerTime() }], current: parsed.player, colorIndex: ci, gfx, label });
          }
          pushNotification(`${parsed.name} joined`, PAL.uiCyan);
        }
        break;
      case "playerLeft":
        { const name2 = playerNames.get(parsed.playerId) ?? "Player"; const e = remotePlayers.get(parsed.playerId); if (e) { e.gfx.destroy(); e.label.destroy(); } remotePlayers.delete(parsed.playerId); playerNames.delete(parsed.playerId); pushNotification(`${name2} left`, PAL.uiGray); }
        break;
      case "pong":
        updateServerClock(parsed.serverTime);
        pingMs = Date.now() - parsed.clientTime;
        break;
      case "matchPhase":
        matchPhase = parsed.phase;
        if (parsed.phase === "countdown") pushNotification("GET READY!", PAL.uiParchment);
        else if (parsed.phase === "playing") pushNotification("GO!", PAL.coinGold);
        else if (parsed.phase === "finished") pushNotification("MATCH OVER", PAL.hazardRed);
        break;
    }
  });

  ws.addEventListener("close", () => { netStatus.textContent = `Disconnected. Retrying in ${reconnDelay / 1000}s…`; schedReconn(name); });
  ws.addEventListener("error", () => { netStatus.textContent = "Server unavailable. Local mode active."; });
}

function schedReconn(name: string): void {
  if (reconnTimeout) return;
  reconnTimeout = setTimeout(() => { reconnTimeout = null; reconnDelay = Math.min(reconnDelay * 2, 30_000); connectRoom(name); }, reconnDelay);
}

function sendInput(inp: PlayerInput): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || !localPlayerId) return;
  ws.send(JSON.stringify({ type: "input", playerId: localPlayerId, input: inp }));
}

function shouldPredictLocalMovement(): boolean {
  return !ws || ws.readyState !== WebSocket.OPEN || matchPhase === "playing";
}

function maybePing(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (Date.now() - lastPingTime > 2000) { lastPingTime = Date.now(); ws.send(JSON.stringify({ type: "ping", clientTime: lastPingTime })); }
}

function updateServerClock(serverTime: number): void {
  const sampleOffset = serverTime - Date.now();
  if (!hasServerClock) {
    serverTimeOffsetMs = sampleOffset;
    hasServerClock = true;
  } else {
    serverTimeOffsetMs += (sampleOffset - serverTimeOffsetMs) * SERVER_CLOCK_SMOOTHING;
  }
}

function estimatedServerTime(): number {
  return Date.now() + serverTimeOffsetMs;
}

function reqChunks(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || !localPlayer) return;
  const ci = Math.max(0, -Math.floor(Math.floor(localPlayer.position.y / TILE_SIZE) / CHUNK_HEIGHT_TILES));
  for (let cy = ci; cy <= ci + 3; cy++) if (!loadedChunks.has(cy)) ws.send(JSON.stringify({ type: "requestChunk", chunkY: cy }));
}

// ── Reconciliation & remote interpolation ────────────────────────────────────

function reconcileLocalPlayer(ss: PlayerState, lastSeq: number): void {
  if (!localPlayer) { localPlayer = clonePlayerState(ss); snapLocalVisualToSimulation(); cameraSnap = true; return; }
  if (lastSeq < 0) {
    if (Math.hypot(ss.position.x - localPlayer.position.x, ss.position.y - localPlayer.position.y) > RECONCILIATION_TOLERANCE_PX * 4)
      { localPlayer = clonePlayerState(ss); snapLocalVisualToSimulation(); cameraSnap = true; }
    resetLocalPrediction();
    return;
  }
  const idx = predBuf.findIndex((e) => e.seq === lastSeq);
  if (idx < 0) { localPlayer = clonePlayerState(ss); snapLocalVisualToSimulation(); resetLocalPrediction(); cameraSnap = true; return; }
  const pred = predBuf[idx]; if (!pred) return;
  const correction = Math.hypot(ss.position.x - pred.state.position.x, ss.position.y - pred.state.position.y);
  if (correction > RECONCILIATION_TOLERANCE_PX) {
    const snapVisual = correction > LOCAL_VISUAL_SNAP_THRESHOLD_PX || ss.invulnerable > 0;
    localPlayer = clonePlayerState(ss);
    for (let i = idx + 1; i < predBuf.length; i++) {
      const e = predBuf[i]; if (!e) continue;
      const { player: next } = stepPlayer(localPlayer, e.input, tileMap, PHYSICS_STEP_SECONDS);
      localPlayer = next;
    }
    if (snapVisual) snapLocalVisualToSimulation();
  }
  predBuf.splice(0, idx + 1);
}

function updateRemotePlayer(s: PlayerState, serverTime: number): void {
  let e = remotePlayers.get(s.id);
  if (!e) {
    const ci = playerColorIdx++ % PLAYER_COLORS.length;
    const gfx = new Graphics(); const label = makeLabel(playerNames.get(s.id) ?? "?");
    remoteLayer.addChild(gfx, label);
    e = { states: [], current: s, colorIndex: ci, gfx, label };
    remotePlayers.set(s.id, e);
  }
  e.states.push({ state: s, t: serverTime });
  if (e.states.length > 20) e.states.shift();
}

function interpRemotes(): void {
  const rt = estimatedServerTime() - INTERP_DELAY_MS;
  for (const e of remotePlayers.values()) {
    const { states } = e;
    if (states.length === 0) continue;
    if (states.length === 1) { e.current = states[0]!.state; continue; }
    const first = states[0]!;
    const last = states[states.length - 1]!;
    if (rt <= first.t) {
      e.current = first.state;
      continue;
    }
    if (rt >= last.t) {
      const extrapolateMs = Math.min(rt - last.t, REMOTE_MAX_EXTRAPOLATION_MS);
      const extrapolateSec = extrapolateMs / 1000;
      e.current = {
        ...last.state,
        position: {
          x: last.state.position.x + last.state.velocity.x * extrapolateSec,
          y: last.state.position.y + last.state.velocity.y * extrapolateSec
        }
      };
      continue;
    }

    let bf = first, af = last;
    for (let i = 0; i < states.length - 1; i++) {
      if (states[i]!.t <= rt && states[i + 1]!.t >= rt) { bf = states[i]!; af = states[i + 1]!; break; }
    }
    const span = af.t - bf.t;
    const t = span > 0 ? Math.min(1, (rt - bf.t) / span) : 1;
    e.current = { ...af.state, position: { x: bf.state.position.x + (af.state.position.x - bf.state.position.x) * t, y: bf.state.position.y + (af.state.position.y - bf.state.position.y) * t } };
  }
}

// Draw a small pixel-art crown above a player position
function drawCrown(g: Graphics, cx: number, cy: number, color: number): void {
  // Base band
  g.rect(cx - 5, cy - 2, 10, 4).fill(PAL.coinGold);
  g.rect(cx - 5, cy - 2, 10, 1).fill(PAL.coinGlow);
  // Three points
  g.rect(cx - 5, cy - 6, 2, 4).fill(PAL.coinGold);
  g.rect(cx - 1, cy - 8, 2, 6).fill(PAL.coinGold);
  g.rect(cx + 3, cy - 6, 2, 4).fill(PAL.coinGold);
  // Gem on top middle point
  g.rect(cx, cy - 8, 1, 2).fill(color);
  // Dark outline
  g.rect(cx - 6, cy - 9, 1, 8).fill({ color: PAL.uiInk, alpha: 0.5 });
  g.rect(cx + 5,  cy - 9, 1, 8).fill({ color: PAL.uiInk, alpha: 0.5 });
}

// ── Draw actors ───────────────────────────────────────────────────────────────

function drawActors(): void {
  interpRemotes();

  // Find leader (highest world height = lowest y position)
  let leaderY = Infinity, leaderId: string | null = null;
  if (localPlayer && localPlayerId) {
    leaderY = localPlayer.position.y;
    leaderId = localPlayerId;
  }
  for (const [pid, e] of remotePlayers) {
    if (e.current.position.y < leaderY) { leaderY = e.current.position.y; leaderId = pid; }
  }

  for (const [pid, e] of remotePlayers) {
    const col = PLAYER_COLORS[e.colorIndex % PLAYER_COLORS.length]!;
    drawPlayerInto(e.gfx, e.current, col, elapsedMs);
    e.label.x = Math.round(e.current.position.x + PLAYER_WIDTH / 2 - e.label.width / 2);
    e.label.y = Math.round(e.current.position.y - 16);
    if (pid === leaderId) drawCrown(e.gfx, Math.round(e.current.position.x + PLAYER_WIDTH / 2), Math.round(e.current.position.y) - 12, col);
  }

  if (localPlayer) {
    const renderPos = getLocalRenderPosition();
    const renderState = renderPos ? { ...localPlayer, position: renderPos } : localPlayer;
    drawPlayerInto(localGfx, renderState, PLAYER_COLORS[0]!, elapsedMs);
    if (localPlayerId === leaderId)
      drawCrown(localGfx, Math.round((renderPos?.x ?? localPlayer.position.x) + PLAYER_WIDTH / 2), Math.round(renderPos?.y ?? localPlayer.position.y) - 12, PLAYER_COLORS[0]!);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

for (let cy = 0; cy <= 3; cy++) loadChunk(cy);
respawnLocal();
joinBtn.addEventListener("click", () => connectRoom(nameInput.value.trim() || "Explorer"));

// ── Ticker ────────────────────────────────────────────────────────────────────

pixi.ticker.add((ticker) => {
  const dtMs = ticker.deltaMS;
  const dt   = Math.min(dtMs / 1000, 1 / 30);
  elapsedMs += dtMs;
  const tSec  = elapsedMs / 1000;
  const scale = getScale();

  ensureChunksAhead();
  reqChunks();
  maybePing();
  updateParticles(dt);
  spawnAmbientParticles(dt);
  updateRelicAnims(tSec);
  updatePortals(tSec);
  updateNotifications(dt);

  // Slow horizontal cloud drift — rebuild when offset exceeds screen width
  cloudDriftFar   += dt * 6;
  cloudDriftMid   += dt * 11;
  cloudDriftFront += dt * 18;
  if (cloudDriftFar > pixi.screen.width + 80) {
    cloudDriftFar = 0; cloudDriftMid = 0; cloudDriftFront = 0;
    buildSkyStatic(pixi.screen.width, pixi.screen.height);
  }

  if (localPlayer && shouldPredictLocalMovement()) {
    const frameInput = captureInput();
    queuedJumpPressed = queuedJumpPressed || frameInput.jumpPressed;
    queuedKickPressed = queuedKickPressed || frameInput.kick;
    predictionAccumulatorSeconds = Math.min(
      predictionAccumulatorSeconds + dt,
      MAX_PREDICTION_ACCUMULATOR_SECONDS
    );

    let predictionSteps = 0;
    while (
      localPlayer &&
      predictionSteps < MAX_PREDICTION_STEPS_PER_FRAME &&
      predictionAccumulatorSeconds + PREDICTION_STEP_EPSILON >= PHYSICS_STEP_SECONDS
    ) {
      predictionAccumulatorSeconds -= PHYSICS_STEP_SECONDS;
      predictionSteps++;

      const inp = createPredictionInput(frameInput);
      const wasGrounded = localPlayer.grounded;
      const wasVelY = localPlayer.velocity.y;
      const wasKickPhase = localPlayer.kickPhase;
      const willJump = inp.jumpPressed && (localPlayer.grounded || localPlayer.coyoteTimer > 0);
      const { player: next } = stepPlayer(localPlayer, inp, tileMap, PHYSICS_STEP_SECONDS);

      if (willJump && wasGrounded) jumpDust(next.position.x + PLAYER_WIDTH / 2, next.position.y + PLAYER_HEIGHT, next.facing);

      const justLanded = !wasGrounded && next.grounded && wasVelY > 55;
      if (justLanded) {
        landDust(next.position.x + PLAYER_WIDTH / 2, next.position.y + PLAYER_HEIGHT, wasVelY);
        triggerShake(wasVelY > 200 ? 3 : 1.5, wasVelY > 200 ? 2.5 : 1.2);
      }

      if (wasKickPhase !== "active" && next.kickPhase === "active") {
        kickSpark(
          next.position.x + (next.facing > 0 ? PLAYER_WIDTH + 4 : -4),
          next.position.y + PLAYER_HEIGHT * 0.7,
          next.facing, PLAYER_COLORS[0]!
        );
      }

      const floorY = (CHUNK_HEIGHT_TILES + 1) * TILE_SIZE;
      if (next.position.y > floorY && next.invulnerable <= 0) {
        burst(next.position.x + PLAYER_WIDTH / 2, next.position.y, PAL.hazardRed);
        respawnLocal();
        break;
      }

      localPlayer = next;
      if (predBuf.length >= 120) predBuf.shift();
      predBuf.push({ seq: inp.sequence, input: inp, state: clonePlayerState(next) });
      sendInput(inp);
    }
  } else {
    jumpEdge = false;
    kickEdge = false;
    queuedJumpPressed = false;
    queuedKickPressed = false;
    predictionAccumulatorSeconds = 0;
  }

  updateLocalVisualPosition(dt);
  updateCamera(dt, scale);
  drawActors();
  updateHud(tSec);
  updateDebug();
});
