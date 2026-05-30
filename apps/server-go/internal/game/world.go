package game

import (
	"math"
	"strings"
)

func CreatePlayerState(id string, x, y float64) PlayerState {
	return PlayerState{
		ID:                  id,
		Position:            Vec2{X: x, Y: y},
		Velocity:            Vec2{},
		Facing:              1,
		Grounded:            false,
		CoyoteTimer:         0,
		JumpBufferTimer:     0,
		KickCooldown:        0,
		KickPhase:           "idle",
		KickTimer:           0,
		KickInvulnerable:    0,
		Invulnerable:        0,
		StunTimer:           0,
		CheckpointChunkY:    0,
		Coins:               0,
		Health:              BaseMaxHealth,
		MaxHealth:           BaseMaxHealth,
		Damage:              1,
		AttackSpeed:         1,
		JumpPower:           1,
		AirControl:          1,
		KnockbackResistance: 0,
		MovementSpeed:       1,
		Level:               1,
		Relics:              0,
		Crystals:            0,
		RelicFragments:      0,
	}
}

func IdleInput(seq int64) PlayerInput {
	return PlayerInput{Sequence: seq}
}

func NormalizeInput(msg ClientInput) PlayerInput {
	input := msg.Input
	if msg.Movement != nil {
		input.Left = msg.Movement.Left
		input.Right = msg.Movement.Right
		input.JumpPressed = msg.Movement.JumpPressed
		input.JumpHeld = msg.Movement.JumpHeld
		input.Drop = msg.Movement.Drop
	}
	if msg.Action != nil {
		input.Kick = msg.Action.Kick
	}
	if msg.InputSeq > 0 {
		input.Sequence = msg.InputSeq
	}
	input.ClientTime = msg.ClientTime
	return input
}

func StepPlayer(seed uint32, player PlayerState, input PlayerInput, dt float64) PlayerState {
	if dt <= 0 {
		return player
	}
	if dt > MaxDeltaSeconds {
		dt = MaxDeltaSeconds
	}

	player.KickPhase, player.KickTimer, player.KickCooldown = stepKick(player.KickPhase, player.KickTimer, player.KickCooldown, input.Kick, dt, KickCooldownSeconds/math.Max(0.25, math.Min(3, player.AttackSpeed)))
	player.CoyoteTimer = math.Max(0, player.CoyoteTimer-dt)
	if input.JumpPressed {
		player.JumpBufferTimer = JumpBufferSeconds
	} else {
		player.JumpBufferTimer = math.Max(0, player.JumpBufferTimer-dt)
	}
	player.Invulnerable = math.Max(0, player.Invulnerable-dt)
	player.StunTimer = math.Max(0, player.StunTimer-dt)
	player.KickInvulnerable = math.Max(0, player.KickInvulnerable-dt)
	if player.Grounded {
		player.CoyoteTimer = CoyoteTimeSeconds
	}

	accel := AirAcceleration * player.AirControl
	if player.Grounded {
		accel = MoveAcceleration
	}
	targetDir := 0.0
	locked := player.KickPhase != "idle" || player.StunTimer > 0 || player.Health <= 0
	if !locked {
		if input.Left && !input.Right {
			targetDir = -1
			player.Facing = -1
		} else if input.Right && !input.Left {
			targetDir = 1
			player.Facing = 1
		}
	}

	maxSpeed := MaxRunSpeed * player.MovementSpeed
	if targetDir != 0 {
		player.Velocity.X += targetDir * accel * dt
		if player.Velocity.X > maxSpeed {
			player.Velocity.X = maxSpeed
		}
		if player.Velocity.X < -maxSpeed {
			player.Velocity.X = -maxSpeed
		}
	} else if player.Grounded {
		friction := GroundFriction * dt
		if math.Abs(player.Velocity.X) <= friction {
			player.Velocity.X = 0
		} else if player.Velocity.X > 0 {
			player.Velocity.X -= friction
		} else {
			player.Velocity.X += friction
		}
	}

	if player.JumpBufferTimer > 0 && (player.Grounded || player.CoyoteTimer > 0) {
		player.Velocity.Y = -JumpSpeed * player.JumpPower
		player.Grounded = false
		player.CoyoteTimer = 0
		player.JumpBufferTimer = 0
	}
	if !input.JumpHeld && player.Velocity.Y < 0 {
		player.Velocity.Y += Gravity * ShortHopCutoff * dt
	}

	player.Velocity.Y += Gravity * dt
	if player.Velocity.Y > MaxFallSpeed {
		player.Velocity.Y = MaxFallSpeed
	}

	previousBottom := player.Position.Y + PlayerHeight
	player.Position.X += player.Velocity.X * dt
	player.Position.Y += player.Velocity.Y * dt

	minX := 0.0
	maxX := float64(ChunkWidthTiles*TileSize - PlayerWidth)
	if player.Position.X < minX {
		player.Position.X = minX
		player.Velocity.X = 0
	}
	if player.Position.X > maxX {
		player.Position.X = maxX
		player.Velocity.X = 0
	}

	if groundY, ok := landingSurfaceY(seed, player, input.Drop, previousBottom); ok {
		player.Position.Y = groundY - PlayerHeight
		player.Velocity.Y = 0
		player.Grounded = true
		player.CoyoteTimer = CoyoteTimeSeconds
		player.JumpBufferTimer = 0
	} else {
		player.Grounded = false
	}

	return player
}

