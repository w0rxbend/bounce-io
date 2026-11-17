import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptedSnapshotRemovals,
  collectBinaryRemovalIds,
  stageSnapshotRemovals,
} from "../../apps/client/src/snapshotCommit.js";

test("a truncated removal list is not a commit", () => {
  assert.equal(collectBinaryRemovalIds([1, null], new Set(), () => "enemy-1"), null);
});

test("a stale or unparsed snapshot applies no removals", () => {
  const stale = { id: "stale" };
  stageSnapshotRemovals(stale, ["enemy-1"]);
  assert.deepEqual(acceptedSnapshotRemovals(stale, 4, 9, 4, 8), []);
  assert.deepEqual(acceptedSnapshotRemovals(null, 0, 0, 0, 0), []);
});

test("an accepted snapshot applies only ids parsed from the whole buffer", () => {
  const present = new Set<number>([7]);
  const ids = collectBinaryRemovalIds([7, 8, 9], present, (hash) => hash === 9 ? undefined : `id-${hash}`);
  assert.deepEqual(ids, ["id-8"]);
  const snapshot = { id: "fresh" };
  stageSnapshotRemovals(snapshot, ids ?? []);
  assert.deepEqual(acceptedSnapshotRemovals(snapshot, 5, 10, 4, 9), ["id-8"]);
  assert.deepEqual(acceptedSnapshotRemovals(snapshot, 6, 11, 5, 10), []);
});
