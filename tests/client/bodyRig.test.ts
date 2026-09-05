import assert from "node:assert/strict";
import test from "node:test";
import { MAX_FALL_SPEED } from "@skybound/shared";
import { Sprite, Texture } from "pixi.js";
import { createBodyRig, poseBodyRig, solveTwoBoneIK, stableAnimationSeed, updateBodyRigAppearance, DEFAULT_BODY_RIG_PALETTE } from "../../apps/client/src/bodyRig.js";

test("two-bone IK reaches valid contacts and clamps unreachable targets", () => {
  for (const [x, y] of [[0, 15], [5, 14], [-4, 12]] as const) {
    const solved = solveTwoBoneIK(x, y, 8, 8);
    assert.ok(Math.abs(solved.reachedX - x) < 0.001, `${solved.reachedX} != ${x}`);
    assert.ok(Math.abs(solved.reachedY - y) < 0.001, `${solved.reachedY} != ${y}`);
  }
  const clamped = solveTwoBoneIK(100, 0, 8, 8);
  assert.ok(Math.hypot(clamped.reachedX, clamped.reachedY) < 16);
  assert.ok(Number.isFinite(clamped.upper) && Number.isFinite(clamped.lower));
});

test("procedural rig remains finite and anatomically bounded across frame rates and hitches", () => {
  for (const fps of [20, 30, 60, 144]) {
    const rig = createBodyRig();
    let elapsed = 0;
    for (let frame = 0; frame < fps * 2; frame++) {
      elapsed += 1000 / fps;
      poseBodyRig(rig, { state: "run", elapsedMs: elapsed, speedFactor: 1, horizontalVelocity: 150, verticalVelocity: 0, facing: 1 });
    }
    elapsed += 1000; // background-tab style hitch; integration clamps/substeps
    poseBodyRig(rig, { state: "run", elapsedMs: elapsed, speedFactor: 1, horizontalVelocity: -150, verticalVelocity: 0, facing: -1 });
    for (const [name, bone] of Object.entries(rig.bones)) {
      assert.ok(Number.isFinite(bone.rotation), `${fps}fps ${name} rotation`);
      assert.ok(Math.abs(bone.rotation) <= 3.1, `${fps}fps ${name} exceeded joint envelope`);
    }
    for (const velocity of Object.values(rig.angularVelocity)) assert.ok(Number.isFinite(velocity));
    rig.root.destroy({ children: true });
  }
});

test("head stabilization cancels procedural spine lean across frame rates", () => {
  for (const fps of [30, 60, 144]) {
    const rig = createBodyRig();
    for (let frame = 0; frame < fps * 3; frame++) {
      poseBodyRig(rig, {
        state: "run",
        elapsedMs: frame * 1000 / fps,
        speedFactor: 1,
        horizontalVelocity: 150,
        verticalVelocity: 0,
        facing: 1,
      });
    }
    const spineAngle = rig.bones.torso.rotation + rig.bones.chest.rotation;
    const headWorldAngle = spineAngle + rig.bones.neck.rotation + rig.bones.head.rotation;
    assert.ok(spineAngle > 0.2, `${fps}fps spine did not establish its run lean: ${spineAngle}`);
    assert.ok(Math.abs(headWorldAngle + 0.06) < 0.035, `${fps}fps head inherited spine lean: ${headWorldAngle}`);
    rig.root.destroy({ children: true });
  }
});

test("landing response remembers airborne impact and decays into compression", () => {
  const rig = createBodyRig();
  poseBodyRig(rig, { state: "jump_fall", elapsedMs: 0, speedFactor: 0, horizontalVelocity: 0, verticalVelocity: MAX_FALL_SPEED });
  poseBodyRig(rig, { state: "idle", elapsedMs: 16.7, speedFactor: 0, horizontalVelocity: 0, verticalVelocity: 0 });
  assert.ok(rig.landingCompression > 0.7, `impact memory was ${rig.landingCompression}`);
  assert.ok(rig.squashY < 1, `expected vertical compression, got ${rig.squashY}`);
  rig.root.destroy({ children: true });
});

