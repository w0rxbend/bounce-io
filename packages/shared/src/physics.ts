import {
  AIR_ACCELERATION,
  AIR_PUSH_FACTOR,
  COYOTE_TIME_SECONDS,
  FATAL_FALL_DISTANCE_PX,
  GAME_REWARD_CONFIG,
  GRAVITY,
  GROUND_FRICTION,
  HAZARD_HIT_INVULNERABLE_SECONDS,
  HIT_STUN_SECONDS,
  JUMP_BUFFER_SECONDS,
  JUMP_SPEED,
  KICK_ACTIVE_SECONDS,
  KICK_FORCE_AIR,
  KICK_FORCE_GROUND,
  KICK_HIT_INVULNERABLE_SECONDS,
  KICK_RANGE_PX,
  KICK_RECOVERY_SECONDS,
  KICK_WINDUP_SECONDS,
  MAX_DELTA_SECONDS,
  MAX_FALL_SPEED,
  MELEE_ATTACK_COOLDOWN_SECONDS,
  MOVE_ACCELERATION,
  MAX_RUN_SPEED,
  PLAYER_BASE_AIR_CONTROL,
  PLAYER_BASE_ATTACK_SPEED,
  PLAYER_BASE_DAMAGE,
  PLAYER_BASE_JUMP_POWER,
  PLAYER_BASE_KNOCKBACK_RESISTANCE,
  PLAYER_BASE_MOVEMENT_SPEED,
  PLAYER_HEIGHT,
  PLAYER_MAX_HEALTH,
  PLAYER_MAX_PUSH_VELOCITY,
  PLAYER_PUSH_FORCE,
  PLAYER_WIDTH,
  RESPAWN_INVULNERABILITY_SECONDS,
  SHORT_HOP_CUTOFF,
  TILE_SIZE
} from "./constants.js";
import type { CollectibleKind, CollisionHit, GeneratedChunk, HazardKind, KickPhase, PlayerId, PlayerInput, PlayerState, Rect, StepResult, TileMap } from "./types.js";

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
    stunTimer: 0,
    checkpointChunkY: 0,
    coins: 0,
    health: PLAYER_MAX_HEALTH,
    maxHealth: PLAYER_MAX_HEALTH,
    damage: PLAYER_BASE_DAMAGE,
    attackSpeed: PLAYER_BASE_ATTACK_SPEED,
    jumpPower: PLAYER_BASE_JUMP_POWER,
    airControl: PLAYER_BASE_AIR_CONTROL,
    knockbackResistance: PLAYER_BASE_KNOCKBACK_RESISTANCE,
    movementSpeed: PLAYER_BASE_MOVEMENT_SPEED,
    level: 1,
    relics: 0,
    crystals: 0,
    relicFragments: 0,
    fallStartY: null
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function diminishingBonus(stacks: number, firstStackValue: number, decay: number): number {
  let total = 0;
  for (let i = 0; i < stacks; i++) {
    total += firstStackValue / (1 + i * decay);
  }
  return total;
}

function recalculateMovementProgression(player: PlayerState): void {
  const jumpBonus = diminishingBonus(player.crystals, 0.018, 0.42);
  const airBonus = diminishingBonus(player.crystals, 0.007, 0.5);
  player.jumpPower = Math.min(1.22, PLAYER_BASE_JUMP_POWER + jumpBonus);
  player.airControl = Math.min(1.1, PLAYER_BASE_AIR_CONTROL + airBonus);
}

function recalculateAttackProgression(player: PlayerState): void {
  const damageBonus = diminishingBonus(player.relicFragments, 0.035, 0.32);
  const speedBonus = diminishingBonus(player.relicFragments, 0.014, 0.36);
  player.damage = Math.min(1.45, PLAYER_BASE_DAMAGE + damageBonus);
  player.attackSpeed = Math.min(1.28, PLAYER_BASE_ATTACK_SPEED + speedBonus);
}

export function xpRequiredForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.max(1, Math.round(GAME_REWARD_CONFIG.xpPerLevelBase * Math.pow(GAME_REWARD_CONFIG.xpPerLevelGrowth, safeLevel - 1)));
}

export function addPlayerXp(player: PlayerState, amount: number): number {
  const gained = Math.max(0, Math.floor(amount));
  if (gained <= 0) return 0;

  player.relics += gained;
  while (player.relics >= xpRequiredForLevel(player.level)) {
    player.relics -= xpRequiredForLevel(player.level);
    player.level += 1;
    if (player.level % 2 === 0) {
      player.maxHealth = Math.min(9, player.maxHealth + 1);
      player.health = Math.min(player.maxHealth, player.health + 1);
    }
  }
  recalculateAttackProgression(player);
  return gained;
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

function stepKick(phase: KickPhase, kickTimer: number, kickCooldown: number, kicked: boolean, dt: number, cooldownSeconds: number): {
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
    c = cooldownSeconds;
  } else if (p === "idle") {
    t = 0; // don't accumulate idle timer
  }

  return { phase: p, kickTimer: t, kickCooldown: c };
}

