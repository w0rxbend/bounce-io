import type { PlayerState } from "@skybound/shared";

export function withReplayedState<T extends { state: PlayerState }>(entry: T, replayed: PlayerState): T {
  return {
    ...entry,
    state: {
      ...replayed,
      position: { ...replayed.position },
      velocity: { ...replayed.velocity },
      selectedSkills: { ...(replayed.selectedSkills ?? {}) },
    },
  };
}
