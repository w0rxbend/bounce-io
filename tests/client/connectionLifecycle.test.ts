import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_AUTOMATIC_RECONNECT_ATTEMPTS,
  SOCKET_READ_DEADLINE_MS,
  nextReconnect,
  reconnectDelayMs,
  roomIdForReconnectTimer,
  socketReadDeadlineExceeded,
} from "../../apps/client/src/connectionLifecycle.js";

test("reconnect backoff is bounded and monotonic", () => {
  const delays = Array.from({ length: 10 }, (_, index) => reconnectDelayMs(index + 1));
  assert.deepEqual(delays.slice(0, 6), [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]);
  assert.ok(delays.every((delay, index) => index === 0 || delay >= delays[index - 1]!));
  assert.ok(delays.every((delay) => delay <= 30_000));
});

test("automatic reconnect uses the live room, not the room captured at connect", () => {
  assert.equal(roomIdForReconnectTimer("room-9", "auto"), "room-9");
  assert.equal(roomIdForReconnectTimer("room-9", "demo"), "room-9");
});

test("a silent socket crosses the read deadline and a fresh pong does not", () => {
  const openedAt = 1_000;
  assert.equal(socketReadDeadlineExceeded(openedAt + SOCKET_READ_DEADLINE_MS, openedAt), false);
  assert.equal(socketReadDeadlineExceeded(openedAt + SOCKET_READ_DEADLINE_MS + 1, openedAt), true);
  assert.equal(socketReadDeadlineExceeded(openedAt + SOCKET_READ_DEADLINE_MS + 1, 0), false);
  assert.equal(SOCKET_READ_DEADLINE_MS, 10_000);
});

test("automatic reconnect becomes actionable offline state after its budget", () => {
  let attempt = 0;
  for (let i = 0; i < MAX_AUTOMATIC_RECONNECT_ATTEMPTS; i++) {
    const next = nextReconnect(attempt, true);
    assert.equal(next.status, "reconnecting");
    assert.ok(next.delayMs !== null);
    attempt = next.attempt;
  }
  assert.deepEqual(nextReconnect(attempt, true), { status: "offline", attempt, delayMs: null });
  assert.equal(nextReconnect(0, false).status, "offline");
});
