# World Generation Redesign

## Current Algorithm Analysis

The migrated Go generator produced one short climb per chunk:

- entry platform near the bottom;
- five repeated rows at fixed heights;
- a center-biased spine;
- optional side platforms;
- frequent jump pads;
- one relic;
- one enemy;
- portal/checkpoint effectively every chunk.

That made the world readable, but too uniform. The path almost always converged near the center, checkpoints were minutes apart only on paper, jump pads solved too many traversal problems, and collectibles did not pull players into side space.

## Redesign Rules

- A checkpoint is now an Arc Portal.
- Arc Portals appear every 4-5 chunks, making checkpoint distance 4x-5x longer.
- Non-portal chunks are traversal space, not respawn milestones.
- Regions are generated as macro sections with explicit entry/exit portals.
- Each region has a distinct route shape, enemy flavor, collectible rhythm, and landmark identity.
- Every chunk keeps a guaranteed normal-jump route, while branches create 2-4 playable choices.
- Jump pads are rare shortcuts and never appear on checkpoint chunks.
- Collectibles are clustered along routes, detours, and caches.

## Generation Pipeline

```text
Seed
  -> RegionPlan
  -> RouteGraph
  -> Platforms
  -> Portals
  -> Collectibles
  -> JumpPads
  -> Enemies
  -> WorldState
  -> ClientRenderData
```

The Go server builds the `RegionPlan` first. The plan owns the region ID, length, portal style, landmark, route graph, platforms, collectibles, rare shortcut pads, enemies, and serialized client metadata. The PixiJS client renders gameplay objects from that server-authored chunk data.

## Regions

| Region | Landmark | Length | Silhouette | Route Flavor |
| --- | --- | --- | --- | --- |
| Floating Garden | Giant tree | 4 chunks | wide, leafy, braided | gentle parallel routes and canopy side islands |
| Ancient Ruins | Broken ruin gate | 4 chunks | broken, stepped | ruined bridge paths and offset stair climbs |
| Crystal Heights | Crystal tower | 5 chunks | tall, vertical | side tower climbs and crystal cache pockets |
| Mechanical Skyworks | Crashed airship | 4 chunks | wide decks | horizontal bridges and parallel machine lanes |
| Storm Islands | Storm generator | 5 chunks | sparse, fragmented | risky jumps and split island chains |
| Celestial Sanctuary | Celestial shrine | 5 chunks | spiral, high-altitude | rotating center/side spiral routes |

## Topology Diagrams

Legend: `P` portal checkpoint, `S` safe route, `R` risk route, `C` collectible cache, `J` rare shortcut jump pad.

### Region Scale

Seed `demo` topology, first cycle:

```text
P0  Floating Garden / living-tree-gate
│
├─ chunk 1: route split + first detours
├─ chunk 2: region challenge + collectible branches
├─ chunk 3: high-risk shortcut / rare jump pad
│
P4  Ancient Ruins / ruin-arch
│
├─ chunk 5: broken bridge route + relic side path
├─ chunk 6: offset ruin climb + hidden chamber
├─ chunk 7: landmark approach + rare shortcut
│
P8  Crystal Heights / crystal-gateway
│
├─ chunk 9: tower base split
├─ chunk 10: crystal cache side shafts
├─ chunk 11: vertical contest platforms
├─ chunk 12: high-risk upper branch
│
P13 Mechanical Skyworks / sky-beacon
```

### Example Chunk Shape

```text
        P/Exit lane
      S─────R
    C   S
  R─────S────C
    S       R
 Entry / previous portal
```

### Multiplayer Spread

```text
Player A: safe lane      Entry → S → S → S → Portal
Player B: relic route    Entry → R → C → R → Portal
Player C: shortcut       Entry → S → J → high branch → Portal
Player D: hidden cache   Entry → side island → C → reconnect
```

## Gameplay Impact

- Checkpoints now feel like completing a region instead of stepping onto the next row.
- Players naturally separate because safe, risk, cache, and shortcut routes coexist.
- Collectible clusters make exploration visible and rewarding.
- Rare jump pads become memorable movement opportunities instead of mandatory elevators.
- Landmarks and region names give players navigation anchors.
- Replayability improves because each region changes macro shape instead of repeating a center stack.

## Implementation Notes

- Multiplayer source of truth remains the Go generator.
- The client renders authoritative chunks received from the server.
- The PixiJS client spawns Arc Portals from server `portal` metadata.
- Chunk payloads include `regionId`, `regionName`, `checkpoint`, `portal`, `landmarks`, and `routes`.
- Legacy decorative checkpoint markers were removed from chunk dressing.
- The F1 debug overlay shows region boundaries, route branches, portal trigger bounds, platform collision boxes, collectible pickup bounds, jump pad trigger bounds, and object IDs.
- The server debug dump exposes region, landmark, checkpoint, collision boxes, trigger boxes, and enemy patrol data.

## Regression Coverage

- Reachability across generated chunks.
- 4-5 chunk checkpoint intervals.
- 3x-5x collectible density target.
- Jump pads rare and absent from checkpoint chunks.
- Portal metadata and gameplay objects included in chunk protocol.
- Region macro profiles present across the first full cycle.
