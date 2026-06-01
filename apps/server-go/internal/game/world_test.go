package game

import (
	"math"
	"reflect"
	"testing"
)

func TestGeneratedChunksKeepPlatformsReachable(t *testing.T) {
	for chunkY := 0; chunkY < 25; chunkY++ {
		chunk := GenerateChunk(HashString("demo"), chunkY)
		for _, platform := range chunk.Platforms {
			if platform == chunk.Entry {
				continue
			}
			if !hasReachableLowerPlatform(platform, chunk.Platforms) && !hasAssistedLaunch(platform, chunk) {
				t.Fatalf("chunk %d platform %+v has no normal or jump-pad-assisted route in %+v", chunkY, platform, chunk.Platforms)
			}
		}
	}
}

func TestFarOptionalPlatformsHaveJumpPads(t *testing.T) {
	for chunkY := 0; chunkY < 25; chunkY++ {
		chunk := GenerateChunk(HashString("demo"), chunkY)
		for _, platform := range chunk.Platforms {
			if platform == chunk.Entry {
				continue
			}
			if hasReachableLowerPlatform(platform, chunk.Platforms) {
				continue
			}
			if !hasAssistedLaunch(platform, chunk) {
				t.Fatalf("chunk %d far platform %+v needs jump pad assistance", chunkY, platform)
			}
		}
	}
}

func TestRegionGenerationCreatesProgressivePortalIntervals(t *testing.T) {
	for regionIndex := 0; regionIndex < len(worldRegionProfiles); regionIndex++ {
		start := RegionStartChunkY(regionIndex)
		if !IsCheckpointChunk(start) {
			t.Fatalf("region %d start chunk %d should be checkpoint", regionIndex, start)
		}
		distance := RegionLengthForIndex(regionIndex)
		maxDistance := 5
		if regionIndex >= 8 {
			maxDistance = 7
		}
		if distance < 3 || distance > maxDistance {
			t.Fatalf("region %d checkpoint distance should stay in progressive bounds 3-%d chunks, got %d", regionIndex, maxDistance, distance)
		}
		for chunkY := start + 1; chunkY < start+distance; chunkY++ {
			if IsCheckpointChunk(chunkY) {
				t.Fatalf("chunk %d should be traversal space, not a checkpoint", chunkY)
			}
		}
	}
}

func TestSameSeedGeneratesSameWorld(t *testing.T) {
	seed := HashString("demo")
	for chunkY := 0; chunkY < 30; chunkY++ {
		a := GenerateChunk(seed, chunkY)
		b := GenerateChunk(seed, chunkY)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("chunk %d is not deterministic", chunkY)
		}
	}
}

func TestGeneratedChunkCacheDoesNotShareMutableSlices(t *testing.T) {
	seed := HashString("demo")
	chunk := GenerateChunk(seed, 3)
	originalTile := chunk.Tiles[0]
	originalRouteNode := chunk.Routes[0].Nodes[0]

	chunk.Tiles[0] = "mutated"
	chunk.Routes[0].Nodes[0].X += 1000
	if chunk.Portal != nil {
		chunk.Portal.ID = "mutated"
	}

	again := GenerateChunk(seed, 3)
	if again.Tiles[0] != originalTile {
		t.Fatalf("cached chunk shared tile backing array: got %q want %q", again.Tiles[0], originalTile)
	}
	if again.Routes[0].Nodes[0] != originalRouteNode {
		t.Fatalf("cached chunk shared route node backing array: got %#v want %#v", again.Routes[0].Nodes[0], originalRouteNode)
	}
	if again.Portal != nil && again.Portal.ID == "mutated" {
		t.Fatalf("cached chunk shared portal pointer")
	}
}

func TestFarRegionMathKeepsChunksInsideComputedRegions(t *testing.T) {
	for chunkY := 0; chunkY < 1000; chunkY++ {
		regionIndex := RegionIndexForChunkY(chunkY)
		start := RegionStartChunkY(regionIndex)
		end := start + RegionLengthForIndex(regionIndex)
		if chunkY < start || chunkY >= end {
			t.Fatalf("chunk %d mapped outside region %d range [%d,%d)", chunkY, regionIndex, start, end)
		}
	}
}

