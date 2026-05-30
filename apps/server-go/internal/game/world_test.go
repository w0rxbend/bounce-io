package game

import (
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

func TestRegionGenerationCreatesLongPortalIntervals(t *testing.T) {
	for regionIndex := 0; regionIndex < len(worldRegionProfiles); regionIndex++ {
		start := RegionStartChunkY(regionIndex)
		if !IsCheckpointChunk(start) {
			t.Fatalf("region %d start chunk %d should be checkpoint", regionIndex, start)
		}
		distance := RegionLengthForIndex(regionIndex)
		if distance < 3 || distance > 5 {
			t.Fatalf("region %d checkpoint distance should be 3x-5x old chunks, got %d", regionIndex, distance)
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
	if len(state.pendingEvents) != 1 || state.pendingEvents[0]["type"] != "COIN_COLLECTED" {
		t.Fatalf("expected one COIN_COLLECTED event, got %#v", state.pendingEvents)
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

func TestFatalFallOverSixMetersKillsPlayer(t *testing.T) {
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
