# Principal-Engineer Review — Bounce IO

**Scope:** full codebase and game systems — deterministic physics, procedural world
generation, authoritative Go netcode, PixiJS client, skills/combat/progression — with
emphasis on **architecture and readiness for feature/mechanic expansion**.

**Method:** five parallel deep-dive reads (physics, generation, server, client, skills)
plus an orchestrator pass over docs, build/test health, constants parity, wire protocol,
domain model, and operational tooling. All findings cite `file:line`.

**Date:** 2026-07-22 · **Branch:** `main` (with a large uncommitted in-flight slice, +2,704 lines)

---

## 1. Executive Summary

Bounce IO is a **genuinely well-architected slice** with a few excellent load-bearing
decisions and three foundational gaps that will govern how expensive every future feature
is. It is not in trouble; it is at the inflection point where *content ambition has
outrun the primitives the simulation can express*.

**What is strong and must be preserved:**

- **Server actor-model-per-room** — one goroutine owns each `roomState`, external I/O via a
  command channel. Near-zero locking on game state, no classic data races. (`room.go:667`)
- **Full server authority + server-side re-validation** of every movement, pickup, chest,
  and PvP interaction. Cheat resistance is done right. (`server.go:404`, `room.go:1376/1463/1687/2170`)
- **Client prediction/reconciliation** is the best-engineered code in the repo: fixed-step
  accumulator, simulation-vs-visual position split, physics-based remote dead-reckoning,
  self-tuning interpolation delay. (`main.ts:11626/11739/12089`)
- **Operational maturity** unusual for this stage: pprof, structured logging, graceful
  shutdown, healthchecks, multi-arch Docker, a real latency/jitter/slow-client loadtest
  harness, and detailed per-room tick/backpressure metrics.
- **Disciplined refactor direction** — pure, unit-tested logic being extracted from the
  monolith (`inputPolicy`, `hudLayout`, `skillOfferQueue`, `cosmeticAssetRegistry`).
- **Health baseline is green:** Go tests pass, 115/115 TS tests pass, build clean.

**The one theme that dominates everything below:**

> **The game is implemented twice — TypeScript (client prediction + offline) and Go
> (authoritative server) — and nothing proves the two agree.** Physics, world generation,
> the skill registry, damage math, and every balance constant are hand-mirrored across two
> languages. They have **already silently diverged in measurable ways**, and reconciliation
> smoothing *masks* the drift rather than preventing it. Local play and online play are, in
> several respects, **different games.**

Layered on top of that are **three structural gaps that block the stated expansion goals:**

1. **No dynamic entity/collider layer** → blocks moving platforms, crumbling platforms,
   projectiles, ranged enemies, falling icicles, bosses.
2. **No effect / ability / status framework** → blocks active abilities, buffs, timed
   power-ups, consumables, status effects.
3. **No game-mode / objective seam** → blocks team modes and new win conditions.

The content *vocabulary* already exists (10 enemy kinds, 12 biomes, 5 hazard kinds, 6
platform archetypes in `types.ts`), but the *simulation primitives* to make them behave
distinctly do not. Closing the three gaps above — behind a parity harness — is what turns
each new feature from a multi-site dual-language edit into a data change.

**Verdict:** architecturally sound core, content-expansion-blocked middle layer. Invest in
foundations (parity harness, entity layer, effect/ability framework) *before* adding the
roadmap's content, or the drift and special-case surface will compound with every feature.

---

## 2. Cross-Cutting Architectural Findings

### 2.1 Dual-language duplication with no parity guard — **the master risk**

Five independent reviews converged on this. The same simulation is authored twice with only
human discipline keeping the copies aligned:

| Concern | TypeScript (client/offline) | Go (authoritative server) | Guard today |
|---|---|---|---|
| Movement/collision | `physics.ts:702` `stepPlayer` | `world.go:109` `StepPlayerAtTime` | none (only a wind *scalar* fixture) |
| World generation | `generation.ts:536` `generateVerticalChunk` | `world.go` `BuildRegionPlan` | none — **different algorithms & RNGs** |
| Skill registry/effects | `skills.ts:95/192` | `skills.go:68/153` | none |
| Damage/knockback | `physics.ts:356` `applyDamage` | `world.go:2015` `applyDamage` | none |
| Constants | `constants.ts` | `protocol.go:5-75` | none (hand-mirrored, comments only) |
| Wire messages | `protocol.ts` unions | `protocol.go` JSON | ✅ `protocol_compat_test.go` |

Only the wire protocol has a parity test. Concrete, already-shipped divergences found:

- **Physics:** horizontal speed clamp has different *scope* (TS clamps whenever
  `!dashActive`, `physics.ts:786`; Go clamps only while accelerating, `world.go:163`) — so
  dash-exit, knockback, and wind boosts persist on the server but get clamped on the client.
  Verified.
- **Damage:** TS keeps **float** HP and *adds* knockback with a `[0,0.75]` resistance clamp;
  Go uses **integer** HP (`ceil`) and *overwrites* horizontal velocity with a `0.2`-floored
  multiplier and applies post-hit i-frames the client never sets (`physics.ts:356` vs
  `world.go:2015`).
- **Progression:** crystal → jump/air-control/move-speed formulas are entirely different
  (Go integer step `world.go:2081-2086`; TS smooth diminishing `skills.ts:214-215`), so a
  crystal-holder literally jumps higher and runs faster on the server than the client
  predicts.
- **Skills:** Go `Damage` is an integer, so Heavy Hit stacks 1–4 round to 1 and do nothing
  online, while TS floats make the same card work offline.
- **Generation:** TS uses a stateful splitmix PRNG; Go uses stateless FNV-1a string hashes —
  byte-parity is *impossible by construction*, and difficulty curves/archetype selection/row
  sets all differ.

**None of these are caught by any test.** In predicted multiplayer this manifests as
constant reconciliation corrections and rubber-banding that the visual smoothing hides but
never fixes.

**The single highest-leverage investment in the codebase is a full-trajectory
cross-language conformance harness** (identical input+seed → assert bit-comparable
`position`/`velocity`/`grounded`/timers/HP each tick across Go and TS). It would have caught
every item above and is the precondition for safely evolving the shared sim.

The durable fix is to stop maintaining two implementations: make skills/constants **data**
(one JSON consumed by both), and either (a) make Go the *only* generator with the client
always rendering server chunks (the `WORLD_CONTRACT_AUDIT.md` recommendation, still not
done — `main.ts:3632` still runs the TS generator online), or (b) generate one language's
sim constants/formulas from the other.

### 2.2 No generic entity abstraction — the content-expansion barrier

On **both** client and server, every entity family (enemy, collectible, relic, chest,
portal, jump-pad) is a hand-rolled `Map` + spawn/update/clear/destroy quartet with bespoke
tick logic, AOI accessor, and binary-encoding code. There is no `Entity` interface, no
component model. Consequences:

- Adding an entity type is ~5 copy-pasted call sites per side (`room.go` tick passes +
  `binary_snapshot.go:170` code table; client `processSnapshotMessage` + `destroyChunkVisuals`).
- It is the top source of "forgot to clean up X" leaks — `binaryEntityIds` (`main.ts:169`)
  and `playerNames` (`main.ts:11178`) both grow unbounded because a despawn path missed a map.
- Enemies accumulate on the server forever (culled only by death, never by distance,
  `room.go:1760`), so a widely-traversed room simulates every enemy any player ever passed.

### 2.3 No effect/ability/status framework — the mechanic-expansion barrier

Skill *selection/offer/gating* is a clean data-driven framework
(`generateSkillCardOffer`/`availableSkills`). Skill *effects* are a hardcoded ~60-line
`recalculateSkillDerivedStats` duplicated in two languages, with several skills
(`vital_growth`, `shockwave_hit`, `double_jump`, `dash`, `last_stand`) special-cased inline
across the combat/movement loops. There is:

- **No timed-modifier / buff system.** The only "status" primitives are bespoke float
  timers (`StunTimer`, `Invulnerable`, `KickInvulnerable`) decremented by hand. A
  poison/slow/haste/shield-buff has nowhere to live.
- **No ability abstraction.** Active inputs are hardcoded booleans on `PlayerInput` consumed
  by inline `if` blocks; cooldown/duration are per-ability hand-rolled `PlayerState` fields
  (`dashUnlocked/dashCooldownMs/dashCooldownRemainingMs/dashTimerMs`).

`PlayerState` is already a **60-field god-struct** (`types.ts:303`) mixing input, physics,
kick, combat, progression, shield, and dash — mirrored by hand in Go. Every new mechanic
bloats it further.

### 2.4 No game-mode / objective / matchmaking / persistence seam

Match phase is a bare inline string machine in `tickRoom` (`room.go:862`). Win/rank is
height+timer only. Room selection is a raw `?room=` query string. All state is in-memory;
progression dies with the session. New modes, team play, alternate win conditions,
matchmaking, and any account/meta-progression are all greenfield.

### 2.5 Documentation drift (a milestone behind)

The design docs describe an earlier slice than the code implements:

- `CHUNK_WIDTH_TILES = 36` (world is 576px), but `GAME_DESIGN.md` / `BALANCE_TABLES.md` /
  `PLATFORM_RULES.md` all still say 24 tiles / 384px. The `/24.0` rescale in `world.go:1241`
  is the fossil of that change.
- `GAME_DESIGN.md` still lists hazard damage, wind, skills, enemies, chests as "not
  implemented" — all are live and test-covered. Its pillars still name a "Hono" server; the
  server is Go. `PROGRESSION_AND_DIFFICULTY.md` (newer) is the only doc reflecting reality.

Stale docs are a real hazard when the docs are the balance/placement contract.

---

## 3. Subsystem Assessments (condensed)

### 3.1 Physics (`physics.ts` / `world.go`)
Semi-implicit Euler, fixed 60 Hz, tile-grid AABB with two independent 1-D sweeps and faked
"capsule" corners (3px inset). Model is clean, readable, and tunnel-safe at 60 Hz. The
weakness is **parity** (§2.1): six ranked divergences, none tested. Latent risk: single-sample
collision + the `MAX_DELTA=1/15` clamp would tunnel (~49px jump-pad move) if `stepPlayer` is
ever driven with a large `dt` (no variable-dt caller today). Extensibility: double-jump/dash
are easy templates; wall-jump is moderate (wall-contact flag not persisted, Go resolver emits
no hits); moving platforms/ice/grapple are hard (static tile grid, no dynamic colliders,
single global friction).

### 3.2 World Generation (`generation.ts` / `world.go`)
Thoughtful design — region-first planning, route branching, altitude challenge budgets, and
**constructive** reachability on the Go side (`ensureReachability`). But two divergent
generators presented as one world (§2.1). **The client still generates locally in online mode**
(`main.ts:3632`), keeping the original desync bug (floating enemies / phantom platforms)
alive despite the "server-authoritative" fix. The TS generator has **no runtime reachability
guarantee** — `verifyChunkReachability` exists only for tests; it relies on opportunistic
jump-pad insertion and can strand relics/exits on wide-spread biomes. Declared-but-inert:
`crumblingPlatform`/`fallingIcicle`/`lightningRune` hazards and `hidden` routes/landmarks are
labels with no behavior.

### 3.3 Server / Netcode (`room.go`, `server.go`, `client.go`, `binary_snapshot.go`)
Actor model and authority are excellent (§1). Two critical issues: **(a) unbounded room
creation from untrusted `?room=` with no reaping** (`server.go:390/523`, `room.go:567`) — a
goroutine/memory DoS and permanent 60 Hz leak; **(b) per-tick chunk deep-cloning** — ~5,000
`GenerateChunk` calls/sec/room, each `cloneGeneratedChunk`-ing a full chunk *even on cache
hit* (`world.go:506`), behind a single global mutex that serializes all rooms. The "binary
delta" is **not a delta** — every visible entity is fully re-serialized each frame;
`baselineTick` is written but never diffed. Relic/chest ID lists are re-sent in full every
snapshot and grow unbounded. Reconnect/roster desync: `playerLeft` fires on drop but is never
reversed on reconnect, and peers lose returning players' names. No lag compensation (a
defensible design choice, but undocumented). Exact-equality version gate blocks staged rollouts.

### 3.4 Client (`main.ts` + extracted modules)
`main.ts` is 12,219 lines, executes on import, holds 114 module-level `let`s. The
prediction/interpolation layer is excellent; the liability is structure. Decomposition is
underway but "by testability, not by feature" — ~350 of 12k lines extracted. Perf exposure is
CPU/GC, not draw calls: `poseBodyRig` (120 Hz-substepped, 16 bones, terrain IK) runs per
visible remote per frame with no LOD gate; `interpRemotes` allocates fresh state objects (and
up to 8 `stepPlayer` clones) per remote per frame. Leaks: `binaryEntityIds` (unbounded +
32-bit hash-collision decode risk), `playerNames`. Bug: stale jump/kick edge input survives a
skill modal and fires an unintended jump on close (`main.ts:12175`). `Date.now()` used for the
interpolation clock (non-monotonic). Static chunk decor is well-handled (`cacheAsTexture`,
pooling, explicit culling).

### 3.5 Skills / Combat / Progression (`skills.ts` / `skills.go` / `room.go` / `world.go`)
Offer/gating is a clean framework with good cap discipline (every multiplier clamped). Effects
and enemy AI are special-case piles, doubled and drifting (§2.1, §2.3). Four unrelated
progression axes (XP/level, relic fragments, crystals, coins). All 10 enemy kinds share one
melee AI hard-pinned to `PlatformY-24` — `archer`/`iceBat`/`windSpirit` are cosmetic labels
with no ranged/flying behavior, and **no projectile system exists anywhere**. Balance
outlier: **Vital Growth is a free common card granting +90 HP on a 5-HP base.**

