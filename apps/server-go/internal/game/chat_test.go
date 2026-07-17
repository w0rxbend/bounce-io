package game

import "testing"

func newChatTestState() *roomState {
	return &roomState{
		room:          &Room{cfg: RoomConfig{TickRate: DefaultTickRate}},
		pendingEvents: []MatchEvent{},
	}
}

func TestChatCommandBroadcastsSanitizedText(t *testing.T) {
	state := newChatTestState()
	sess := &session{playerID: "p1", player: CreatePlayerState("p1", 0, 0), connected: true}
	state.sessions = map[string]*session{"p1": sess}

	chatCommand{playerID: "p1", text: "  hello there  "}.apply(state)

	if len(state.pendingEvents) != 1 {
		t.Fatalf("expected 1 pending event, got %#v", state.pendingEvents)
	}
	ev := state.pendingEvents[0]
	if ev["type"] != "CHAT_MESSAGE" || ev["playerId"] != "p1" || ev["text"] != "hello there" {
		t.Fatalf("unexpected chat event: %#v", ev)
	}
}

func TestChatCommandDropsEmptyOrWhitespaceOnlyText(t *testing.T) {
	state := newChatTestState()
	sess := &session{playerID: "p1", player: CreatePlayerState("p1", 0, 0), connected: true}
	state.sessions = map[string]*session{"p1": sess}

	chatCommand{playerID: "p1", text: "   "}.apply(state)
	chatCommand{playerID: "p1", text: ""}.apply(state)

	if len(state.pendingEvents) != 0 {
		t.Fatalf("expected no events from blank chat text, got %#v", state.pendingEvents)
	}
}

func TestChatCommandIsRateLimitedPerPlayer(t *testing.T) {
	state := newChatTestState()
	sess := &session{playerID: "p1", player: CreatePlayerState("p1", 0, 0), connected: true}
	state.sessions = map[string]*session{"p1": sess}

	chatCommand{playerID: "p1", text: "first"}.apply(state)
	chatCommand{playerID: "p1", text: "second"}.apply(state)

	if len(state.pendingEvents) != 1 {
		t.Fatalf("expected second message within cooldown to be dropped, got %#v", state.pendingEvents)
	}

	state.tick += state.secondsToTicks(1.0)
	chatCommand{playerID: "p1", text: "second"}.apply(state)

	if len(state.pendingEvents) != 2 {
		t.Fatalf("expected message after cooldown to broadcast, got %#v", state.pendingEvents)
	}
}

func TestChatCommandIgnoresSpectatorsAndUnknownPlayers(t *testing.T) {
	state := newChatTestState()
	spectator := &session{playerID: "spec", player: CreatePlayerState("spec", 0, 0), connected: true, spectator: true}
	state.sessions = map[string]*session{"spec": spectator}

	chatCommand{playerID: "spec", text: "hi"}.apply(state)
	chatCommand{playerID: "ghost", text: "hi"}.apply(state)

	if len(state.pendingEvents) != 0 {
		t.Fatalf("expected no events from spectator or unknown player, got %#v", state.pendingEvents)
	}
}

func TestSanitizeChatTextStripsControlCharsAndCapsLength(t *testing.T) {
	if got := sanitizeChatText("hi\x00\x07 there\n"); got != "hi there" {
		t.Fatalf("expected control chars stripped and newline converted to space, got %q", got)
	}
	long := ""
	for i := 0; i < 300; i++ {
		long += "a"
	}
	if got := sanitizeChatText(long); len(got) != 240 {
		t.Fatalf("expected chat text capped at 240 runes, got length %d", len(got))
	}
}
