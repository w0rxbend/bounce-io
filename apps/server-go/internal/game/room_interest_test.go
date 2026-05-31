package game

import (
	"io"
	"log/slog"
	"testing"
)

func TestSessionAOIFiltersSnapshotState(t *testing.T) {
	room := &Room{cfg: RoomConfig{ID: "interest"}, seed: HashString("interest"), log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	state := &roomState{
		room:     room,
		sessions: map[string]*session{},
	}

	near := CreatePlayerState("near", 120, -float64(ChunkHeightTiles*TileSize*10))
	far := CreatePlayerState("far", 120, -float64(ChunkHeightTiles*TileSize*30))
	state.sessions["near"] = &session{playerID: "near", player: near, connected: true}
	state.sessions["far"] = &session{playerID: "far", player: far, connected: true}

	frames := map[string]PlayerEntityFrame{
		"near": {ID: "near", X: near.Position.X, Y: near.Position.Y},
		"far":  {ID: "far", X: far.Position.X, Y: far.Position.Y},
	}
	aoi := state.sessionAOI(state.sessions["near"])
	filteredPlayers := state.playerFramesForAOI(aoi, frames)
	if len(filteredPlayers) != 1 || filteredPlayers[0].ID != "near" {
		t.Fatalf("expected only near player in AOI, got %#v", filteredPlayers)
	}

	filteredEnemies := enemiesForAOI(aoi, []EnemyState{
		{ID: "enemy-near", Position: Vec2{X: 120, Y: -float64(ChunkHeightTiles * TileSize * 10)}, ChunkY: 10, Health: 3},
		{ID: "enemy-far", Position: Vec2{X: 120, Y: -float64(ChunkHeightTiles * TileSize * 30)}, ChunkY: 30, Health: 3},
	})
	if len(filteredEnemies) != 1 || filteredEnemies[0].ID != "enemy-near" {
		t.Fatalf("expected only near enemy in AOI, got %#v", filteredEnemies)
	}

	filteredCollectibles := collectiblesForAOI(aoi, []CollectibleState{
		{ID: "collectible-near", Y: -float64(ChunkHeightTiles * TileSize * 10)},
		{ID: "collectible-far", Y: -float64(ChunkHeightTiles * TileSize * 30)},
	})
	if len(filteredCollectibles) != 1 || filteredCollectibles[0].ID != "collectible-near" {
		t.Fatalf("expected only near collectible in AOI, got %#v", filteredCollectibles)
	}
}

func TestChunkRequestAllowedUsesAOIWindowWithSlack(t *testing.T) {
	room := &Room{cfg: RoomConfig{ID: "interest"}, seed: HashString("interest"), log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	state := &roomState{room: room}
	player := CreatePlayerState("p1", 120, -float64(ChunkHeightTiles*TileSize*8))
	sess := &session{playerID: "p1", player: player, connected: true}
	aoi := state.sessionAOI(sess)

	if !state.chunkRequestAllowed(sess, aoi.min) || !state.chunkRequestAllowed(sess, aoi.max+DefaultChunkRequestSlack) {
		t.Fatalf("expected AOI and slack chunks to be allowed: %#v", aoi)
	}
	if state.chunkRequestAllowed(sess, aoi.max+DefaultChunkRequestSlack+1) {
		t.Fatalf("expected far future chunk request to be rejected: %#v", aoi)
	}
}

func TestViewportAOIIsClampedAroundAuthoritativePlayer(t *testing.T) {
	room := &Room{cfg: RoomConfig{ID: "interest"}, seed: HashString("interest"), log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	state := &roomState{
		room:     room,
		sessions: map[string]*session{},
	}
	player := CreatePlayerState("p1", 120, -float64(ChunkHeightTiles*TileSize*8))
	sess := &session{playerID: "p1", player: player, connected: true}
	state.sessions["p1"] = sess

	viewportCommand{playerID: "p1", minChunkY: 0, maxChunkY: 80, x1: -500, y1: -9000, x2: 5000, y2: 5000}.apply(state)
	aoi := state.sessionAOI(sess)
	center := ChunkYForWorldY(player.Position.Y)
	if aoi.min < center-MaxClientAOIChunksBehind || aoi.max > center+MaxClientAOIChunksAhead {
		t.Fatalf("viewport AOI was not clamped around authoritative player: center=%d aoi=%#v", center, aoi)
	}
	if !chunkInAOI(aoi, center) {
		t.Fatalf("viewport AOI must retain player center chunk: center=%d aoi=%#v", center, aoi)
	}
	if aoi.left < 0 || aoi.right > ChunkWidthTiles*TileSize {
		t.Fatalf("viewport AOI should clamp horizontal world bounds: %#v", aoi)
	}
}

func TestViewportAOIFiltersByWorldAABB(t *testing.T) {
	aoi := chunkAOI{
		min:    0,
		max:    2,
		left:   0,
		right:  120,
		top:    -600,
		bottom: 120,
	}
	enemies := enemiesForAOI(aoi, []EnemyState{
		{ID: "inside", Position: Vec2{X: 80, Y: -120}, ChunkY: 1, Health: 3},
		{ID: "outside-x", Position: Vec2{X: 420, Y: -120}, ChunkY: 1, Health: 3},
		{ID: "outside-y", Position: Vec2{X: 80, Y: -980}, ChunkY: 4, Health: 3},
	})
	if len(enemies) != 1 || enemies[0].ID != "inside" {
		t.Fatalf("expected only AABB-visible enemy, got %#v", enemies)
	}

	collectibles := collectiblesForAOI(aoi, []CollectibleState{
		{ID: "inside", X: 96, Y: -96},
		{ID: "outside-x", X: 300, Y: -96},
	})
	if len(collectibles) != 1 || collectibles[0].ID != "inside" {
		t.Fatalf("expected only AABB-visible collectible, got %#v", collectibles)
	}
}
