# Production Roadmap And Risk Plan

## Production Goals

| Goal | Target |
|---|---|
| Primary product | Polished pixel-art vertical mountain-climbing multiplayer platformer |
| Core fantasy | Race upward through colder, more magical biomes while collecting relics and avoiding hazards |
| Production principle | Build vertical slices early, keep playable builds frequent, protect polish time |
| Quality bar | 60 FPS with headroom, readable platforming, satisfying feedback, low-friction multiplayer |

## 1. Major Production Risks And Scope Traps

| # | Risk Or Anti-Pattern | Why It Hurts This Game | Prevention |
|---:|---|---|---|
| 1 | Asset volume without gameplay ownership | Hundreds of sprites can exist but remain unused, inconsistent, or decorative-only. | Every asset folder needs an in-game placement rule and owner. |
| 2 | Building too many mechanics before one full loop feels great | Vertical racers live or die on jump feel, checkpoint rhythm, and readable hazards. | Lock a vertical slice before expanding enemies, biomes, or upgrades. |
| 3 | Over-randomized procedural platforms | Randomness can destroy flow, fairness, and route learning. | Use authored templates with seeded variation and reachability validation. |
| 4 | PvP chaos before readability | Knockback combat can feel unfair if hit ranges, cooldowns, and recovery are unclear. | Add hit telegraphs, invulnerability windows, and combat playtests early. |
| 5 | Hazards that surprise instead of teach | Vertical games punish falls heavily, so surprise hazards create rage quits. | Telegraph every hazard and introduce each in a safe setup first. |
| 6 | Biome creep | Five biomes can become five unfinished games if each gets unique systems. | Reuse core traversal grammar, vary visuals and hazard density first. |
| 7 | Late networking fixes | Prediction, reconciliation, respawn, and combat authority are hard to retrofit. | Keep server authority and multiplayer smoke tests in every milestone. |
| 8 | Polish postponed until the end | Juice systems need hooks across physics, events, rendering, audio, and UI. | Reserve polish tracks in every sprint, not just launch month. |
| 9 | Unbounded live tuning | Too many exposed variables can make balance impossible to reason about. | Centralize tuning tables and limit edits to owned categories. |
| 10 | Performance debt from particles and decorations | Visual richness can quietly destroy frame time and memory. | Add culling, pooling, and frame-budget checks before beta. |
| 11 | Onboarding treated as tutorial text | The first 5 minutes need spatial teaching, not instructions. | Build Pine Valley as an onboarding level and test with fresh players. |
| 12 | No cut criteria | Teams keep half-working features because they are emotionally expensive. | Use a scoring gate: fun, readability, performance, scope, and retention. |

## 2. Phased Production Roadmap

```text
Month 1     Month 2     Month 3     Month 4     Month 5     Month 6     Month 7     Month 8
|-----------|-----------|-----------|-----------|-----------|-----------|-----------|-----------|
M1 Core     M2 Vertical  M3 Alpha    M4 Content  M5 Beta     M6 Polish   M7 RC      M8 Launch
Prototype   Slice        Systems     Complete    Lock        Lock        Cert       Live
```

| Milestone | Phase | Duration | Exit Goal |
|---|---|---:|---|
| M1 | Core Prototype | 3 weeks | Jumping, climbing, checkpoints, hazards, and multiplayer are playable in rough form. |
| M2 | Vertical Slice | 5 weeks | One polished 10-minute climb from Pine Valley to Snowfall Cliffs proves the loop. |
| M3 | Alpha Systems | 6 weeks | Full game systems exist end to end, even if content is rough. |
| M4 | Content Complete | 6 weeks | All planned biomes, assets, hazards, pickups, and level templates are represented. |
| M5 | Beta Lock | 4 weeks | Feature set is locked; focus shifts to bug fixing, balance, performance, and usability. |
| M6 | Polish Lock | 4 weeks | Juice, audio, camera, onboarding, and accessibility reach launch quality. |
| M7 | Release Candidate | 2 weeks | No known blocking bugs, stable multiplayer, shippable build. |
| M8 | Launch And Live Ops | ongoing | Launch, monitor, patch, tune, and prepare first event. |