func TestRegionGenerationIncreasesCollectibleDensity(t *testing.T) {
	seed := HashString("demo")
	total := 0
	for chunkY := 0; chunkY < 24; chunkY++ {
		chunk := GenerateChunk(seed, chunkY)
		if len(chunk.Relics) < 4 {
			t.Fatalf("chunk %d has too few relics: %d", chunkY, len(chunk.Relics))
		}
		total += len(chunk.Relics)
	}
	if avg := float64(total) / 24; avg < 4.5 {
		t.Fatalf("expected 3x-5x denser relic placement, avg=%0.2f", avg)
	}
}

func TestJumpPadsAreRareAndNeverOnCheckpoints(t *testing.T) {
	seed := HashString("demo")
	totalPads := 0
	for chunkY := 0; chunkY < 32; chunkY++ {
		chunk := GenerateChunk(seed, chunkY)
		if IsCheckpointChunk(chunkY) && len(chunk.JumpPads) > 0 {
			t.Fatalf("checkpoint chunk %d should not contain jump pads: %#v", chunkY, chunk.JumpPads)
		}
		if chunk.Portal != nil {
			if chunk.Portal.Width > CheckpointPortalWidthTiles {
				t.Fatalf("portal %s is too wide: got %d tiles, max %d", chunk.Portal.ID, chunk.Portal.Width, CheckpointPortalWidthTiles)
			}
			if chunk.Portal.Trigger.Width != float64(chunk.Portal.Width*TileSize) {
				t.Fatalf("portal %s trigger width does not match visual width", chunk.Portal.ID)
			}
			for _, pad := range chunk.JumpPads {
				if pad.X >= chunk.Portal.X && pad.X < chunk.Portal.X+chunk.Portal.Width && absInt(pad.Y-chunk.Portal.Y) <= 1 {
					t.Fatalf("jump pad %s overlaps portal %s", pad.ID, chunk.Portal.ID)
				}
			}
		}
		totalPads += len(chunk.JumpPads)
	}
	if totalPads > 8 {
		t.Fatalf("jump pads should be rare shortcut mechanics, got %d in first 32 chunks", totalPads)
	}
	if totalPads == 0 {
		t.Fatalf("expected at least one rare shortcut jump pad")
	}
}

func TestRegionsProvideDistinctMacroProfiles(t *testing.T) {
	seen := map[string]struct{}{}
	for regionIndex := 0; regionIndex < len(worldRegionProfiles); regionIndex++ {
		chunkY := RegionStartChunkY(regionIndex)
		region := RegionForChunkY(chunkY)
		seen[region.Name] = struct{}{}
		chunk := GenerateChunk(HashString("demo"), chunkY)
		if len(chunk.Platforms) < 8 {
			t.Fatalf("region %s chunk %d has too little route structure", region.Name, chunkY)
		}
		if chunk.RegionID == "" || chunk.RegionName != region.Name || chunk.Portal == nil {
			t.Fatalf("region %s chunk %d missing authoritative metadata: %#v", region.Name, chunkY, chunk)
		}
		if len(chunk.Routes) < 2 || len(chunk.Routes) > 4 {
			t.Fatalf("region %s chunk %d should expose 2-4 routes, got %d", region.Name, chunkY, len(chunk.Routes))
		}
	}
	if len(seen) != len(worldRegionProfiles) {
		t.Fatalf("expected %d regions, got %d", len(worldRegionProfiles), len(seen))
	}
}

