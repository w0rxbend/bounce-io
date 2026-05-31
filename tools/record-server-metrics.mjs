#!/usr/bin/env node

import { createWriteStream } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  const next = process.argv[i + 1];
  if (!next || next.startsWith("--")) {
    args.set(key, "true");
  } else {
    args.set(key, next);
    i++;
  }
}

const url = args.get("url") ?? "http://127.0.0.1:8787/metrics";
const intervalMs = Number(args.get("interval-ms") ?? 1000);
const durationMs = Number(args.get("duration-ms") ?? 30000);
const label = args.get("label") ?? "perf";
const outPath = args.get("out") ?? "";

if (!Number.isFinite(intervalMs) || intervalMs < 100) {
  throw new Error("--interval-ms must be at least 100");
}
if (!Number.isFinite(durationMs) || durationMs < intervalMs) {
  throw new Error("--duration-ms must be greater than or equal to --interval-ms");
}

const out = outPath ? createWriteStream(outPath, { flags: "a" }) : process.stdout;
const startedAt = Date.now();
let samples = 0;
let failures = 0;

function roomSummary(room) {
  const metrics = room?.metrics ?? {};
  const clients = Array.isArray(room?.clients) ? room.clients : [];
  return {
    id: room?.id,
    phase: room?.phase,
    tick: room?.tick,
    players: room?.players,
    activeClients: room?.activeClients,
    tickDurationAvgMs: metrics.tickDurationAvgMs,
    tickDurationMaxMs: metrics.tickDurationMaxMs,
    tickOverruns: metrics.tickOverruns,
    snapshotBuildAvgMs: metrics.snapshotBuildAvgMs ?? metrics.serializationAvgMs,
    snapshotSendAvgMs: metrics.snapshotSendAvgMs ?? metrics.broadcastDurationAvgMs,
    snapshotBytesAvg: metrics.snapshotBytesAvg,
    droppedOutboundMessages: metrics.droppedOutboundMessages,
    clients: clients.map((client) => ({
      playerId: client.playerId,
      queuedInputs: client.queuedInputs,
      queueDepth: client.metrics?.queueDepth,
      aoiPlayers: client.metrics?.aoiPlayers,
      aoiEnemies: client.metrics?.aoiEnemies,
      aoiCollectibles: client.metrics?.aoiCollectibles,
      bytesSentPerSecond: client.metrics?.bytesSentPerSecond,
      messagesSentPerSecond: client.metrics?.messagesSentPerSecond,
    })),
  };
}

async function sample() {
  const sampledAt = Date.now();
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  if (!response.ok) {
    const preview = text.trim().slice(0, 120);
    throw new Error(`${response.status} ${response.statusText}${preview ? `: ${preview}` : ""}`);
  }
  let snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch {
    const contentType = response.headers.get("content-type") ?? "";
    const preview = text.trim().replace(/\s+/g, " ").slice(0, 80);
    const kind = contentType || (text.trim().startsWith("<") ? "html" : "non-json");
    throw new Error(`metrics returned ${kind} from ${url}${preview ? `: ${preview}` : ""}`);
  }
  const record = {
    label,
    sampledAt,
    elapsedMs: sampledAt - startedAt,
    process: {
      goroutines: snapshot.process?.goroutines,
      heapAllocBytes: snapshot.process?.memory?.heapAllocBytes,
      lastGcPauseNs: snapshot.process?.memory?.lastGcPauseNs,
      numGc: snapshot.process?.memory?.numGc,
    },
    websocket: snapshot.websocket,
    rooms: Array.isArray(snapshot.rooms) ? snapshot.rooms.map(roomSummary) : [],
  };
  out.write(`${JSON.stringify(record)}\n`);
  samples++;
}

while (Date.now() - startedAt <= durationMs) {
  try {
    await sample();
  } catch (error) {
    failures++;
    const record = {
      label,
      sampledAt: Date.now(),
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
    out.write(`${JSON.stringify(record)}\n`);
  }
  await sleep(intervalMs);
}

if (out !== process.stdout) {
  await new Promise((resolve) => out.end(resolve));
}

console.error(`recorded ${samples} metrics samples with ${failures} failures from ${url}`);