func stepKick(phase string, timer, cooldown float64, kicked bool, dt float64, cooldownSeconds float64) (string, float64, float64) {
	p := phase
	t := timer + dt
	c := math.Max(0, cooldown-dt)
	switch {
	case p == "idle" && kicked && c <= 0:
		return "windup", 0, c
	case p == "windup" && t >= KickWindupSeconds:
		return "active", 0, c
	case p == "active" && t >= KickActiveSeconds:
		return "recovery", 0, c
	case p == "recovery" && t >= KickRecoverySeconds:
		return "idle", 0, cooldownSeconds
	case p == "idle":
		return "idle", 0, c
	default:
		return p, t, c
	}
}

func landingSurfaceY(seed uint32, player PlayerState, drop bool, previousBottom float64) (float64, bool) {
	if player.Velocity.Y <= 0 {
		return 0, false
	}

	bottom := player.Position.Y + float64(PlayerHeight)
	left := player.Position.X
	right := player.Position.X + float64(PlayerWidth)
	best := math.Inf(1)

	centerChunkY := ChunkYForWorldY(player.Position.Y)
	for chunkY := max(0, centerChunkY-1); chunkY <= centerChunkY+1; chunkY++ {
		chunk := GenerateChunk(seed, chunkY)
		for _, platform := range chunk.Platforms {
			top := float64((chunk.WorldTileY + platform.Y) * TileSize)
			platformLeft := float64(platform.X * TileSize)
			platformRight := float64((platform.X + platform.Width) * TileSize)
			if right <= platformLeft || left >= platformRight {
				continue
			}
			if bottom < top || previousBottom > top+0.001 {
				continue
			}
			if drop {
				continue
			}
			if top < best {
				best = top
			}
		}

		if chunkY == 0 {
			floorTop := float64((chunk.WorldTileY + ChunkHeightTiles - 1) * TileSize)
			if bottom >= floorTop && floorTop < best {
				best = floorTop
			}
		}
	}

	if math.IsInf(best, 1) {
		return 0, false
	}
	return best, true
}