func TestRegionRoutesProvideSafeRiskRelicAndRecoveryOpportunities(t *testing.T) {
	seed := HashString("demo")
	for regionIndex := 0; regionIndex < len(worldRegionProfiles)*2; regionIndex++ {
		plan := BuildRegionPlan(seed, regionIndex)
		routeKinds := map[string]RouteBranch{}
		for _, route := range plan.RouteBranches {
			routeKinds[route.Kind] = route
		}

		safeRoute, hasSafe := routeKinds["safe"]
		riskRoute, hasRisk := routeKinds["risk"]
		relicRoute, hasRelic := routeKinds["relic"]
		if !hasSafe || !hasRisk || !hasRelic {
			t.Fatalf("region %d missing route opportunities: %#v", regionIndex, plan.RouteBranches)
		}
		if !(safeRoute.Reward < riskRoute.Reward && safeRoute.Reward < relicRoute.Reward) {
			t.Fatalf("region %d safe route should trade lower reward for safety: safe=%d risk=%d relic=%d", regionIndex, safeRoute.Reward, riskRoute.Reward, relicRoute.Reward)
		}
		if plan.Portal.ID == "" || !plan.Portal.Checkpoint {
			t.Fatalf("region %d missing checkpoint/recovery portal: %#v", regionIndex, plan.Portal)
		}

		for chunkY := plan.StartChunkY; chunkY <= plan.EndChunkY; chunkY++ {
			chunk := GenerateChunk(seed, chunkY)
			if len(chunk.Routes) < 2 {
				t.Fatalf("region %d chunk %d should expose multiple route choices, got %#v", regionIndex, chunkY, chunk.Routes)
			}
			if len(chunk.Relics) == 0 {
				t.Fatalf("region %d chunk %d should include optional relic/recovery rewards", regionIndex, chunkY)
			}
			if !chunkHasRouteKind(chunk, "safe") {
				t.Fatalf("region %d chunk %d missing safe route anchor", regionIndex, chunkY)
			}
		}
	}
}

func TestChunksExposeDifficultyMetricsAndAvoidStaircases(t *testing.T) {
	seed := HashString("demo")
	archetypes := map[string]struct{}{}
	staircaseTotal := 0.0
	chunks := 0
	earlyScore := 0.0
	earlyChunks := 0
	lateScore := 0.0
	lateChunks := 0
	highStaircaseChunks := 0

	for chunkY := 0; chunkY < 60; chunkY++ {
		chunk := GenerateChunk(seed, chunkY)
		if chunk.DifficultyMetrics == nil {
			t.Fatalf("chunk %d missing difficulty metrics", chunkY)
		}
		metrics := chunk.DifficultyMetrics
		if metrics.Score < 0 || metrics.Score > 1 || metrics.TargetDifficulty < 0 || metrics.TargetDifficulty > 1 {
			t.Fatalf("chunk %d metrics out of range: %#v", chunkY, metrics)
		}
		if metrics.StaircaseRatio > 0.5 {
			highStaircaseChunks++
		}
		archetypes[metrics.Archetype] = struct{}{}
		staircaseTotal += metrics.StaircaseRatio
		chunks++
		if chunkY < 8 {
			earlyScore += metrics.Score
			earlyChunks++
		} else if chunkY >= 32 {
			lateScore += metrics.Score
			lateChunks++
		}
	}

	if len(archetypes) < 5 {
		t.Fatalf("expected varied route archetypes, got %#v", archetypes)
	}
	if staircaseTotal/float64(chunks) > 0.20 {
		t.Fatalf("average staircase ratio should stay near 20%% target, got %.2f", staircaseTotal/float64(chunks))
	}
	if float64(highStaircaseChunks)/float64(chunks) > 0.20 {
		t.Fatalf("mostly-staircase chunks should be rare, got %d/%d", highStaircaseChunks, chunks)
	}
	if lateScore/float64(lateChunks) <= earlyScore/float64(earlyChunks) {
		t.Fatalf("late chunks should measure harder than early chunks: early=%.2f late=%.2f", earlyScore/float64(earlyChunks), lateScore/float64(lateChunks))
	}
}

func TestBiomeProfilesIncreaseTraversalComplexity(t *testing.T) {
	seed := HashString("demo")
	starter := regionComplexityScore(seed, 0)
	crystal := regionComplexityScore(seed, 2)
	storm := regionComplexityScore(seed, 4)
	celestial := regionComplexityScore(seed, 5)

	if crystal <= starter {
		t.Fatalf("crystal biome should be more complex than starter biome: starter=%d crystal=%d", starter, crystal)
	}
	if storm <= starter {
		t.Fatalf("storm biome should be more complex than starter biome: starter=%d storm=%d", starter, storm)
	}
	if celestial <= starter {
		t.Fatalf("celestial biome should be more complex than starter biome: starter=%d celestial=%d", starter, celestial)
	}
}

