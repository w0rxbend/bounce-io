// 2D bone-rigged player body: parts are Graphics parented into a Container
// tree that mirrors a bone hierarchy. Each bone's rotation is driven by a
// spring-damper toward a per-frame "target" pose (idle/run/jump/kick/hit),
// so motion carries real inertia — limbs lag, overshoot, and settle instead
// of snapping straight to their target angle. Colors come from a
// PlayerCosmetics selection (see cosmetics.ts) so each body-part slot
// (head/torso/arms/legs) can be customized independently.
import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { JUMP_SPEED, MAX_FALL_SPEED } from "@skybound/shared";

export type BoneName =
  | "hip"
  | "torso"
  | "chest"
  | "neck"
  | "head"
  | "armUpperL" | "armLowerL"
  | "armUpperR" | "armLowerR"
  | "handL" | "handR"
  | "legUpperL" | "legLowerL"
  | "legUpperR" | "legLowerR"
  | "footL" | "footR";

const ANIMATED_BONES: BoneName[] = [
  "torso", "chest", "neck", "head",
  "armUpperL", "armLowerL", "armUpperR", "armLowerR",
  "legUpperL", "legLowerL", "legUpperR", "legLowerR",
  "handL", "handR", "footL", "footR",
];

export type BodyPoseState = "idle" | "run" | "jump_fall" | "hit";
export type KickPhaseName = "windup" | "active" | "recovery";

interface BoneDef {
  name: BoneName;
  parent: BoneName | null;
  // Pivot position in the parent bone's local space (where this bone attaches).
  x: number;
  y: number;
  // Segment drawn from the pivot toward (segX, segY); width is the segment thickness.
  segX: number;
  segY: number;
  width: number;
  color: keyof BodyRigPalette;
}

// One color per customizable body-part slot (see cosmetics.ts), plus
// automatically-derived shades for two-tone segments (sleeve/boot shadow).
export interface BodyRigPalette {
  skin: number;
  hair: number;
  torso: number;
  torsoShade: number;
  arms: number;
  limb: number;
  limbShade: number;
  boot: number;
}

export interface BodyRigPartTexture {
  texture: Texture;
  width: number;
  height: number;
  pivot: readonly [number, number];
}

type BodyRigTextureInput = Texture | BodyRigPartTexture;

export interface BodyRigTextures {
  head?: BodyRigTextureInput;
  torso?: BodyRigTextureInput;
  chest?: BodyRigTextureInput;
  neck?: BodyRigTextureInput;
  arm?: BodyRigTextureInput;
  hand?: BodyRigTextureInput;
  leg?: BodyRigTextureInput;
  foot?: BodyRigTextureInput;
}

export const DEFAULT_BODY_RIG_PALETTE: BodyRigPalette = {
  skin: 0xffd090,
  hair: 0x281a10,
  torso: 0xb83020,
  torsoShade: 0x701818,
  arms: 0xffd090,
  limb: 0x36475f,
  limbShade: 0x26354a,
  boot: 0x1c1f2a,
};

// Order matters: bones are added to their parent Container in this order,
// and Pixi paints children in addChild order (later = on top). Legs are
// defined before torso so the torso (and everything nested under it,
// including the arms) paints over the legs — hands should never be
// hidden behind a leg mid-stride or mid-kick.
const BODY_BONE_DEFS: BoneDef[] = [
  { name: "hip",       parent: null,       x: 0,  y: -16, segX: 0, segY: 0,  width: 0, color: "torso" },
  { name: "legUpperL", parent: "hip",      x: -3, y: 0,   segX: 0, segY: 8,   width: 4, color: "limb" },
  { name: "legLowerL", parent: "legUpperL",x: 0,  y: 8,   segX: 0, segY: 8,   width: 4, color: "boot" },
  { name: "footL",     parent: "legLowerL",x: 0,  y: 8,   segX: 5, segY: 0,   width: 3, color: "boot" },
  { name: "legUpperR", parent: "hip",      x: 3,  y: 0,   segX: 0, segY: 8,   width: 4, color: "limb" },
  { name: "legLowerR", parent: "legUpperR",x: 0,  y: 8,   segX: 0, segY: 8,   width: 4, color: "boot" },
  { name: "footR",     parent: "legLowerR",x: 0,  y: 8,   segX: 5, segY: 0,   width: 3, color: "boot" },
  { name: "torso",     parent: "hip",      x: 0,  y: 0,   segX: 0, segY: -4,  width: 7, color: "torso" },
  { name: "chest",     parent: "torso",    x: 0,  y: -4,  segX: 0, segY: -5,  width: 8, color: "torsoShade" },
  { name: "neck",      parent: "chest",    x: 0,  y: -5,  segX: 0, segY: -2,  width: 3, color: "skin" },
  { name: "head",      parent: "neck",     x: 0,  y: -2,  segX: 0, segY: -8,  width: 7, color: "skin" },
  { name: "armUpperL", parent: "chest",    x: -4, y: -5,  segX: 0, segY: 8,   width: 3, color: "arms" },
  { name: "armLowerL", parent: "armUpperL",x: 0,  y: 8,   segX: 0, segY: 8,   width: 3, color: "arms" },
  { name: "handL",     parent: "armLowerL",x: 0,  y: 8,   segX: 0, segY: 3,   width: 3, color: "arms" },
  { name: "armUpperR", parent: "chest",    x: 4,  y: -5,  segX: 0, segY: 8,   width: 3, color: "arms" },
  { name: "armLowerR", parent: "armUpperR",x: 0,  y: 8,   segX: 0, segY: 8,   width: 3, color: "arms" },
  { name: "handR",     parent: "armLowerR",x: 0,  y: 8,   segX: 0, segY: 3,   width: 3, color: "arms" },
];

export interface FootContactState {
  planted: boolean;
  wasStance: boolean;
  anchorX: number;
  anchorY: number;
  weight: number;
  plannedX: number;
  plannedY: number;
  hasPlan: boolean;
}

export interface BodyRig {
  root: Container;
  bones: Record<BoneName, Container>;
  visuals: Partial<Record<BoneName, Container>>;
  // Spring-damper state, persisted frame to frame (see springTo()).
  angularVelocity: Record<BoneName, number>;
  hipY: number;
  hipVelocityY: number;
  supportHipOffsetY: number;
  // Weight-transfer lunge (forward/back translation of the hip along the
  // strike axis) and a whole-body squash/stretch pulse, both spring-driven
  // like every other bone so a strike's impact carries the same organic
  // overshoot/settle as the limbs — see poseBodyRig's kick handling.
  hipX: number;
  hipVelocityX: number;
  squashX: number;
  squashY: number;
  squashVelX: number;
  squashVelY: number;
  lastElapsedMs: number | null;
  lastState: BodyPoseState | "kick" | null;
  locomotionPhase: number;
  locomotionWeight: number;
  maxAirborneFallSpeed: number;
  landingCompression: number;
  lastHorizontalVelocity: number;
  footContacts: Record<"left" | "right", FootContactState>;
  animationSeed: number;
  jumpOrdinal: number;
  previousVerticalVelocity: number;
  lastFacing: -1 | 1;
  // Deterministically advanced whenever a jump begins.
  jumpSeed: number;
}

