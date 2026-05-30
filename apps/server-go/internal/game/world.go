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
		HitRange:            KickRangePX,
		AttackCooldownMs:    KickCooldownSeconds * 1000,
		DamageReduction:     0,
		Shield:              0,
		MaxShield:           0,
		ShieldRegenPerSec:   0,
		ShieldRegenDelayMs:  skillShieldRegenDelayMs,
		LastDamageAt:        0,
		ShieldRegenCooldown: 0,
		JumpPowerMultiplier: 1,
		AirControlMultiplier: 1,
		ExtraJumps:          0,
		ExtraJumpsUsed:      0,
		DashUnlocked:        false,
		DashCooldownMs:      skillDashBaseCooldownMs,
		DashCooldownRemainingMs: 0,
		DashTimerMs:         0,
		PickupRadius:        PickupRadius,
		XPGainMultiplier:    1,
		KillXPMultiplier:    1,
		SelectedSkills:      map[string]int{},
		ShockwaveCounter:    0,
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
	ensurePlayerSkillState(&player)

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
	player.ShieldRegenCooldown = math.Max(0, player.ShieldRegenCooldown-dt*1000)
	player.DashCooldownRemainingMs = math.Max(0, player.DashCooldownRemainingMs-dt*1000)
	player.DashTimerMs = math.Max(0, player.DashTimerMs-dt*1000)
	if player.MaxShield > 0 && player.ShieldRegenCooldown <= 0 && player.Shield < player.MaxShield {
		player.Shield = math.Min(player.MaxShield, player.Shield+player.ShieldRegenPerSec*dt)
	}
	if player.Grounded {
		player.CoyoteTimer = CoyoteTimeSeconds
		player.ExtraJumpsUsed = 0
	}
	previousY := player.Position.Y

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
	applyWorldWindZones(seed, &player, dt)

	if !locked && input.Dash && player.DashUnlocked && player.DashCooldownRemainingMs <= 0 {
		dashDir := targetDir
		if dashDir == 0 {
			dashDir = float64(player.Facing)
		}
		player.Velocity.X = dashDir * math.Max(maxSpeed*1.8, 260)
		player.DashCooldownRemainingMs = player.DashCooldownMs
		player.DashTimerMs = 120
	}

	if player.JumpBufferTimer > 0 && (player.Grounded || player.CoyoteTimer > 0) {
		player.Velocity.Y = -JumpSpeed * player.JumpPower
		player.Grounded = false
		player.CoyoteTimer = 0
		player.JumpBufferTimer = 0
		player.ExtraJumpsUsed = 0
	} else if player.JumpBufferTimer > 0 && !player.Grounded && player.ExtraJumpsUsed < player.ExtraJumps {
		bonus := 1 + float64(max(0, skillStacks(player, "double_jump")-1))*0.08
		player.Velocity.Y = -JumpSpeed * player.JumpPower * bonus
		player.ExtraJumpsUsed++
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

	updateFatalFall(&player, previousY)
	applyWorldHazards(seed, &player)
	return player
}

func applyWorldWindZones(seed uint32, player *PlayerState, dt float64) {
	if player.Health <= 0 {
		return
	}
	centerChunkY := ChunkYForWorldY(player.Position.Y)
	bounds := playerRect(*player)
	for chunkY := max(0, centerChunkY-1); chunkY <= centerChunkY+1; chunkY++ {
		chunk := GenerateChunk(seed, chunkY)
		for _, zone := range chunk.WindZones {
			zoneRect := playerBounds{
				x:      float64(zone.X * TileSize),
				y:      float64((chunk.WorldTileY + zone.Y) * TileSize),
				width:  float64(zone.Width * TileSize),
				height: float64(zone.Height * TileSize),
			}
			if !rectsOverlap(bounds, zoneRect) {
				continue
			}
			target := float64(zone.Direction) * math.Min(MaxRunSpeed*1.55, zone.Strength*0.55)
			player.Velocity.X = moveTowardFloat(player.Velocity.X, target, zone.Strength*3.4*dt)
			player.Velocity.X = math.Max(-MaxRunSpeed*1.55, math.Min(MaxRunSpeed*1.55, player.Velocity.X))
		}
	}
}

func moveTowardFloat(value, target, maxDelta float64) float64 {
	if value < target {
		return math.Min(value+maxDelta, target)
	}
	if value > target {
		return math.Max(value-maxDelta, target)
	}
	return target
}

func applyWorldHazards(seed uint32, player *PlayerState) {
	if player.Health <= 0 || player.Invulnerable > 0 {
		return
	}
	left := int(math.Floor(player.Position.X / TileSize))
	right := int(math.Floor((player.Position.X + float64(PlayerWidth) - 0.001) / TileSize))
	top := int(math.Floor(player.Position.Y / TileSize))
	bottom := int(math.Floor((player.Position.Y + float64(PlayerHeight) - 0.001) / TileSize))
	for ty := top; ty <= bottom; ty++ {
		for tx := left; tx <= right; tx++ {
			if worldTileKind(seed, tx, ty) != "hazard" {
				continue
			}
			chunkY := max(0, -int(math.Floor(float64(ty)/ChunkHeightTiles)))
			damage := 1 + min(3, chunkY/10)
			dir := -1.0
			if player.Velocity.X < 0 {
				dir = 1
			}
			applyDamage(player, damage, dir*130, -85, 0.18)
			player.Invulnerable = math.Max(player.Invulnerable, 0.85)
			return
		}
	}
}

