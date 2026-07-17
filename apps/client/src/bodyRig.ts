// 2D bone-rigged player body: parts are Graphics parented into a Container
// tree that mirrors a bone hierarchy. Each bone's rotation is driven by a
// spring-damper toward a per-frame "target" pose (idle/run/jump/kick/hit),
// so motion carries real inertia — limbs lag, overshoot, and settle instead
// of snapping straight to their target angle. Colors come from a
// PlayerCosmetics selection (see cosmetics.ts) so each body-part slot
// (head/torso/arms/legs) can be customized independently.
import { Container, Graphics } from "pixi.js";
import { JUMP_SPEED, MAX_FALL_SPEED } from "@skybound/shared";

export type BoneName =
  | "hip"
  | "torso"
  | "head"
  | "armUpperL" | "armLowerL"
  | "armUpperR" | "armLowerR"
  | "legUpperL" | "legLowerL"
  | "legUpperR" | "legLowerR";

const ANIMATED_BONES: BoneName[] = [
  "torso", "head",
  "armUpperL", "armLowerL", "armUpperR", "armLowerR",
  "legUpperL", "legLowerL", "legUpperR", "legLowerR",
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
  { name: "legUpperR", parent: "hip",      x: 3,  y: 0,   segX: 0, segY: 8,   width: 4, color: "limb" },
  { name: "legLowerR", parent: "legUpperR",x: 0,  y: 8,   segX: 0, segY: 8,   width: 4, color: "boot" },
  { name: "torso",     parent: "hip",      x: 0,  y: 0,   segX: 0, segY: -11, width: 7, color: "torso" },
  { name: "head",      parent: "torso",    x: 0,  y: -11, segX: 0, segY: -8,  width: 7, color: "skin" },
  { name: "armUpperL", parent: "torso",    x: -4, y: -9,  segX: 0, segY: 8,   width: 3, color: "arms" },
  { name: "armLowerL", parent: "armUpperL",x: 0,  y: 8,   segX: 0, segY: 8,   width: 3, color: "arms" },
  { name: "armUpperR", parent: "torso",    x: 4,  y: -9,  segX: 0, segY: 8,   width: 3, color: "arms" },
  { name: "armLowerR", parent: "armUpperR",x: 0,  y: 8,   segX: 0, segY: 8,   width: 3, color: "arms" },
];

export interface BodyRig {
  root: Container;
  bones: Record<BoneName, Container>;
  // Spring-damper state, persisted frame to frame (see springTo()).
  angularVelocity: Record<BoneName, number>;
  hipY: number;
  hipVelocityY: number;
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
  // Reseeded whenever a jump begins so each airborne arc looks different.
  jumpSeed: number;
}

export function createBodyRig(palette: BodyRigPalette = DEFAULT_BODY_RIG_PALETTE): BodyRig {
  const bones: Partial<Record<BoneName, Container>> = {};
  const root = new Container();

  for (const def of BODY_BONE_DEFS) {
    const bone = new Container();
    bone.x = def.x;
    bone.y = def.y;
    bone.eventMode = "none";
    if (def.name === "head") {
      const gfx = new Graphics().circle(0, def.segY / 2, def.width / 2 + 1).fill(palette[def.color]);
      bone.addChild(gfx);
    } else if (def.width > 0) {
      const half = def.width / 2;
      const gfx = new Graphics()
        .rect(-half, Math.min(0, def.segY), def.width, Math.abs(def.segY))
        .fill(palette[def.color]);
      bone.addChild(gfx);
    }
    bones[def.name] = bone;
    const parent = def.parent ? bones[def.parent] : root;
    (parent ?? root).addChild(bone);
  }

  const angularVelocity = {} as Record<BoneName, number>;
  for (const name of ANIMATED_BONES) angularVelocity[name] = 0;

  return {
    root,
    bones: bones as Record<BoneName, Container>,
    angularVelocity,
    hipY: -16,
    hipVelocityY: 0,
    hipX: 0,
    hipVelocityX: 0,
    squashX: 1,
    squashY: 1,
    squashVelX: 0,
    squashVelY: 0,
    lastElapsedMs: null,
    lastState: null,
    jumpSeed: Math.random() * 1000,
  };
}

