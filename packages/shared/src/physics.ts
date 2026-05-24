import {
  AIR_ACCELERATION,
  AIR_PUSH_FACTOR,
  COYOTE_TIME_SECONDS,
  GRAVITY,
  GROUND_FRICTION,
  JUMP_BUFFER_SECONDS,
  JUMP_SPEED,
  KICK_ACTIVE_SECONDS,
  KICK_COOLDOWN_SECONDS,
  KICK_FORCE_AIR,
  KICK_FORCE_GROUND,
  KICK_HIT_INVULNERABLE_SECONDS,
  KICK_RANGE_PX,
  KICK_RECOVERY_SECONDS,
  KICK_WINDUP_SECONDS,
  MAX_DELTA_SECONDS,
  MAX_FALL_SPEED,
  MOVE_ACCELERATION,
  MAX_RUN_SPEED,
  PLAYER_HEIGHT,
  PLAYER_MAX_PUSH_VELOCITY,
  PLAYER_PUSH_FORCE,
  PLAYER_WIDTH,
  SHORT_HOP_CUTOFF,
  TILE_SIZE
} from "./constants.js";
import type { CollisionHit, KickPhase, PlayerId, PlayerInput, PlayerState, Rect, StepResult, TileMap } from "./types.js";

export interface PlayerInteractionEvent {
  type: "PLAYER_KICK_HIT";
  playerId: PlayerId;
  targetId: PlayerId;
}

export function createPlayerState(id: string, x: number, y: number): PlayerState {
  return {
    id,
    position: { x, y },
    velocity: { x: 0, y: 0 },
    facing: 1,
    grounded: false,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    kickCooldown: 0,
    kickPhase: "idle",
    kickTimer: 0,
    kickInvulnerable: 0,
    invulnerable: 0,
    checkpointChunkY: 0,
    coins: 0
  };
}

export function playerRect(player: PlayerState): Rect {
  return {
    x: player.position.x,
    y: player.position.y,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT
  };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
}

function moveToward(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target);
  if (value > target) return Math.max(value - maxDelta, target);
  return target;
}

function tileRange(min: number, max: number): [number, number] {
  return [
    Math.floor(min / TILE_SIZE),
    Math.floor((max - 0.001) / TILE_SIZE)
  ];
}

function solidAt(map: TileMap, tileX: number, tileY: number): boolean {
  return map.isSolid(tileX, tileY);
}

function resolveHorizontal(player: PlayerState, map: TileMap, dx: number, hits: CollisionHit[]): void {
  player.position.x += dx;
  const rect = playerRect(player);
  const [top, bottom] = tileRange(rect.y, rect.y + rect.height);

  if (dx > 0) {
    const right = Math.floor((rect.x + rect.width - 0.001) / TILE_SIZE);
    for (let y = top; y <= bottom; y += 1) {
      if (solidAt(map, right, y)) {
        player.position.x = right * TILE_SIZE - rect.width;
        player.velocity.x = 0;
        hits.push({ normal: { x: -1, y: 0 }, tileX: right, tileY: y, kind: "solid" });
        return;
      }
    }
  } else if (dx < 0) {
    const left = Math.floor(rect.x / TILE_SIZE);
    for (let y = top; y <= bottom; y += 1) {
      if (solidAt(map, left, y)) {
        player.position.x = (left + 1) * TILE_SIZE;
        player.velocity.x = 0;
        hits.push({ normal: { x: 1, y: 0 }, tileX: left, tileY: y, kind: "solid" });
        return;
      }
    }
  }
}