func TestEveryRegionHasEntryAndExitPortal(t *testing.T) {
	for regionIndex := 0; regionIndex < len(worldRegionProfiles)*2; regionIndex++ {
		plan := BuildRegionPlan(HashString("demo"), regionIndex)
		if plan.Portal.ID == "" || !plan.Portal.Checkpoint {
			t.Fatalf("region %d missing entry portal: %#v", regionIndex, plan.Portal)
		}
		exitChunk := GenerateChunk(HashString("demo"), plan.ExitChunkY)
		if exitChunk.Portal == nil || !exitChunk.Portal.Checkpoint {
			t.Fatalf("region %d exit chunk %d should contain next portal", regionIndex, plan.ExitChunkY)
		}
	}
}

func TestHazardsStayOffMandatorySafeRoutePlatforms(t *testing.T) {
	seed := HashString("demo")
	checkedHazards := 0
	for chunkY := 0; chunkY < 60; chunkY++ {
		chunk := GenerateChunk(seed, chunkY)
		for y := 0; y < chunk.Height; y++ {
			for x := 0; x < chunk.Width; x++ {
				if chunk.Tiles[y*chunk.Width+x] != "hazard" {
					continue
				}
				checkedHazards++
				platform, ok := platformBelowTile(chunk, x, y)
				if !ok {
					t.Fatalf("chunk %d hazard at %d,%d is not attached to a platform", chunkY, x, y)
				}
				if platform == chunk.Entry || platform == chunk.Exit {
					t.Fatalf("chunk %d hazard at %d,%d blocks entry/exit platform %+v", chunkY, x, y, platform)
				}
				if routeNodeTouchesPlatform(chunk, "safe", platform) {
					t.Fatalf("chunk %d hazard at %d,%d sits on safe route platform %+v", chunkY, x, y, platform)
				}
			}
		}
	}
	if checkedHazards == 0 {
		t.Fatalf("expected seed to generate hazards for mandatory-path validation")
	}
}

func TestCollectiblesAndEnemiesAttachToValidPlatforms(t *testing.T) {
	for chunkY := 0; chunkY < 30; chunkY++ {
		chunk := GenerateChunk(HashString("demo"), chunkY)
		for _, relic := range chunk.Relics {
			if !hasPlatformBelow(chunk, relic.X, relic.Y) {
				t.Fatalf("relic %s in chunk %d is not on a reachable platform", relic.ID, chunkY)
			}
		}
		for _, enemy := range chunk.Enemies {
			if !hasPlatformBelow(chunk, enemy.X, enemy.Y) {
				t.Fatalf("enemy %s in chunk %d is not on a valid platform", enemy.ID, chunkY)
			}
		}
	}
}

func TestDropInputFallsThroughOneWayPlatform(t *testing.T) {
	seed := HashString("demo")
	chunk := GenerateChunk(seed, 0)
	platform := chunk.Platforms[1]
	top := float64((chunk.WorldTileY + platform.Y) * TileSize)
	player := CreatePlayerState("p1", float64(platform.X*TileSize), top-PlayerHeight)
	player.Grounded = true

	next := StepPlayer(seed, player, PlayerInput{Drop: true, Sequence: 1}, PhysicsStepSeconds)

	if next.Grounded {
		t.Fatalf("drop input should not remain grounded on one-way platform")
	}
	if next.Position.Y <= player.Position.Y {
		t.Fatalf("drop input should move player downward: before=%v after=%v", player.Position.Y, next.Position.Y)
	}
}

func TestRelicCollectionUpdatesAuthoritativeState(t *testing.T) {
	seed := HashString("demo")
	chunk := GenerateChunk(seed, 0)
	relic := chunk.Relics[0]
	worldX := float64(relic.X*TileSize) + float64(TileSize)/2
	worldY := float64((chunk.WorldTileY+relic.Y)*TileSize) + float64(TileSize)/2

	state := &roomState{
		room:            &Room{seed: seed},
		collectedRelics: map[string]struct{}{},
		pendingEvents:   []MatchEvent{},
	}
	sess := &session{
		playerID: "p1",
		player:   CreatePlayerState("p1", worldX-float64(PlayerWidth)/2, worldY-float64(PlayerHeight)/2),
	}

	state.checkRelicCollection(sess)
	state.checkRelicCollection(sess)

	if sess.player.Coins != 1 {
		t.Fatalf("expected exactly one coin, got %d", sess.player.Coins)
	}
	if _, ok := state.collectedRelics[relic.ID]; !ok {
		t.Fatalf("expected relic %q to be collected", relic.ID)
	}
	if len(state.pendingEvents) != 2 ||
		state.pendingEvents[0]["type"] != "PLAYER_STATS" ||
		state.pendingEvents[1]["type"] != "COIN_COLLECTED" {
		t.Fatalf("expected PLAYER_STATS and COIN_COLLECTED events, got %#v", state.pendingEvents)
	}
}