func GenerateChunk(seed uint32, chunkY int) GeneratedChunk {
	tiles := make([]string, ChunkWidthTiles*ChunkHeightTiles)
	for i := range tiles {
		tiles[i] = "empty"
	}

	entryY := ChunkHeightTiles - 2
	entryWidth := 6
	entryX := ChunkWidthTiles/2 - entryWidth/2
	if chunkY == 0 {
		entryWidth = ChunkWidthTiles
		entryX = 0
	}
	entry := PlatformSpan{X: entryX, Y: entryY, Width: entryWidth}
	platforms := []PlatformSpan{entry}

	// Build an always-reachable spine through the chunk. The jump physics can
	// comfortably climb 3 tiles; larger gaps were the source of unreachable maps.
	spineXs := []int{8, 10, 7, 9, 8}
	spineWidths := []int{8, 7, 8, 7, 8}
	for i, y := range []int{13, 10, 7, 4, 1} {
		shift := int((seed+uint32(chunkY*31+i*17))%3) - 1
		x := clampInt(spineXs[i]+shift, 1, ChunkWidthTiles-spineWidths[i]-1)
		platforms = append(platforms, PlatformSpan{X: x, Y: y, Width: spineWidths[i]})
	}
	exit := platforms[len(platforms)-1]

	// Optional side platforms are bonuses, but still close enough to recover
	// from a jump-pad launch. None of these are required for vertical ascent.
	sideCandidates := []PlatformSpan{
		{X: 1, Y: 10, Width: 4},
		{X: 19, Y: 10, Width: 4},
		{X: 2, Y: 4, Width: 4},
		{X: 18, Y: 4, Width: 4},
	}
	jumpPads := make([]JumpPadSpawn, 0, len(sideCandidates))
	for i, p := range sideCandidates {
		if (seed+uint32(chunkY*13+i))%2 == 0 {
			platforms = append(platforms, p)
			if lower, ok := bestAssistedLaunchPlatform(p, platforms); ok {
				jumpPads = append(jumpPads, JumpPadSpawn{
					ID:         "jumpPad:" + itoa(chunkY) + ":" + itoa(i),
					X:          lower.X + lower.Width/2,
					Y:          lower.Y - 1,
					Multiplier: 2.2,
				})
			}
		}
	}

	for _, p := range platforms {
		for x := p.X; x < p.X+p.Width && x < ChunkWidthTiles; x++ {
			if x >= 0 && p.Y >= 0 && p.Y < ChunkHeightTiles {
				tiles[p.Y*ChunkWidthTiles+x] = "oneWay"
			}
		}
	}
	if chunkY == 0 {
		for x := 0; x < ChunkWidthTiles; x++ {
			tiles[(ChunkHeightTiles-1)*ChunkWidthTiles+x] = "solid"
		}
	}

	relicPlatform := platforms[2]
	relics := []RelicSpawn{
		{ID: "relic:" + itoa(chunkY) + ":0", X: relicPlatform.X + relicPlatform.Width/2, Y: relicPlatform.Y - 1},
	}
	enemyPlatform := platforms[3]
	enemies := []EnemySpawn{}
	if chunkY > 0 {
		enemies = append(enemies, EnemySpawn{
			ID:   "enemy:" + itoa(chunkY) + ":0",
			Kind: "goblin",
			X:    enemyPlatform.X + enemyPlatform.Width/2,
			Y:    enemyPlatform.Y - 1,
		})
	}

	return GeneratedChunk{
		Seed:       seed,
		ChunkY:     chunkY,
		Width:      ChunkWidthTiles,
		Height:     ChunkHeightTiles,
		WorldTileY: -chunkY * ChunkHeightTiles,
		Tiles:      tiles,
		Platforms:  platforms,
		Entry:      entry,
		Exit:       exit,
		Relics:     relics,
		Enemies:    enemies,
		JumpPads:   jumpPads,
		WindZones:  []any{},
	}
}

func EnemyStateFromSpawn(chunk GeneratedChunk, spawn EnemySpawn) EnemyState {
	platform := chunk.Entry
	for _, candidate := range chunk.Platforms {
		if candidate.Y == spawn.Y+1 && spawn.X >= candidate.X && spawn.X < candidate.X+candidate.Width {
			platform = candidate
			break
		}
	}
	platformY := float64((chunk.WorldTileY + platform.Y) * TileSize)
	minX := float64(platform.X*TileSize + 2)
	maxX := float64((platform.X+platform.Width)*TileSize - 22)
	speed := 22.0
	facing := 1
	if spawn.X%2 != 0 {
		facing = -1
		speed = -speed
	}
	return EnemyState{
		ID:             spawn.ID,
		Kind:           spawn.Kind,
		Position:       Vec2{X: float64(spawn.X*TileSize - 10), Y: platformY - 24},
		Velocity:       Vec2{X: speed, Y: 0},
		Facing:         facing,
		Health:         2,
		MaxHealth:      2,
		ChunkY:         chunk.ChunkY,
		PatrolMinX:     minX,
		PatrolMaxX:     maxX,
		PlatformY:      platformY,
		AttackCooldown: 0.35,
		HurtCooldown:   0,
	}
}

