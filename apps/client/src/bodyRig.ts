// 2D bone-rigged player body: parts are Graphics parented into a Container
// tree that mirrors a bone hierarchy, posed procedurally per animation state.
// Colors come from a PlayerCosmetics selection (see cosmetics.ts) so each
// body-part slot (head/torso/arms/legs) can be customized independently.
import { Container, Graphics } from "pixi.js";

export type BoneName =
  | "hip"
  | "torso"
  | "head"
  | "armUpperL" | "armLowerL"
  | "armUpperR" | "armLowerR"
  | "legUpperL" | "legLowerL"
  | "legUpperR" | "legLowerR";

export type BodyPoseState = "idle" | "run" | "jump_fall" | "kick_push" | "hit";

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

const BODY_BONE_DEFS: BoneDef[] = [
  { name: "hip",       parent: null,       x: 0,  y: -16, segX: 0, segY: 0,  width: 0, color: "torso" },
  { name: "torso",     parent: "hip",      x: 0,  y: 0,   segX: 0, segY: -11, width: 7, color: "torso" },
  { name: "head",      parent: "torso",    x: 0,  y: -11, segX: 0, segY: -8,  width: 7, color: "skin" },
  { name: "armUpperL", parent: "torso",    x: -4, y: -9,  segX: 0, segY: 6,   width: 3, color: "arms" },
  { name: "armLowerL", parent: "armUpperL",x: 0,  y: 6,   segX: 0, segY: 6,   width: 3, color: "arms" },
  { name: "armUpperR", parent: "torso",    x: 4,  y: -9,  segX: 0, segY: 6,   width: 3, color: "arms" },
  { name: "armLowerR", parent: "armUpperR",x: 0,  y: 6,   segX: 0, segY: 6,   width: 3, color: "arms" },
  { name: "legUpperL", parent: "hip",      x: -3, y: 0,   segX: 0, segY: 8,   width: 4, color: "limb" },
  { name: "legLowerL", parent: "legUpperL",x: 0,  y: 8,   segX: 0, segY: 8,   width: 4, color: "boot" },
  { name: "legUpperR", parent: "hip",      x: 3,  y: 0,   segX: 0, segY: 8,   width: 4, color: "limb" },
  { name: "legLowerR", parent: "legUpperR",x: 0,  y: 8,   segX: 0, segY: 8,   width: 4, color: "boot" },
];

export interface BodyRig {
  root: Container;
  bones: Record<BoneName, Container>;
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

  return { root, bones: bones as Record<BoneName, Container> };
}

function walkCyclePhase(elapsedMs: number, speedFactor: number): number {
  const cycleMs = 380 - speedFactor * 180; // faster cycle at higher speed
  return (elapsedMs % cycleMs) / cycleMs * Math.PI * 2;
}

/**
 * Poses the rig's bones for the given animation state. speedFactor is 0..1
 * (how close to max run speed), verticalSign is -1 while ascending a jump,
 * +1 while falling, 0 when grounded.
 */
export function poseBodyRig(
  rig: BodyRig,
  state: BodyPoseState,
  elapsedMs: number,
  speedFactor: number,
  verticalSign: -1 | 0 | 1,
): void {
  const b = rig.bones;
  const resetAll = () => {
    for (const name of Object.keys(b) as BoneName[]) {
      if (name === "hip" || name === "torso" || name === "head") continue;
      b[name].rotation = 0;
    }
    b.torso.rotation = 0;
    b.head.rotation = 0;
    b.hip.y = -16;
  };
  resetAll();

  if (state === "idle") {
    const t = elapsedMs / 1000;
    const breathe = Math.sin(t * 2) * 0.03;
    b.torso.rotation = breathe;
    b.head.rotation = -breathe * 0.6;
    b.armUpperL.rotation = 0.08 + breathe;
    b.armUpperR.rotation = -0.08 - breathe;
    b.hip.y = -16 + Math.sin(t * 2) * 0.6;
    return;
  }

  if (state === "run") {
    const phase = walkCyclePhase(elapsedMs, speedFactor);
    const swing = 0.9 * Math.max(0.35, speedFactor);
    b.legUpperL.rotation = Math.sin(phase) * swing;
    b.legUpperR.rotation = Math.sin(phase + Math.PI) * swing;
    b.legLowerL.rotation = Math.max(0, Math.sin(phase + Math.PI * 0.5)) * 0.9;
    b.legLowerR.rotation = Math.max(0, Math.sin(phase + Math.PI * 1.5)) * 0.9;
    b.armUpperL.rotation = Math.sin(phase + Math.PI) * swing * 0.7;
    b.armUpperR.rotation = Math.sin(phase) * swing * 0.7;
    b.armLowerL.rotation = 0.3;
    b.armLowerR.rotation = 0.3;
    b.torso.rotation = 0.06 + Math.sin(phase * 2) * 0.02;
    b.hip.y = -16 - Math.abs(Math.sin(phase)) * 1.2;
    return;
  }

  if (state === "jump_fall") {
    b.legUpperL.rotation = verticalSign >= 0 ? -0.25 : -0.5;
    b.legUpperR.rotation = verticalSign >= 0 ? 0.35 : 0.15;
    b.legLowerL.rotation = 0.8;
    b.legLowerR.rotation = 0.5;
    b.armUpperL.rotation = verticalSign < 0 ? -1.0 : -0.4;
    b.armUpperR.rotation = verticalSign < 0 ? -1.0 : 0.5;
    b.torso.rotation = verticalSign < 0 ? -0.12 : 0.08;
    return;
  }

  if (state === "kick_push") {
    b.legUpperR.rotation = -1.1;
    b.legLowerR.rotation = -0.2;
    b.legUpperL.rotation = 0.15;
    b.armUpperL.rotation = -0.6;
    b.armUpperR.rotation = 0.5;
    b.torso.rotation = -0.15;
    return;
  }

  if (state === "hit") {
    b.torso.rotation = 0.3;
    b.head.rotation = 0.2;
    b.armUpperL.rotation = -0.5;
    b.armUpperR.rotation = -0.7;
    return;
  }
}