/** Stable player-identity hash used to synchronize procedural motion. */
export function stableAnimationSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mixMotionSeed(base: number, ordinal: number): number {
  let value = (base ^ Math.imul(ordinal, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function createBoneVisual(def: BoneDef, palette: BodyRigPalette, textures: BodyRigTextures): Container | undefined {
  const texture = def.name === "head" ? textures.head
    : def.name === "torso" ? textures.torso
    : def.name === "chest" ? textures.chest
    : def.name === "neck" ? textures.neck
    : def.name.startsWith("arm") ? textures.arm
    : def.name.startsWith("hand") ? textures.hand
    : def.name.startsWith("leg") ? textures.leg
    : def.name.startsWith("foot") ? textures.foot
    : undefined;
  const descriptor = texture && !(texture instanceof Texture) ? texture : undefined;
  const pixiTexture = descriptor?.texture ?? (texture instanceof Texture ? texture : undefined);
  if (pixiTexture && pixiTexture !== Texture.EMPTY) {
    const sprite = new Sprite(pixiTexture);
    sprite.texture.source.scaleMode = "nearest";
    if (descriptor) {
      sprite.anchor.set(descriptor.pivot[0] / descriptor.width, descriptor.pivot[1] / descriptor.height);
    } else if (def.segX !== 0) {
      sprite.anchor.set(def.segX < 0 ? 1 : 0, 0.5);
    } else {
      sprite.anchor.set(0.5, def.segY < 0 ? 1 : 0);
    }
    if (def.segX !== 0) sprite.width = Math.abs(def.segX);
    else if (def.name === "head") sprite.height = Math.abs(def.segY) * 2.75;
    else if (def.segY !== 0) sprite.height = Math.abs(def.segY);
    return sprite;
  }
  if (def.name === "head") return new Graphics().ellipse(0, def.segY / 2, def.width / 2 + 5.5, Math.abs(def.segY) * 1.35).fill(palette[def.color]);
  if (def.width > 0) {
    const half = def.width / 2;
    if (def.segX !== 0) return new Graphics().rect(Math.min(0, def.segX), -half, Math.abs(def.segX), def.width).fill(palette[def.color]);
    return new Graphics().rect(-half, Math.min(0, def.segY), def.width, Math.abs(def.segY)).fill(palette[def.color]);
  }
  return undefined;
}

export function createBodyRig(palette: BodyRigPalette = DEFAULT_BODY_RIG_PALETTE, textures: BodyRigTextures = {}): BodyRig {
  const bones: Partial<Record<BoneName, Container>> = {};
  const visuals: Partial<Record<BoneName, Container>> = {};
  const root = new Container();

  for (const def of BODY_BONE_DEFS) {
    const bone = new Container();
    bone.x = def.x;
    bone.y = def.y;
    bone.eventMode = "none";
    const visual = createBoneVisual(def, palette, textures);
    if (visual) { visuals[def.name] = visual; bone.addChild(visual); }
    bones[def.name] = bone;
    const parent = def.parent ? bones[def.parent] : root;
    (parent ?? root).addChild(bone);
  }

  const angularVelocity = {} as Record<BoneName, number>;
  for (const name of ANIMATED_BONES) angularVelocity[name] = 0;

  return {
    root,
    bones: bones as Record<BoneName, Container>,
    visuals,
    angularVelocity,
    hipY: -16,
    hipVelocityY: 0,
    supportHipOffsetY: 0,
    hipX: 0,
    hipVelocityX: 0,
    squashX: 1,
    squashY: 1,
    squashVelX: 0,
    squashVelY: 0,
    lastElapsedMs: null,
    lastState: null,
    locomotionPhase: 0,
    locomotionWeight: 0,
    maxAirborneFallSpeed: 0,
    landingCompression: 0,
    lastHorizontalVelocity: 0,
    footContacts: {
      left: { planted: false, wasStance: false, anchorX: 0, anchorY: 0, weight: 0, plannedX: 0, plannedY: 0, hasPlan: false },
      right: { planted: false, wasStance: false, anchorX: 0, anchorY: 0, weight: 0, plannedX: 0, plannedY: 0, hasPlan: false },
    },
    animationSeed: stableAnimationSeed("preview"),
    jumpOrdinal: 0,
    previousVerticalVelocity: 0,
    lastFacing: 1,
    jumpSeed: mixMotionSeed(stableAnimationSeed("preview"), 0),
  };
}

export function updateBodyRigAppearance(rig: BodyRig, palette: BodyRigPalette, textures: BodyRigTextures = {}): void {
  for (const def of BODY_BONE_DEFS) {
    const previous = rig.visuals[def.name];
    if (previous) {
      rig.bones[def.name].removeChild(previous);
      previous.destroy({ children: true });
    }
    const visual = createBoneVisual(def, palette, textures);
    if (visual) {
      rig.visuals[def.name] = visual;
      // Keep the visual behind child joints so hands/feet remain layered by
      // the hierarchy rather than accidentally hiding their parent segment.
      rig.bones[def.name].addChildAt(visual, 0);
    } else {
      delete rig.visuals[def.name];
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface TwoBoneSolution {
  upper: number;
  lower: number;
  reachedX: number;
  reachedY: number;
}

export interface GroundContactContext {
  rootWorldX: number;
  rootWorldY: number;
  grounded: boolean;
  /** Returns the nearest walkable surface Y near the supplied reference. */
  sampleGroundY(worldX: number, referenceY: number): number | null;
}

interface TerrainLegSolutions {
  left?: TwoBoneSolution;
  right?: TwoBoneSolution;
  footLeft: number;
  footRight: number;
}

/** Analytic two-link IK in the rig's angle convention (zero points down). */
export function solveTwoBoneIK(targetX: number, targetY: number, upperLength: number, lowerLength: number, bendDirection: -1 | 1 = 1): TwoBoneSolution {
  const minReach = Math.abs(upperLength - lowerLength) + 0.001;
  const maxReach = upperLength + lowerLength - 0.001;
  const rawDistance = Math.hypot(targetX, targetY);
  const distance = clamp(rawDistance, minReach, maxReach);
  const scale = rawDistance > 0.0001 ? distance / rawDistance : 0;
  const x = rawDistance > 0.0001 ? targetX * scale : 0;
  const y = rawDistance > 0.0001 ? targetY * scale : distance;
  const cosLower = clamp((distance * distance - upperLength * upperLength - lowerLength * lowerLength) / (2 * upperLength * lowerLength), -1, 1);
  const lower = Math.acos(cosLower) * bendDirection;
  const standardUpper = Math.atan2(y, x) - Math.atan2(lowerLength * Math.sin(lower), upperLength + lowerLength * Math.cos(lower));
  const upper = standardUpper - Math.PI / 2;
  return {
    upper,
    lower,
    reachedX: -Math.sin(upper) * upperLength - Math.sin(upper + lower) * lowerLength,
    reachedY: Math.cos(upper) * upperLength + Math.cos(upper + lower) * lowerLength,
  };
}

function gaitLegIK(phase: number, speedFactor: number): TwoBoneSolution {
  const cycle = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const intensity = Math.max(0.42, speedFactor);
  if (cycle < Math.PI) {
    // Stance: keep the sole at ground height while the pelvis travels over
    // it. Distance-driven phase makes this foot nearly stationary in world
    // space instead of skating backward through the floor.
    const t = cycle / Math.PI;
    return solveTwoBoneIK(lerp(5.2, -5.2, t) * intensity, 15.4, 8, 8, 1);
  }
  // Swing: toe clears the ground in an asymmetric arc, rising quickly and
  // reaching forward more gently for readable anticipation before contact.
  const t = (cycle - Math.PI) / Math.PI;
  const eased = t * t * (3 - 2 * t);
  return solveTwoBoneIK(lerp(-5.2, 5.2, eased) * intensity, 15.4 - Math.sin(t * Math.PI) * 5.4 * intensity, 8, 8, 1);
}

function wrapPhase(value: number): number {
  return ((value % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

function updateTerrainLegs(
  rig: BodyRig,
  state: BodyPoseState,
  speedFactor: number,
  facing: -1 | 1,
  context: GroundContactContext | undefined,
  targets: Targets,
  dt: number,
  kick: PoseParams["kick"],
  locomotionWeight: number,
  horizontalVelocity: number,
): TerrainLegSolutions {
  const result: TerrainLegSolutions = { footLeft: 0, footRight: 0 };
  const enabled = !!context && context.grounded && !kick && (state === "run" || state === "idle");
  if (!enabled || !context) {
    for (const contact of Object.values(rig.footContacts)) {
      contact.planted = false;
      contact.wasStance = false;
      contact.hasPlan = false;
      contact.weight *= Math.exp(-dt * 24);
    }
    rig.supportHipOffsetY *= Math.exp(-dt * 10);
    const airborneToe = state === "jump_fall" ? clamp(-0.18 - verticalVelocityToToe(rig), -0.45, 0.25) : 0;
    result.footLeft = airborneToe;
    result.footRight = airborneToe;
    return result;
  }

  const moving = locomotionWeight > 0.035;
  const intensity = clamp(Math.max(speedFactor, locomotionWeight * 0.22), 0.15, 1);
  const specs = [
    { side: "left" as const, phase: moving ? rig.locomotionPhase : 0, socketX: -3 },
    { side: "right" as const, phase: moving ? rig.locomotionPhase + Math.PI : 0, socketX: 3 },
  ];

  if (facing !== rig.lastFacing) {
    for (const contact of Object.values(rig.footContacts)) {
      contact.planted = false;
      contact.wasStance = false;
      contact.hasPlan = false;
      contact.weight = 0;
    }
  }
  rig.lastFacing = facing;

  // First acquire/release contacts. Anchors are immutable during stance;
  // this is the key property that prevents the classic procedural foot skate.
  for (const spec of specs) {
    const cycle = wrapPhase(spec.phase);
    const stance = !moving || cycle < Math.PI;
    const contact = rig.footContacts[spec.side];
    if (stance && contact.planted) {
      const sampledY = context.sampleGroundY(contact.anchorX, contact.anchorY);
      const sx = Math.max(0.2, rig.squashX);
      const sy = Math.max(0.2, rig.squashY);
      const targetX = (contact.anchorX - context.rootWorldX) * facing / sx - rig.hipX - spec.socketX;
      const targetY = (contact.anchorY - context.rootWorldY) / sy - rig.hipY;
      const surfaceDelta = sampledY === null ? Infinity : Math.abs(sampledY - contact.anchorY);
      if (sampledY === null || surfaceDelta > 3 || Math.hypot(targetX, targetY) > 16.35) {
        contact.planted = false;
      } else if (surfaceDelta <= 1.5) {
        contact.anchorY = sampledY;
      }
    }
    if (stance && !contact.wasStance) {
      const nominalX = moving ? 5.2 * intensity : 0;
      const worldX = contact.hasPlan
        ? contact.plannedX
        : context.rootWorldX + (rig.hipX + spec.socketX + nominalX) * facing * rig.squashX;
      const groundY = context.sampleGroundY(worldX, contact.hasPlan ? contact.plannedY : context.rootWorldY);
      if (groundY !== null) {
        contact.anchorX = worldX;
        contact.anchorY = groundY;
        contact.planted = true;
      }
      contact.hasPlan = false;
    } else if (!stance) {
      contact.planted = false;
    }
    contact.wasStance = stance;
    const targetWeight = stance && contact.planted ? 1 : 0;
    contact.weight += (targetWeight - contact.weight) * (1 - Math.exp(-dt * (targetWeight ? 30 : 24)));
  }

  // Solve feasible support heights from the feet's actual horizontal reach.
  // Squared weights keep a newly acquired toe from moving the pelvis as much
  // as the established stance foot, and smoothing avoids threshold pops.
  const supports = specs.filter((spec) => rig.footContacts[spec.side].weight > 0.05 && rig.footContacts[spec.side].planted);
  if (supports.length > 0) {
    let weightedOffset = 0;
    let totalWeight = 0;
    for (const spec of supports) {
      const contact = rig.footContacts[spec.side];
      const footLocalX = (contact.anchorX - context.rootWorldX) * facing / Math.max(0.2, rig.squashX);
      const dx = clamp(footLocalX - targets.hipX - spec.socketX, -7.25, 7.25);
      const verticalReach = Math.sqrt(Math.max(13 * 13, 15.4 * 15.4 - dx * dx));
      const candidateHipY = (contact.anchorY - context.rootWorldY) / Math.max(0.2, rig.squashY) - verticalReach;
      const weight = contact.weight * contact.weight;
      weightedOffset += clamp(candidateHipY - targets.hipY, -2.5, 2.5) * weight;
      totalWeight += weight;
    }
    const desiredOffset = totalWeight > 0 ? weightedOffset / totalWeight : 0;
    rig.supportHipOffsetY += (desiredOffset - rig.supportHipOffsetY) * (1 - Math.exp(-dt * 18));
  } else {
    rig.supportHipOffsetY *= Math.exp(-dt * 10);
  }
  targets.hipY += rig.supportHipOffsetY;

  for (const spec of specs) {
    const cycle = wrapPhase(spec.phase);
    const contact = rig.footContacts[spec.side];
    let fallback = moving ? gaitLegIK(spec.phase, intensity) : solveTwoBoneIK(0, 15.4, 8, 8, 1);
    if (moving && cycle >= Math.PI) {
      const swingT = (cycle - Math.PI) / Math.PI;
      const eased = swingT * swingT * (3 - 2 * swingT);
      const travelX = lerp(-5.2, 5.2, eased) * intensity;
      const touchdownLocalX = 5.2 * intensity;
      const halfCycleSeconds = clamp(13 / Math.max(28, Math.abs(horizontalVelocity)), 0.04, 0.24);
      const remainingSeconds = (1 - swingT) * halfCycleSeconds;
      const touchdownX = context.rootWorldX + horizontalVelocity * remainingSeconds +
        (rig.hipX + spec.socketX + touchdownLocalX) * facing * rig.squashX;
      const touchdownY = context.sampleGroundY(touchdownX, context.rootWorldY);
      if (touchdownY !== null && Math.abs(touchdownY - context.rootWorldY) <= 8) {
        const currentWorldX = context.rootWorldX + (rig.hipX + spec.socketX + fallback.reachedX) * facing * rig.squashX;
        let highestSurfaceY = Math.min(context.rootWorldY, touchdownY);
        for (let sample = 0; sample <= 4; sample++) {
          const progress = sample / 4;
          const surfaceY = context.sampleGroundY(
            lerp(currentWorldX, touchdownX, progress),
            lerp(context.rootWorldY, touchdownY, progress),
          );
          if (surfaceY !== null) highestSurfaceY = Math.min(highestSurfaceY, surfaceY);
        }
        const obstacleRise = Math.max(0, touchdownY - highestSurfaceY);
        const clearance = 5.4 * intensity + clamp(obstacleRise + 1.25, 0, 7.5) * Math.pow(Math.sin(swingT * Math.PI), 0.75);
        const desiredWorldY = lerp(context.rootWorldY, touchdownY, eased) - clearance;
        const desiredLocalY = (desiredWorldY - context.rootWorldY) / Math.max(0.2, rig.squashY) - targets.hipY;
        fallback = solveTwoBoneIK(travelX, desiredLocalY, 8, 8, 1);
        contact.plannedX = touchdownX;
        contact.plannedY = touchdownY;
        contact.hasPlan = true;
      } else {
        contact.hasPlan = false;
      }
    }
    let solution = fallback;
    if (contact.planted && contact.weight > 0.001) {
      const sx = Math.max(0.2, rig.squashX);
      const sy = Math.max(0.2, rig.squashY);
      const targetX = (contact.anchorX - context.rootWorldX) * facing / sx - targets.hipX - spec.socketX;
      const targetY = (contact.anchorY - context.rootWorldY) / sy - targets.hipY;
      const planted = solveTwoBoneIK(targetX, targetY, 8, 8, 1);
      solution = {
        upper: lerp(fallback.upper, planted.upper, contact.weight),
        lower: lerp(fallback.lower, planted.lower, contact.weight),
        reachedX: lerp(fallback.reachedX, planted.reachedX, contact.weight),
        reachedY: lerp(fallback.reachedY, planted.reachedY, contact.weight),
      };
    }
    const sampleOffset = 2.5;
    const centerY = context.sampleGroundY(contact.anchorX, contact.anchorY) ?? contact.anchorY;
    const leftY = context.sampleGroundY(contact.anchorX - sampleOffset, centerY) ?? centerY;
    const rightY = context.sampleGroundY(contact.anchorX + sampleOffset, centerY) ?? centerY;
    const groundAngle = Math.atan2(rightY - leftY, sampleOffset * 2) * facing;
    const footAngle = contact.planted
      ? groundAngle - solution.upper - solution.lower
      : -0.18 * Math.sin(Math.max(0, cycle - Math.PI));
    if (spec.side === "left") {
      result.left = solution;
      result.footLeft = footAngle;
    } else {
      result.right = solution;
      result.footRight = footAngle;
    }
  }
  return result;
}

function verticalVelocityToToe(rig: BodyRig): number {
  return clamp(rig.maxAirborneFallSpeed / Math.max(1, MAX_FALL_SPEED), 0, 1) * -0.12;
}

// Deterministic pseudo-random in [-1, 1] from a seed, stable across a frame
// but different per jump instance (via jumpSeed) and per bone (via salt).
function seededWobble(seed: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

// Critically-ish-damped spring toward `target`, integrated with a clamped
// dt. Lower stiffness/higher inertia reads as "loose" (arms, shins);
// higher stiffness reads as "firm" (torso, head, thighs). This is what
// gives limbs real lag/overshoot instead of snapping to their pose.
function springTo(rig: BodyRig, name: BoneName, target: number, stiffness: number, damping: number, dt: number): void {
  const bone = rig.bones[name];
  const vel = rig.angularVelocity[name] ?? 0;
  const accel = (target - bone.rotation) * stiffness - vel * damping;
  const nextVel = vel + accel * dt;
  bone.rotation += nextVel * dt;
  const limits: Partial<Record<BoneName, readonly [number, number]>> = {
    torso: [-0.38, 0.38], chest: [-0.48, 0.48], neck: [-0.28, 0.28], head: [-0.55, 0.55],
  };
  const limit = limits[name];
  let limitedVelocity = nextVel;
  if (limit) {
    bone.rotation = clamp(bone.rotation, limit[0], limit[1]);
    if ((bone.rotation === limit[0] && limitedVelocity < 0) || (bone.rotation === limit[1] && limitedVelocity > 0)) {
      limitedVelocity = 0;
    }
  }
  rig.angularVelocity[name] = limitedVelocity;
}

// Note: rig.root's own x/y is the world/screen anchor set by the caller
// each frame (see main.ts) — this only springs the hip bone's offset
// within that anchor (the vertical bob/dip/tuck), never touches root.
function springHipY(rig: BodyRig, target: number, stiffness: number, damping: number, dt: number): void {
  const accel = (target - rig.hipY) * stiffness - rig.hipVelocityY * damping;
  rig.hipVelocityY += accel * dt;
  rig.hipY += rig.hipVelocityY * dt;
  rig.bones.hip.y = rig.hipY;
}

// Weight-transfer lunge: the hip's horizontal offset within root space.
// Springing this (instead of snapping) is what sells a strike's forward
// drive and its recoil back to guard as real momentum, not a pose swap.
function springHipX(rig: BodyRig, target: number, stiffness: number, damping: number, dt: number): void {
  const accel = (target - rig.hipX) * stiffness - rig.hipVelocityX * damping;
  rig.hipVelocityX += accel * dt;
  rig.hipX += rig.hipVelocityX * dt;
  rig.bones.hip.x = rig.hipX;
}

// Whole-body squash/stretch pulse applied to root.scale, springing toward
// (1,1) at rest and toward an elongated/compressed target at the moment of
// a strike's impact — the classic animation-principles trick for selling
// weight and force on a 2D rig without any extra geometry.
function springSquash(rig: BodyRig, targetX: number, targetY: number, stiffness: number, damping: number, dt: number): void {
  const accelX = (targetX - rig.squashX) * stiffness - rig.squashVelX * damping;
  rig.squashVelX += accelX * dt;
  rig.squashX += rig.squashVelX * dt;
  const accelY = (targetY - rig.squashY) * stiffness - rig.squashVelY * damping;
  rig.squashVelY += accelY * dt;
  rig.squashY += rig.squashVelY * dt;
  const facingSign = rig.root.scale.x < 0 ? -1 : 1;
  rig.root.scale.x = facingSign * rig.squashX;
  rig.root.scale.y = rig.squashY;
}

const STIFF_FIRM = { k: 260, d: 24 };   // torso, head — stays readable
const STIFF_LEG = { k: 150, d: 17 };    // thighs — needs to read as running
const STIFF_SHIN = { k: 90, d: 11 };    // knees — some lag behind the thigh
const STIFF_ARM = { k: 55, d: 7.5 };    // upper arms — loose, swings with inertia
const STIFF_FOREARM = { k: 38, d: 6 };  // forearms — loosest, trails the upper arm
const STIFF_HIP_Y = { k: 210, d: 20 };
// Strike-specific springs: stiffer/snappier than the idle/run rig so a
// kick's weight-shift and impact pulse read as fast and forceful instead
// of floaty, while still carrying real overshoot from the spring math.
const STIFF_HIP_X = { k: 320, d: 24 };
const STIFF_SQUASH = { k: 420, d: 26 };
// Strike bones themselves spring stiffer than idle/run so the chamber and
// extension snap crisply — a slow kick reads as weak, not powerful.
const STIFF_STRIKE_LIMB = { k: 340, d: 26 };
const STIFF_STRIKE_TORSO = { k: 300, d: 22 };

interface Targets {
  torso: number; head: number;
  armUpperL: number; armLowerL: number; armUpperR: number; armLowerR: number;
  legUpperL: number; legLowerL: number; legUpperR: number; legLowerR: number;
  hipY: number;
  // Weight-transfer lunge and impact squash/stretch — neutral (0 / 1 / 1)
  // outside of strikes, see kickTargets().
  hipX: number;
  squashX: number;
  squashY: number;
}

function idleTargets(elapsedMs: number): Targets {
  const t = elapsedMs / 1000;
  const breathe = Math.sin(t * 2) * 0.03;
  return {
    torso: breathe, head: -breathe * 0.6,
    armUpperL: 0.08 + breathe, armLowerL: 0.18,
    armUpperR: -0.08 - breathe, armLowerR: 0.18,
    legUpperL: 0, legLowerL: 0.05, legUpperR: 0, legLowerR: 0.05,
    hipY: -16 + Math.sin(t * 2) * 0.6,
    hipX: 0, squashX: 1, squashY: 1,
  };
}

function runTargets(phase: number, speedFactor: number): Targets {
  const intensity = Math.max(0.4, speedFactor);
  const legL = gaitLegIK(phase, intensity);
  const legR = gaitLegIK(phase + Math.PI, intensity);

  // Naruto run: arms held together behind the back, trailing opposite the
  // direction of travel — angled down-and-back at roughly hip height
  // (not shoulder height) so it reads as hanging under gravity rather
  // than a rigid horizontal bar. The spring system (loose arm stiffness)
  // adds the inertia/lag on top of this target as the torso lean changes.
  // Both arms use the SAME rotation (not mirrored/offset) since they're
  // held together behind the back — giving them different magnitudes
  // makes the further-swung one overtake the other and read as crossed
  // arms in front of the chest, given how narrow the shoulder span is.
  const trailSway = Math.sin(phase * 2) * 0.06 * intensity;
  const armTrail = 1.15 + trailSway;
  const forearmTrail = -0.6 - trailSway * 0.3;

  return {
    legUpperL: legL.upper, legLowerL: legL.lower,
    legUpperR: legR.upper, legLowerR: legR.lower,
    armUpperL: armTrail, armLowerL: forearmTrail,
    armUpperR: armTrail, armLowerR: forearmTrail,
    torso: 0.32 * intensity, head: -0.06 * intensity,
    hipY: -16 - Math.pow(Math.abs(Math.sin(phase)), 1.6) * 1.6,
    hipX: 0, squashX: 1, squashY: 1,
  };
}

// Three intentional keyframes blended by vertical velocity, instead of
// continuous per-limb noise: LAUNCH (legs tucked, arms swept up for
// momentum, torso leaning back) -> APEX (a brief relaxed hang) -> FALL
// (legs reaching down for a landing, torso leaning forward to look down,
// arms out for balance). The spring-damper integration in poseBodyRig is
// what gives this real secondary motion/inertia as the target moves
// through these keyframes — no manual jiggle needed on top.
const JUMP_LAUNCH: Targets = {
  legUpperL: -0.5, legLowerL: 1.15, legUpperR: 0.35, legLowerR: 0.85,
  armUpperL: -1.85, armLowerL: 0.35, armUpperR: 1.25, armLowerR: -0.45,
  torso: -0.16, head: -0.05, hipY: -17.1, hipX: 0, squashX: 1, squashY: 1,
};
const JUMP_APEX: Targets = {
  legUpperL: -0.12, legLowerL: 0.3, legUpperR: 0.12, legLowerR: 0.22,
  armUpperL: -0.5, armLowerL: 0.28, armUpperR: 0.35, armLowerR: 0.22,
  torso: 0.0, head: 0.0, hipY: -16.3, hipX: 0, squashX: 1, squashY: 1,
};
const JUMP_LAND_ANTICIPATION: Targets = {
  legUpperL: 0.32, legLowerL: -0.12, legUpperR: -0.22, legLowerR: 0.18,
  armUpperL: 0.32, armLowerL: 0.12, armUpperR: -0.5, armLowerR: 0.28,
  torso: 0.2, head: 0.1, hipY: -15.4, hipX: 0, squashX: 1, squashY: 1,
};

// Per-jump variety as a fixed offset chosen once at takeoff (see
// poseBodyRig's jumpSeed reroll), not continuous noise — different jumps
// look a little different from each other, but any single jump animates
// smoothly rather than jittering.
function jumpVariance(jumpSeed: number): Targets {
  const off = (salt: number) => seededWobble(jumpSeed, salt) * 0.14;
  return {
    legUpperL: off(1), legLowerL: off(2), legUpperR: off(3), legLowerR: off(4),
    armUpperL: off(5), armLowerL: off(6), armUpperR: off(7), armLowerR: off(8),
    torso: off(9) * 0.5, head: off(10) * 0.5, hipY: off(11) * 2,
    hipX: 0, squashX: 1, squashY: 1,
  };
}

function addTargets(a: Targets, b: Targets): Targets {
  return {
    torso: a.torso + b.torso, head: a.head + b.head,
    armUpperL: a.armUpperL + b.armUpperL, armLowerL: a.armLowerL + b.armLowerL,
    armUpperR: a.armUpperR + b.armUpperR, armLowerR: a.armLowerR + b.armLowerR,
    legUpperL: a.legUpperL + b.legUpperL, legLowerL: a.legLowerL + b.legLowerL,
    legUpperR: a.legUpperR + b.legUpperR, legLowerR: a.legLowerR + b.legLowerR,
    hipY: a.hipY + b.hipY, hipX: a.hipX + b.hipX,
    squashX: a.squashX + (b.squashX - 1), squashY: a.squashY + (b.squashY - 1),
  };
}

function jumpFallTargets(verticalVelocity: number, jumpSeed: number): Targets {
  const vr = clamp(verticalVelocity >= 0 ? verticalVelocity / MAX_FALL_SPEED : -verticalVelocity / JUMP_SPEED, -1, 1);
  const rising = clamp(-vr, 0, 1);
  const falling = clamp(vr, 0, 1);
  let target = blendTargets(JUMP_APEX, JUMP_LAND_ANTICIPATION, falling);
  target = blendTargets(target, JUMP_LAUNCH, rising);
  return addTargets(target, jumpVariance(jumpSeed));
}

function hitTargets(): Targets {
  return {
    torso: 0.3, head: 0.2,
    armUpperL: -0.5, armLowerL: 0.2, armUpperR: -0.7, armLowerR: 0.2,
    legUpperL: 0, legLowerL: 0.05, legUpperR: 0, legLowerR: 0.05,
    hipY: -16, hipX: 0, squashX: 1, squashY: 1,
  };
}

// Karate combo keyframes, blended through a full animation-principles
// sequence rather than a single guard->chamber->strike lerp: GUARD ->
// ANTICIPATE (weight rocks back, body coils - telegraphs the strike) ->
// CHAMBER (knee driven high and tight, rear arm cocked, an instant before
// release) -> STRIKE (full extension: kicking leg drives forward, rear
// arm throws a simultaneous cross punch, hip lunges into the target) ->
// OVERSHOOT (a brief snap past full extension right at the impact frame -
// the classic "pop" that sells force) -> back through STRIKE and into
// GUARD as the limbs retract. Every keyframe also carries a hipX
// (forward/back weight-transfer lunge) and a squashX/squashY body-wide
// scale pulse, both spring-driven in poseBodyRig so the strike's power
// and recoil read as momentum, not a pose swap.
//
// Rotation convention (confirmed empirically): a bone's tip moves toward
// -x for POSITIVE rotation and toward +x (forward, matching facing) for
// NEGATIVE rotation. Kicking leg/lead arm are always "R" in local
// (unflipped) space; the rig's root already mirrors for facing, and
// facing itself only changes on active left/right input, so a kick
// thrown while stationary keeps facing (and this pose) oriented in the
// last direction moved.
const KICK_GUARD: Targets = {
  legUpperL: -0.04, legLowerL: -0.1, legUpperR: 0.06, legLowerR: -0.12,
  armUpperL: -0.4, armLowerL: 0.55, armUpperR: -0.55, armLowerR: 1.45,
  torso: -0.05, head: -0.02, hipY: -16, hipX: 0, squashX: 1, squashY: 1,
};
const KICK_ANTICIPATE: Targets = {
  legUpperL: -0.4, legLowerL: 0.3, legUpperR: 0.55, legLowerR: -0.3,
  armUpperL: -0.15, armLowerL: 0.85, armUpperR: -0.3, armLowerR: 1.1,
  torso: -0.3, head: -0.14, hipY: -15.4, hipX: -1.4, squashX: 0.9, squashY: 1.1,
};
const KICK_CHAMBER: Targets = {
  legUpperL: -0.14, legLowerL: -0.05, legUpperR: 1.75, legLowerR: -1.95,
  armUpperL: -0.1, armLowerL: 0.3, armUpperR: -0.7, armLowerR: 1.8,
  torso: 0.28, head: 0.1, hipY: -16.7, hipX: -0.5, squashX: 1.06, squashY: 0.94,
};
const KICK_STRIKE: Targets = {
  legUpperL: -0.16, legLowerL: 0.22, legUpperR: -1.65, legLowerR: 0.5,
  armUpperL: -1.55, armLowerL: 0.15, armUpperR: -2.65, armLowerR: 1.55,
  torso: -0.4, head: -0.14, hipY: -17.0, hipX: 1.5, squashX: 1.14, squashY: 0.88,
};
const KICK_OVERSHOOT: Targets = {
  legUpperL: -0.18, legLowerL: 0.26, legUpperR: -1.85, legLowerR: 0.65,
  armUpperL: -1.7, armLowerL: 0.05, armUpperR: -2.9, armLowerR: 1.7,
  torso: -0.48, head: -0.18, hipY: -17.1, hipX: 1.75, squashX: 1.22, squashY: 0.82,
};

function blendTargets(a: Targets, b: Targets, t: number): Targets {
  const e = clamp(t, 0, 1);
  return {
    torso: lerp(a.torso, b.torso, e), head: lerp(a.head, b.head, e),
    armUpperL: lerp(a.armUpperL, b.armUpperL, e), armLowerL: lerp(a.armLowerL, b.armLowerL, e),
    armUpperR: lerp(a.armUpperR, b.armUpperR, e), armLowerR: lerp(a.armLowerR, b.armLowerR, e),
    legUpperL: lerp(a.legUpperL, b.legUpperL, e), legLowerL: lerp(a.legLowerL, b.legLowerL, e),
    legUpperR: lerp(a.legUpperR, b.legUpperR, e), legLowerR: lerp(a.legLowerR, b.legLowerR, e),
    hipY: lerp(a.hipY, b.hipY, e), hipX: lerp(a.hipX, b.hipX, e),
    squashX: lerp(a.squashX, b.squashX, e), squashY: lerp(a.squashY, b.squashY, e),
  };
}

function easeOutCubic(t: number): number {
  const e = clamp(t, 0, 1);
  return 1 - Math.pow(1 - e, 3);
}

function easeInQuad(t: number): number {
  const e = clamp(t, 0, 1);
  return e * e;
}

// Sub-blends within each server-driven phase so a single 3-phase attack
// (windup/active/recovery) reads as a full six-beat combo:
//   windup:   GUARD -> ANTICIPATE (coil)      -> CHAMBER (load)
//   active:   CHAMBER -> STRIKE (snap out)     -> OVERSHOOT (impact pop)
//   recovery: OVERSHOOT -> STRIKE (recoil)     -> GUARD (retract)
// Each half uses its own easing: fast/eased-out for the strike's release,
// fast/eased-in for the retract, so the limb *arrives* with speed instead
// of drifting in linearly like a single lerp would.
function kickTargets(phase: KickPhaseName, progress: number): Targets {
  if (phase === "windup") {
    if (progress < 0.55) return blendTargets(KICK_GUARD, KICK_ANTICIPATE, progress / 0.55);
    return blendTargets(KICK_ANTICIPATE, KICK_CHAMBER, easeOutCubic((progress - 0.55) / 0.45));
  }
  if (phase === "active") {
    if (progress < 0.7) return blendTargets(KICK_CHAMBER, KICK_STRIKE, easeOutCubic(progress / 0.7));
    return blendTargets(KICK_STRIKE, KICK_OVERSHOOT, (progress - 0.7) / 0.3);
  }
  if (progress < 0.3) return blendTargets(KICK_OVERSHOOT, KICK_STRIKE, progress / 0.3);
  return blendTargets(KICK_STRIKE, KICK_GUARD, easeInQuad((progress - 0.3) / 0.7));
}

export interface PoseParams {
  state: BodyPoseState;
  elapsedMs: number;
  speedFactor: number;
  verticalVelocity: number;
  horizontalVelocity?: number;
  facing?: -1 | 1;
  groundContact?: GroundContactContext;
  animationSeed?: number;
  reducedMotion?: boolean;
  kick?: { phase: KickPhaseName; progress: number };
}

/**
 * Poses the rig by springing every bone toward a per-state target angle
 * each frame — the spring-damper integration (springTo) is what gives the
 * motion real inertia (arms lag behind torso direction changes, overshoot
 * and settle) instead of snapping straight to the target.
 */
export function poseBodyRig(rig: BodyRig, params: PoseParams): void {
  const { state, elapsedMs, speedFactor, verticalVelocity, horizontalVelocity = 0, facing = 1, groundContact, animationSeed, reducedMotion = false, kick } = params;

  const dt = rig.lastElapsedMs === null ? 1 / 60 : clamp((elapsedMs - rig.lastElapsedMs) / 1000, 0, 1 / 20);
  rig.lastElapsedMs = elapsedMs;

  // `kick` is an additive action overlay. Airborne/landing memory follows the
  // base locomotion state so attacking in mid-air cannot erase impact speed.
  const effectiveState: BodyPoseState | "kick" = state;
  if (animationSeed !== undefined && rig.animationSeed !== (animationSeed >>> 0)) {
    rig.animationSeed = animationSeed >>> 0;
    rig.jumpOrdinal = 0;
    rig.jumpSeed = mixMotionSeed(rig.animationSeed, 0);
  }
  const enteredAir = rig.lastState !== "jump_fall" && state === "jump_fall";
  const restartedUpward = rig.lastState === "jump_fall" &&
    rig.previousVerticalVelocity > -JUMP_SPEED * 0.25 && verticalVelocity < -JUMP_SPEED * 0.65;
  if (enteredAir || restartedUpward) {
    rig.jumpOrdinal += 1;
    rig.jumpSeed = mixMotionSeed(rig.animationSeed, rig.jumpOrdinal);
  }
  rig.previousVerticalVelocity = verticalVelocity;
  if (state === "jump_fall") {
    rig.maxAirborneFallSpeed = Math.max(rig.maxAirborneFallSpeed, Math.max(0, verticalVelocity));
  } else if (rig.lastState === "jump_fall") {
    // Ignore tiny curb/ledge transitions; only meaningful downward momentum
    // should produce a visible compression pulse.
    rig.landingCompression = clamp((rig.maxAirborneFallSpeed - 35) / Math.max(1, MAX_FALL_SPEED - 35), 0, 1);
    rig.maxAirborneFallSpeed = 0;
  }
  rig.lastState = effectiveState;

  const groundedLocomotion = !kick && (state === "idle" || state === "run");
  const startThreshold = 34;
  const stopThreshold = 18;
  const locomotionGoal = groundedLocomotion && Math.abs(horizontalVelocity) >= (rig.locomotionWeight > 0.1 ? stopThreshold : startThreshold) ? 1 : 0;
  const locomotionRate = locomotionGoal > rig.locomotionWeight ? 10 : 6;
  rig.locomotionWeight += (locomotionGoal - rig.locomotionWeight) * (1 - Math.exp(-dt * locomotionRate));

  if (groundedLocomotion && rig.locomotionWeight > 0.02) {
    // Drive the gait from distance travelled instead of wall time. A full
    // cycle spans roughly two 13px steps, keeping foot rhythm coupled to
    // actual motion through acceleration, slowdown, and network smoothing.
    const gaitSpeed = Math.max(Math.abs(horizontalVelocity), 28 * rig.locomotionWeight);
    rig.locomotionPhase = (rig.locomotionPhase + gaitSpeed * dt / 26 * Math.PI * 2) % (Math.PI * 2);
  }

  let targets = kick
    ? kickTargets(kick.phase, kick.progress)
    : groundedLocomotion ? blendTargets(idleTargets(reducedMotion ? 0 : elapsedMs), runTargets(rig.locomotionPhase, Math.max(speedFactor, 0.4)), rig.locomotionWeight * rig.locomotionWeight * (3 - 2 * rig.locomotionWeight))
    : state === "jump_fall" ? jumpFallTargets(verticalVelocity, rig.jumpSeed)
    : hitTargets();

  let localAcceleration = 0;
  if (!kick && state !== "jump_fall") {
    localAcceleration = clamp((horizontalVelocity - rig.lastHorizontalVelocity) / Math.max(dt, 1 / 120) * facing / 900, -1, 1);
    targets = {
      ...targets,
      torso: targets.torso + localAcceleration * 0.16,
      head: targets.head - localAcceleration * 0.05,
      hipX: targets.hipX - localAcceleration * 0.7,
      armUpperL: targets.armUpperL - localAcceleration * 0.08,
      armUpperR: targets.armUpperR - localAcceleration * 0.08,
    };
  }
  rig.lastHorizontalVelocity = horizontalVelocity;

  if (reducedMotion) rig.landingCompression = 0;
  if (!reducedMotion && !kick && state !== "jump_fall" && rig.landingCompression > 0.002) {
    const impact = rig.landingCompression;
    targets = {
      ...targets,
      hipY: targets.hipY + impact * 2.8,
      squashX: targets.squashX + impact * 0.16,
      squashY: targets.squashY - impact * 0.2,
      legUpperL: targets.legUpperL - impact * 0.18,
      legUpperR: targets.legUpperR + impact * 0.18,
      legLowerL: targets.legLowerL + impact * 0.38,
      legLowerR: targets.legLowerR + impact * 0.38,
    };
    rig.landingCompression *= Math.exp(-dt * 9);
  }

  const terrainLegs = updateTerrainLegs(rig, state, speedFactor, facing, groundContact, targets, dt, kick, rig.locomotionWeight, horizontalVelocity);
  if (terrainLegs.left) {
    targets.legUpperL = terrainLegs.left.upper;
    targets.legLowerL = terrainLegs.left.lower;
  }
  if (terrainLegs.right) {
    targets.legUpperR = terrainLegs.right.upper;
    targets.legLowerR = terrainLegs.right.lower;
  }

  // A strike needs snappier limb springs than idle/run/jump — otherwise
  // the fast phase-driven target changes (guard->anticipate->chamber->
  // strike->overshoot in well under half a second) get smeared into a
  // slow drift instead of reading as a fast, forceful motion.
  const limbStiff = kick ? STIFF_STRIKE_LIMB : STIFF_ARM;
  const torsoStiff = kick ? STIFF_STRIKE_TORSO : STIFF_FIRM;
  const aggregateTorso = targets.torso;
  const chestCounterbend = !reducedMotion && !kick && state === "run"
    ? Math.sin(rig.locomotionPhase) * 0.055 * rig.locomotionWeight * clamp(speedFactor, 0, 1)
    : 0;
  const torsoTarget = aggregateTorso * 0.38 - chestCounterbend * 0.25;
  const chestTarget = aggregateTorso * 0.62 + chestCounterbend * 1.25;
  const secondaryNeck = reducedMotion ? 0 : state === "idle"
    ? Math.sin(elapsedMs / 1000 * 2) * 0.008
    : state === "run" ? localAcceleration * 0.035
    : state === "jump_fall" ? clamp(verticalVelocity / MAX_FALL_SPEED, -1, 1) * 0.035
    : 0;
  const neckTarget = clamp(-aggregateTorso * 0.16 + secondaryNeck, -0.22, 0.22);
  const desiredHeadWorldAngle = clamp(targets.head, -0.3, 0.3);

  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const subDt = dt / steps;
  for (let step = 0; step < steps; step++) {
    springTo(rig, "torso", torsoTarget, torsoStiff.k, torsoStiff.d, subDt);
    springTo(rig, "chest", chestTarget, torsoStiff.k * 0.9, torsoStiff.d, subDt);
    springTo(rig, "neck", neckTarget, 115, 14, subDt);
    const headWorldAngle = rig.bones.torso.rotation + rig.bones.chest.rotation + rig.bones.neck.rotation + rig.bones.head.rotation;
    const headWorldVelocity = rig.angularVelocity.torso + rig.angularVelocity.chest + rig.angularVelocity.neck + rig.angularVelocity.head;
    const headAccel = (desiredHeadWorldAngle - headWorldAngle) * torsoStiff.k - headWorldVelocity * torsoStiff.d;
    let headVelocity = rig.angularVelocity.head + headAccel * subDt;
    rig.bones.head.rotation += headVelocity * subDt;
    rig.bones.head.rotation = clamp(rig.bones.head.rotation, -0.55, 0.55);
    if ((rig.bones.head.rotation === -0.55 && headVelocity < 0) || (rig.bones.head.rotation === 0.55 && headVelocity > 0)) headVelocity = 0;
    rig.angularVelocity.head = headVelocity;
    springTo(rig, "legUpperL", targets.legUpperL, kick ? limbStiff.k : STIFF_LEG.k, kick ? limbStiff.d : STIFF_LEG.d, subDt);
    springTo(rig, "legUpperR", targets.legUpperR, kick ? limbStiff.k : STIFF_LEG.k, kick ? limbStiff.d : STIFF_LEG.d, subDt);
    springTo(rig, "legLowerL", targets.legLowerL, kick ? limbStiff.k : STIFF_SHIN.k, kick ? limbStiff.d : STIFF_SHIN.d, subDt);
    springTo(rig, "legLowerR", targets.legLowerR, kick ? limbStiff.k : STIFF_SHIN.k, kick ? limbStiff.d : STIFF_SHIN.d, subDt);
    springTo(rig, "armUpperL", targets.armUpperL, limbStiff.k, limbStiff.d, subDt);
    springTo(rig, "armUpperR", targets.armUpperR, limbStiff.k, limbStiff.d, subDt);
    springTo(rig, "armLowerL", targets.armLowerL, kick ? limbStiff.k : STIFF_FOREARM.k, kick ? limbStiff.d : STIFF_FOREARM.d, subDt);
    springTo(rig, "armLowerR", targets.armLowerR, kick ? limbStiff.k : STIFF_FOREARM.k, kick ? limbStiff.d : STIFF_FOREARM.d, subDt);
    springTo(rig, "footL", terrainLegs.footLeft, 180, 20, subDt);
    springTo(rig, "footR", terrainLegs.footRight, 180, 20, subDt);
    // Wrists counter a little of the forearm motion, keeping silhouettes
    // readable while retaining loose secondary follow-through.
    springTo(rig, "handL", clamp(-targets.armLowerL * 0.16, -0.5, 0.5), 75, 10, subDt);
    springTo(rig, "handR", clamp(-targets.armLowerR * 0.16, -0.5, 0.5), 75, 10, subDt);
    springHipY(rig, targets.hipY, STIFF_HIP_Y.k, STIFF_HIP_Y.d, subDt);
    springHipX(rig, targets.hipX, STIFF_HIP_X.k, STIFF_HIP_X.d, subDt);
    springSquash(rig, targets.squashX, targets.squashY, STIFF_SQUASH.k, STIFF_SQUASH.d, subDt);
  }

  for (const [side, solution, upperName, lowerName] of [
    ["left", terrainLegs.left, "legUpperL", "legLowerL"],
    ["right", terrainLegs.right, "legUpperR", "legLowerR"],
  ] as const) {
    const contact = rig.footContacts[side];
    if (!solution || !contact.planted || contact.weight <= 0) continue;
    const projection = (1 - Math.exp(-dt * 38)) * contact.weight;
    rig.bones[upperName].rotation = lerp(rig.bones[upperName].rotation, solution.upper, projection);
    rig.bones[lowerName].rotation = lerp(rig.bones[lowerName].rotation, solution.lower, projection);
    rig.angularVelocity[upperName] *= Math.exp(-dt * 18 * contact.weight);
    rig.angularVelocity[lowerName] *= Math.exp(-dt * 18 * contact.weight);
  }

  // Anatomical limits are intentionally broad enough for stylized attacks,
  // but prevent unstable springs or hitches from inverting a joint.
  const limits: Partial<Record<BoneName, [number, number]>> = {
    torso: [-0.75, 0.75], head: [-0.55, 0.55],
    armUpperL: [-3.05, 2.2], armUpperR: [-3.05, 2.2],
    armLowerL: [-2.25, 2.25], armLowerR: [-2.25, 2.25],
    legUpperL: [-2.1, 2.1], legUpperR: [-2.1, 2.1],
    legLowerL: [-0.55, 2.25], legLowerR: [-0.55, 2.25],
    footL: [-1.2, 1.2], footR: [-1.2, 1.2],
    handL: [-0.9, 0.9], handR: [-0.9, 0.9],
  };
  for (const [name, range] of Object.entries(limits) as Array<[BoneName, [number, number]]>) {
    const bone = rig.bones[name];
    const bounded = clamp(bone.rotation, range[0], range[1]);
    if (!Number.isFinite(bone.rotation) || !Number.isFinite(rig.angularVelocity[name])) {
      bone.rotation = 0; rig.angularVelocity[name] = 0;
    } else if (bounded !== bone.rotation) {
      bone.rotation = bounded; rig.angularVelocity[name] *= -0.12;
    }
  }
}