function walkCyclePhase(elapsedMs: number, speedFactor: number): number {
  const cycleMs = 340 - speedFactor * 150; // faster cycle at higher speed
  return (elapsedMs % cycleMs) / cycleMs * Math.PI * 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
  rig.angularVelocity[name] = nextVel;
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

function runTargets(elapsedMs: number, speedFactor: number): Targets {
  const phase = walkCyclePhase(elapsedMs, speedFactor);
  const intensity = Math.max(0.4, speedFactor);
  const thighSwing = 0.95 * intensity;

  const thighL = Math.sin(phase);
  const thighR = Math.sin(phase + Math.PI);
  const kneeCurve = (thighPhaseCos: number) => {
    const swingingForward = clamp(thighPhaseCos, 0, 1);
    return 0.12 + swingingForward * swingingForward * 1.35 * intensity;
  };

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
    legUpperL: thighL * thighSwing, legLowerL: kneeCurve(Math.cos(phase)),
    legUpperR: thighR * thighSwing, legLowerR: kneeCurve(Math.cos(phase + Math.PI)),
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
  kick?: { phase: KickPhaseName; progress: number };
}

/**
 * Poses the rig by springing every bone toward a per-state target angle
 * each frame — the spring-damper integration (springTo) is what gives the
 * motion real inertia (arms lag behind torso direction changes, overshoot
 * and settle) instead of snapping straight to the target.
 */
export function poseBodyRig(rig: BodyRig, params: PoseParams): void {
  const { state, elapsedMs, speedFactor, verticalVelocity, kick } = params;

  const dt = rig.lastElapsedMs === null ? 1 / 60 : clamp((elapsedMs - rig.lastElapsedMs) / 1000, 0, 1 / 20);
  rig.lastElapsedMs = elapsedMs;

  const effectiveState: BodyPoseState | "kick" = kick ? "kick" : state;
  if (rig.lastState !== "jump_fall" && effectiveState === "jump_fall") {
    rig.jumpSeed = Math.random() * 1000;
  }
  rig.lastState = effectiveState;

  const targets = kick
    ? kickTargets(kick.phase, kick.progress)
    : state === "idle" ? idleTargets(elapsedMs)
    : state === "run" ? runTargets(elapsedMs, speedFactor)
    : state === "jump_fall" ? jumpFallTargets(verticalVelocity, rig.jumpSeed)
    : hitTargets();

  // A strike needs snappier limb springs than idle/run/jump — otherwise
  // the fast phase-driven target changes (guard->anticipate->chamber->
  // strike->overshoot in well under half a second) get smeared into a
  // slow drift instead of reading as a fast, forceful motion.
  const limbStiff = kick ? STIFF_STRIKE_LIMB : STIFF_ARM;
  const torsoStiff = kick ? STIFF_STRIKE_TORSO : STIFF_FIRM;

  springTo(rig, "torso", targets.torso, torsoStiff.k, torsoStiff.d, dt);
  springTo(rig, "head", targets.head, torsoStiff.k, torsoStiff.d, dt);
  springTo(rig, "legUpperL", targets.legUpperL, kick ? limbStiff.k : STIFF_LEG.k, kick ? limbStiff.d : STIFF_LEG.d, dt);
  springTo(rig, "legUpperR", targets.legUpperR, kick ? limbStiff.k : STIFF_LEG.k, kick ? limbStiff.d : STIFF_LEG.d, dt);
  springTo(rig, "legLowerL", targets.legLowerL, kick ? limbStiff.k : STIFF_SHIN.k, kick ? limbStiff.d : STIFF_SHIN.d, dt);
  springTo(rig, "legLowerR", targets.legLowerR, kick ? limbStiff.k : STIFF_SHIN.k, kick ? limbStiff.d : STIFF_SHIN.d, dt);
  springTo(rig, "armUpperL", targets.armUpperL, limbStiff.k, limbStiff.d, dt);
  springTo(rig, "armUpperR", targets.armUpperR, limbStiff.k, limbStiff.d, dt);
  springTo(rig, "armLowerL", targets.armLowerL, kick ? limbStiff.k : STIFF_FOREARM.k, kick ? limbStiff.d : STIFF_FOREARM.d, dt);
  springTo(rig, "armLowerR", targets.armLowerR, kick ? limbStiff.k : STIFF_FOREARM.k, kick ? limbStiff.d : STIFF_FOREARM.d, dt);
  springHipY(rig, targets.hipY, STIFF_HIP_Y.k, STIFF_HIP_Y.d, dt);
  springHipX(rig, targets.hipX, STIFF_HIP_X.k, STIFF_HIP_X.d, dt);
  springSquash(rig, targets.squashX, targets.squashY, STIFF_SQUASH.k, STIFF_SQUASH.d, dt);
}