test("tiny ledge transitions do not trigger a heavy landing pulse", () => {
  const rig = createBodyRig();
  poseBodyRig(rig, { state: "jump_fall", elapsedMs: 0, speedFactor: 0, horizontalVelocity: 0, verticalVelocity: 24 });
  poseBodyRig(rig, { state: "idle", elapsedMs: 16.7, speedFactor: 0, horizontalVelocity: 0, verticalVelocity: 0 });
  assert.equal(rig.landingCompression, 0);
  assert.ok(rig.squashY > 0.99, `unexpected tiny-drop squash ${rig.squashY}`);
  rig.root.destroy({ children: true });
});

test("locomotion hysteresis prevents idle-run chatter near the speed boundary", () => {
  const rig = createBodyRig();
  let elapsed = 0;
  for (let frame = 0; frame < 30; frame++) {
    elapsed += 1000 / 60;
    poseBodyRig(rig, { state: "run", elapsedMs: elapsed, speedFactor: 0.4, horizontalVelocity: 60, verticalVelocity: 0 });
  }
  const movingWeight = rig.locomotionWeight;
  let maxWeightDelta = 0;
  let previous = movingWeight;
  for (let frame = 0; frame < 60; frame++) {
    elapsed += 1000 / 60;
    const velocity = frame % 2 === 0 ? 24 : 32;
    poseBodyRig(rig, { state: velocity > 28 ? "run" : "idle", elapsedMs: elapsed, speedFactor: velocity / 150, horizontalVelocity: velocity, verticalVelocity: 0 });
    maxWeightDelta = Math.max(maxWeightDelta, Math.abs(rig.locomotionWeight - previous));
    previous = rig.locomotionWeight;
  }
  assert.ok(movingWeight > 0.9);
  assert.ok(rig.locomotionWeight > 0.85, `hysteresis dropped gait weight to ${rig.locomotionWeight}`);
  assert.ok(maxWeightDelta < 0.08, `locomotion weight popped by ${maxWeightDelta}`);
  rig.root.destroy({ children: true });
});

test("reduced motion removes idle breathing and landing squash while retaining stable poses", () => {
  const rig = createBodyRig();
  for (let frame = 0; frame < 60; frame++) {
    poseBodyRig(rig, { state: "idle", elapsedMs: frame * 16.7, speedFactor: 0, horizontalVelocity: 0, verticalVelocity: 0, reducedMotion: true });
  }
  assert.ok(Math.abs(rig.bones.torso.rotation) < 1e-6);
  assert.ok(Math.abs(rig.bones.chest.rotation) < 1e-6);
  assert.ok(Math.abs(rig.bones.neck.rotation) < 1e-6);
  poseBodyRig(rig, { state: "jump_fall", elapsedMs: 1100, speedFactor: 0, horizontalVelocity: 0, verticalVelocity: MAX_FALL_SPEED, reducedMotion: true });
  poseBodyRig(rig, { state: "idle", elapsedMs: 1117, speedFactor: 0, horizontalVelocity: 0, verticalVelocity: 0, reducedMotion: true });
  assert.equal(rig.landingCompression, 0);
  rig.root.destroy({ children: true });
});

test("aerial attack overlay preserves fall-speed memory for landing", () => {
  const rig = createBodyRig();
  poseBodyRig(rig, {
    state: "jump_fall", elapsedMs: 0, speedFactor: 0.3,
    horizontalVelocity: 40, verticalVelocity: MAX_FALL_SPEED, facing: 1,
    kick: { phase: "active", progress: 0.5 },
  });
  assert.equal(rig.maxAirborneFallSpeed, MAX_FALL_SPEED);
  poseBodyRig(rig, {
    state: "idle", elapsedMs: 16.7, speedFactor: 0,
    horizontalVelocity: 0, verticalVelocity: 0, facing: 1,
    kick: { phase: "recovery", progress: 0.8 },
  });
  assert.ok(rig.landingCompression > 0.7, `aerial attack impact memory was ${rig.landingCompression}`);
  rig.root.destroy({ children: true });
});

