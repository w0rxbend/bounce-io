const stagedRemovals = new WeakMap<object, readonly string[]>();

export function collectBinaryRemovalIds(
  hashes: readonly (number | null)[],
  presentHashes: ReadonlySet<number>,
  idForHash: (hash: number) => string | undefined,
): string[] | null {
  const removalIds: string[] = [];
  for (const hash of hashes) {
    if (hash === null) return null;
    if (presentHashes.has(hash)) continue;
    const id = idForHash(hash);
    if (id === undefined) continue;
    removalIds.push(id);
  }
  return removalIds;
}

export function stageSnapshotRemovals(snapshot: object, removalIds: readonly string[]): void {
  stagedRemovals.set(snapshot, removalIds);
}

export function acceptedSnapshotRemovals(
  snapshot: object | null,
  snapshotSeq: number,
  tick: number,
  lastSnapshotSeq: number,
  serverTick: number,
): readonly string[] {
  if (snapshot === null || snapshotSeq <= lastSnapshotSeq || tick <= serverTick) return [];
  const removalIds = stagedRemovals.get(snapshot) ?? [];
  stagedRemovals.delete(snapshot);
  return removalIds;
}
