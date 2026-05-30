package game

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWorldDebugDumpMatchesGeneratedChunk(t *testing.T) {
	seed := HashString("demo")
	chunk := GenerateChunk(seed, 2)
	dump := BuildWorldDebugDump("demo", seed, 2, 2)

	if dump.TileSize != TileSize || dump.ChunkWidthTiles != ChunkWidthTiles || dump.ChunkHeightTiles != ChunkHeightTiles {
		t.Fatalf("unexpected coordinate metadata: %#v", dump)
	}
	if len(dump.Chunks) != 1 {
		t.Fatalf("expected one chunk, got %d", len(dump.Chunks))
	}
	got := dump.Chunks[0]
	if got.ChunkY != chunk.ChunkY || got.WorldTileY != chunk.WorldTileY {
		t.Fatalf("chunk identity mismatch: got chunkY=%d worldTileY=%d, want chunkY=%d worldTileY=%d", got.ChunkY, got.WorldTileY, chunk.ChunkY, chunk.WorldTileY)
	}
	if len(got.Platforms) != len(chunk.Platforms) {
		t.Fatalf("platform count mismatch: got %d want %d", len(got.Platforms), len(chunk.Platforms))
	}
	if len(got.Relics) != len(chunk.Relics) {
		t.Fatalf("relic count mismatch: got %d want %d", len(got.Relics), len(chunk.Relics))
	}
	if len(got.JumpPads) != len(chunk.JumpPads) {
		t.Fatalf("jump pad count mismatch: got %d want %d", len(got.JumpPads), len(chunk.JumpPads))
	}
	if len(got.Enemies) != len(chunk.Enemies) {
		t.Fatalf("enemy count mismatch: got %d want %d", len(got.Enemies), len(chunk.Enemies))
	}
	for i, platform := range chunk.Platforms {
		box := got.Platforms[i].WorldBox
		if box.X != float64(platform.X*TileSize) ||
			box.Y != float64((chunk.WorldTileY+platform.Y)*TileSize) ||
			box.Width != float64(platform.Width*TileSize) ||
			box.Height != TileSize {
			t.Fatalf("platform %d box mismatch: got %#v for platform %#v", i, box, platform)
		}
	}
}

func TestWorldDebugEndpointDumpsAuthoritativeChunk(t *testing.T) {
	server := NewServer(ServerConfig{}, slog.Default())
	req := httptest.NewRequest(http.MethodGet, "/debug/world?room=demo&chunk=1", nil)
	rec := httptest.NewRecorder()

	server.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", rec.Code, rec.Body.String())
	}
	var dump WorldDebugDump
	if err := json.Unmarshal(rec.Body.Bytes(), &dump); err != nil {
		t.Fatalf("invalid debug JSON: %v", err)
	}
	if dump.RoomID != "demo" || dump.Seed != HashString("demo") {
		t.Fatalf("unexpected room identity: %#v", dump)
	}
	if len(dump.Chunks) != 1 || dump.Chunks[0].ChunkY != 1 {
		t.Fatalf("unexpected chunks: %#v", dump.Chunks)
	}
	if len(dump.Chunks[0].Platforms) == 0 {
		t.Fatalf("expected debug dump to include collision platforms")
	}
}
