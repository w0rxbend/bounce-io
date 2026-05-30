package game

import "testing"

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