func bestAssistedLaunchPlatform(target PlatformSpan, platforms []PlatformSpan) (PlatformSpan, bool) {
	var best PlatformSpan
	maxInt := int(^uint(0) >> 1)
	bestScore := maxInt
	for _, lower := range platforms {
		verticalGap := lower.Y - target.Y
		if verticalGap <= 0 || verticalGap > MaxReachableVerticalGapTiles*2 {
			continue
		}
		gap := platformGap(lower, target)
		if verticalGap <= MaxReachableVerticalGapTiles && gap <= MaxReachableHorizontalGapTiles {
			continue
		}
		if gap > MaxReachableHorizontalGapTiles*3 {
			continue
		}
		score := gap + verticalGap*2
		if score < bestScore {
			best = lower
			bestScore = score
		}
	}
	return best, bestScore != maxInt
}

func ApplyJumpPads(seed uint32, player PlayerState) (PlayerState, bool, JumpPadSpawn, float64, float64) {
	if player.Health <= 0 || player.Velocity.Y < 0 {
		return player, false, JumpPadSpawn{}, 0, 0
	}

	playerCenterX := player.Position.X + float64(PlayerWidth)/2
	playerBottom := player.Position.Y + float64(PlayerHeight)
	centerChunkY := ChunkYForWorldY(player.Position.Y)

	for chunkY := max(0, centerChunkY-1); chunkY <= centerChunkY+1; chunkY++ {
		chunk := GenerateChunk(seed, chunkY)
		for _, pad := range chunk.JumpPads {
			padX := float64(pad.X*TileSize) + float64(TileSize)/2
			padY := float64((chunk.WorldTileY+pad.Y)*TileSize) + float64(TileSize)/2
			nearX := math.Abs(playerCenterX-padX) <= float64(TileSize)*0.85
			nearY := playerBottom >= padY-float64(TileSize)*0.9 && playerBottom <= padY+float64(TileSize)*0.9
			if !nearX || !nearY {
				continue
			}
			player.Velocity.Y = -JumpSpeed * math.Max(1, pad.Multiplier)
			player.Grounded = false
			player.CoyoteTimer = 0
			player.JumpBufferTimer = 0
			player.FallStartY = nil
			return player, true, pad, padX, padY
		}
	}

	return player, false, JumpPadSpawn{}, 0, 0
}

