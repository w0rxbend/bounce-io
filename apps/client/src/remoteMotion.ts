import type { PlayerInput, PlayerState } from "@skybound/shared";

export function neutralRemoteInput(): PlayerInput {
  return {
    left: false,
    right: false,
    jumpPressed: false,
    jumpHeld: false,
    drop: false,
    kick: false,
    sequence: 0,
  };
}

export function remoteRenderState(authoritative: PlayerState, simulated: PlayerState): PlayerState {
  if (simulated.health === authoritative.health && simulated.invulnerable === authoritative.invulnerable) {
    return simulated;
  }
  return {
    ...simulated,
    health: authoritative.health,
    invulnerable: authoritative.invulnerable,
  };
}