function overlappedHazard(map: TileMap, player: PlayerState): boolean {
  if (!map.getTile) return false;
  const rect = playerRect(player);
  const [left, right] = tileRange(rect.x, rect.x + rect.width);
  const [top, bottom] = tileRange(rect.y, rect.y + rect.height);

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (map.getTile(x, y) === "hazard") return true;
    }
  }
  return false;
}

export function isPlayerDead(player: PlayerState): boolean {
  return player.health <= 0;
}

export function applyDamage(
  player: PlayerState,
  amount: number,
  knockbackX = 0,
  knockbackY = 0,
  stunSeconds = HIT_STUN_SECONDS
): void {
  if (player.invulnerable > 0 || player.health <= 0) return;
  const resistance = clamp(player.knockbackResistance, 0, 0.75);
  player.health = Math.max(0, player.health - Math.max(0, amount));
  player.velocity.x += knockbackX * (1 - resistance);
  player.velocity.y += knockbackY * (1 - resistance);
  player.stunTimer = Math.max(player.stunTimer, stunSeconds);
}

export function applyHazardHit(player: PlayerState, kind: HazardKind = "spikeTrap", direction: -1 | 1 = player.facing === 1 ? -1 : 1): void {
  if (player.invulnerable > 0 || player.health <= 0) return;

  switch (kind) {
    case "fallingIcicle":
      applyDamage(player, 2, direction * 170, -95, 0.20);
      break;
    case "windGust":
      player.velocity.x += direction * 260 * (1 - clamp(player.knockbackResistance, 0, 0.75));
      player.stunTimer = Math.max(player.stunTimer, 0.08);
      break;
    case "lightningRune":
      applyDamage(player, 3, direction * 130, -120, 0.45);
      break;
    case "crumblingPlatform":
      applyDamage(player, 0, 0, 0, 0);
      break;
    case "spikeTrap":
    default:
      applyDamage(player, 1, direction * 120, -85, 0.14);
      break;
  }
  player.invulnerable = Math.max(player.invulnerable, HAZARD_HIT_INVULNERABLE_SECONDS);
}

function windZoneSeed(chunk: GeneratedChunk, zone: GeneratedChunk["windZones"][number]): number {
  return (chunk.seed ^ (chunk.chunkY * 73_856_093) ^ (zone.x * 19_349_663) ^ (zone.y * 83_492_791)) >>> 0;
}

function windGustMultiplier(seed: number, timeSeconds: number, bounds: Rect): number {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const primary = Math.sin(timeSeconds * 2.15 + seed * 0.000_31) * 0.5 + 0.5;
  const choppy = Math.sin(timeSeconds * 5.4 + centerY * 0.08 + seed * 0.000_17) * 0.5 + 0.5;
  const lane = Math.sin(centerY * 0.16 + centerX * 0.035 + seed * 0.000_09) * 0.5 + 0.5;
  const lull = Math.sin(timeSeconds * 1.3 + centerY * 0.11 + seed * 0.000_23) < -0.38;
  const base = lull ? 0.16 : 0.42;
  return clamp(base + primary * 0.9 + choppy * 0.28 + lane * 0.22, 0.12, lull ? 0.55 : 1.65);
}

export function applyWindZones(player: PlayerState, chunks: Iterable<GeneratedChunk>, deltaSeconds: number, timeSeconds = 0): boolean {
  if (player.health <= 0) return false;
  const dt = Math.min(Math.max(deltaSeconds, 0), MAX_DELTA_SECONDS);
  const bounds = playerRect(player);
  let pushed = false;

  for (const chunk of chunks) {
    for (const zone of chunk.windZones ?? []) {
      const zoneRect: Rect = {
        x: zone.x * TILE_SIZE,
        y: (chunk.worldTileY + zone.y) * TILE_SIZE,
        width: zone.width * TILE_SIZE,
        height: zone.height * TILE_SIZE
      };
      if (!rectsOverlap(bounds, zoneRect)) continue;

      const gust = windGustMultiplier(windZoneSeed(chunk, zone), timeSeconds, bounds);
      const targetVelocity = zone.direction * Math.min(MAX_RUN_SPEED * 1.45, zone.strength * 0.55 * gust);
      player.velocity.x = moveToward(player.velocity.x, targetVelocity, zone.strength * (2.2 + gust * 3.0) * dt);
      player.velocity.x = clamp(player.velocity.x, -MAX_RUN_SPEED * 1.45, MAX_RUN_SPEED * 1.45);
      pushed = true;
    }
  }

  return pushed;
}

export function applyCollectible(player: PlayerState, kind: CollectibleKind, xpValue: number = GAME_REWARD_CONFIG.xpCollectibleValue): number {
  switch (kind) {
    case "coin":
    case "xp":
      break;
    case "smallHeart":
      player.health = Math.min(player.maxHealth, player.health + 1);
      break;
    case "bigHeart":
      player.health = player.maxHealth;
      break;
    case "blueCrystal":
      player.crystals += 1;
      recalculateMovementProgression(player);
      break;
    case "greenCrystal":
      player.health = Math.min(player.maxHealth, player.health + 1);
      break;
    case "purpleCrystal":
      player.crystals += 1;
      recalculateMovementProgression(player);
      break;
    case "relic":
    default: {
      player.relicFragments += 1;
      recalculateAttackProgression(player);
      break;
    }
  }
  return addPlayerXp(player, xpValue);
}

