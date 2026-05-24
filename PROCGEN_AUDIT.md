# Procgen Audit

Generated: 2026-05-24

## Current behavior
- Intra-chunk generation is deterministic and produces entry, exit, route platforms, hazards, and right-lane relics.
- Existing reachability validator checks platforms inside a single chunk.
- Every chunk writes a full-width solid floor row.

## Expected behavior
- Endless upward traversal with no full-width blockers, no solid horizontal walls, and passable chunk boundaries.
- Validation covers both intra-chunk and cross-chunk flow.

## Root cause
- The generator treats every chunk as self-contained. When stacked, upper chunk floors become ceilings over previous chunks.

## Affected files/functions
- `packages/shared/src/generation.ts`: `generateVerticalChunk`, `createMultiChunkTileMap`, `verifyChunkReachability`
- `tests/shared/generation.test.ts`

## Proposed fix
- Only chunk 0 should have a true solid floor.
- Add cross-chunk tests asserting no full-width solid blocker exists above chunk 0.
- Add cross-chunk reachability validation helper in a follow-up.

## Risk level
High. This directly affects world traversal and death/fall behavior.

## Verification method
- Generate thousands of chunks.
- Assert no blocking full-width rows above chunk 0.
- Simulate/validate transition from chunk N exit to chunk N+1 entry.