test("appearance updates preserve the bone hierarchy", () => {
  const rig = createBodyRig();
  const lowerLeg = rig.bones.legLowerL;
  assert.equal(lowerLeg.parent, rig.bones.legUpperL);
  updateBodyRigAppearance(rig, { ...DEFAULT_BODY_RIG_PALETTE, torso: 0x33aa77 });
  assert.equal(lowerLeg.parent, rig.bones.legUpperL);
  assert.ok(rig.visuals.torso);
  assert.equal(rig.bones.footL.parent, rig.bones.legLowerL);
  assert.equal(rig.bones.footR.parent, rig.bones.legLowerR);
  assert.equal(rig.bones.handL.parent, rig.bones.armLowerL);
  assert.equal(rig.bones.handR.parent, rig.bones.armLowerR);
  assert.equal(rig.bones.chest.parent, rig.bones.torso);
  assert.equal(rig.bones.neck.parent, rig.bones.chest);
  assert.equal(rig.bones.head.parent, rig.bones.neck);
  assert.equal(rig.bones.armUpperL.parent, rig.bones.chest);
  assert.equal(rig.bones.armUpperR.parent, rig.bones.chest);
  rig.root.destroy({ children: true });
});

test("authored cosmetic pivots become normalized sprite anchors", () => {
  const rig = createBodyRig(DEFAULT_BODY_RIG_PALETTE, {
    foot: { texture: Texture.WHITE, width: 8, height: 6, pivot: [0, 3] },
  });
  const foot = rig.visuals.footL;
  assert.ok(foot instanceof Sprite);
  assert.equal(foot.anchor.x, 0);
  assert.equal(foot.anchor.y, 0.5);
  rig.root.destroy({ children: true });
});

test("jump variation is deterministic per identity and advances per takeoff", () => {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error("body rig must not use Math.random"); };
  try {
    const seed = stableAnimationSeed("player-one");
    const rigA = createBodyRig();
    const rigB = createBodyRig();
    for (const rig of [rigA, rigB]) {
      poseBodyRig(rig, { state: "idle", elapsedMs: 0, speedFactor: 0, verticalVelocity: 0, animationSeed: seed });
      poseBodyRig(rig, { state: "jump_fall", elapsedMs: 17, speedFactor: 0, verticalVelocity: -420, animationSeed: seed });
    }
    assert.equal(rigA.jumpSeed, rigB.jumpSeed);
    const firstJump = rigA.jumpSeed;
    poseBodyRig(rigA, { state: "idle", elapsedMs: 34, speedFactor: 0, verticalVelocity: 0, animationSeed: seed });
    poseBodyRig(rigA, { state: "jump_fall", elapsedMs: 51, speedFactor: 0, verticalVelocity: -420, animationSeed: seed });
    assert.notEqual(rigA.jumpSeed, firstJump);
    assert.notEqual(stableAnimationSeed("player-one"), stableAnimationSeed("player-two"));

    const ordinal = rigA.jumpOrdinal;
    updateBodyRigAppearance(rigA, { ...DEFAULT_BODY_RIG_PALETTE, torso: 0xabcdef });
    assert.equal(rigA.jumpOrdinal, ordinal, "cosmetic swaps preserve motion state");
    rigA.root.destroy({ children: true });
    rigB.root.destroy({ children: true });
  } finally {
    Math.random = originalRandom;
  }
});

test("terrain-aware stance anchors feet in world space while the root advances", () => {
  const rig = createBodyRig();
  let elapsed = 0;
  let rootX = 100;
  const plantedXs: number[] = [];
  for (let frame = 0; frame < 24; frame++) {
    elapsed += 1000 / 60;
    rootX += 50 / 60;
    poseBodyRig(rig, {
      state: "run", elapsedMs: elapsed, speedFactor: 0.5,
      horizontalVelocity: 50, verticalVelocity: 0, facing: 1,
      groundContact: { rootWorldX: rootX, rootWorldY: 0, grounded: true, sampleGroundY: () => 0 },
    });
    const contact = rig.footContacts.left;
    if (contact.planted && contact.weight > 0.8) {
      const upper = rig.bones.legUpperL.rotation;
      const lower = rig.bones.legLowerL.rotation;
      const ankleLocalX = rig.hipX - 3 - Math.sin(upper) * 8 - Math.sin(upper + lower) * 8;
      plantedXs.push(rootX + ankleLocalX * rig.squashX);
    }
  }
  assert.ok(plantedXs.length >= 3, `insufficient planted samples: ${plantedXs.length}`);
  const slip = Math.max(...plantedXs) - Math.min(...plantedXs);
  assert.ok(slip < 1.25, `planted foot slipped ${slip.toFixed(3)}px`);
  rig.root.destroy({ children: true });
});