---

## 4. Concrete Bug Ledger (prioritized, verifiable)

### P0 — correctness / security / desync
| # | Bug | Location | Impact |
|---|---|---|---|
| 1 | Unbounded room creation from untrusted `?room=`, rooms never reaped | `server.go:390/523`, `room.go:567` | Goroutine/memory DoS; permanent 60 Hz leak |
| 2 | Client runs TS generator in online mode → world mismatch window | `main.ts:3632` | Floating enemies / phantom platforms / uncollectable relics |
| 3 | TS↔Go physics divergence (horizontal clamp scope) | `physics.ts:786` vs `world.go:163` | Persistent reconciliation corrections on dash/knockback/wind |
| 4 | TS↔Go `applyDamage` divergence (float vs int HP, add vs set knockback, resistance clamp, i-frames) | `physics.ts:356` vs `world.go:2015` | Different death frames & knockback online vs offline |
| 5 | Crystal progression formulas differ across languages | `skills.ts:214` vs `world.go:2081` | Crystal-holders jump higher / run faster on server than predicted |

### P1 — gameplay logic / leaks
| # | Bug | Location | Impact |
|---|---|---|---|
| 6 | Shockwave can never kill — `max(1, …)` health floor | `room.go:2037` | Epic skill can't finish enemies (likely meant `max(0,…)`) |
| 7 | Heavy Hit inert online — integer `Damage`, `round(1×1.4)=1` | `skills.go:173` | First 4 stacks do nothing online |
| 8 | Vital Growth = free common +90 HP on 5-HP base | `skills.ts:117` | Dominant, match-warping balance outlier |
| 9 | Banked level-up choices silently zeroed when none offerable | `room.go:1611` | Players lose earned skill picks |
| 10 | `binaryEntityIds` unbounded growth + 32-bit hash-collision decode | `main.ts:169/10677` | Long-session leak + wrong-entity binary decode |
| 11 | `playerNames` leaks on snapshot-based despawn | `main.ts:11178` | Stale names accumulate |
| 12 | `playerLeft` not reversed on reconnect; returning peer's name lost | `room.go:357` vs `206-218` | Roster desync after any reconnect |
| 13 | Stale jump/kick edge input survives skill modal → unintended jump | `main.ts:12175` | Input glitch after every level-up modal |
| 14 | Enemies never culled by distance (only by death) | `room.go:1760` | Unbounded per-tick sim growth with explored area |

### P2 — latent / cosmetic / hardening
| # | Bug | Location | Impact |
|---|---|---|---|
| 15 | Binary snapshot `serverTick/baselineTick/snapshotSeq` truncated to uint32 | `binary_snapshot.go:49` | Wraps after ~828 days of a never-restarted process |
| 16 | Full relic/chest ID lists re-sent every snapshot | `room.go:979/1025` | Snapshot size grows with exploration |
| 17 | Dead cap branch in HP-on-levelup (both branches = `+1`) | `world.go:2121` | Confusing intent; latent |
| 18 | `applyAuthoritativeSkillStats` `Object.assign` copies non-schema keys onto player | `main.ts:7615` | Latent footgun |
| 19 | TS generator has no runtime reachability guarantee | `generation.ts` | Strandable relics/exits on wide biomes |
| 20 | `MAX_DELTA` + single-sample collision = tunneling if ever driven with large `dt` | `physics.ts:791` | Latent (no variable-dt caller today) |

---

## 5. Architecture-for-Expansion Roadmap (the priority)

The stated goal is *extension and new game features / mechanics expansion*. The blunt reality
from all five reviews: **most roadmap features are blocked on missing primitives, not on
content effort.** Sequence the foundations first; then content is cheap and safe.

### Feature feasibility against the *current* architecture
| Roadmap feature | Difficulty now | Blocked on |
|---|---|---|
| New biome (visual + params) | Medium | ~12 hand-synced switch edits across TS+Go (§2.1) |
| New passive stat skill | Low–Med | Registry + `recalculateSkillDerivedStats` ×2 |
| New active ability | **High** | No ability/cooldown framework (§2.3) |
| Status effect / timed buff / consumable | **High** | No modifier/expiry system (§2.3) |
| Ranged enemy / new enemy AI | **High** | One shared melee AI; **no projectile system**; enemies ground-pinned |
| Moving / crumbling platform | **High** | Static tile grid; no dynamic collider (§2.2) |
| Boss encounter | **Very High** | Greenfield — no phases, multi-hitbox, off-platform, large HP |
| Functional portals / teleport | Medium | Portal data exists; teleport unimplemented |
| Team mode | **High** | No team concept; PvP/credit assume FFA (§2.4) |
| New win condition (CTF/KotH/elim) | **High** | No pluggable objective layer (§2.4) |
| Persistence / meta-progression | **High** | All state in-memory (§2.4) |