func clampInt(value, minValue, maxValue int) int {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func platformGap(a, b PlatformSpan) int {
	aMax := a.X + a.Width - 1
	bMax := b.X + b.Width - 1
	if aMax < b.X {
		return b.X - aMax
	}
	if bMax < a.X {
		return a.X - bMax
	}
	return 0
}

type playerBounds struct {
	x      float64
	y      float64
	width  float64
	height float64
}

func playerRect(player PlayerState) playerBounds {
	return playerBounds{
		x:      player.Position.X,
		y:      player.Position.Y,
		width:  float64(PlayerWidth),
		height: float64(PlayerHeight),
	}
}

func rectsOverlap(a, b playerBounds) bool {
	return a.x < b.x+b.width &&
		a.x+a.width > b.x &&
		a.y < b.y+b.height &&
		a.y+a.height > b.y
}

func inKickRange(kicker, target PlayerState) bool {
	kr := playerRect(kicker)
	tr := playerRect(target)
	rangeX := kr.x
	if kicker.Facing < 0 {
		rangeX = kr.x - KickRangePX
	}
	return rectsOverlap(playerBounds{
		x:      rangeX,
		y:      kr.y - 4,
		width:  float64(PlayerWidth + KickRangePX),
		height: float64(PlayerHeight + 8),
	}, tr)
}

func applyKickHit(kicker, target *PlayerState) {
	force := KickForceAir
	if kicker.Grounded {
		force = KickForceGround
	}
	dir := 1.0
	if kicker.Facing < 0 {
		dir = -1
	}
	knockbackY := 0.0
	if target.Velocity.Y > -60 {
		knockbackY = -60
	}
	applyDamage(target, kicker.Damage, dir*force, knockbackY, HitStunSeconds)
	target.KickInvulnerable = KickHitInvulnerableSeconds
}

func applyDamage(player *PlayerState, damage int, knockbackX, knockbackY, stunSeconds float64) {
	if player.Health <= 0 || player.Invulnerable > 0 {
		return
	}
	player.Health = max(0, player.Health-damage)
	player.Velocity.X = knockbackX * math.Max(0.2, 1-player.KnockbackResistance)
	if knockbackY != 0 {
		player.Velocity.Y = knockbackY
	}
	player.StunTimer = math.Max(player.StunTimer, stunSeconds)
	player.Invulnerable = math.Max(player.Invulnerable, 0.2)
}

func collectibleKindForRelicID(id string) string {
	if strings.HasPrefix(id, "drop:") {
		switch {
		case strings.Contains(id, ":heart:"):
			return "smallHeart"
		case strings.Contains(id, ":jump:"):
			return "purpleCrystal"
		case strings.Contains(id, ":relic:"):
			return "relic"
		}
	}
	hash := uint32(0)
	for _, r := range id {
		hash = hash*31 + uint32(r)
	}
	switch {
	case hash%17 == 0:
		return "bigHeart"
	case hash%7 == 0:
		return "smallHeart"
	case hash%3 == 0:
		return "purpleCrystal"
	default:
		return "relic"
	}
}

func applyCollectible(player *PlayerState, kind string) {
	switch kind {
	case "smallHeart":
		player.Health = min(player.MaxHealth, player.Health+1)
	case "bigHeart":
		player.Health = player.MaxHealth
	case "blueCrystal", "purpleCrystal":
		player.Crystals++
		player.JumpPower = math.Min(1.8, 1+float64(player.Crystals/3)*0.06)
		player.MovementSpeed = math.Min(2, 1+float64(player.Crystals/3)*0.05)
		player.AirControl = math.Min(2, 1+float64(player.Crystals/3)*0.05)
	case "greenCrystal":
		player.Health = min(player.MaxHealth, player.Health+1)
	default:
		player.Relics++
		player.RelicFragments++
		player.Level = 1 + player.Relics/RelicsPerLevel
		player.Damage = 1 + player.Level/3
		player.AttackSpeed = math.Min(3, 1+float64(player.Level-1)*0.04)
	}
}

func playerKickHitsEnemy(player PlayerState, enemy EnemyState) bool {
	if player.KickPhase != "active" || enemy.HurtCooldown > 0 || enemy.Health <= 0 {
		return false
	}
	rangeX := player.Position.X
	if player.Facing < 0 {
		rangeX = player.Position.X - KickRangePX
	}
	return rectsOverlap(playerBounds{
		x:      rangeX,
		y:      player.Position.Y - 4,
		width:  float64(PlayerWidth + KickRangePX),
		height: float64(PlayerHeight + 8),
	}, playerBounds{
		x:      enemy.Position.X,
		y:      enemy.Position.Y,
		width:  22,
		height: 24,
	})
}

func enemyTouchesPlayer(enemy EnemyState, player PlayerState) bool {
	return rectsOverlap(playerBounds{
		x:      enemy.Position.X + 2,
		y:      enemy.Position.Y + 3,
		width:  18,
		height: 21,
	}, playerRect(player))
}

func SpawnPosition(seed uint32, chunkY int) (float64, float64) {
	chunk := GenerateChunk(seed, chunkY)
	x := float64((chunk.Entry.X+chunk.Entry.Width/2)*TileSize) - float64(PlayerWidth)/2
	y := float64((chunk.WorldTileY+chunk.Entry.Y)*TileSize - PlayerHeight)
	return x, y
}

type DebugBox struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type DebugPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type WorldDebugDump struct {
	RoomID           string             `json:"roomId"`
	Seed             uint32             `json:"seed"`
	TileSize         int                `json:"tileSize"`
	ChunkWidthTiles  int                `json:"chunkWidthTiles"`
	ChunkHeightTiles int                `json:"chunkHeightTiles"`
	PlayerBox        DebugBox           `json:"playerBox"`
	CoordinateRules  []string           `json:"coordinateRules"`
	Chunks           []ChunkDebugRecord `json:"chunks"`
}

type ChunkDebugRecord struct {
	ChunkY       int                   `json:"chunkY"`
	WorldTileY   int                   `json:"worldTileY"`
	PixelTopY    float64               `json:"pixelTopY"`
	PixelBottomY float64               `json:"pixelBottomY"`
	Platforms    []PlatformDebugRecord `json:"platforms"`
	SolidTiles   []TileDebugRecord     `json:"solidTiles"`
	Relics       []RelicDebugRecord    `json:"relics"`
	JumpPads     []JumpPadDebugRecord  `json:"jumpPads"`
	Enemies      []EnemyDebugRecord    `json:"enemies"`
	Entry        PlatformDebugRecord   `json:"entry"`
	Exit         PlatformDebugRecord   `json:"exit"`
}

type PlatformDebugRecord struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Tile     PlatformSpan `json:"tile"`
	WorldBox DebugBox     `json:"worldBox"`
}