func TestDynamicCollectiblePickupIsChunkLocalAndDeletesPicked(t *testing.T) {
	state := &roomState{
		collectibles: map[string]CollectibleState{
			"near": {ID: "near", Type: "xp", X: 24, Y: 24, XPValue: 10},
			"far":  {ID: "far", Type: "xp", X: 24, Y: float64(-4 * ChunkHeightTiles * TileSize), XPValue: 10},
		},
		pendingEvents: []MatchEvent{},
	}
	sess := &session{
		playerID: "p1",
		player:   CreatePlayerState("p1", 16, 16),
	}

	state.checkDynamicCollectibleCollection(sess)

	if _, ok := state.collectibles["near"]; ok {
		t.Fatalf("picked collectible should be removed from lifecycle map")
	}
	if _, ok := state.collectibles["far"]; !ok {
		t.Fatalf("far collectible should not be touched by chunk-local pickup scan")
	}
}

func TestKickHitDamagesTargetAndEmitsEvent(t *testing.T) {
	state := &roomState{pendingEvents: []MatchEvent{}}
	a := &session{
		playerID:  "a",
		player:    CreatePlayerState("a", 100, 100),
		connected: true,
	}
	b := &session{
		playerID:  "b",
		player:    CreatePlayerState("b", 115, 100),
		connected: true,
	}
	a.player.KickPhase = "active"
	a.player.Grounded = true
	state.sessions = map[string]*session{"a": a, "b": b}

	state.applyPlayerInteractions(PhysicsStepSeconds)

	if b.player.Health >= b.player.MaxHealth {
		t.Fatalf("kick should damage target, health=%d", b.player.Health)
	}
	if len(state.pendingEvents) != 1 || state.pendingEvents[0]["type"] != "PLAYER_KICK_HIT" {
		t.Fatalf("expected PLAYER_KICK_HIT event, got %#v", state.pendingEvents)
	}
}

func TestKickInvulnerabilityPreventsRepeatedPvPDamage(t *testing.T) {
	state := &roomState{pendingEvents: []MatchEvent{}}
	a := &session{
		playerID:  "a",
		player:    CreatePlayerState("a", 100, 100),
		connected: true,
	}
	b := &session{
		playerID:  "b",
		player:    CreatePlayerState("b", 115, 100),
		connected: true,
	}
	a.player.KickPhase = "active"
	a.player.Grounded = true
	state.sessions = map[string]*session{"a": a, "b": b}

	state.applyPlayerInteractions(PhysicsStepSeconds)
	healthAfterFirstHit := b.player.Health
	eventCountAfterFirstHit := len(state.pendingEvents)
	stunAfterFirstHit := b.player.StunTimer

	state.applyPlayerInteractions(PhysicsStepSeconds)

	if b.player.Health != healthAfterFirstHit {
		t.Fatalf("target took repeated kick damage while protected: before=%d after=%d", healthAfterFirstHit, b.player.Health)
	}
	if len(state.pendingEvents) != eventCountAfterFirstHit {
		t.Fatalf("expected no repeated PLAYER_KICK_HIT event, got %#v", state.pendingEvents)
	}
	if b.player.KickInvulnerable <= 0 || b.player.KickInvulnerable > KickHitInvulnerableSeconds {
		t.Fatalf("expected kick invulnerability window, got %.3f", b.player.KickInvulnerable)
	}
	if stunAfterFirstHit <= 0 || stunAfterFirstHit > HitStunSeconds {
		t.Fatalf("expected bounded stun from kick, got %.3f", stunAfterFirstHit)
	}
}