## 3. Milestone Definitions And Must-Have Deliverables

### M1: Core Prototype

| Must-Have | Deliverable |
|---|---|
| Movement | Jump, coyote time, jump buffer, one-way platforms, fall death. |
| Multiplayer | Two players in same climb, snapshots, prediction, reconciliation. |
| Checkpoints | Highest checkpoint respawn logic. |
| Hazards | At least one damaging hazard and one knockback hazard. |
| Pickups | Relic, crystal, and heart rules stubbed in. |
| Debug tools | FPS, ping, position, checkpoint, and current biome visible in dev mode. |

**Exit Criteria**

- [ ] Player can climb 200m.
- [ ] Player can die and respawn at checkpoint.
- [ ] Two-player kick interaction works.
- [ ] Build runs at 60 FPS on target development machine.
- [ ] At least 20 minutes of continuous play without crash.

### M2: Vertical Slice

| Must-Have | Deliverable |
|---|---|
| Level slice | Pine Valley into Cloud Ridge into Snowfall Cliffs. |
| Art pass | Manifest-driven assets visible in world. |
| Juice pass | Jump dust, landing dust, hit flash, pickup burst, checkpoint beam. |
| Onboarding | First 5 minutes teaches route, pickup, checkpoint, hazard. |
| Tuning | Initial balance table for movement, gaps, hazards, pickups. |
| Playtest | 5 external players complete observed first-run test. |

**Exit Criteria**

- [ ] 80%+ first-time players reach first checkpoint.
- [ ] 60%+ first-time players understand the upward goal without explanation.
- [ ] Hazards are described as fair by majority of testers.
- [ ] No severe readability complaints.
- [ ] Slice looks representative of final quality.

### M3: Alpha Systems

| Must-Have | Deliverable |
|---|---|
| Full loop | Spawn, climb, fight, collect, upgrade, checkpoint, summit objective. |
| Enemy system | Basic enemy placement, health, damage, drops. |
| Hazard system | Spike, icicle, wind, crumbling platform, lightning rune. |
| Upgrade system | Relic level-ups and crystal movement progression. |
| Match flow | Start, active match, win, post-match summary stub. |
| Instrumentation | Deaths, checkpoint time, pickup rate, hazard hits, match completion. |

**Exit Criteria**

- [ ] Full match can be completed.
- [ ] All core systems exist in rough but testable form.
- [ ] Server remains authoritative for damage, death, checkpoints, and victory.
- [ ] Basic telemetry file or dashboard exists.
- [ ] Major architecture decisions are locked.

### M4: Content Complete

| Must-Have | Deliverable |
|---|---|
| Biomes | Pine Valley, Cloud Ridge, Snowfall Cliffs, Frozen Spires, Celestial Summit. |
| Level templates | At least 5 route archetypes in generator. |
| Props | Biome-specific decorations and landmarks. |
| Enemies | Goblin, archer, ice bat, skeleton, yeti, wind spirit. |
| Finale | Sky Crown altar with hold timer. |
| Audio draft | Music layers and core SFX placeholders or first pass. |

**Exit Criteria**

- [ ] No placeholder-critical content remains.
- [ ] All assets have placement rules or are cut.
- [ ] Every biome has unique visual identity and gameplay pressure.
- [ ] 30-minute playtest session works without manual reset.
- [ ] Cut list is approved before beta.

### M5: Beta Lock

| Must-Have | Deliverable |
|---|---|
| Feature lock | No new mechanics without producer approval. |
| Balance pass | Difficulty curve, upgrade economy, hazard density. |
| Performance pass | Culling, pooling, memory checks, network payload review. |
| Accessibility | Reduced shake, high contrast, readable hazards, controls. |
| QA matrix | Regression test plan for all systems. |
| Bug triage | Severity labels and daily burn-down. |

**Exit Criteria**

- [ ] 60 FPS with 4 players and expected particles.
- [ ] Match completion rate meets target.
- [ ] No known blocker or critical bugs.
- [ ] All major accessibility options functional.
- [ ] Feature requests are routed to post-launch backlog.

### M6: Polish Lock