type TileDebugRecord struct {
	ID       string   `json:"id"`
	Type     string   `json:"type"`
	TileX    int      `json:"tileX"`
	TileY    int      `json:"tileY"`
	WorldBox DebugBox `json:"worldBox"`
}

type RelicDebugRecord struct {
	ID            string     `json:"id"`
	TileX         int        `json:"tileX"`
	TileY         int        `json:"tileY"`
	WorldCenter   DebugPoint `json:"worldCenter"`
	TriggerRadius float64    `json:"triggerRadius"`
}

type JumpPadDebugRecord struct {
	ID          string     `json:"id"`
	TileX       int        `json:"tileX"`
	TileY       int        `json:"tileY"`
	Multiplier  float64    `json:"multiplier"`
	WorldCenter DebugPoint `json:"worldCenter"`
	TriggerBox  DebugBox   `json:"triggerBox"`
}

type EnemyDebugRecord struct {
	ID          string     `json:"id"`
	Kind        string     `json:"kind"`
	SpawnTileX  int        `json:"spawnTileX"`
	SpawnTileY  int        `json:"spawnTileY"`
	WorldBox    DebugBox   `json:"worldBox"`
	GroundY     float64    `json:"groundY"`
	PatrolMinX  float64    `json:"patrolMinX"`
	PatrolMaxX  float64    `json:"patrolMaxX"`
	GroundProbe DebugPoint `json:"groundProbe"`
}

