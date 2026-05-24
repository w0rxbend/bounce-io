import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import test from "node:test";
import { GAME_VERSION, PROTOCOL_VERSION } from "../../packages/shared/src/constants.js";
import type { ServerMessage } from "../../packages/shared/src/protocol.js";

const TEST_TIMEOUT_MS = 8_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(port: number, proc: ChildProcessWithoutNullStreams): Promise<void> {
  const deadline = Date.now() + TEST_TIMEOUT_MS;
  let stderr = "";
  proc.stderr.on("data", (chunk) => { stderr += String(chunk); });

  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`server exited early with ${proc.exitCode}: ${stderr}`);
    }

    try {
      const response = await fetch(`http://localhost:${port}/`);
      if (response.ok) return;
    } catch {
      // Server is still booting.
    }

    await wait(50);
  }

  throw new Error(`server did not become ready on port ${port}: ${stderr}`);
}

function nextMessage(ws: WebSocket): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      cleanup();
      try {
        resolve(JSON.parse(String(event.data)) as ServerMessage);
      } catch (error) {
        reject(error);
      }
    };
    const onError = () => {
      cleanup();
      reject(new Error("websocket error"));
    };
    const cleanup = () => {
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("error", onError);
    };
    ws.addEventListener("message", onMessage, { once: true });
    ws.addEventListener("error", onError, { once: true });
  });
}

async function connectPlayer(port: number, room: string, name: string): Promise<{ ws: WebSocket; welcome: ServerMessage }> {
  const ws = new WebSocket(`ws://localhost:${port}/ws?room=${room}`);
  await once(ws, "open");
  ws.send(JSON.stringify({
    type: "hello",
    protocol: PROTOCOL_VERSION,
    version: GAME_VERSION,
    name
  }));
  const welcome = await nextMessage(ws);
  return { ws, welcome };
}

async function waitForSnapshotWithPlayers(ws: WebSocket, count: number): Promise<ServerMessage> {
  const deadline = Date.now() + TEST_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const message = await nextMessage(ws);
    if (message.type === "snapshot" && message.players.length >= count) {
      return message;
    }
  }
  throw new Error(`did not receive snapshot with ${count} players`);
}

test("live websocket server accepts two players in the same room and broadcasts snapshots", async (t) => {
  const port = 19_000 + Math.floor(Math.random() * 10_000);
  const proc = spawn(process.execPath, ["--import", "tsx", "apps/server/src/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      PATH: `/home/worxbend/.nvm/versions/node/v26.1.0/bin:${process.env["PATH"] ?? ""}`
    }
  });

  t.after(() => {
    proc.kill();
  });

  await waitForServer(port, proc);

  const room = `smoke-${Date.now()}`;
  const first = await connectPlayer(port, room, "One");
  const second = await connectPlayer(port, room, "Two");
  t.after(() => {
    first.ws.close();
    second.ws.close();
  });

  assert.equal(first.welcome.type, "welcome");
  assert.equal(second.welcome.type, "welcome");
  if (first.welcome.type === "welcome" && second.welcome.type === "welcome") {
    assert.notEqual(first.welcome.playerId, second.welcome.playerId);
    assert.equal(Number.isInteger(first.welcome.seed), true);
    assert.equal(first.welcome.seed, second.welcome.seed);
  }

  const snapshot = await waitForSnapshotWithPlayers(first.ws, 2);
  assert.equal(snapshot.type, "snapshot");
  if (snapshot.type === "snapshot") {
    assert.equal(snapshot.players.length, 2);
    assert.equal(Object.keys(snapshot.lastProcessedSeq).length, 2);
  }
}, { timeout: TEST_TIMEOUT_MS + 2_000 });
