package game

import "sort"

const spatialCellSize = ChunkHeightTiles * TileSize

type spatialCellKey struct {
	x int
	y int
}

type spatialPlayer struct {
	id    string
	frame PlayerEntityFrame
}

type dynamicSpatialIndex struct {
	players      map[spatialCellKey][]spatialPlayer
	enemies      map[spatialCellKey][]EnemyState
	collectibles map[spatialCellKey][]CollectibleState
}

func buildDynamicSpatialIndex(s *roomState, playerFrames map[string]PlayerEntityFrame) dynamicSpatialIndex {
	index := dynamicSpatialIndex{
		players:      map[spatialCellKey][]spatialPlayer{},
		enemies:      map[spatialCellKey][]EnemyState{},
		collectibles: map[spatialCellKey][]CollectibleState{},
	}
	for _, sess := range s.sessions {
		if !sess.connected {
			continue
		}
		frame, ok := playerFrames[sess.playerID]
		if !ok {
			continue
		}
		key := cellKeyForPoint(sess.player.Position.X, sess.player.Position.Y)
		index.players[key] = append(index.players[key], spatialPlayer{id: sess.playerID, frame: frame})
	}
	for _, enemy := range s.enemies {
		if enemy.Health <= 0 {
			continue
		}
		key := cellKeyForPoint(enemy.Position.X, enemy.Position.Y)
		index.enemies[key] = append(index.enemies[key], enemy)
	}
	for _, collectible := range s.collectibles {
		if collectible.Picked {
			continue
		}
		key := cellKeyForPoint(collectible.X, collectible.Y)
		index.collectibles[key] = append(index.collectibles[key], collectible)
	}
	return index
}

func (index dynamicSpatialIndex) playersForAOI(aoi chunkAOI, s *roomState) []PlayerEntityFrame {
	out := make([]PlayerEntityFrame, 0)
	for _, key := range cellKeysForAOI(aoi) {
		for _, player := range index.players[key] {
			sess := s.sessions[player.id]
			if sess == nil || !sess.connected {
				continue
			}
			if rectIntersectsAOI(aoi, sess.player.Position.X, sess.player.Position.Y, PlayerWidth, PlayerHeight) {
				out = append(out, player.frame)
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (index dynamicSpatialIndex) enemiesForAOI(aoi chunkAOI) []EnemyState {
	out := make([]EnemyState, 0)
	seen := map[string]struct{}{}
	for _, key := range cellKeysForAOI(aoi) {
		for _, enemy := range index.enemies[key] {
			if _, ok := seen[enemy.ID]; ok {
				continue
			}
			if chunkInAOI(aoi, enemy.ChunkY) && rectIntersectsAOI(aoi, enemy.Position.X, enemy.Position.Y, 22, 28) {
				out = append(out, enemy)
				seen[enemy.ID] = struct{}{}
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (index dynamicSpatialIndex) collectiblesForAOI(aoi chunkAOI) []CollectibleState {
	out := make([]CollectibleState, 0)
	seen := map[string]struct{}{}
	for _, key := range cellKeysForAOI(aoi) {
		for _, collectible := range index.collectibles[key] {
			if _, ok := seen[collectible.ID]; ok {
				continue
			}
			if chunkInAOI(aoi, ChunkYForWorldY(collectible.Y)) && pointInAOI(aoi, collectible.X, collectible.Y) {
				out = append(out, collectible)
				seen[collectible.ID] = struct{}{}
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func cellKeyForPoint(x, y float64) spatialCellKey {
	return spatialCellKey{x: int(x) / spatialCellSize, y: floorDiv(int(y), spatialCellSize)}
}

func cellKeysForAOI(aoi chunkAOI) []spatialCellKey {
	minX := aoi.left / spatialCellSize
	maxX := aoi.right / spatialCellSize
	minY := floorDiv(aoi.top, spatialCellSize)
	maxY := floorDiv(aoi.bottom, spatialCellSize)
	out := make([]spatialCellKey, 0, (maxX-minX+1)*(maxY-minY+1))
	for y := minY; y <= maxY; y++ {
		for x := minX; x <= maxX; x++ {
			out = append(out, spatialCellKey{x: x, y: y})
		}
	}
	return out
}

func floorDiv(value, divisor int) int {
	if divisor == 0 {
		return 0
	}
	q := value / divisor
	r := value % divisor
	if r != 0 && ((r < 0) != (divisor < 0)) {
		q--
	}
	return q
}