func worldTileKind(seed uint32, tileX, tileY int) string {
	if tileX < 0 || tileX >= ChunkWidthTiles {
		return "solid"
	}
	if tileY >= ChunkHeightTiles {
		return "solid"
	}
	chunkY := max(0, -int(math.Floor(float64(tileY)/ChunkHeightTiles)))
	chunk := GenerateChunk(seed, chunkY)
	localY := tileY + chunkY*ChunkHeightTiles
	if localY < 0 || localY >= ChunkHeightTiles {
		return "empty"
	}
	return chunk.Tiles[localY*ChunkWidthTiles+tileX]
}

func updateFatalFall(player *PlayerState, previousY float64) {
	if !player.Grounded && player.Velocity.Y > 0 {
		if player.FallStartY == nil {
			startY := previousY
			player.FallStartY = &startY
		}
		if player.FallStartY != nil && player.Position.Y-*player.FallStartY > FatalFallDistancePX && player.Invulnerable <= 0 {
			player.Health = 0
		}
		return
	}
	if player.Grounded {
		if player.FallStartY != nil && player.Position.Y-*player.FallStartY > FatalFallDistancePX && player.Invulnerable <= 0 {
			player.Health = 0
		}
		player.FallStartY = nil
		return
	}
	if player.Velocity.Y <= 0 {
		player.FallStartY = nil
	}
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
	regionIndex := RegionIndexForChunkY(chunkY)
	plan := BuildRegionPlan(seed, regionIndex)
	platformRecords := plan.Platforms[chunkY]
	platforms := make([]PlatformSpan, 0, len(platformRecords))
	for _, record := range platformRecords {
		platforms = append(platforms, record.Span)
	}
	if len(platforms) == 0 {
		platforms = append(platforms, platformFromCenter(ChunkWidthTiles/2, ChunkHeightTiles-2, 8))
	}
	entry := plan.EntryForChunk(chunkY)
	exit := plan.ExitForChunk(chunkY)

	tiles := make([]string, ChunkWidthTiles*ChunkHeightTiles)
	for i := range tiles {
		tiles[i] = "empty"
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
	for _, platform := range platformRecords {
		if chunkY < 2 || platform.Kind != "risk" || platform.Span.Y <= 1 {
			continue
		}
		hazardChance := min(72, 14+chunkY*4)
		roll := int(HashString("hazard:"+itoa(seedAsInt(seed))+":"+itoa(chunkY)+":"+itoa(platform.Span.X)+":"+itoa(platform.Span.Y)) % 100)
		if roll >= hazardChance {
			continue
		}
		hazardX := platform.Span.X + platform.Span.Width/2
		hazardY := platform.Span.Y - 1
		if hazardX >= 0 && hazardX < ChunkWidthTiles && hazardY >= 0 && hazardY < ChunkHeightTiles && tiles[hazardY*ChunkWidthTiles+hazardX] == "empty" {
			tiles[hazardY*ChunkWidthTiles+hazardX] = "hazard"
		}
	}

	relics := plan.Relics[chunkY]
	if relics == nil {
		relics = []RelicSpawn{}
	}
	for _, relic := range relics {
		if relic.Y >= 0 && relic.Y < ChunkHeightTiles && relic.X >= 0 && relic.X < ChunkWidthTiles {
			tiles[relic.Y*ChunkWidthTiles+relic.X] = "relic"
		}
	}
	landmarks := plan.Landmarks[chunkY]
	if landmarks == nil {
		landmarks = []LandmarkSpawn{}
	}
	routes := plan.ChunkRoutes(chunkY)
	if routes == nil {
		routes = []RouteBranch{}
	}
	enemies := plan.Enemies[chunkY]
	if enemies == nil {
		enemies = []EnemySpawn{}
	}
	jumpPads := plan.JumpPads[chunkY]
	if jumpPads == nil {
		jumpPads = []JumpPadSpawn{}
	}
	windZones := windZonesForChunk(seed, chunkY, platformRecords)
	portal := plan.PortalForChunk(chunkY)

	return GeneratedChunk{
		Seed:        seed,
		ChunkY:      chunkY,
		Width:       ChunkWidthTiles,
		Height:      ChunkHeightTiles,
		WorldTileY:  -chunkY * ChunkHeightTiles,
		RegionID:    plan.ID,
		RegionIndex: plan.Index,
		RegionName:  plan.Profile.Name,
		Checkpoint:  IsCheckpointChunk(chunkY),
		Tiles:       tiles,
		Platforms:   platforms,
		Entry:       entry,
		Exit:        exit,
		Portal:      portal,
		Landmarks:   landmarks,
		Routes:      routes,
		Relics:      relics,
		Enemies:     enemies,
		JumpPads:    jumpPads,
		WindZones:   windZones,
	}
}

func seedAsInt(seed uint32) int {
	return int(seed & 0x7fffffff)
}

type worldRegionProfile struct {
	ID             string
	Name           string
	Landmark       string
	PortalStyle    string
	EnemyKind      string
	LengthChunks   int
	SafeWidth      int
	ContestWidth   int
	CollectibleAdd int
}

type levelDesignConfig struct {
	TargetPlatformDensity     float64
	RoutesPerBandMin          int
	RoutesPerBandMax          int
	RestPlatformEveryBands    int
	RiskyShortcutChance        float64
	JumpPadChance             float64
	MaxNormalJumpHeight       float64
	MaxNormalJumpHorizontal   float64
	JumpPadBoostHeight        float64
	JumpPadMultiplier         float64
}

var LevelDesign = levelDesignConfig{
	TargetPlatformDensity:   0.64,
	RoutesPerBandMin:        2,
	RoutesPerBandMax:        3,
	RestPlatformEveryBands:  3,
	RiskyShortcutChance:     0.35,
	JumpPadChance:           0.35,
	MaxNormalJumpHeight:     (JumpSpeed * JumpSpeed) / (2 * Gravity),
	MaxNormalJumpHorizontal: float64(MaxReachableHorizontalGapTiles * TileSize),
	JumpPadBoostHeight:     (JumpSpeed * 2.35 * JumpSpeed * 2.35) / (2 * Gravity),
	JumpPadMultiplier:       2.35,
}

var worldRegionProfiles = []worldRegionProfile{
	{ID: "floating-garden", Name: "Floating Garden", Landmark: "giant tree", PortalStyle: "living-tree-gate", EnemyKind: "goblin", LengthChunks: 4, SafeWidth: 8, ContestWidth: 11, CollectibleAdd: 1},
	{ID: "ancient-ruins", Name: "Ancient Ruins", Landmark: "broken ruin gate", PortalStyle: "ruin-arch", EnemyKind: "goblin", LengthChunks: 4, SafeWidth: 6, ContestWidth: 10, CollectibleAdd: 2},
	{ID: "crystal-heights", Name: "Crystal Heights", Landmark: "crystal tower", PortalStyle: "crystal-gateway", EnemyKind: "yeti", LengthChunks: 5, SafeWidth: 5, ContestWidth: 8, CollectibleAdd: 3},
	{ID: "mechanical-skyworks", Name: "Mechanical Skyworks", Landmark: "crashed airship", PortalStyle: "sky-beacon", EnemyKind: "goblin", LengthChunks: 4, SafeWidth: 8, ContestWidth: 12, CollectibleAdd: 2},
	{ID: "storm-islands", Name: "Storm Islands", Landmark: "storm generator", PortalStyle: "storm-ring", EnemyKind: "yeti", LengthChunks: 5, SafeWidth: 4, ContestWidth: 8, CollectibleAdd: 3},
	{ID: "celestial-sanctuary", Name: "Celestial Sanctuary", Landmark: "celestial shrine", PortalStyle: "celestial-shrine", EnemyKind: "iceGolem", LengthChunks: 5, SafeWidth: 6, ContestWidth: 10, CollectibleAdd: 2},
}

type RegionPlan struct {
	ID            string
	Index         int
	StartChunkY   int
	EndChunkY     int
	ExitChunkY    int
	Profile       worldRegionProfile
	Platforms     map[int][]plannedPlatform
	Relics        map[int][]RelicSpawn
	JumpPads      map[int][]JumpPadSpawn
	Enemies       map[int][]EnemySpawn
	Landmarks     map[int][]LandmarkSpawn
	RouteBranches []RouteBranch
	Portal        PortalSpawn
}

type plannedPlatform struct {
	Span    PlatformSpan
	RouteID string
	Kind    string
}

func RegionForChunkY(chunkY int) worldRegionProfile {
	return worldRegionProfiles[RegionIndexForChunkY(chunkY)%len(worldRegionProfiles)]
}

func RegionIndexForChunkY(chunkY int) int {
	if chunkY <= 0 {
		return 0
	}
	cursor := 0
	for regionIndex := 0; ; regionIndex++ {
		next := cursor + RegionLengthForIndex(regionIndex)
		if chunkY < next {
			return regionIndex
		}
		cursor = next
	}
}

func RegionStartChunkY(regionIndex int) int {
	if regionIndex <= 0 {
		return 0
	}
	chunkY := 0
	for i := 0; i < regionIndex; i++ {
		chunkY += RegionLengthForIndex(i)
	}
	return chunkY
}

func RegionLengthForIndex(regionIndex int) int {
	return worldRegionProfiles[positiveMod(regionIndex, len(worldRegionProfiles))].LengthChunks
}

func IsCheckpointChunk(chunkY int) bool {
	if chunkY <= 0 {
		return true
	}
	return RegionStartChunkY(RegionIndexForChunkY(chunkY)) == chunkY
}

func BuildRegionPlan(seed uint32, regionIndex int) RegionPlan {
	profile := worldRegionProfiles[positiveMod(regionIndex, len(worldRegionProfiles))]
	startChunkY := RegionStartChunkY(regionIndex)
	length := profile.LengthChunks
	exitChunkY := startChunkY + length
	plan := RegionPlan{
		ID:          profile.ID + ":" + itoa(regionIndex),
		Index:       regionIndex,
		StartChunkY: startChunkY,
		EndChunkY:   exitChunkY - 1,
		ExitChunkY:  exitChunkY,
		Profile:     profile,
		Platforms:   map[int][]plannedPlatform{},
		Relics:      map[int][]RelicSpawn{},
		JumpPads:    map[int][]JumpPadSpawn{},
		Enemies:     map[int][]EnemySpawn{},
		Landmarks:   map[int][]LandmarkSpawn{},
	}

	routeSpecs := buildRouteSpecs(profile)
	routes := make([]RouteBranch, 0, len(routeSpecs))
	for _, spec := range routeSpecs {
		route := RouteBranch{ID: spec.ID, Kind: spec.Kind, Label: spec.Label, Hidden: spec.Hidden, Reward: spec.Reward, Nodes: []Vec2{}}
		for local := 0; local < length; local++ {
			chunkY := startChunkY + local
			entryY := ChunkHeightTiles - 2
			entryCenter := routeCenterForPlan(seed, profile, regionIndex, local, spec, 0)
			if spec.Kind == "safe" {
				entryWidth := profile.ContestWidth
				if chunkY == 0 {
					entryWidth = max(profile.ContestWidth, 14)
				}
				plan.addPlatform(chunkY, platformFromCenter(entryCenter, entryY, entryWidth), spec.ID, "portal-entry")
			}
			for layer, y := range routeRowsForSpec(spec) {
				center := routeCenterForPlan(seed, profile, regionIndex, local, spec, layer+1)
				width := spec.Width
				if spec.Kind == "safe" && (layer == 1 || layer == 3) {
					width = min(profile.ContestWidth, width+2)
				}
				if local == length-1 && layer == len(routeRowsForSpec(spec))-1 && spec.Kind == "safe" {
					width = profile.ContestWidth
				}
				span := platformFromCenter(center, y, width)
				plan.addPlatform(chunkY, span, spec.ID, spec.Kind)
				route.Nodes = append(route.Nodes, Vec2{
					X: float64(span.X*TileSize) + float64(span.Width*TileSize)/2,
					Y: float64(((-chunkY * ChunkHeightTiles) + span.Y) * TileSize),
				})
			}
		}
		routes = append(routes, route)
	}
	plan.RouteBranches = routes
	plan.ensureReachability()
	plan.placeLandmarks(seed)
	plan.placePortals()
	plan.placeCollectibles()
	plan.placeJumpPads(seed)
	plan.placeEnemies()
	return plan
}

type routeSpec struct {
	ID     string
	Kind   string
	Label  string
	Offset int
	Width  int
	Reward int
	Hidden bool
}

func buildRouteSpecs(profile worldRegionProfile) []routeSpec {
	return []routeSpec{
		{ID: "safe", Kind: "safe", Label: "safe long route", Offset: 0, Width: profile.SafeWidth, Reward: 1},
		{ID: "risk", Kind: "risk", Label: "risky shortcut", Offset: -8, Width: max(3, profile.SafeWidth-3), Reward: 3},
		{ID: "relic", Kind: "relic", Label: "relic detour", Offset: 8, Width: max(4, profile.SafeWidth-2), Reward: 4},
	}
}

func routeRowsForSpec(spec routeSpec) []int {
	switch spec.Kind {
	case "risk":
		return []int{10, 4}
	case "relic":
		return []int{13, 7}
	default:
		return []int{13, 10, 7, 4, 1}
	}
}

func routeCenterForPlan(seed uint32, profile worldRegionProfile, regionIndex, local int, spec routeSpec, layer int) int {
	baseByProfile := map[string]int{
		"floating-garden":     11,
		"ancient-ruins":       13,
		"crystal-heights":     9,
		"mechanical-skyworks": 15,
		"storm-islands":       10,
		"celestial-sanctuary": 12,
	}
	center := scaleDesignX(baseByProfile[profile.ID] + spec.Offset)
	switch profile.ID {
	case "floating-garden":
		center += scaleDesignOffset([]int{-2, 2, -1, 3, 0}[layer%5])
	case "ancient-ruins":
		center += scaleDesignOffset(alternatingOffset(local+layer, 2))
	case "crystal-heights":
		center += scaleDesignOffset([]int{-3, -2, 0, 2, 3}[layer%5])
	case "mechanical-skyworks":
		center += scaleDesignOffset([]int{-4, 3, 4, -2, 0}[layer%5])
	case "storm-islands":
		center += scaleDesignOffset(alternatingOffset(local+layer, 4))
	case "celestial-sanctuary":
		center += scaleDesignOffset([]int{-5, -2, 3, 5, 0}[layer%5])
	}
	center += deterministicSigned(seed, regionIndex*37+local*11, layer+len(spec.ID), 2)
	return clampInt(center, 3, ChunkWidthTiles-4)
}

func scaleDesignX(x int) int {
	return int(math.Round(float64(x) * float64(ChunkWidthTiles) / 24.0))
}

func scaleDesignOffset(offset int) int {
	return int(math.Round(float64(offset) * float64(ChunkWidthTiles) / 24.0))
}

func (p *RegionPlan) addPlatform(chunkY int, span PlatformSpan, routeID, kind string) {
	for i, existing := range p.Platforms[chunkY] {
		if existing.Span.Y == span.Y && rangesOverlapOrTouch(existing.Span, span) {
			mergedLeft := min(existing.Span.X, span.X)
			mergedRight := max(existing.Span.X+existing.Span.Width, span.X+span.Width)
			existing.Span.X = mergedLeft
			existing.Span.Width = clampInt(mergedRight-mergedLeft, 3, ChunkWidthTiles-2)
			if kind == "safe" || existing.Kind == "" {
				existing.Kind = kind
				existing.RouteID = routeID
			}
			p.Platforms[chunkY][i] = existing
			return
		}
	}
	p.Platforms[chunkY] = append(p.Platforms[chunkY], plannedPlatform{Span: span, RouteID: routeID, Kind: kind})
}

func (p *RegionPlan) ensureReachability() {
	for chunkY, platforms := range p.Platforms {
		if len(platforms) == 0 {
			continue
		}
		for i := range platforms {
			if platforms[i].Span.Y == ChunkHeightTiles-2 {
				continue
			}
			lower := []PlatformSpan{}
			for _, candidate := range platforms {
				if candidate.Span.Y > platforms[i].Span.Y {
					lower = append(lower, candidate.Span)
				}
			}
			platforms[i].Span = makeReachableFromLower(platforms[i].Span, lower)
		}
		p.Platforms[chunkY] = platforms
	}
}

func (p RegionPlan) EntryForChunk(chunkY int) PlatformSpan {
	best := platformFromCenter(ChunkWidthTiles/2, ChunkHeightTiles-2, 7)
	for _, platform := range p.Platforms[chunkY] {
		if platform.Span.Y == ChunkHeightTiles-2 {
			if platform.Kind == "portal-entry" || best.Y != ChunkHeightTiles-2 {
				return platform.Span
			}
			best = platform.Span
		}
	}
	return best
}

func (p RegionPlan) ExitForChunk(chunkY int) PlatformSpan {
	best := p.EntryForChunk(chunkY)
	for _, platform := range p.Platforms[chunkY] {
		if platform.Span.Y < best.Y || (platform.Span.Y == best.Y && platform.Kind == "safe") {
			best = platform.Span
		}
	}
	return best
}

func (p RegionPlan) PortalForChunk(chunkY int) *PortalSpawn {
	if !IsCheckpointChunk(chunkY) || chunkY != p.StartChunkY {
		return nil
	}
	portal := p.Portal
	return &portal
}

func (p RegionPlan) ChunkRoutes(chunkY int) []RouteBranch {
	out := []RouteBranch{}
	for _, route := range p.RouteBranches {
		nodes := []Vec2{}
		top := float64((-chunkY * ChunkHeightTiles) * TileSize)
		bottom := float64(((-chunkY * ChunkHeightTiles) + ChunkHeightTiles) * TileSize)
		for _, node := range route.Nodes {
			if node.Y >= top && node.Y < bottom {
				nodes = append(nodes, node)
			}
		}
		if len(nodes) == 0 {
			continue
		}
		r := route
		r.Nodes = nodes
		out = append(out, r)
	}
	return out
}

func (p *RegionPlan) placePortals() {
	entry := p.EntryForChunk(p.StartChunkY)
	width := min(CheckpointPortalWidthTiles, entry.Width)
	x := clampInt(entry.X+(entry.Width-width)/2, 0, ChunkWidthTiles-width)
	y := entry.Y
	p.Portal = PortalSpawn{
		ID:         "portal:" + p.ID + ":entry",
		RegionID:   p.ID,
		ChunkY:     p.StartChunkY,
		X:          x,
		Y:          y,
		Width:      width,
		Style:      p.Profile.PortalStyle,
		Checkpoint: true,
		Trigger: TriggerBox{
			X:      float64(x * TileSize),
			Y:      float64(((-p.StartChunkY*ChunkHeightTiles)+y)*TileSize) - 42,
			Width:  float64(width * TileSize),
			Height: 58,
		},
	}
}

func (p *RegionPlan) placeLandmarks(seed uint32) {
	midChunk := p.StartChunkY + max(0, (p.Profile.LengthChunks-1)/2)
	entry := p.EntryForChunk(p.StartChunkY)
	p.Landmarks[p.StartChunkY] = append(p.Landmarks[p.StartChunkY], LandmarkSpawn{
		ID:       "landmark:" + p.ID + ":portal",
		RegionID: p.ID,
		Kind:     p.Profile.Landmark,
		X:        entry.X,
		Y:        max(0, entry.Y-5),
		Width:    min(ChunkWidthTiles-entry.X, max(8, entry.Width+4)),
		Height:   6,
	})
	if platforms := p.Platforms[midChunk]; len(platforms) > 0 {
		span := platforms[len(platforms)/2].Span
		p.Landmarks[midChunk] = append(p.Landmarks[midChunk], LandmarkSpawn{
			ID:       "landmark:" + p.ID + ":vista",
			RegionID: p.ID,
			Kind:     p.Profile.Landmark + " vista",
			X:        clampInt(span.X-1, 0, ChunkWidthTiles-2),
			Y:        max(0, span.Y-6),
			Width:    min(ChunkWidthTiles-span.X, max(6, span.Width+3)),
			Height:   5 + int(seed%2),
			Hidden:   false,
		})
	}
}

func (p *RegionPlan) placeCollectibles() {
	for chunkY := p.StartChunkY; chunkY <= p.EndChunkY; chunkY++ {
		target := 3 + min(2, p.Profile.CollectibleAdd)
		if chunkY == p.StartChunkY || chunkY == p.EndChunkY {
			target++
		}
		relics := []RelicSpawn{}
		for _, platform := range p.Platforms[chunkY] {
			if len(relics) >= target {
				break
			}
			if platform.Span.Y <= 1 {
				continue
			}
			addRelicOnPlatform(&relics, chunkY, platform, platform.Span.Width/2)
			if len(relics) < target && platform.Kind == "relic" && platform.Span.Width >= 4 {
				addRelicOnPlatform(&relics, chunkY, platform, max(1, platform.Span.Width-2))
			}
		}
		p.Relics[chunkY] = relics
	}
}

func addRelicOnPlatform(relics *[]RelicSpawn, chunkY int, platform plannedPlatform, offset int) {
	x := clampInt(platform.Span.X+offset, 1, ChunkWidthTiles-2)
	y := platform.Span.Y - 1
	if y < 0 {
		return
	}
	for _, existing := range *relics {
		if existing.X == x && existing.Y == y {
			return
		}
	}
	prefix := "relic"
	if platform.Kind == "risk" {
		prefix = "riskRelic"
	} else if platform.Kind == "relic" {
		prefix = "cache"
	}
	*relics = append(*relics, RelicSpawn{ID: prefix + ":" + itoa(chunkY) + ":" + itoa(len(*relics)), X: x, Y: y})
}

func (p *RegionPlan) placeJumpPads(seed uint32) {
	jumpChunk := p.StartChunkY + max(1, p.Profile.LengthChunks-2)
	if jumpChunk == p.StartChunkY || IsCheckpointChunk(jumpChunk) {
		return
	}
	candidates := []plannedPlatform{}
	for _, platform := range p.Platforms[jumpChunk] {
		if (platform.Kind == "risk" || platform.Kind == "relic") && platform.Span.Y >= 7 && platform.Span.Y <= 13 {
			candidates = append(candidates, platform)
		}
	}
	if len(candidates) == 0 {
		return
	}
	platform := candidates[int((seed+uint32(p.Index*131))%uint32(len(candidates)))]
	p.JumpPads[jumpChunk] = []JumpPadSpawn{{
		ID:         "jumpPad:" + p.ID + ":shortcut",
		X:          platform.Span.X + platform.Span.Width/2,
		Y:          platform.Span.Y - 1,
		Multiplier: LevelDesign.JumpPadMultiplier,
	}}
}

func (p *RegionPlan) placeEnemies() {
	for chunkY := p.StartChunkY; chunkY <= p.EndChunkY; chunkY++ {
		if chunkY == 0 {
			continue
		}
		enemies := []EnemySpawn{}
		maxEnemies := 1 + min(2, chunkY/8)
		for _, platform := range p.Platforms[chunkY] {
			if len(enemies) >= maxEnemies || platform.Span.Width < 4 || platform.Span.Y <= 1 {
				continue
			}
			if platform.Kind != "safe" && platform.Kind != "risk" {
				continue
			}
			chance := 42 + min(38, chunkY*3)
			roll := int(HashString("enemy:"+itoa(chunkY)+":"+itoa(platform.Span.X)+":"+itoa(platform.Span.Y)+":"+platform.Kind) % 100)
			if roll >= chance && platform.Kind != "risk" {
				continue
			}
			enemies = append(enemies, EnemySpawn{
				ID:   "enemy:" + itoa(chunkY) + ":" + itoa(len(enemies)),
				Kind: enemyKindForProgression(p.Profile.EnemyKind, chunkY, len(enemies)),
				X:    platform.Span.X + platform.Span.Width/2,
				Y:    platform.Span.Y - 1,
			})
		}
		p.Enemies[chunkY] = enemies
	}
}

func enemyKindForProgression(profileKind string, chunkY, index int) string {
	if chunkY < 4 {
		if index == 1 {
			return "goblinScout"
		}
		return profileKind
	}
	pools := [][]string{
		{"goblin", "goblinScout", "archer"},
		{"goblinScout", "goblinChief", "archer", "skeleton"},
		{"skeleton", "archer", "iceBat"},
		{"skeletonArmored", "iceBat", "windSpirit", "iceGolem"},
		{"skeletonArmored", "iceGolem", "windSpirit", "yeti"},
	}
	band := min(len(pools)-1, chunkY/5)
	pool := pools[band]
	return pool[(chunkY+index)%len(pool)]
}

func windZonesForChunk(seed uint32, chunkY int, platforms []plannedPlatform) []WindZoneSpawn {
	if chunkY < 8 {
		return []WindZoneSpawn{}
	}
	maxZones := 1
	if chunkY >= 16 {
		maxZones = 2
	}
	zones := []WindZoneSpawn{}
	for _, platform := range platforms {
		if len(zones) >= maxZones || platform.Span.Width < 4 || platform.Span.Y < 5 {
			continue
		}
		roll := int(HashString("wind:"+itoa(seedAsInt(seed))+":"+itoa(chunkY)+":"+itoa(platform.Span.X)+":"+itoa(platform.Span.Y)) % 100)
		chance := 24 + min(34, chunkY*2)
		if roll >= chance {
			continue
		}
		width := clampInt(platform.Span.Width+1, 3, 5)
		height := 4
		x := clampInt(platform.Span.X+platform.Span.Width/2-width/2, 0, ChunkWidthTiles-width)
		y := clampInt(platform.Span.Y-height, 0, ChunkHeightTiles-height-1)
		direction := 1
		if roll%2 == 1 {
			direction = -1
		}
		strength := 480.0 + float64(min(260, chunkY*18))
		zones = append(zones, WindZoneSpawn{
			ID:        "wind:" + itoa(chunkY) + ":" + itoa(len(zones)),
			X:         x,
			Y:         y,
			Width:     width,
			Height:    height,
			Direction: direction,
			Strength:  strength,
		})
	}
	return zones
}

func platformFromCenter(center, y, width int) PlatformSpan {
	width = clampInt(width, 3, ChunkWidthTiles-2)
	return PlatformSpan{
		X:     clampInt(center-width/2, 1, ChunkWidthTiles-width-1),
		Y:     y,
		Width: width,
	}
}

func appendReachablePlatform(current []PlatformSpan, lower []PlatformSpan, platform PlatformSpan) []PlatformSpan {
	platform = makeReachableFromLower(platform, lower)
	for _, existing := range current {
		if existing.Y == platform.Y && rangesOverlapOrTouch(existing, platform) {
			return current
		}
		if existing == platform {
			return current
		}
	}
	return append(current, platform)
}

func makeReachableFromLower(platform PlatformSpan, lower []PlatformSpan) PlatformSpan {
	if len(lower) == 0 || reachableFromAnyLower(platform, lower) {
		return platform
	}
	candidates := make([]PlatformSpan, 0, len(lower))
	for _, candidate := range lower {
		verticalGap := candidate.Y - platform.Y
		if verticalGap > 0 && verticalGap <= MaxReachableVerticalGapTiles {
			candidates = append(candidates, candidate)
		}
	}
	if len(candidates) == 0 {
		candidates = lower
	}
	best := candidates[0]
	bestGap := platformGap(best, platform)
	for _, candidate := range candidates[1:] {
		if gap := platformGap(candidate, platform); gap < bestGap {
			best = candidate
			bestGap = gap
		}
	}
	if platform.X > best.X {
		platform.X = best.X + best.Width - 1 + MaxReachableHorizontalGapTiles - platform.Width/2
	} else {
		platform.X = best.X - MaxReachableHorizontalGapTiles + platform.Width/2
	}
	platform.X = clampInt(platform.X, 1, ChunkWidthTiles-platform.Width-1)
	return platform
}

func reachableFromAnyLower(platform PlatformSpan, lower []PlatformSpan) bool {
	for _, candidate := range lower {
		verticalGap := candidate.Y - platform.Y
		if verticalGap <= 0 || verticalGap > MaxReachableVerticalGapTiles {
			continue
		}
		if platformGap(candidate, platform) <= MaxReachableHorizontalGapTiles {
			return true
		}
	}
	return false
}

func rangesOverlapOrTouch(a, b PlatformSpan) bool {
	return a.X <= b.X+b.Width && b.X <= a.X+a.Width
}

func deterministicSigned(seed uint32, a, b, magnitude int) int {
	if magnitude <= 0 {
		return 0
	}
	n := int((seed + uint32(a*7349) + uint32(b*9151)) % uint32(magnitude*2+1))
	return n - magnitude
}

func alternatingOffset(value, magnitude int) int {
	if value%2 == 0 {
		return magnitude
	}
	return -magnitude
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
	level := 1 + max(0, chunk.ChunkY)/3
	baseHealth := enemyBaseHealth(spawn.Kind)
	maxHealth := baseHealth + max(0, level-1)
	speedMultiplier := 1 + math.Min(0.65, float64(chunk.ChunkY)*0.025)
	return EnemyState{
		ID:             spawn.ID,
		Kind:           spawn.Kind,
		Position:       Vec2{X: float64(spawn.X*TileSize - 10), Y: platformY - 24},
		Velocity:       Vec2{X: speed * speedMultiplier, Y: 0},
		Facing:         facing,
		Health:         maxHealth,
		MaxHealth:      maxHealth,
		ChunkY:         chunk.ChunkY,
		PatrolMinX:     minX,
		PatrolMaxX:     maxX,
		PlatformY:      platformY,
		AttackCooldown: 0.35,
		HurtCooldown:   0,
	}
}

func enemyBaseHealth(kind string) int {
	switch kind {
	case "goblinChief", "windSpirit":
		return 4
	case "skeleton":
		return 3
	case "skeletonArmored":
		return 5
	case "yeti":
		return 6
	case "iceGolem":
		return 7
	default:
		return 2
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
	ensurePlayerSkillState(&kicker)
	kr := playerRect(kicker)
	tr := playerRect(target)
	rangeX := kr.x
	hitRange := math.Max(KickRangePX, kicker.HitRange)
	if kicker.Facing < 0 {
		rangeX = kr.x - hitRange
	}
	return rectsOverlap(playerBounds{
		x:      rangeX,
		y:      kr.y - 4,
		width:  float64(PlayerWidth) + hitRange,
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
	kicker.ShockwaveCounter++
	target.KickInvulnerable = KickHitInvulnerableSeconds
}

func applyDamage(player *PlayerState, damage int, knockbackX, knockbackY, stunSeconds float64) {
	ensurePlayerSkillState(player)
	if player.Health <= 0 || player.Invulnerable > 0 {
		return
	}
	lastStandStacks := skillStacks(*player, "last_stand")
	lowHP := float64(player.Health)/math.Max(1, float64(player.MaxHealth)) <= 0.3+float64(lastStandStacks)*0.03
	lastStandReduction := 0.0
	if lowHP {
		lastStandReduction = math.Min(0.35, float64(lastStandStacks)*0.08)
	}
	reduction := math.Min(skillMaxDamageReduction, math.Max(0, player.DamageReduction+lastStandReduction))
	remaining := math.Max(0, float64(damage)) * (1 - reduction)
	if player.Shield > 0 && remaining > 0 {
		absorbed := math.Min(player.Shield, remaining)
		player.Shield -= absorbed
		remaining -= absorbed
	}
	player.Health = max(0, player.Health-int(math.Ceil(remaining)))
	player.LastDamageAt = nowMillis()
	player.ShieldRegenCooldown = player.ShieldRegenDelayMs
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
		case strings.Contains(id, ":xp:"):
			return "xp"
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
	ensurePlayerSkillState(player)
	switch kind {
	case "coin", "xp":
	case "smallHeart":
		player.Health = min(player.MaxHealth, player.Health+1)
	case "bigHeart":
		player.Health = player.MaxHealth
	case "blueCrystal", "purpleCrystal":
		player.Crystals++
		player.JumpPower = math.Min(1.8, 1+float64(player.Crystals/3)*0.06)
		player.MovementSpeed = math.Min(2, 1+float64(player.Crystals/3)*0.05)
		player.AirControl = math.Min(2, 1+float64(player.Crystals/3)*0.05)
		recalculateSkillDerivedStats(player)
	case "greenCrystal":
		player.Health = min(player.MaxHealth, player.Health+1)
	default:
		player.RelicFragments++
		recalculateAttackProgression(player)
	}
	xp := XPCollectibleValue
	if kind == "xp" {
		xp = int(math.Round(float64(xp) * player.XPGainMultiplier))
	}
	addPlayerXP(player, xp)
}

func xpRequiredForLevel(level int) int {
	if level < 1 {
		level = 1
	}
	return max(1, int(math.Round(XPPerLevelBase*math.Pow(XPPerLevelGrowth, float64(level-1)))))
}

func addPlayerXP(player *PlayerState, amount int) int {
	gained := max(0, amount)
	if gained == 0 {
		return 0
	}
	player.Relics += gained
	for player.Relics >= xpRequiredForLevel(player.Level) {
		player.Relics -= xpRequiredForLevel(player.Level)
		player.Level++
		if player.Level%2 == 0 {
			if player.MaxHealth < 9 {
				player.MaxHealth = min(9, player.MaxHealth+1)
			} else {
				player.MaxHealth++
			}
			player.Health = min(player.MaxHealth, player.Health+1)
		}
	}
	recalculateAttackProgression(player)
	return gained
}

func recalculateAttackProgression(player *PlayerState) {
	player.Damage = 1 + player.RelicFragments/8
	player.AttackSpeed = math.Min(3, 1+float64(player.RelicFragments)*0.014)
	recalculateSkillDerivedStats(player)
}

func playerKickHitsEnemy(player PlayerState, enemy EnemyState) bool {
	if player.KickPhase != "active" || enemy.HurtCooldown > 0 || enemy.Health <= 0 {
		return false
	}
	ensurePlayerSkillState(&player)
	rangeX := player.Position.X
	hitRange := math.Max(KickRangePX, player.HitRange)
	if player.Facing < 0 {
		rangeX = player.Position.X - hitRange
	}
	return rectsOverlap(playerBounds{
		x:      rangeX,
		y:      player.Position.Y - 4,
		width:  float64(PlayerWidth) + hitRange,
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
	Region       string                `json:"region"`
	Landmark     string                `json:"landmark"`
	Checkpoint   bool                  `json:"checkpoint"`
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
		region := RegionForChunkY(chunkY)
		record := ChunkDebugRecord{
			ChunkY:       chunkY,
			WorldTileY:   chunk.WorldTileY,
			Region:       region.Name,
			Landmark:     region.Landmark,
			Checkpoint:   IsCheckpointChunk(chunkY),
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

func positiveMod(value, divisor int) int {
	if divisor <= 0 {
		return 0
	}
	out := value % divisor
	if out < 0 {
		out += divisor
	}
	return out
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