### Recommended sequencing

**Phase 0 — Foundations (do before any content):**
1. **Cross-language conformance harness.** Golden trajectory vectors for `stepPlayer` and the
   skill/damage math (§2.1). This is the single highest-ROI change; it de-risks every
   subsequent edit to the shared sim.
2. **Collapse the dual authority.** Skills + constants → one shared data file consumed by both
   languages; make Go the sole generator and stop client-side online generation (`main.ts:3632`).
   Target: local play and online play become the same game.
3. **Room lifecycle + chunk-clone fix.** Whitelist/cap rooms, reap idle rooms, and return
   shared read-only chunks to internal callers instead of deep-cloning per tick. Closes the
   DoS, the leak, the GC hot path, and the global-mutex serialization in one pass.

**Phase 1 — Extensibility primitives (unlock the roadmap):**
4. **Effect/modifier + ability framework.** Skills emit typed modifiers
   `{stat, op, value, cap}` and lifecycle hooks (`onHit/onTick/onDamaged`); a generic
   ability-slot (input → ability id → cooldown/duration/cast) replaces the bespoke dash/double-jump
   fields. Unlocks active abilities, buffs, timed power-ups, consumables, status effects — and
   folds the current special cases into one path.
5. **Generic entity + dynamic-collider layer.** One `Entity` interface (spawn/update/serialize/cull)
   on both sides, plus a dynamic-collider concept separate from the static tile grid. Unlocks
   moving/crumbling platforms, projectiles, ranged enemies, falling icicles, and is the base for
   bosses. Also eliminates the copy-paste leak class (§2.2).
6. **Enemy strategy interface.** Split the monolithic `stepServerEnemyBehavior` into per-kind
   behaviors and add the projectile/fly primitives that `archer/iceBat/windSpirit` already imply.
   Cheaper now (10 near-identical kinds) than after bosses pile on more special cases.

**Phase 2 — Modes & meta:**
7. **Mode/ruleset + objective interface** (extract the inline phase machine, `room.go:862`) →
   team modes, alternate win conditions.
8. **Persistence** for progression/cosmetics; **matchmaking** beyond raw room strings.

**Continuous:** fix the P0/P1 bug ledger (§4); refresh the design docs (§2.5); continue the
`main.ts` decomposition by extracting stateful subsystems (`NetClient`, `WorldRenderer`,
`LocalController`/`RemoteInterpolator`, `Hud`) behind the pure modules already carved out;
add actor-render LOD before shipping large lobbies.

---

## 6. Ten Things To Do First

1. Build the cross-language physics/skill **conformance harness** (§2.1, §5.1).
2. Stop client-side world generation in online mode (`main.ts:3632`) (Bug #2).
3. **Whitelist/cap + reap rooms**; stop untrusted `?room=` room spawning (Bug #1).
4. Return **shared read-only chunks** to internal callers; kill per-tick deep-clone (`world.go:506`).
5. Unify the **horizontal speed clamp** and **`applyDamage`** across TS/Go (Bugs #3, #4).
6. Unify **crystal progression** math; make Go damage a float or scale HP ×10 (Bugs #5, #7).
7. Fix **shockwave** `max(1,…)`→`max(0,…)` and **rebalance Vital Growth** (Bugs #6, #8).
8. Fix **reconnect roster** + the two client **leaks** (`binaryEntityIds`, `playerNames`) (Bugs #10–12).
9. Move skills + constants to **one shared data source** (§2.1).
10. Refresh `GAME_DESIGN.md` / `BALANCE_TABLES.md` / `PLATFORM_RULES.md` to match the code (§2.5).

---

*Appendix — evidence base: green build (Go + 115/115 TS tests); constants hand-mirrored
`constants.ts`↔`protocol.go`; one parity fixture (`wind-gust-parity.json`);
`protocol_compat_test.go` guards wire messages only; domain vocabulary in `types.ts`
(10 enemy kinds, 12 biomes, 5 hazard kinds, 6 archetypes) exceeds the simulation primitives
that back it.*
