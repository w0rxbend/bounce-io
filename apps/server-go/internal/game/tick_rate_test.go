package game

import (
	"io"
	"log/slog"
	"testing"
)

func quietTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestServerEnforcesPredictionFixedTickRate(t *testing.T) {
	for _, requested := range []int{-1, 0, 30, 60, 120} {
		server := NewServer(ServerConfig{TickRate: requested}, quietTestLogger())
		if server.cfg.TickRate != DefaultTickRate {
			t.Fatalf("requested %d Hz: got %d Hz, want fixed %d Hz", requested, server.cfg.TickRate, DefaultTickRate)
		}
	}
}

func TestRoomEnforcesPredictionFixedTickRate(t *testing.T) {
	for _, requested := range []int{-1, 0, 30, 60, 120} {
		room := NewRoom(RoomConfig{TickRate: requested}, NewServerMetrics(), quietTestLogger())
		if room.cfg.TickRate != DefaultTickRate {
			t.Fatalf("requested %d Hz: got %d Hz, want fixed %d Hz", requested, room.cfg.TickRate, DefaultTickRate)
		}
		room.Stop()
	}
}

func TestNeutralModalInputReleasesRepeatedHeldControls(t *testing.T) {
	sess := &session{
		lastProcessedSeq: 4,
		lastInput:        PlayerInput{Right: true, JumpHeld: true, Drop: true, Sequence: 4},
		inputQueue:       []PlayerInput{{Sequence: 5}},
	}
	neutral := sess.consumeInput()
	if neutral.Left || neutral.Right || neutral.JumpHeld || neutral.Drop {
		t.Fatalf("neutral input retained held controls: %+v", neutral)
	}
	repeated := sess.consumeInput()
	if repeated.Left || repeated.Right || repeated.JumpHeld || repeated.Drop {
		t.Fatalf("empty tick repeated controls after neutral release: %+v", repeated)
	}
	if repeated.Sequence != 5 {
		t.Fatalf("repeated sequence = %d, want 5", repeated.Sequence)
	}
}