| Must-Have | Deliverable |
|---|---|
| Juice | Final camera, screenshake, particles, pickup feedback, hit feedback. |
| Audio | Final or near-final SFX and music layers. |
| UI | HUD, scoreboard, notifications, post-match screen. |
| Onboarding | First 5 minutes tuned from fresh-player data. |
| Visual clarity | Platform tops, hazards, enemies, player silhouettes validated. |
| Retention hooks | Daily seed or replay hook scoped for launch or post-launch. |

**Exit Criteria**

- [ ] New-player first checkpoint rate meets target.
- [ ] Players can describe relic, crystal, and heart effects.
- [ ] Average match has at least 3 memorable feedback moments.
- [ ] No readability blocker remains.
- [ ] Final cut list is closed.

### M7: Release Candidate

| Must-Have | Deliverable |
|---|---|
| Stability | Crash-free sessions, reconnect test, browser/device checks. |
| Build | Production build, versioning, changelog, deployment checklist. |
| QA | Full regression pass and multiplayer soak test. |
| Launch telemetry | Event logging and rollback plan. |
| Store/web page | Screens, description, controls, known requirements. |

**Exit Criteria**

- [ ] No blocker bugs.
- [ ] No critical performance regressions.
- [ ] 2-hour multiplayer soak passes.
- [ ] Production deployment rehearsed.
- [ ] Launch owner signs off.

### M8: Launch And Live Ops

| Must-Have | Deliverable |
|---|---|
| Day 0 | Launch build, monitoring, hotfix branch. |
| Day 1 | Crash and retention review. |
| Week 1 | First balance patch. |
| Week 2 | First event or daily seed push. |
| Month 1 | Roadmap review and DLC planning. |

## 4. Weekly Sprint Cadence And Key Rituals

| Ritual | Frequency | Owner | Output |
|---|---|---|---|
| Sprint planning | Weekly, Monday | Producer | Prioritized sprint board with acceptance criteria. |
| Playable build review | Weekly, Wednesday | Design lead | Ranked feedback and cut risks. |
| Multiplayer smoke test | 3x weekly | Engineering lead | Pass/fail checklist and bug tickets. |
| Art integration review | Weekly | Art lead | Asset usage audit and visual clarity notes. |
| Balance council | Weekly | Design lead | Tuning table changes and rationale. |
| Risk review | Weekly | Producer | Updated risk register and mitigations. |
| External playtest | Every 2 weeks until beta, weekly after beta | UX/Design | Observed notes, metrics, top 5 issues. |
| Sprint retro | Weekly, Friday | Producer | Process fix, morale check, cut proposal if needed. |

## 5. Task Breakdown Template

| Stage | Questions | Required Output | Exit Gate |
|---|---|---|---|
| Design | What player problem does this solve? What emotion should it create? | 1-page design note, tuning variables, success metric. | Approved by design lead. |
| Prototype | Can it be tested in-game fast? | Rough playable implementation behind feature flag or dev toggle. | Works in a local build. |
| Integrate | Does it survive multiplayer and chunk loading? | Server/client wiring, asset hooks, telemetry events. | Multiplayer smoke passes. |
| Polish | Does it feel satisfying and readable? | Juice, audio hook, animation, UI feedback. | Playable build review approval. |
| Balance | Is it fair and tuneable? | Constants in tuning table, first-pass values. | Balance council approval. |
| Validate | Did players understand and enjoy it? | Playtest data, top issues, decision to keep/cut/iterate. | Metric target or approved exception. |

### Ticket Template

| Field | Required Content |
|---|---|
| Feature | Clear player-facing outcome. |
| Owner | One directly responsible individual. |
| Milestone | M1 to M8. |
| Dependencies | Art, server, client, design, audio, QA. |
| Acceptance Criteria | Testable checklist. |
| Tuning Variables | Names, defaults, allowed ranges. |
| Performance Budget | Expected sprite count, particles, network payload, memory risk. |
| Telemetry | Events added or affected. |
| Cut Condition | When to remove or defer. |

## 6. Risk Register And Mitigation Plan