test("terrain contacts remain ledge-safe when no support is sampled", () => {
  const rig = createBodyRig();
  for (let frame = 0; frame < 20; frame++) {
    poseBodyRig(rig, {
      state: "run", elapsedMs: frame * 16.7, speedFactor: 0.8,
      horizontalVelocity: 100, verticalVelocity: 0, facing: 1,
      groundContact: { rootWorldX: frame, rootWorldY: 0, grounded: true, sampleGroundY: () => null },
    });
  }
  assert.equal(rig.footContacts.left.planted, false);
  assert.equal(rig.footContacts.right.planted, false);
  for (const bone of Object.values(rig.bones)) assert.ok(Number.isFinite(bone.rotation));
  rig.root.destroy({ children: true });
});

test("planted contacts track small terrain shifts and release stale support smoothly", () => {
  const rig = createBodyRig();
  let surface: number | null = 0;
  const context = { rootWorldX: 100, rootWorldY: 0, grounded: true, sampleGroundY: () => surface };
  poseBodyRig(rig, { state: "idle", elapsedMs: 0, speedFactor: 0, horizontalVelocity: 0, verticalVelocity: 0, groundContact: context });
  const contact = rig.footContacts.left;
  assert.equal(contact.planted, true);
  surface = 1;
  poseBodyRig(rig, { state: "idle", elapsedMs: 16.7, speedFactor: 0, horizontalVelocity: 0, verticalVelocity: 0, groundContact: context });
  assert.equal(contact.planted, true);
  assert.equal(contact.anchorY, 1);
  const weightBeforeRelease = contact.weight;
  surface = 5;
  poseBodyRig(rig, { state: "idle", elapsedMs: 33.4, speedFactor: 0, horizontalVelocity: 0, verticalVelocity: 0, groundContact: context });
  assert.equal(contact.planted, false);
  assert.ok(contact.weight > 0 && contact.weight < weightBeforeRelease, "released support should blend out instead of popping");
  for (const bone of Object.values(rig.bones)) assert.ok(Number.isFinite(bone.rotation));
  rig.root.destroy({ children: true });
});

test("swing feet plan a raised touchdown using terrain lookahead", () => {
  const rig = createBodyRig();
  rig.locomotionWeight = 1;
  rig.locomotionPhase = Math.PI * 1.45;
  const context = {
    rootWorldX: 100,
    rootWorldY: 0,
    grounded: true,
    sampleGroundY: (x: number) => x >= 104 ? -6 : 0,
  };
  poseBodyRig(rig, {
    state: "run", elapsedMs: 0, speedFactor: 0.6,
    horizontalVelocity: 75, verticalVelocity: 0, facing: 1, groundContact: context,
  });
  const swinging = [rig.footContacts.left, rig.footContacts.right].find((contact) => contact.hasPlan);
  assert.ok(swinging, "one swing foot should have a planned touchdown");
  assert.equal(swinging.plannedY, -6);
  assert.ok(Number.isFinite(swinging.plannedX));
  for (const bone of Object.values(rig.bones)) assert.ok(Number.isFinite(bone.rotation));
  rig.root.destroy({ children: true });
});

test("swing touchdown prediction uses the remaining half-cycle distance", () => {
  const rig = createBodyRig();
  rig.locomotionWeight = 1;
  rig.locomotionPhase = Math.PI;
  poseBodyRig(rig, {
    state: "run",
    elapsedMs: 0,
    speedFactor: 1,
    horizontalVelocity: 150,
    verticalVelocity: 0,
    facing: 1,
    groundContact: {
      grounded: true,
      rootWorldX: 100,
      rootWorldY: -16,
      sampleGroundY: () => -12,
    },
  });
  const swingT = (rig.locomotionPhase - Math.PI) / Math.PI;
  const expectedX = 100 + (1 - swingT) * 13 + (-3 + 5.2);
  assert.equal(rig.footContacts.left.hasPlan, true);
  assert.ok(Math.abs(rig.footContacts.left.plannedX - expectedX) < 0.1,
    `planned ${rig.footContacts.left.plannedX}, expected ${expectedX}`);
  rig.root.destroy({ children: true });
});
