export type ConnectionStatus = "local" | "connecting" | "online" | "reconnecting" | "offline";

export const MAX_AUTOMATIC_RECONNECT_ATTEMPTS = 6;
export const BASE_RECONNECT_DELAY_MS = 1_000;
export const MAX_RECONNECT_DELAY_MS = 30_000;

export function reconnectDelayMs(attempt: number): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(BASE_RECONNECT_DELAY_MS * 2 ** (safeAttempt - 1), MAX_RECONNECT_DELAY_MS);
}

export function nextReconnect(attempt: number, online: boolean): {
  status: "reconnecting" | "offline";
  attempt: number;
  delayMs: number | null;
} {
  if (!online || attempt >= MAX_AUTOMATIC_RECONNECT_ATTEMPTS) {
    return { status: "offline", attempt, delayMs: null };
  }
  const nextAttempt = attempt + 1;
  return { status: "reconnecting", attempt: nextAttempt, delayMs: reconnectDelayMs(nextAttempt) };
}