function resolveVertical(
  player: PlayerState,
  map: TileMap,
  dy: number,
  drop: boolean,
  hits: CollisionHit[]
): void {
  const previousBottom = player.position.y + PLAYER_HEIGHT;
  player.position.y += dy;
  player.grounded = false;
  const rect = playerRect(player);
  const [left, right] = tileRange(rect.x, rect.x + rect.width);

  if (dy > 0) {
    const bottom = Math.floor((rect.y + rect.height - 0.001) / TILE_SIZE);
    for (let x = left; x <= right; x += 1) {
      if (solidAt(map, x, bottom)) {
        player.position.y = bottom * TILE_SIZE - rect.height;
        player.velocity.y = 0;
        player.grounded = true;
        player.coyoteTimer = COYOTE_TIME_SECONDS;
        hits.push({ normal: { x: 0, y: -1 }, tileX: x, tileY: bottom, kind: "solid" });
        return;
      }
      // One-way: only land when falling downward (dy > 0 == player.velocity.y > 0) and not holding drop
      const platformTop = bottom * TILE_SIZE;
      if (!drop && player.velocity.y > 0 && previousBottom <= platformTop && map.isOneWay?.(x, bottom)) {
        player.position.y = platformTop - rect.height;
        player.velocity.y = 0;
        player.grounded = true;
        player.coyoteTimer = COYOTE_TIME_SECONDS;
        player.jumpBufferTimer = 0;
        hits.push({ normal: { x: 0, y: -1 }, tileX: x, tileY: bottom, kind: "oneWay" });
        return;
      }
    }
  } else if (dy < 0) {
    const top = Math.floor(rect.y / TILE_SIZE);
    for (let x = left; x <= right; x += 1) {
      if (solidAt(map, x, top)) {
        player.position.y = (top + 1) * TILE_SIZE;
        player.velocity.y = 0;
        hits.push({ normal: { x: 0, y: 1 }, tileX: x, tileY: top, kind: "solid" });
        return;
      }
    }
  }
}

function stepKick(phase: KickPhase, kickTimer: number, kickCooldown: number, kicked: boolean, dt: number): {
  phase: KickPhase;
  kickTimer: number;
  kickCooldown: number;
} {
  let p = phase;
  let t = kickTimer + dt;
  let c = Math.max(0, kickCooldown - dt);

  if (p === "idle" && kicked && c <= 0) {
    p = "windup";
    t = 0;
  } else if (p === "windup" && t >= KICK_WINDUP_SECONDS) {
    p = "active";
    t = 0;
  } else if (p === "active" && t >= KICK_ACTIVE_SECONDS) {
    p = "recovery";
    t = 0;
  } else if (p === "recovery" && t >= KICK_RECOVERY_SECONDS) {
    p = "idle";
    t = 0;
    c = KICK_COOLDOWN_SECONDS;
  } else if (p === "idle") {
    t = 0; // don't accumulate idle timer
  }

  return { phase: p, kickTimer: t, kickCooldown: c };
}

export function stepPlayer(player: PlayerState, input: PlayerInput, map: TileMap, deltaSeconds: number): StepResult {
  const dt = Math.min(Math.max(deltaSeconds, 0), MAX_DELTA_SECONDS);

  const kick = stepKick(
    player.kickPhase,
    player.kickTimer,
    player.kickCooldown,
    input.kick,
    dt
  );

  const next: PlayerState = {
    ...player,
    position: { ...player.position },
    velocity: { ...player.velocity },
    coyoteTimer: Math.max(0, player.coyoteTimer - dt),
    jumpBufferTimer: input.jumpPressed ? JUMP_BUFFER_SECONDS : Math.max(0, player.jumpBufferTimer - dt),
    kickCooldown: kick.kickCooldown,
    kickPhase: kick.phase,
    kickTimer: kick.kickTimer,
    kickInvulnerable: Math.max(0, player.kickInvulnerable - dt),
    invulnerable: Math.max(0, player.invulnerable - dt)
  };

  const hits: CollisionHit[] = [];

  // Horizontal movement (lock during windup/active/recovery)
  const locked = next.kickPhase !== "idle";
  const direction = locked ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);

  if (direction !== 0) {
    next.facing = direction > 0 ? 1 : -1;
    const acceleration = next.grounded ? MOVE_ACCELERATION : AIR_ACCELERATION;
    next.velocity.x = moveToward(next.velocity.x, direction * MAX_RUN_SPEED, acceleration * dt);
  } else if (next.grounded) {
    next.velocity.x = moveToward(next.velocity.x, 0, GROUND_FRICTION * dt);
  }

  // Jump
  if (next.jumpBufferTimer > 0 && (next.grounded || next.coyoteTimer > 0)) {
    next.velocity.y = -JUMP_SPEED;
    next.grounded = false;
    next.coyoteTimer = 0;
    next.jumpBufferTimer = 0;
  }

  // Short-hop cut
  if (!input.jumpHeld && next.velocity.y < -JUMP_SPEED * SHORT_HOP_CUTOFF) {
    next.velocity.y = -JUMP_SPEED * SHORT_HOP_CUTOFF;
  }

  // Gravity
  next.velocity.y = Math.min(next.velocity.y + GRAVITY * dt, MAX_FALL_SPEED);

  // Clamp horizontal
  if (next.velocity.x > MAX_RUN_SPEED) next.velocity.x = MAX_RUN_SPEED;
  if (next.velocity.x < -MAX_RUN_SPEED) next.velocity.x = -MAX_RUN_SPEED;

  resolveHorizontal(next, map, next.velocity.x * dt, hits);
  resolveVertical(next, map, next.velocity.y * dt, input.drop, hits);

  return { player: next, hits };
}

