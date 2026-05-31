package game

import (
	"io"
	"log/slog"
	"testing"

	"github.com/coder/websocket"
)

func TestClientDropMetricsSeparateReliableAndSnapshots(t *testing.T) {
	stats := NewServerMetrics()
	client := NewClient(nil, 0, 10, stats, slog.New(slog.NewTextHandler(io.Discard, nil)))

	if client.EnqueueEncoded([]byte(`{"type":"events"}`)) {
		t.Fatal("expected reliable message enqueue to fail with an unbuffered queue and no writer")
	}

	if !client.EnqueueSnapshotMessage([]byte("first"), websocket.MessageText) {
		t.Fatal("expected first replaceable snapshot to be accepted")
	}
	if !client.EnqueueSnapshotMessage([]byte("second"), websocket.MessageText) {
		t.Fatal("expected second replaceable snapshot to overwrite pending snapshot")
	}

	metrics := client.Metrics()
	if metrics.DroppedOutbound != 2 {
		t.Fatalf("expected 2 total drops, got %d", metrics.DroppedOutbound)
	}
	if metrics.DroppedReliable != 1 {
		t.Fatalf("expected 1 reliable drop, got %d", metrics.DroppedReliable)
	}
	if metrics.DroppedSnapshots != 1 {
		t.Fatalf("expected 1 snapshot overwrite, got %d", metrics.DroppedSnapshots)
	}
	if got := stats.DroppedOutbound.Load(); got != 2 {
		t.Fatalf("expected 2 global outbound drops, got %d", got)
	}
	if got := stats.DroppedReliable.Load(); got != 1 {
		t.Fatalf("expected 1 global reliable drop, got %d", got)
	}
	if got := stats.DroppedSnapshots.Load(); got != 1 {
		t.Fatalf("expected 1 global snapshot overwrite, got %d", got)
	}
}
