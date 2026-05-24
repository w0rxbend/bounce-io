import {
  AIR_ACCELERATION,
  COYOTE_TIME_SECONDS,
  GRAVITY,
  GROUND_FRICTION,
  JUMP_BUFFER_SECONDS,
  JUMP_SPEED,
  MAX_FALL_SPEED,
  MAX_RUN_SPEED,
  MOVE_ACCELERATION,
  PLAYER_HEIGHT,
  PLAYER_WIDTH
} from "../constants.js";

export const PHYSICS = {
  gravity: GRAVITY,
  jumpVelocity: JUMP_SPEED,
  maxRunSpeed: MAX_RUN_SPEED,
  acceleration: MOVE_ACCELERATION,
  airAcceleration: AIR_ACCELERATION,
  friction: GROUND_FRICTION,
  airFriction: 0,
  coyoteTimeMs: COYOTE_TIME_SECONDS * 1000,
  jumpBufferMs: JUMP_BUFFER_SECONDS * 1000,
  maxFallSpeed: MAX_FALL_SPEED,
  playerWidth: 24,
  playerHeight: 28,
  playerCollisionWidth: PLAYER_WIDTH,
  playerCollisionHeight: PLAYER_HEIGHT
} as const;