export function collectibleKindForRelicId(id: string): CollectibleKind {
  if (id.startsWith("drop:")) {
    if (id.includes(":heart:")) return "smallHeart";
    if (id.includes(":jump:")) return "purpleCrystal";
    if (id.includes(":relic:")) return "relic";
    if (id.includes(":xp:")) return "xp";
  }
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  if (hash % 17 === 0) return "bigHeart";
  if (hash % 7 === 0) return "smallHeart";
  if (hash % 3 === 0) return "purpleCrystal";
  return "relic";
}

export function respawnPlayerState(player: PlayerState, x: number, y: number, checkpointChunkY: number): void {
  player.position.x = x;
  player.position.y = y;
  player.velocity.x = 0;
  player.velocity.y = 0;
  player.grounded = false;
  player.coyoteTimer = 0;
  player.jumpBufferTimer = 0;
  player.kickPhase = "idle";
  player.kickTimer = 0;
  player.kickCooldown = 0;
  player.kickInvulnerable = 0;
  player.invulnerable = RESPAWN_INVULNERABILITY_SECONDS;
  player.stunTimer = 0;
  player.health = player.maxHealth;
  player.fallStartY = null;
  player.checkpointChunkY = checkpointChunkY;
}

export function stepPlayer(player: PlayerState, input: PlayerInput, map: TileMap, deltaSeconds: number): StepResult {
  const dt = Math.min(Math.max(deltaSeconds, 0), MAX_DELTA_SECONDS);

  const kick = stepKick(
    player.kickPhase,
    player.kickTimer,
    player.kickCooldown,
    input.kick,
    dt,
    MELEE_ATTACK_COOLDOWN_SECONDS / clamp(player.attackSpeed, 0.25, 3)
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
    invulnerable: Math.max(0, player.invulnerable - dt),
    stunTimer: Math.max(0, player.stunTimer - dt)
  };

  const hits: CollisionHit[] = [];

  // Horizontal movement (lock during windup/active/recovery)
  const locked = next.kickPhase !== "idle" || next.stunTimer > 0 || next.health <= 0;
  const direction = locked ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const maxRunSpeed = MAX_RUN_SPEED * clamp(next.movementSpeed, 0.5, 2);
  const jumpSpeed = JUMP_SPEED * clamp(next.jumpPower, 0.5, 1.8);

  if (direction !== 0) {
    next.facing = direction > 0 ? 1 : -1;
    const acceleration = next.grounded
      ? MOVE_ACCELERATION * clamp(next.movementSpeed, 0.5, 2)
      : AIR_ACCELERATION * clamp(next.airControl, 0.5, 2);
    next.velocity.x = moveToward(next.velocity.x, direction * maxRunSpeed, acceleration * dt);
  } else if (next.grounded) {
    next.velocity.x = moveToward(next.velocity.x, 0, GROUND_FRICTION * dt);
  }

  // Jump
  if (next.jumpBufferTimer > 0 && (next.grounded || next.coyoteTimer > 0)) {
    next.velocity.y = -jumpSpeed;
    next.grounded = false;
    next.coyoteTimer = 0;
    next.jumpBufferTimer = 0;
  }

  // Short-hop cut
  if (!input.jumpHeld && next.velocity.y < -jumpSpeed * SHORT_HOP_CUTOFF) {
    next.velocity.y = -jumpSpeed * SHORT_HOP_CUTOFF;
  }

  // Gravity
  next.velocity.y = Math.min(next.velocity.y + GRAVITY * dt, MAX_FALL_SPEED);

  // Clamp horizontal
  if (next.velocity.x > maxRunSpeed) next.velocity.x = maxRunSpeed;
  if (next.velocity.x < -maxRunSpeed) next.velocity.x = -maxRunSpeed;

  resolveHorizontal(next, map, next.velocity.x * dt, hits);
  resolveVertical(next, map, next.velocity.y * dt, input.drop, hits);

  if (overlappedHazard(map, next) && next.invulnerable <= 0) {
    const hazardDir: -1 | 1 = next.velocity.x >= 0 ? -1 : 1;
    applyHazardHit(next, "spikeTrap", hazardDir);
  }

  if (!next.grounded && next.velocity.y > 0) {
    next.fallStartY = next.fallStartY ?? player.position.y;
    if (next.fallStartY !== null && next.position.y - next.fallStartY > FATAL_FALL_DISTANCE_PX && next.invulnerable <= 0) {
      next.health = 0;
    }
  } else if (next.grounded) {
    if (next.fallStartY !== null && next.position.y - next.fallStartY > FATAL_FALL_DISTANCE_PX && next.invulnerable <= 0) {
      next.health = 0;
    }
    next.fallStartY = null;
  } else if (next.velocity.y <= 0) {
    next.fallStartY = null;
  }

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
  applyDamage(target, kicker.damage, dir * force, target.velocity.y > -60 ? -60 : 0, HIT_STUN_SECONDS);
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