| Rank | Risk | Probability | Impact | Owner | Mitigation | Trigger |
|---:|---|---:|---:|---|---|---|
| 1 | Core movement does not feel great | Medium | Critical | Design Lead | Weekly movement-only playtest, tune constants, protect jump polish. | Testers describe movement as floaty, sticky, or unclear. |
| 2 | Procedural chunks feel unfair | High | High | Level Designer | Template-based generation, reachability tests, death heatmaps. | Deaths cluster on same jump or hazard. |
| 3 | Multiplayer prediction feels bad | Medium | Critical | Network Engineer | Keep physics shared, monitor reconciliation, test with simulated latency. | Rubber-banding or delayed hits reported. |
| 4 | Too many assets remain unused | High | Medium | Art Lead | Manifest folder audit, placement rules, asset owner per folder. | New asset folder has no runtime consumer. |
| 5 | Scope creep from enemies and bosses | Medium | High | Producer | Feature gates, enemy MVP first, boss deferred if needed. | Enemy work blocks core loop polish. |
| 6 | Performance drops below target | Medium | High | Rendering Engineer | Culling, pooling, frame profiling, particle budgets. | FPS under 60 in 4-player test. |
| 7 | Hazards feel unfair | Medium | High | Level Designer | Telegraph rules, safe introductions, hazard-specific playtests. | Players cannot explain why they took damage. |
| 8 | Onboarding fails | Medium | High | UX Lead | First 5-minute tests every 2 weeks, no tutorial-text dependency. | First checkpoint rate below target. |
| 9 | Balance variables become chaotic | Medium | Medium | Design Lead | Central tuning file, change log, weekly balance council. | Same value changed repeatedly without rationale. |
| 10 | Polish time gets consumed by unfinished features | High | Critical | Producer | Feature lock at beta, cut list, no new mechanics after M5. | New feature proposed after beta without cutting equivalent work. |

## 7. Team Role Matrix And Communication Flow

| Role | Owns | Consults | Signs Off |
|---|---|---|---|
| Producer | Roadmap, scope, sprint health, cut decisions | All leads | Milestone readiness |
| Game Director | Product vision, feel, final tradeoffs | Design, art, engineering | Creative quality |
| Design Lead | Movement, combat, hazards, upgrades, tuning | Engineering, UX | Gameplay changes |
| Level Designer | Chunk templates, routes, pacing, onboarding spaces | Art, design, QA | Level readiness |
| Client Engineer | Pixi rendering, UI, prediction visuals, asset usage | Rendering, design | Client build |
| Server Engineer | Authority, rooms, snapshots, reconnects, match state | Client, QA | Multiplayer stability |
| Rendering Engineer | Performance, particles, culling, texture memory | Art, client | FPS budget |
| Art Lead | Asset pipeline, readability, biome identity | Design, rendering | Art integration |
| Audio Designer | SFX, music layers, feedback timing | Design, client | Audio pass |
| QA Lead | Test plans, regression, bug quality, release checks | Producer, engineers | QA gate |
| UX Researcher | Playtests, surveys, onboarding metrics | Design, producer | Usability findings |

### Communication Flow

```text
Daily execution:
Individual contributors -> Discipline lead -> Producer

Gameplay changes:
Designer -> Prototype -> Engineering consult -> Playtest -> Balance council -> Merge

Asset changes:
Artist -> Manifest/regeneration -> Art review -> In-game placement -> Readability review

Bug escalation:
QA -> Owner -> Lead -> Producer if milestone risk

Cut decisions:
Owner proposal -> Lead review -> Producer/Game Director decision -> Backlog update
```

## 8. Iteration And Playtest Cadence

| Phase | Internal Playtest | External Playtest | Focus |
|---|---|---|---|
| M1 | 3x weekly | None | Core movement, death, respawn, networking. |
| M2 | 3x weekly | Every 2 weeks | First 5 minutes, vertical slice readability. |
| M3 | 2x weekly | Every 2 weeks | Full loop, enemies, upgrades, summit objective. |
| M4 | 2x weekly | Weekly | Content pacing, biome identity, route variety. |
| M5 | 2x weekly | Weekly | Balance, bugs, performance, accessibility. |
| M6 | Daily short tests | Weekly | Polish, onboarding, retention risk. |
| M7 | Daily smoke and soak | Targeted only | Stability and release confidence. |
| M8 | Live monitoring | Community data | Hotfixes, retention, tuning. |

