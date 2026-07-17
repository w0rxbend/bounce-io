package game

import "testing"

func findChunkWithChest(seed uint32) (GeneratedChunk, ChestSpawn, bool) {
	for chunkY := 1; chunkY < 400; chunkY++ {
		chunk := GenerateChunk(seed, chunkY)
		if len(chunk.Chests) > 0 {
			return chunk, chunk.Chests[0], true
		}
	}
	return GeneratedChunk{}, ChestSpawn{}, false
}

func TestChestIsHiddenUntilKickedThenOpenedOnPickup(t *testing.T) {
	seed := HashString("chest-demo")
	chunk, chest, found := findChunkWithChest(seed)
	if !found {
		t.Fatalf("expected at least one generated chest within the scanned chunk range for this seed")
	}
	worldX := float64(chest.X*TileSize) + float64(TileSize)/2
	worldY := float64((chunk.WorldTileY+chest.Y)*TileSize) + float64(TileSize)/2

	sess := &session{
		playerID:  "p1",
		player:    CreatePlayerState("p1", worldX-float64(PlayerWidth)/2, worldY-float64(PlayerHeight)/2),
		connected: true,
	}
	state := &roomState{
		room:          &Room{seed: seed, cfg: RoomConfig{TickRate: DefaultTickRate}},
		chestRevealed: map[string]struct{}{},
		openedChests:  map[string]uint64{},
		pendingEvents: []MatchEvent{},
		sessions:      map[string]*session{"p1": sess},
	}

	// Standing near it without kicking must not open it — it's still hidden.
	state.checkChestInteraction(sess)
	if _, revealed := state.chestRevealed[chest.ID]; revealed {
		t.Fatalf("chest should stay hidden without a kick")
	}
	if sess.player.Coins != 0 {
		t.Fatalf("hidden chest must not grant coins just from proximity")
	}

	// A kick within range reveals it (uncovers the foliage) but does not
	// grant the reward yet.
	sess.player.KickPhase = "active"
	state.checkChestInteraction(sess)
	if _, revealed := state.chestRevealed[chest.ID]; !revealed {
		t.Fatalf("expected the chest to be revealed by the kick")
	}
	foundRevealEvent := false
	for _, event := range state.pendingEvents {
		if event["type"] == "CHEST_REVEALED" && event["chestId"] == chest.ID {
			foundRevealEvent = true
		}
	}
	if !foundRevealEvent {
		t.Fatalf("expected a CHEST_REVEALED event, got %#v", state.pendingEvents)
	}
	if sess.player.Coins != 0 {
		t.Fatalf("revealing a chest must not itself grant coins")
	}

	// Now that it's revealed, proximity opens it and grants a reward.
	sess.player.KickPhase = "idle"
	state.pendingEvents = []MatchEvent{}
	state.checkChestInteraction(sess)
	if sess.player.Coins < ChestCoinMin || sess.player.Coins > ChestCoinMax {
		t.Fatalf("expected chest to grant between %d and %d coins, got %d", ChestCoinMin, ChestCoinMax, sess.player.Coins)
	}
	foundOpenEvent := false
	for _, event := range state.pendingEvents {
		if event["type"] == "CHEST_OPENED" && event["chestId"] == chest.ID {
			foundOpenEvent = true
		}
	}
	if !foundOpenEvent {
		t.Fatalf("expected a CHEST_OPENED event, got %#v", state.pendingEvents)
	}

	// Opened chests don't re-grant on subsequent proximity checks.
	coinsAfterOpen := sess.player.Coins
	state.pendingEvents = []MatchEvent{}
	state.checkChestInteraction(sess)
	if sess.player.Coins != coinsAfterOpen {
		t.Fatalf("an already-opened chest must not grant coins again before its respawn window elapses")
	}

	// Past the respawn window, the chest resets to hidden and can be
	// revealed + opened again.
	state.tick += state.secondsToTicks(chestRespawnSeconds) + state.secondsToTicks(1)
	state.pendingEvents = []MatchEvent{}
	sess.player.KickPhase = "active"
	state.checkChestInteraction(sess)
	foundResetEvent := false
	for _, event := range state.pendingEvents {
		if event["type"] == "CHEST_RESET" && event["chestId"] == chest.ID {
			foundResetEvent = true
		}
	}
	if !foundResetEvent {
		t.Fatalf("expected a CHEST_RESET event after the respawn window elapsed, got %#v", state.pendingEvents)
	}
	if _, revealed := state.chestRevealed[chest.ID]; !revealed {
		t.Fatalf("expected the kick in this same tick to re-reveal the reset chest")
	}
}
