package game

import "testing"

func TestCollectedRelicRespawnsAfterRespawnWindow(t *testing.T) {
	seed := HashString("respawn-demo")
	chunk := GenerateChunk(seed, 0)
	relic := chunk.Relics[0]
	worldX := float64(relic.X*TileSize) + float64(TileSize)/2
	worldY := float64((chunk.WorldTileY+relic.Y)*TileSize) + float64(TileSize)/2

	sess := &session{
		playerID:  "p1",
		player:    CreatePlayerState("p1", worldX-float64(PlayerWidth)/2, worldY-float64(PlayerHeight)/2),
		connected: true,
	}
	state := &roomState{
		room:            &Room{seed: seed, cfg: RoomConfig{TickRate: DefaultTickRate}},
		collectedRelics: map[string]uint64{},
		pendingEvents:   []MatchEvent{},
		sessions:        map[string]*session{"p1": sess},
	}

	state.checkRelicCollection(sess)
	if _, ok := state.collectedRelics[relic.ID]; !ok {
		t.Fatalf("expected relic to be collected on first pass")
	}
	coinsAfterFirstPickup := sess.player.Coins

	// Well before the respawn window: re-running the check must not
	// re-award the relic (still marked collected).
	state.tick += state.secondsToTicks(relicRespawnSeconds) - state.secondsToTicks(1)
	state.pendingEvents = []MatchEvent{}
	state.checkRelicCollection(sess)
	if _, ok := state.collectedRelics[relic.ID]; !ok {
		t.Fatalf("relic should still be marked collected before the respawn window elapses")
	}
	if sess.player.Coins != coinsAfterFirstPickup {
		t.Fatalf("relic must not be re-collectible before its respawn window elapses")
	}
	for _, event := range state.pendingEvents {
		if event["type"] == "COLLECTIBLE_RESPAWNED" {
			t.Fatalf("did not expect a respawn event before the window elapsed, got %#v", state.pendingEvents)
		}
	}

	// Past the respawn window: a newly-joined (or the same) player should
	// be able to collect it again, and a COLLECTIBLE_RESPAWNED event
	// should fire so already-connected clients redraw the pickup.
	state.tick += state.secondsToTicks(2)
	state.pendingEvents = []MatchEvent{}
	state.checkRelicCollection(sess)

	foundRespawnEvent := false
	for _, event := range state.pendingEvents {
		if event["type"] == "COLLECTIBLE_RESPAWNED" && event["collectibleId"] == relic.ID {
			foundRespawnEvent = true
		}
	}
	if !foundRespawnEvent {
		t.Fatalf("expected a COLLECTIBLE_RESPAWNED event after the respawn window elapsed, got %#v", state.pendingEvents)
	}
	if sess.player.Coins != coinsAfterFirstPickup+1 {
		t.Fatalf("expected the respawned relic to be collectible again, coins %d -> %d", coinsAfterFirstPickup, sess.player.Coins)
	}
}