### Standard Playtest Report

| Section | Required Content |
|---|---|
| Build | Version, date, commit, enabled flags. |
| Players | Count, experience level, device/browser. |
| Goals | 3 to 5 questions the test must answer. |
| Metrics | Completion rate, deaths, checkpoint times, pickup rate, FPS, ping. |
| Observations | Timestamped behavior notes. |
| Top Issues | Ranked by severity and frequency. |
| Decisions | Keep, change, cut, retest. |

## 9. Cut-List And Prioritization Framework

### Priority Formula

```text
Priority Score =
  (Player Impact x 3)
+ (Core Loop Support x 3)
+ (Retention Value x 2)
+ (Readability Value x 2)
- (Scope Cost x 2)
- (Performance Risk x 2)
- (Schedule Risk x 3)
```

| Decision | Score Range | Action |
|---|---:|---|
| Must ship | 24+ | Keep in launch scope. |
| Strong candidate | 16 to 23 | Keep if milestone capacity exists. |
| Risky | 8 to 15 | Prototype only or defer. |
| Cut | Below 8 | Move to post-launch backlog or remove. |

### Protected Launch Core

- [ ] Jump feel.
- [ ] Platform readability.
- [ ] Checkpoint respawn.
- [ ] PvP hit clarity.
- [ ] Hazard telegraphs.
- [ ] Relic/crystal/heart pickups.
- [ ] Biome progression.
- [ ] Summit objective.
- [ ] 60 FPS target.
- [ ] First 5 minutes onboarding.

### Default Cut Candidates

| Feature | Cut If |
|---|---|
| Complex boss AI | Enemy MVP is not stable by alpha. |
| Extra character classes | Base characters lack readable animation polish. |
| Large procedural rule variety | Route fairness is not validated. |
| Advanced live ops | Launch stability is not proven. |
| Cosmetic economy | Core retention metrics are weak. |
| Moving platforms | Prediction or readability suffers. |
| Too many unique hazards | Existing hazards lack fair telegraphs. |
| Long post-match stats | Main match loop still needs polish. |

## 10. Red-Flag Dashboard

| Red Flag | Threshold | Owner | Immediate Action |
|---|---:|---|---|
| Build not playable | More than 2 working days | Producer | Stop feature work, stabilize build. |
| FPS below target | Under 60 FPS in standard 4-player test | Rendering Engineer | Profile, cut particles/decorations, add pooling. |
| First checkpoint failure | More than 25% of new players fail | UX Lead | Rework onboarding route immediately. |
| Unfair death reports | More than 30% of deaths described as unfair | Level Designer | Add telegraphs or reduce hazard density. |
| Reconciliation spikes | Average correction above tolerance | Network Engineer | Inspect prediction divergence before new combat work. |
| Asset folder unused | Any folder has no placement rule | Art Lead | Add rule or cut folder from launch scope. |
| Scope growth | New feature added without cut | Producer | Reject or require equivalent removal. |
| Bug backlog growth | Critical/high bugs increase for 2 sprints | QA Lead | Bug-fix sprint or feature freeze. |
| Playtest no-show | 2 missed external tests | Producer | Reschedule and block milestone exit. |
| Polish debt | Juice tasks deferred 2 sprints in a row | Game Director | Reserve polish sprint capacity. |
| Balance churn | Same variable changed 3 times without playtest | Design Lead | Lock value until controlled test. |
| Team fatigue | Repeated spillover for 3 sprints | Producer | Reduce scope and reset sprint load. |

## 11. Momentum Protection Checklist

- [ ] Maintain a playable build at all times.
- [ ] No milestone exits without observed playtest.
- [ ] Every feature has a cut condition.
- [ ] Every asset folder has a runtime use.
- [ ] Every new mechanic has a tutorial-by-level beat.
- [ ] Every hazard has a telegraph.
- [ ] Every pickup has feedback and a stat purpose.
- [ ] Every sprint includes polish capacity.
- [ ] Every beta task must fix, tune, optimize, or clarify.
- [ ] No new launch features after beta lock without producer and director approval.

