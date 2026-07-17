package game

import "testing"

func newEmoteTestState() *roomState {
	return &roomState{
		room:          &Room{cfg: RoomConfig{TickRate: DefaultTickRate}},
		pendingEvents: []MatchEvent{},
	}
}

func TestEmoteCommandBroadcastsAllowedEmote(t *testing.T) {
	state := newEmoteTestState()
	sess := &session{playerID: "p1", player: CreatePlayerState("p1", 0, 0), connected: true}
	state.sessions = map[string]*session{"p1": sess}

	emoteCommand{playerID: "p1", emoteID: "wave"}.apply(state)

	if len(state.pendingEvents) != 1 {
		t.Fatalf("expected 1 pending event, got %#v", state.pendingEvents)
	}
	ev := state.pendingEvents[0]
	if ev["type"] != "PLAYER_EMOTE" || ev["playerId"] != "p1" || ev["emoteId"] != "wave" {
		t.Fatalf("unexpected emote event: %#v", ev)
	}
}

func TestEmoteCommandRejectsUnknownEmoteID(t *testing.T) {
	state := newEmoteTestState()
	sess := &session{playerID: "p1", player: CreatePlayerState("p1", 0, 0), connected: true}
	state.sessions = map[string]*session{"p1": sess}

	emoteCommand{playerID: "p1", emoteID: "not_a_real_emote"}.apply(state)

	if len(state.pendingEvents) != 0 {
		t.Fatalf("unknown emote id should not broadcast, got %#v", state.pendingEvents)
	}
}

func TestEmoteCommandIsRateLimitedPerPlayer(t *testing.T) {
	state := newEmoteTestState()
	sess := &session{playerID: "p1", player: CreatePlayerState("p1", 0, 0), connected: true}
	state.sessions = map[string]*session{"p1": sess}

	emoteCommand{playerID: "p1", emoteID: "wave"}.apply(state)
	emoteCommand{playerID: "p1", emoteID: "gg"}.apply(state)

	if len(state.pendingEvents) != 1 {
		t.Fatalf("expected second emote within cooldown to be dropped, got %#v", state.pendingEvents)
	}

	state.tick += state.secondsToTicks(1.5)
	emoteCommand{playerID: "p1", emoteID: "gg"}.apply(state)

	if len(state.pendingEvents) != 2 {
		t.Fatalf("expected emote after cooldown to broadcast, got %#v", state.pendingEvents)
	}
}

func TestEmoteCommandIgnoresSpectatorsAndUnknownPlayers(t *testing.T) {
	state := newEmoteTestState()
	spectator := &session{playerID: "spec", player: CreatePlayerState("spec", 0, 0), connected: true, spectator: true}
	state.sessions = map[string]*session{"spec": spectator}

	emoteCommand{playerID: "spec", emoteID: "wave"}.apply(state)
	emoteCommand{playerID: "ghost", emoteID: "wave"}.apply(state)

	if len(state.pendingEvents) != 0 {
		t.Fatalf("expected no events from spectator or unknown player, got %#v", state.pendingEvents)
	}
}