func BuildWorldDebugDump(roomID string, seed uint32, minChunkY, maxChunkY int) WorldDebugDump {
	if maxChunkY < minChunkY {
		minChunkY, maxChunkY = maxChunkY, minChunkY
	}
	if minChunkY < 0 {
		minChunkY = 0
	}
	if maxChunkY < 0 {
		maxChunkY = 0
	}
	dump := WorldDebugDump{
		RoomID:           roomID,
		Seed:             seed,
		TileSize:         TileSize,
		ChunkWidthTiles:  ChunkWidthTiles,
		ChunkHeightTiles: ChunkHeightTiles,
		PlayerBox:        DebugBox{Width: PlayerWidth, Height: PlayerHeight},
		CoordinateRules: []string{
			"world units are pixels",
			"positive Y points downward",
			"chunk.worldTileY is negative for chunks above the start",
			"tile world pixel origin is (tileX * tileSize, (chunk.worldTileY + tileY) * tileSize)",
			"player/enemy positions are top-left collision boxes",
			"platforms are one-way surfaces at the top edge of their tile row",
		},
	}
	for chunkY := minChunkY; chunkY <= maxChunkY; chunkY++ {
		chunk := GenerateChunk(seed, chunkY)
		record := ChunkDebugRecord{
			ChunkY:       chunkY,
			WorldTileY:   chunk.WorldTileY,
			PixelTopY:    float64(chunk.WorldTileY * TileSize),
			PixelBottomY: float64((chunk.WorldTileY + ChunkHeightTiles) * TileSize),
			Platforms:    make([]PlatformDebugRecord, 0, len(chunk.Platforms)),
			SolidTiles:   []TileDebugRecord{},
			Relics:       make([]RelicDebugRecord, 0, len(chunk.Relics)),
			JumpPads:     make([]JumpPadDebugRecord, 0, len(chunk.JumpPads)),
			Enemies:      make([]EnemyDebugRecord, 0, len(chunk.Enemies)),
		}
		for i, platform := range chunk.Platforms {
			platformRecord := debugPlatformRecord(chunk, platform, "platform:"+itoa(chunkY)+":"+itoa(i), "oneWay")
			record.Platforms = append(record.Platforms, platformRecord)
			if platform == chunk.Entry {
				record.Entry = platformRecord
			}
			if platform == chunk.Exit {
				record.Exit = platformRecord
			}
		}
		for tileIndex, tile := range chunk.Tiles {
			if tile != "solid" {
				continue
			}
			tileX := tileIndex % ChunkWidthTiles
			tileY := tileIndex / ChunkWidthTiles
			record.SolidTiles = append(record.SolidTiles, TileDebugRecord{
				ID:    "tile:" + itoa(chunkY) + ":" + itoa(tileX) + ":" + itoa(tileY),
				Type:  tile,
				TileX: tileX,
				TileY: tileY,
				WorldBox: DebugBox{
					X:      float64(tileX * TileSize),
					Y:      float64((chunk.WorldTileY + tileY) * TileSize),
					Width:  TileSize,
					Height: TileSize,
				},
			})
		}
		for _, relic := range chunk.Relics {
			record.Relics = append(record.Relics, RelicDebugRecord{
				ID:    relic.ID,
				TileX: relic.X,
				TileY: relic.Y,
				WorldCenter: DebugPoint{
					X: float64(relic.X*TileSize) + float64(TileSize)/2,
					Y: float64((chunk.WorldTileY+relic.Y)*TileSize) + float64(TileSize)/2,
				},
				TriggerRadius: 20,
			})
		}
		for _, pad := range chunk.JumpPads {
			centerX := float64(pad.X*TileSize) + float64(TileSize)/2
			centerY := float64((chunk.WorldTileY+pad.Y)*TileSize) + float64(TileSize)/2
			record.JumpPads = append(record.JumpPads, JumpPadDebugRecord{
				ID:         pad.ID,
				TileX:      pad.X,
				TileY:      pad.Y,
				Multiplier: pad.Multiplier,
				WorldCenter: DebugPoint{
					X: centerX,
					Y: centerY,
				},
				TriggerBox: DebugBox{
					X:      centerX - float64(TileSize)*0.85,
					Y:      centerY - float64(TileSize)*0.9,
					Width:  float64(TileSize) * 1.7,
					Height: float64(TileSize) * 1.8,
				},
			})
		}
		for _, spawn := range chunk.Enemies {
			enemy := EnemyStateFromSpawn(chunk, spawn)
			record.Enemies = append(record.Enemies, EnemyDebugRecord{
				ID:         spawn.ID,
				Kind:       spawn.Kind,
				SpawnTileX: spawn.X,
				SpawnTileY: spawn.Y,
				WorldBox: DebugBox{
					X:      enemy.Position.X,
					Y:      enemy.Position.Y,
					Width:  22,
					Height: 24,
				},
				GroundY:    enemy.PlatformY,
				PatrolMinX: enemy.PatrolMinX,
				PatrolMaxX: enemy.PatrolMaxX,
				GroundProbe: DebugPoint{
					X: enemy.Position.X + 11,
					Y: enemy.PlatformY,
				},
			})
		}
		dump.Chunks = append(dump.Chunks, record)
	}
	return dump
}

func debugPlatformRecord(chunk GeneratedChunk, platform PlatformSpan, id, kind string) PlatformDebugRecord {
	return PlatformDebugRecord{
		ID:   id,
		Type: kind,
		Tile: platform,
		WorldBox: DebugBox{
			X:      float64(platform.X * TileSize),
			Y:      float64((chunk.WorldTileY + platform.Y) * TileSize),
			Width:  float64(platform.Width * TileSize),
			Height: TileSize,
		},
	}
}

func GroundYForPlayer(seed uint32, p PlayerState) float64 {
	chunkY := ChunkYForWorldY(p.Position.Y)
	chunk := GenerateChunk(seed, chunkY)
	best := float64((chunk.WorldTileY + ChunkHeightTiles - 1) * TileSize)
	centerX := p.Position.X + float64(PlayerWidth)/2
	bottom := p.Position.Y + float64(PlayerHeight)
	for _, platform := range chunk.Platforms {
		left := float64(platform.X * TileSize)
		right := float64((platform.X + platform.Width) * TileSize)
		y := float64((chunk.WorldTileY + platform.Y) * TileSize)
		if centerX >= left && centerX <= right && bottom <= y+24 && y < best {
			best = y
		}
	}
	return best
}

func ChunkYForWorldY(y float64) int {
	return max(0, -int(math.Floor(math.Floor(y/TileSize)/ChunkHeightTiles)))
}

func HashString(s string) uint32 {
	h := uint32(0x811c9dc5)
	for _, r := range s {
		h ^= uint32(r)
		h *= 0x01000193
	}
	return h
}

func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