func TestEnemyTelegraphedAttackUsesCooldownAndPlayerInvulnerability(t *testing.T) {
	state := &roomState{
		pendingEvents: []MatchEvent{},
		sessions: map[string]*session{
			"p1": {
				playerID:  "p1",
				connected: true,
				player:    CreatePlayerState("p1", 100, 100),
			},
		},
		enemies: map[string]EnemyState{
			"enemy": {
				ID:             "enemy",
				Kind:           "goblin",
				Position:       Vec2{X: 104, Y: 100},
				Velocity:       Vec2{},
				Health:         3,
				MaxHealth:      3,
				ChunkY:         12,
				PatrolMinX:     90,
				PatrolMaxX:     140,
				PlatformY:      124,
				AttackCooldown: 0,
			},
		},
	}

	player := &state.sessions["p1"].player
	startHealth := player.Health
	state.simulateEnemies(PhysicsStepSeconds)
	if player.Health != startHealth {
		t.Fatalf("enemy should not damage before telegraphed attack becomes active: before=%d after=%d", startHealth, player.Health)
	}
	if got := state.enemies["enemy"].Behavior; got != "windup" {
		t.Fatalf("enemy should enter windup before damage, got %q", got)
	}

	for elapsed := 0.0; elapsed <= enemyAttackWindupSeconds; elapsed += PhysicsStepSeconds {
		state.simulateEnemies(PhysicsStepSeconds)
	}
	healthAfterFirstHit := player.Health
	stunAfterFirstHit := player.StunTimer

	state.simulateEnemies(PhysicsStepSeconds)

	if healthAfterFirstHit >= player.MaxHealth {
		t.Fatalf("expected active telegraphed attack to damage player, health=%d/%d", healthAfterFirstHit, player.MaxHealth)
	}
	if player.Health != healthAfterFirstHit {
		t.Fatalf("enemy active attack should not chain damage every frame: before=%d after=%d", healthAfterFirstHit, player.Health)
	}
	if stunAfterFirstHit <= 0 || player.Invulnerable <= 0 {
		t.Fatalf("expected bounded stun and invulnerability after enemy hit: stun=%.3f invuln=%.3f", stunAfterFirstHit, player.Invulnerable)
	}
}

func TestDeathRespawnEmitsClientCompatibleEvents(t *testing.T) {
	seed := HashString("demo")
	state := &roomState{
		room:          &Room{seed: seed},
		pendingEvents: []MatchEvent{},
		sessions: map[string]*session{
			"p1": {
				playerID:  "p1",
				connected: true,
				player:    CreatePlayerState("p1", 100, 100),
			},
		},
	}
	state.sessions["p1"].player.Health = 0

	state.handleDeaths()

	player := state.sessions["p1"].player
	if player.Health != player.MaxHealth {
		t.Fatalf("expected respawned player to be healed, got %d/%d", player.Health, player.MaxHealth)
	}
	if len(state.pendingEvents) != 2 ||
		state.pendingEvents[0]["type"] != "PLAYER_DIED" ||
		state.pendingEvents[1]["type"] != "PLAYER_RESPAWNED" {
		t.Fatalf("expected death and respawn events, got %#v", state.pendingEvents)
	}
}

func TestFatalFallOverTwelveMetersKillsPlayer(t *testing.T) {
	seed := HashString("demo")
	player := CreatePlayerState("p1", 100, -400)
	player.Velocity.Y = MaxFallSpeed
	startY := player.Position.Y - FatalFallDistancePX - 1
	player.FallStartY = &startY

	player = StepPlayer(seed, player, IdleInput(1), PhysicsStepSeconds)

	if player.Health != 0 {
		t.Fatalf("expected fatal fall over %.0fpx to kill player, y=%v start=%v health=%d", FatalFallDistancePX, player.Position.Y, startY, player.Health)
	}
}

