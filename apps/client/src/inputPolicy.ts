export type MovementInputPolicy = "live" | "neutral" | "pause";

export interface MovementInputPolicyState {
  spectator: boolean;
  hasLocalPlayer: boolean;
  mode: "local" | "online" | null;
  modalActive: boolean;
  connected: boolean;
  matchPlaying: boolean;
}

/** Online simulation must not stop at a choice modal: neutral sequenced input
 * releases the authoritative server's last held controls and keeps prediction
 * aligned. Local play may genuinely pause because it owns the simulation. */
export function movementInputPolicy(state: MovementInputPolicyState): MovementInputPolicy {
  if (state.spectator || !state.hasLocalPlayer) return "pause";
  if (state.mode === null) return "pause";
  if (state.mode === "local") return state.modalActive ? "pause" : "live";
  if (!state.connected || !state.matchPlaying) return "pause";
  return state.modalActive ? "neutral" : "live";
}