function getOverlapX(a: Rect, b: Rect): number {
  const overlapRight = Math.min(a.x + a.width, b.x + b.width);
  const overlapLeft = Math.max(a.x, b.x);
  return Math.max(0, overlapRight - overlapLeft);
}

function isInKickRange(kicker: PlayerState, target: PlayerState): boolean {
  const kr = playerRect(kicker);
  const tr = playerRect(target);
  const rangeRect: Rect = {
    x: kicker.facing > 0 ? kr.x : kr.x - KICK_RANGE_PX,
    y: kr.y - 4,
    width: PLAYER_WIDTH + KICK_RANGE_PX,
    height: PLAYER_HEIGHT + 8
  };
  return rectsOverlap(rangeRect, tr);
}

function applyKickHit(kicker: PlayerState, target: PlayerState): void {
  const force = kicker.grounded ? KICK_FORCE_GROUND : KICK_FORCE_AIR;
  const dir = kicker.facing;
  target.velocity.x = dir * force;
  // Small upward bump for readability
  if (target.velocity.y > -60) target.velocity.y = -60;
  target.kickInvulnerable = KICK_HIT_INVULNERABLE_SECONDS;
}

export function applyPlayerInteractions(players: PlayerState[], dt: number): PlayerInteractionEvent[] {
  const events: PlayerInteractionEvent[] = [];

  for (let i = 0; i < players.length; i++) {
    const a = players[i];
    if (!a) continue;
    for (let j = i + 1; j < players.length; j++) {
      const b = players[j];
      if (!b) continue;

      const ar = playerRect(a);
      const br = playerRect(b);

      // Passive push when AABBs overlap
      if (rectsOverlap(ar, br)) {
        const overlapX = getOverlapX(ar, br);
        const centerA = ar.x + ar.width / 2;
        const centerB = br.x + br.width / 2;

        if (Math.abs(centerA - centerB) > 0.5) {
          const pushDir = centerA < centerB ? -1 : 1;
          const airFactor = (a.grounded && b.grounded) ? 1.0 : AIR_PUSH_FACTOR;
          const impulse = Math.min(overlapX * 15 * airFactor, PLAYER_MAX_PUSH_VELOCITY);

          a.velocity.x += pushDir * impulse * dt * PLAYER_PUSH_FORCE / PLAYER_MAX_PUSH_VELOCITY;
          b.velocity.x -= pushDir * impulse * dt * PLAYER_PUSH_FORCE / PLAYER_MAX_PUSH_VELOCITY;

          a.velocity.x = Math.max(-PLAYER_MAX_PUSH_VELOCITY, Math.min(PLAYER_MAX_PUSH_VELOCITY, a.velocity.x));
          b.velocity.x = Math.max(-PLAYER_MAX_PUSH_VELOCITY, Math.min(PLAYER_MAX_PUSH_VELOCITY, b.velocity.x));
        }
      }

      // Active kick
      if (a.kickPhase === "active" && b.kickInvulnerable <= 0 && isInKickRange(a, b)) {
        applyKickHit(a, b);
        events.push({ type: "PLAYER_KICK_HIT", playerId: a.id, targetId: b.id });
      }
      if (b.kickPhase === "active" && a.kickInvulnerable <= 0 && isInKickRange(b, a)) {
        applyKickHit(b, a);
        events.push({ type: "PLAYER_KICK_HIT", playerId: b.id, targetId: a.id });
      }
    }
  }

  return events;
}