func TestFatalFallRespawnsAtCheckpoint(t *testing.T) {
	seed := HashString("demo")
	checkpoint := RegionStartChunkY(1)
	state := &roomState{
		room:          &Room{seed: seed},
		pendingEvents: []MatchEvent{},
		sessions: map[string]*session{
			"p1": {
				playerID:  "p1",
				connected: true,
				player:    CreatePlayerState("p1", 100, -500),
			},
		},
	}
	player := &state.sessions["p1"].player
	player.CheckpointChunkY = checkpoint
	player.Health = 0

	state.handleDeaths()

	respawnX, respawnY := SpawnPosition(seed, checkpoint)
	if player.Health != player.MaxHealth {
		t.Fatalf("expected respawned player to be healed, got %d/%d", player.Health, player.MaxHealth)
	}
	if player.CheckpointChunkY != checkpoint {
		t.Fatalf("expected checkpoint %d to survive respawn, got %d", checkpoint, player.CheckpointChunkY)
	}
	if player.Position.X != respawnX || player.Position.Y != respawnY {
		t.Fatalf("expected respawn at checkpoint %.1f %.1f, got %.1f %.1f", respawnX, respawnY, player.Position.X, player.Position.Y)
	}
}

func chunkHasRouteKind(chunk GeneratedChunk, kind string) bool {
	for _, route := range chunk.Routes {
		if route.Kind == kind {
			return true
		}
	}
	return false
}

func regionComplexityScore(seed uint32, regionIndex int) int {
	start := RegionStartChunkY(regionIndex)
	end := start + RegionLengthForIndex(regionIndex)
	score := 0
	for chunkY := start; chunkY < end; chunkY++ {
		chunk := GenerateChunk(seed, chunkY)
		hazards := 0
		for _, tile := range chunk.Tiles {
			if tile == "hazard" {
				hazards++
			}
		}
		score += hazards*2 + len(chunk.Enemies)*2 + len(chunk.WindZones)*3 + len(chunk.JumpPads) + worldRegionProfiles[positiveMod(regionIndex, len(worldRegionProfiles))].CollectibleAdd
	}
	return score
}

func platformBelowTile(chunk GeneratedChunk, x, y int) (PlatformSpan, bool) {
	for _, platform := range chunk.Platforms {
		if platform.Y == y+1 && x >= platform.X && x < platform.X+platform.Width {
			return platform, true
		}
	}
	return PlatformSpan{}, false
}

func routeNodeTouchesPlatform(chunk GeneratedChunk, routeKind string, platform PlatformSpan) bool {
	for _, route := range chunk.Routes {
		if route.Kind != routeKind {
			continue
		}
		for _, node := range route.Nodes {
			nodeTileX := int(math.Floor(node.X / float64(TileSize)))
			nodeTileY := int(math.Floor(node.Y/float64(TileSize))) - chunk.WorldTileY
			if nodeTileY == platform.Y && nodeTileX >= platform.X && nodeTileX < platform.X+platform.Width {
				return true
			}
		}
	}
	return false
}

func hasReachableLowerPlatform(target PlatformSpan, platforms []PlatformSpan) bool {
	for _, lower := range platforms {
		verticalGap := lower.Y - target.Y
		if verticalGap <= 0 || verticalGap > MaxReachableVerticalGapTiles {
			continue
		}
		if platformGap(lower, target) <= MaxReachableHorizontalGapTiles {
			return true
		}
	}
	return false
}

func hasAssistedLaunch(target PlatformSpan, chunk GeneratedChunk) bool {
	for _, pad := range chunk.JumpPads {
		for _, lower := range chunk.Platforms {
			if pad.X < lower.X || pad.X >= lower.X+lower.Width || pad.Y != lower.Y-1 {
				continue
			}
			verticalGap := lower.Y - target.Y
			if verticalGap <= 0 || verticalGap > MaxReachableVerticalGapTiles*2 {
				continue
			}
			gap := platformGap(lower, target)
			needsAssist := verticalGap > MaxReachableVerticalGapTiles || gap > MaxReachableHorizontalGapTiles
			if needsAssist && gap <= MaxReachableHorizontalGapTiles*3 && pad.Multiplier > 1 {
				return true
			}
		}
	}
	return false
}

func hasPlatformBelow(chunk GeneratedChunk, x, y int) bool {
	for _, platform := range chunk.Platforms {
		if platform.Y != y+1 || x < platform.X || x >= platform.X+platform.Width {
			continue
		}
		if platform == chunk.Entry || hasReachableLowerPlatform(platform, chunk.Platforms) {
			return true
		}
	}
	return false
}

func absInt(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
