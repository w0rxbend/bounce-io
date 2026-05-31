package game

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

const (
	roomCommandDrainLimit = 128

	pvpPairHitCooldownSeconds     = 0.42
	pvpStunWindowSeconds          = 1.35
	pvpStunDiminishPerChainHit    = 0.35
	pvpKnockbackDiminishPerHit    = 0.22
	pvpAntiStunChainHits          = 3
	pvpAntiStunInvulnerable       = 0.48
	pvpRespawnProtectionSeconds   = 1.50
	pvpKillCreditSeconds          = 4.0
	pvpKillXP                     = 30
	pvpKillCoins                  = 1
	relicContestRadiusPadding     = 16.0
	relicContestHoldSeconds       = 0.45
	relicContestEventCooldownSecs = 0.75
	enemyPatrolSpeed              = 24.0
	enemyChaseSpeed               = 62.0
	enemyDetectionRange           = 132.0
	enemyPlatformTolerance        = 10.0
	enemyAttackRange              = 18.0
	enemyAttackWindupSeconds      = 0.34
	enemyAttackActiveSeconds      = 0.12
	enemyAttackRecoverySeconds    = 0.32
	enemyAttackCooldownSeconds    = 0.72
)

type RoomConfig struct {
	ID               string
	TickRate         int
	SnapshotRate     int
	MaxPlayers       int
	ReconnectGrace   time.Duration
	MaxQueuedInputs  int
	MaxInputsPerTick int
}

type Room struct {
	cfg   RoomConfig
	seed  uint32
	log   *slog.Logger
	stats *ServerMetrics

	commands chan roomCommand
	stop     chan struct{}
	done     chan struct{}
	once     sync.Once
}

type roomCommand interface{ apply(*roomState) }

type roomState struct {
	room              *Room
	phase             string
	tick              uint64
	snapshotSeq       uint64
	eventSeq          uint64
	countdownEndsAt   time.Time
	sessions          map[string]*session
	tokenToPlayer     map[string]string
	collectedRelics   map[string]struct{}
	defeatedEnemies   map[string]struct{}
	enemies           map[string]EnemyState
	collectibles      map[string]CollectibleState
	jumpPadCooldowns  map[string]uint64
	pvpHitCooldowns   map[string]uint64
	pvpCombat         map[string]*pvpCombatState
	relicClaims       map[string]relicClaimState
	pendingEvents     []MatchEvent
	metrics           RoomMetrics
	lastTickWallClock time.Time
	spatialIndex      dynamicSpatialIndex
}

type chunkAOI struct {
	min    int
	max    int
	left   int
	right  int
	top    int
	bottom int
}

type scopedSnapshot struct {
	encoded          []byte
	message          SnapshotMessage
	playersList      []PlayerEntityFrame
	enemiesList      []EnemyState
	collectiblesList []CollectibleState
	players          int
	enemies          int
	collectibles     int
}

type pvpCombatState struct {
	lastAttackerID string
	lastDamageTick uint64
	lastHitTick    uint64
	chainHits      int
}

type relicClaimState struct {
	playerID           string
	sinceTick          uint64
	lastSeenTick       uint64
	lastEventTick      uint64
	lastContenderCount int
}

type session struct {
	client              *Client
	playerID            string
	token               string
	name                string
	skinID              string
	player              PlayerState
	connected           bool
	disconnectedAt      time.Time
	inputQueue          []PlayerInput
	inputsThisTick      int
	lastReceivedSeq     int64
	lastProcessedSeq    int64
	lastInput           PlayerInput
	currentSkillOffer   *SkillCardOffer
	pendingLevelChoices int
	hasViewportAOI      bool
	viewportAOI         chunkAOI
	hasStableAOI        bool
	stableAOI           chunkAOI
	lastAOIChangeTick   uint64
	binarySnapshots     bool
	binaryVisible       map[uint32]struct{}
	binaryBaselineTick  uint64
}

type joinCommand struct {
	client          *Client
	name            string
	skinID          string
	token           string
	binarySnapshots bool
	reply           chan joinReply
}

type joinReply struct {
	playerID string
	token    string
	err      string
}

func (cmd joinCommand) apply(s *roomState) {
	now := time.Now()
	if cmd.token != "" {
		if playerID, ok := s.tokenToPlayer[cmd.token]; ok {
			existing := s.sessions[playerID]
			if existing != nil && !existing.connected && now.Sub(existing.disconnectedAt) <= s.room.cfg.ReconnectGrace {
				existing.client = cmd.client
				existing.connected = true
				existing.disconnectedAt = time.Time{}
				existing.binarySnapshots = cmd.binarySnapshots
				if existing.binaryVisible == nil {
					existing.binaryVisible = map[uint32]struct{}{}
				}
				cmd.client.SetSession(s.room, existing.playerID, existing.token, existing.name)
				_ = cmd.client.EnqueueJSON(map[string]any{
					"type":        "resumed",
					"playerId":    existing.playerID,
					"serverTime":  unixMillis(now),
					"matchPhase":  s.phase,
					"playerState": existing.player,
				})
				if existing.currentSkillOffer != nil {
					_ = cmd.client.EnqueueJSON(SkillCardOfferMessage{Type: "skill_card_offer", Offer: *existing.currentSkillOffer})
				}
				_ = cmd.client.EnqueueJSON(RelicStateMessage{Type: "relicState", ServerTime: unixMillis(now), CollectedRelics: s.collectedRelicList()})
				s.pendingEvents = append(s.pendingEvents, MatchEvent{"type": "PLAYER_RECONNECTED", "playerId": existing.playerID})
				cmd.reply <- joinReply{playerID: existing.playerID, token: existing.token}
				return
			}
			if existing != nil && existing.connected {
				cmd.reply <- joinReply{err: "ALREADY_CONNECTED"}
				return
			}
		}
	}

	if activeSessions(s) >= s.room.cfg.MaxPlayers {
		cmd.reply <- joinReply{err: "ROOM_FULL"}
		return
	}

	playerID := newID()
	token := newID()
	name := sanitizeName(cmd.name)
	skinID := sanitizeSkinID(cmd.skinID)
	spawnX, spawnY := SpawnPosition(s.room.seed, 0)
	player := CreatePlayerState(playerID, spawnX, spawnY)
	player.SkinID = skinID
	sess := &session{
		client:           cmd.client,
		playerID:         playerID,
		token:            token,
		name:             name,
		skinID:           skinID,
		player:           player,
		connected:        true,
		inputQueue:       make([]PlayerInput, 0, s.room.cfg.MaxQueuedInputs),
		lastReceivedSeq:  -1,
		lastProcessedSeq: -1,
		lastInput:        IdleInput(-1),
		binarySnapshots:  cmd.binarySnapshots,
		binaryVisible:    map[uint32]struct{}{},
	}
	s.sessions[playerID] = sess
	s.tokenToPlayer[token] = playerID
	cmd.client.SetSession(s.room, playerID, token, name)

	_ = cmd.client.EnqueueJSON(WelcomeMessage{
		Type:         "welcome",
		PlayerID:     playerID,
		SessionToken: token,
		ServerTime:   unixMillis(now),
		TickRate:     s.room.cfg.TickRate,
		MatchPhase:   s.phase,
		Seed:         s.room.seed,
		Name:         name,
	})
	_ = cmd.client.EnqueueJSON(ChunkMessage{Type: "chunk", Chunk: GenerateChunk(s.room.seed, 0)})
	_ = cmd.client.EnqueueJSON(RelicStateMessage{Type: "relicState", ServerTime: unixMillis(now), CollectedRelics: s.collectedRelicList()})
	for _, existing := range s.sessions {
		if existing.playerID == playerID || !existing.connected {
			continue
		}
		_ = cmd.client.EnqueueJSON(PlayerJoinedMessage{Type: "playerJoined", Player: existing.player, Name: existing.name})
		_ = existing.client.EnqueueJSON(PlayerJoinedMessage{Type: "playerJoined", Player: sess.player, Name: name})
	}
	s.pendingEvents = append(s.pendingEvents, MatchEvent{"type": "PLAYER_JOINED", "playerId": playerID})
	if s.phase == "waiting" {
		s.phase = "countdown"
		s.countdownEndsAt = now.Add(3 * time.Second)
		s.pendingEvents = append(s.pendingEvents, MatchEvent{"type": "MATCH_COUNTDOWN_STARTED", "countdownMs": 3000})
		s.broadcastJSON(MatchPhaseMessage{Type: "matchPhase", Phase: "countdown", CountdownMS: 3000})
	}
	cmd.reply <- joinReply{playerID: playerID, token: token}
}

type inputCommand struct {
	playerID string
	input    PlayerInput
	ageMS    float64
	bytes    int
	client   *Client
}

func (cmd inputCommand) apply(s *roomState) {
	sess := s.sessions[cmd.playerID]
	if sess == nil || !sess.connected {
		return
	}
	if s.phase != "playing" {
		sess.inputQueue = sess.inputQueue[:0]
		sess.lastInput = IdleInput(sess.lastProcessedSeq)
		cmd.client.RecordInput(cmd.input.Sequence, cmd.ageMS)
		return
	}
	if cmd.input.Sequence <= sess.lastProcessedSeq || cmd.input.Sequence <= sess.lastReceivedSeq {
		return
	}
	if sess.inputsThisTick >= s.room.cfg.MaxInputsPerTick {
		return
	}
	sess.inputsThisTick++
	sess.lastReceivedSeq = cmd.input.Sequence
	sess.inputQueue = append(sess.inputQueue, cmd.input)
	if len(sess.inputQueue) > s.room.cfg.MaxQueuedInputs {
		copy(sess.inputQueue, sess.inputQueue[len(sess.inputQueue)-s.room.cfg.MaxQueuedInputs:])
		sess.inputQueue = sess.inputQueue[:s.room.cfg.MaxQueuedInputs]
	}
	s.metrics.MessagesReceived++
	s.metrics.BytesReceived += uint64(cmd.bytes)
	cmd.client.RecordInput(cmd.input.Sequence, cmd.ageMS)
}

type leaveCommand struct {
	playerID string
	reason   string
}

func (cmd leaveCommand) apply(s *roomState) {
	sess := s.sessions[cmd.playerID]
	if sess == nil || !sess.connected {
		return
	}
	sess.connected = false
	sess.disconnectedAt = time.Now()
	s.pendingEvents = append(s.pendingEvents, MatchEvent{"type": "PLAYER_DISCONNECTED", "playerId": cmd.playerID})
	s.broadcastJSON(PlayerLeftMessage{Type: "playerLeft", PlayerID: cmd.playerID})
}

type chunkCommand struct {
	playerID string
	chunkY   int
}

type viewportCommand struct {
	playerID  string
	minChunkY int
	maxChunkY int
	x1        float64
	y1        float64
	x2        float64
	y2        float64
}

type pickupCollectibleCommand struct {
	playerID      string
	collectibleID string
}

type selectSkillCardCommand struct {
	playerID string
	offerID  string
	cardID   string
}

func (cmd pickupCollectibleCommand) apply(s *roomState) {
	sess := s.sessions[cmd.playerID]
	if sess == nil || !sess.connected {
		return
	}
	s.tryPickupCollectible(sess, cmd.collectibleID)
}

func (cmd selectSkillCardCommand) apply(s *roomState) {
	sess := s.sessions[cmd.playerID]
	if sess == nil || !sess.connected || sess.currentSkillOffer == nil {
		return
	}
	if sess.currentSkillOffer.OfferID != cmd.offerID {
		return
	}
	valid := false
	for _, card := range sess.currentSkillOffer.Cards {
		if card.ID == cmd.cardID {
			valid = true
			break
		}
	}
	if !valid || !applySkillToPlayer(&sess.player, cmd.cardID) {
		return
	}
	sess.currentSkillOffer = nil
	stats := skillStatsPayload(sess.player)
	s.broadcastJSON(SkillAppliedMessage{Type: "skill_applied", PlayerID: sess.playerID, SkillID: cmd.cardID, NewStats: stats})
	s.broadcastJSON(PlayerStatsMessage{Type: "player_stats", PlayerID: sess.playerID, Stats: stats})
	s.pendingEvents = append(s.pendingEvents, MatchEvent{"type": "SKILL_APPLIED", "playerId": sess.playerID, "skillId": cmd.cardID, "newStats": stats})
	s.emitPlayerStats(sess)
	s.maybeSendNextSkillOffer(sess)
}

func (cmd chunkCommand) apply(s *roomState) {
	if cmd.chunkY < 0 || cmd.chunkY > 200 {
		return
	}
	sess := s.sessions[cmd.playerID]
	if sess == nil || !sess.connected {
		return
	}
	if !s.chunkRequestAllowed(sess, cmd.chunkY) {
		s.metrics.DroppedOutbound++
		s.metrics.DroppedReliable++
		return
	}
	_ = sess.client.EnqueueJSON(ChunkMessage{Type: "chunk", Chunk: GenerateChunk(s.room.seed, cmd.chunkY)})
}

func (cmd viewportCommand) apply(s *roomState) {
	sess := s.sessions[cmd.playerID]
	if sess == nil || !sess.connected {
		return
	}
	if cmd.minChunkY < 0 {
		cmd.minChunkY = 0
	}
	if cmd.maxChunkY < cmd.minChunkY {
		cmd.maxChunkY = cmd.minChunkY
	}
	sess.viewportAOI = s.clampClientAOI(sess, chunkAOI{
		min:    cmd.minChunkY,
		max:    cmd.maxChunkY,
		left:   int(math.Floor(cmd.x1)),
		right:  int(math.Ceil(cmd.x2)),
		top:    int(math.Floor(cmd.y1)),
		bottom: int(math.Ceil(cmd.y2)),
	})
	sess.hasViewportAOI = true
}

type metricsCommand struct {
	reply chan RoomSnapshot
}

func (cmd metricsCommand) apply(s *roomState) {
	clients := make([]ClientSnapshot, 0, len(s.sessions))
	for _, sess := range s.sessions {
		client := ClientMetrics{}
		if sess.client != nil {
			client = sess.client.Metrics()
		}
		clients = append(clients, ClientSnapshot{
			PlayerID:         sess.playerID,
			Name:             sess.name,
			Connected:        sess.connected,
			QueuedInputs:     len(sess.inputQueue),
			LastReceivedSeq:  sess.lastReceivedSeq,
			LastProcessedSeq: sess.lastProcessedSeq,
			Metrics:          client,
		})
	}
	cmd.reply <- RoomSnapshot{
		ID:            s.room.cfg.ID,
		Phase:         s.phase,
		Tick:          s.tick,
		SnapshotSeq:   s.snapshotSeq,
		ActiveClients: activeSessions(s),
		Players:       len(s.sessions),
		Seed:          s.room.seed,
		Metrics:       s.metrics,
		Clients:       clients,
	}
}

func NewRoom(cfg RoomConfig, stats *ServerMetrics, log *slog.Logger) *Room {
	if cfg.TickRate <= 0 {
		cfg.TickRate = DefaultTickRate
	}
	if cfg.SnapshotRate <= 0 {
		cfg.SnapshotRate = DefaultSnapshotRate
	}
	if cfg.MaxPlayers <= 0 {
		cfg.MaxPlayers = DefaultMaxPlayers
	}
	if cfg.ReconnectGrace <= 0 {
		cfg.ReconnectGrace = DefaultReconnectGrace
	}
	if cfg.MaxQueuedInputs <= 0 {
		cfg.MaxQueuedInputs = 24
	}
	if cfg.MaxInputsPerTick <= 0 {
		cfg.MaxInputsPerTick = 3
	}
	room := &Room{
		cfg:      cfg,
		seed:     HashString(cfg.ID),
		log:      log.With("room", cfg.ID),
		stats:    stats,
		commands: make(chan roomCommand, 1024),
		stop:     make(chan struct{}),
		done:     make(chan struct{}),
	}
	go room.loop()
	return room
}

func (r *Room) Join(ctxDone <-chan struct{}, client *Client, name, token, skinID string, binarySnapshots bool) joinReply {
	reply := make(chan joinReply, 1)
	cmd := joinCommand{client: client, name: name, skinID: skinID, token: token, binarySnapshots: binarySnapshots, reply: reply}
	select {
	case r.commands <- cmd:
	case <-ctxDone:
		return joinReply{err: "CONTEXT_CLOSED"}
	}
	select {
	case out := <-reply:
		return out
	case <-ctxDone:
		return joinReply{err: "CONTEXT_CLOSED"}
	case <-time.After(2 * time.Second):
		return joinReply{err: "JOIN_TIMEOUT"}
	}
}

func (r *Room) Input(playerID string, input PlayerInput, ageMS float64, bytes int, client *Client) {
	select {
	case r.commands <- inputCommand{playerID: playerID, input: input, ageMS: ageMS, bytes: bytes, client: client}:
	default:
		r.stats.DroppedOutbound.Add(1)
	}
}

func (r *Room) Leave(playerID, reason string) {
	select {
	case r.commands <- leaveCommand{playerID: playerID, reason: reason}:
	default:
	}
}

func (r *Room) RequestChunk(playerID string, chunkY int) {
	select {
	case r.commands <- chunkCommand{playerID: playerID, chunkY: chunkY}:
	default:
	}
}

func (r *Room) UpdateViewport(playerID string, minChunkY, maxChunkY int, x1, y1, x2, y2 float64) {
	select {
	case r.commands <- viewportCommand{playerID: playerID, minChunkY: minChunkY, maxChunkY: maxChunkY, x1: x1, y1: y1, x2: x2, y2: y2}:
	default:
	}
}

func (r *Room) PickupCollectible(playerID, collectibleID string) {
	select {
	case r.commands <- pickupCollectibleCommand{playerID: playerID, collectibleID: collectibleID}:
	default:
	}
}

func (r *Room) SelectSkillCard(playerID, offerID, cardID string) {
	select {
	case r.commands <- selectSkillCardCommand{playerID: playerID, offerID: offerID, cardID: cardID}:
	default:
	}
}

func (r *Room) Snapshot(timeout time.Duration) (RoomSnapshot, bool) {
	reply := make(chan RoomSnapshot, 1)
	select {
	case r.commands <- metricsCommand{reply: reply}:
	case <-r.done:
		return RoomSnapshot{}, false
	}
	select {
	case snap := <-reply:
		return snap, true
	case <-time.After(timeout):
		return RoomSnapshot{}, false
	}
}

func (r *Room) Stop() {
	r.once.Do(func() {
		close(r.stop)
	})
}

func (r *Room) loop() {
	defer close(r.done)
	interval := time.Second / time.Duration(r.cfg.TickRate)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	state := &roomState{
		room:              r,
		phase:             "waiting",
		sessions:          map[string]*session{},
		tokenToPlayer:     map[string]string{},
		collectedRelics:   map[string]struct{}{},
		defeatedEnemies:   map[string]struct{}{},
		enemies:           map[string]EnemyState{},
		collectibles:      map[string]CollectibleState{},
		jumpPadCooldowns:  map[string]uint64{},
		pvpHitCooldowns:   map[string]uint64{},
		pvpCombat:         map[string]*pvpCombatState{},
		relicClaims:       map[string]relicClaimState{},
		pendingEvents:     make([]MatchEvent, 0, 32),
		lastTickWallClock: time.Now(),
	}

	for {
		select {
		case <-r.stop:
			return
		case now := <-ticker.C:
			state.runTick(now, interval)
			continue
		default:
		}

		select {
		case <-r.stop:
			return
		case now := <-ticker.C:
			state.runTick(now, interval)
		case cmd := <-r.commands:
			cmd.apply(state)
		}
	}
}

func (s *roomState) runTick(now time.Time, interval time.Duration) {
	start := time.Now()
	drainStart := time.Now()
	drained := s.drainCommands(roomCommandDrainLimit)
	s.metrics.recordCommandDrain(time.Since(drainStart), drained, len(s.room.commands))
	s.tickRoom(now, interval)
	s.metrics.recordTick(time.Since(start), now.Sub(s.lastTickWallClock), interval)
	s.lastTickWallClock = now
}

func (s *roomState) drainCommands(limit int) int {
	drained := 0
	for drained < limit {
		select {
		case cmd := <-s.room.commands:
			cmd.apply(s)
			drained++
		default:
			return drained
		}
	}
	return drained
}

func (s *roomState) jumpPadCooldownKey(playerID, padID string) string {
	return playerID + ":" + padID
}

func (s *roomState) canTriggerJumpPad(playerID, padID string) bool {
	if s.jumpPadCooldowns == nil {
		s.jumpPadCooldowns = map[string]uint64{}
	}
	return s.jumpPadCooldowns[s.jumpPadCooldownKey(playerID, padID)] <= s.tick
}

func (s *roomState) markJumpPadTriggered(playerID, padID string) {
	if s.jumpPadCooldowns == nil {
		s.jumpPadCooldowns = map[string]uint64{}
	}
	cooldownTicks := uint64(math.Ceil(0.28 * float64(s.room.cfg.TickRate)))
	if cooldownTicks < 1 {
		cooldownTicks = 1
	}
	s.jumpPadCooldowns[s.jumpPadCooldownKey(playerID, padID)] = s.tick + cooldownTicks
}

func (s *roomState) effectiveTickRate() int {
	if s.room != nil && s.room.cfg.TickRate > 0 {
		return s.room.cfg.TickRate
	}
	return DefaultTickRate
}

func (s *roomState) secondsToTicks(seconds float64) uint64 {
	if seconds <= 0 {
		return 0
	}
	return max(uint64(1), uint64(math.Ceil(seconds*float64(s.effectiveTickRate()))))
}

func pvpHitCooldownKey(attackerID, targetID string) string {
	return attackerID + "\x00" + targetID
}

func (s *roomState) ensurePvPState() {
	if s.pvpHitCooldowns == nil {
		s.pvpHitCooldowns = map[string]uint64{}
	}
	if s.pvpCombat == nil {
		s.pvpCombat = map[string]*pvpCombatState{}
	}
}

func (s *roomState) combatState(playerID string) *pvpCombatState {
	s.ensurePvPState()
	state := s.pvpCombat[playerID]
	if state == nil {
		state = &pvpCombatState{}
		s.pvpCombat[playerID] = state
	}
	return state
}

func (s *roomState) clearCombatState(playerID string) {
	if s.pvpCombat != nil {
		delete(s.pvpCombat, playerID)
	}
	if s.pvpHitCooldowns == nil {
		return
	}
	for key := range s.pvpHitCooldowns {
		if strings.HasPrefix(key, playerID+"\x00") || strings.HasSuffix(key, "\x00"+playerID) {
			delete(s.pvpHitCooldowns, key)
		}
	}
}

func (s *roomState) tickRoom(now time.Time, interval time.Duration) {
	s.tick++
	for _, sess := range s.sessions {
		sess.inputsThisTick = 0
	}

	for id, sess := range s.sessions {
		if !sess.connected && !sess.disconnectedAt.IsZero() && now.Sub(sess.disconnectedAt) > s.room.cfg.ReconnectGrace {
			delete(s.tokenToPlayer, sess.token)
			delete(s.sessions, id)
			s.pendingEvents = append(s.pendingEvents, MatchEvent{"type": "PLAYER_LEFT", "playerId": id})
		}
	}

	if s.phase == "countdown" && now.After(s.countdownEndsAt) {
		s.phase = "playing"
		for _, sess := range s.sessions {
			sess.inputQueue = sess.inputQueue[:0]
			sess.lastInput = IdleInput(sess.lastProcessedSeq)
		}
		s.pendingEvents = append(s.pendingEvents, MatchEvent{"type": "MATCH_STARTED"})
		s.broadcastJSON(MatchPhaseMessage{Type: "matchPhase", Phase: "playing"})
	}

	if s.phase == "playing" {
		for _, sess := range s.sessions {
			if !sess.connected {
				continue
			}
			s.ensureEnemiesAround(sess.player)
			input := sess.consumeInput()
			if sess.currentSkillOffer != nil {
				input = IdleInput(sess.lastProcessedSeq)
			}
			previousKickPhase := sess.player.KickPhase
			sess.player = StepPlayer(s.room.seed, sess.player, input, PhysicsStepSeconds)
			if previousKickPhase == "idle" && sess.player.KickPhase == "windup" {
				s.pendingEvents = append(s.pendingEvents, MatchEvent{"type": "PLAYER_KICK_STARTED", "playerId": sess.playerID})
			}
			if next, hit, pad, x, y := ApplyJumpPads(s.room.seed, sess.player); hit && s.canTriggerJumpPad(sess.playerID, pad.ID) {
				sess.player = next
				s.markJumpPadTriggered(sess.playerID, pad.ID)
				s.pendingEvents = append(s.pendingEvents, MatchEvent{
					"type":       "JUMP_PAD_TRIGGERED",
					"playerId":   sess.playerID,
					"padId":      pad.ID,
					"x":          x,
					"y":          y,
					"multiplier": pad.Multiplier,
				})
			}
			s.checkRelicCollection(sess)
			s.checkDynamicCollectibleCollection(sess)
			chunkY := ChunkYForWorldY(sess.player.Position.Y)
			if chunkY > sess.player.CheckpointChunkY && IsCheckpointChunk(chunkY) {
				sess.player.CheckpointChunkY = chunkY
				chunk := GenerateChunk(s.room.seed, chunkY)
				event := MatchEvent{"type": "CHECKPOINT_REACHED", "playerId": sess.playerID, "chunkY": chunkY, "regionId": chunk.RegionID}
				if chunk.Portal != nil {
					event["portalId"] = chunk.Portal.ID
				}
				s.pendingEvents = append(s.pendingEvents, event)
			}
		}
		s.applyPlayerInteractions(PhysicsStepSeconds)
		s.simulateEnemies(PhysicsStepSeconds)
		s.handleDeaths()
	}

	every := uint64(math.Max(1, float64(s.room.cfg.TickRate)/float64(s.room.cfg.SnapshotRate)))
	if s.tick%every == 0 {
		s.broadcastSnapshot(now)
	}
}

func (s *session) consumeInput() PlayerInput {
	for len(s.inputQueue) > 0 {
		next := s.inputQueue[0]
		copy(s.inputQueue, s.inputQueue[1:])
		s.inputQueue = s.inputQueue[:len(s.inputQueue)-1]
		if next.Sequence <= s.lastProcessedSeq {
			continue
		}
		s.lastProcessedSeq = next.Sequence
		s.lastInput = next
		return next
	}
	return PlayerInput{
		Left:     s.lastInput.Left,
		Right:    s.lastInput.Right,
		JumpHeld: s.lastInput.JumpHeld,
		Drop:     s.lastInput.Drop,
		Sequence: s.lastProcessedSeq,
	}
}

func (s *roomState) broadcastSnapshot(now time.Time) {
	s.snapshotSeq++
	players := make([]PlayerState, 0)
	playerEntities := make(map[string]PlayerEntityFrame, len(s.sessions))
	lastProcessed := make(map[string]int64, len(s.sessions))
	for _, sess := range s.sessions {
		if !sess.connected {
			continue
		}
		playerEntities[sess.playerID] = PlayerEntityFrame{
			ID:             sess.playerID,
			SkinID:         sess.player.SkinID,
			X:              quantize2(sess.player.Position.X),
			Y:              quantize2(sess.player.Position.Y),
			VX:             quantize2(sess.player.Velocity.X),
			VY:             quantize2(sess.player.Velocity.Y),
			Facing:         sess.player.Facing,
			Grounded:       sess.player.Grounded,
			KickPhase:      sess.player.KickPhase,
			KickTimer:      quantize2(sess.player.KickTimer),
			Invulnerable:   quantize2(sess.player.Invulnerable),
			Health:         sess.player.Health,
			Coins:          sess.player.Coins,
			MaxHealth:      sess.player.MaxHealth,
			Shield:         quantize2(sess.player.Shield),
			MaxShield:      quantize2(sess.player.MaxShield),
			HitRange:       quantize2(sess.player.HitRange),
			SelectedSkills: sess.player.SelectedSkills,
		}
		lastProcessed[sess.playerID] = sess.lastProcessedSeq
	}
	collectedRelics := s.collectedRelicList()
	s.spatialIndex = buildDynamicSpatialIndex(s, playerEntities)

	events := s.enrichEvents(s.pendingEvents, s.tick, s.snapshotSeq)
	s.pendingEvents = make([]MatchEvent, 0, 32)
	if len(events) > 0 {
		s.broadcastJSON(EventsMessage{
			Type:        "events",
			ServerTick:  s.tick,
			SnapshotSeq: s.snapshotSeq,
			ServerTime:  unixMillis(now),
			Events:      events,
		})
	}
	startSerialization := time.Now()
	serverTime := unixMillis(now)
	scopedByAOI := map[chunkAOI]scopedSnapshot{}

	startBroadcast := time.Now()
	recipients := 0
	totalSnapshotBytes := 0
	for _, sess := range s.sessions {
		if !sess.connected {
			continue
		}
		aoi := s.sessionAOI(sess)
		scoped, ok := scopedByAOI[aoi]
		if !ok {
			scopedPlayers := s.spatialIndex.playersForAOI(aoi, s)
			scopedEnemies := s.spatialIndex.enemiesForAOI(aoi)
			scopedCollectibles := s.spatialIndex.collectiblesForAOI(aoi)
			msg := SnapshotMessage{
				Type:             "snapshot",
				Tick:             s.tick,
				ServerTick:       s.tick,
				SnapshotSeq:      s.snapshotSeq,
				ServerTime:       serverTime,
				MatchPhase:       s.phase,
				AckInputSeq:      -1,
				Players:          players,
				Entities:         []EntityState{},
				PlayerEntities:   scopedPlayers,
				Enemies:          scopedEnemies,
				Collectibles:     scopedCollectibles,
				CollectedRelics:  collectedRelics,
				Events:           []MatchEvent{},
				LastProcessedSeq: lastProcessed,
			}
			scoped = scopedSnapshot{
				message:          msg,
				playersList:      scopedPlayers,
				enemiesList:      scopedEnemies,
				collectiblesList: scopedCollectibles,
				players:          len(msg.PlayerEntities),
				enemies:          len(msg.Enemies),
				collectibles:     len(msg.Collectibles),
			}
			scopedByAOI[aoi] = scoped
		}
		outbound := scoped.encoded
		msgType := websocket.MessageText
		if sess.binarySnapshots {
			entities := binaryEntitiesFromSnapshot(scoped.playersList, scoped.enemiesList, scoped.collectiblesList)
			removed, nextVisible := removedBinaryEntities(sess.binaryVisible, entities)
			outbound = encodeBinarySnapshot(s.tick, s.snapshotSeq, sess.binaryBaselineTick, serverTime, sess.lastProcessedSeq, entities, removed)
			msgType = websocket.MessageBinary
			sess.binaryVisible = nextVisible
			sess.binaryBaselineTick = s.tick
		} else {
			if len(outbound) == 0 {
				encoded, err := json.Marshal(scoped.message)
				if err != nil {
					s.room.log.Error("marshal scoped snapshot", "error", err)
					continue
				}
				scoped.encoded = encoded
				scopedByAOI[aoi] = scoped
				outbound = encoded
			}
		}
		sess.client.RecordAOI(aoi.min, aoi.max, scoped.players, scoped.enemies, scoped.collectibles, len(outbound))
		totalSnapshotBytes += len(outbound)
		if sess.client.EnqueueSnapshotMessage(outbound, msgType) {
			recipients++
			s.metrics.MessagesSent++
			s.metrics.BytesSent += uint64(len(outbound))
			sess.client.SetAck(sess.lastProcessedSeq)
		} else {
			s.metrics.DroppedOutbound++
			s.metrics.DroppedSnapshots++
			if sess.client.Metrics().DroppedOutbound >= sess.client.maxDrops {
				s.metrics.BackpressureDisconnect++
			}
		}
	}
	s.metrics.recordSerialization(time.Since(startSerialization), totalSnapshotBytes)
	s.metrics.recordBroadcast(time.Since(startBroadcast), recipients)
}

func (s *roomState) sessionAOI(sess *session) chunkAOI {
	if sess.hasViewportAOI {
		return s.stabilizedAOI(sess, sess.viewportAOI)
	}
	center := ChunkYForWorldY(sess.player.Position.Y)
	return s.stabilizedAOI(sess, chunkAOIForChunks(max(0, center-DefaultAOIChunksBehind), center+DefaultAOIChunksAhead))
}

func (s *roomState) stabilizedAOI(sess *session, requested chunkAOI) chunkAOI {
	next := s.clampClientAOI(sess, requested).withMargin(AOIHysteresisPixels)
	if !sess.hasStableAOI {
		sess.stableAOI = next
		sess.hasStableAOI = true
		sess.lastAOIChangeTick = s.tick
		return next
	}
	current := sess.stableAOI
	if !aoiContains(current, next) {
		sess.stableAOI = mergeAOI(current, next)
		sess.lastAOIChangeTick = s.tick
		return sess.stableAOI
	}
	if s.tick-sess.lastAOIChangeTick >= AOIHysteresisTicks {
		sess.stableAOI = next
		sess.lastAOIChangeTick = s.tick
	}
	return sess.stableAOI
}

func (s *roomState) clampClientAOI(sess *session, requested chunkAOI) chunkAOI {
	center := ChunkYForWorldY(sess.player.Position.Y)
	minAllowed := max(0, center-MaxClientAOIChunksBehind)
	maxAllowed := center + MaxClientAOIChunksAhead
	if requested.right < requested.left {
		requested.left, requested.right = requested.right, requested.left
	}
	if requested.bottom < requested.top {
		requested.top, requested.bottom = requested.bottom, requested.top
	}
	out := chunkAOI{
		min:    max(minAllowed, requested.min),
		max:    min(maxAllowed, requested.max),
		left:   max(0, requested.left),
		right:  min(ChunkWidthTiles*TileSize, requested.right),
		top:    requested.top,
		bottom: requested.bottom,
	}
	if out.max < out.min {
		return chunkAOIForChunks(max(0, center-DefaultAOIChunksBehind), center+DefaultAOIChunksAhead)
	}
	if out.right < out.left {
		out.left = 0
		out.right = ChunkWidthTiles * TileSize
	}
	if out.bottom < out.top {
		base := chunkAOIForChunks(out.min, out.max)
		out.top = base.top
		out.bottom = base.bottom
	}
	if !chunkInAOI(out, center) {
		out.min = min(out.min, center)
		out.max = max(out.max, center)
	}
	playerLeft := int(math.Floor(sess.player.Position.X))
	playerRight := int(math.Ceil(sess.player.Position.X + PlayerWidth))
	playerTop := int(math.Floor(sess.player.Position.Y))
	playerBottom := int(math.Ceil(sess.player.Position.Y + PlayerHeight))
	out.left = min(out.left, playerLeft)
	out.right = max(out.right, playerRight)
	out.top = min(out.top, playerTop)
	out.bottom = max(out.bottom, playerBottom)
	out.left = max(0, out.left)
	out.right = min(ChunkWidthTiles*TileSize, out.right)
	return out
}

func chunkAOIForChunks(minChunk, maxChunk int) chunkAOI {
	if maxChunk < minChunk {
		minChunk, maxChunk = maxChunk, minChunk
	}
	return chunkAOI{
		min:    max(0, minChunk),
		max:    max(0, maxChunk),
		left:   0,
		right:  ChunkWidthTiles * TileSize,
		top:    -max(0, maxChunk) * ChunkHeightTiles * TileSize,
		bottom: (-max(0, minChunk) + 1) * ChunkHeightTiles * TileSize,
	}
}

func (aoi chunkAOI) withMargin(px int) chunkAOI {
	if px <= 0 {
		return aoi
	}
	out := aoi
	out.left = max(0, out.left-px)
	out.right = min(ChunkWidthTiles*TileSize, out.right+px)
	out.top -= px
	out.bottom += px
	return out
}

func aoiContains(outer, inner chunkAOI) bool {
	return inner.min >= outer.min &&
		inner.max <= outer.max &&
		inner.left >= outer.left &&
		inner.right <= outer.right &&
		inner.top >= outer.top &&
		inner.bottom <= outer.bottom
}

func mergeAOI(a, b chunkAOI) chunkAOI {
	return chunkAOI{
		min:    min(a.min, b.min),
		max:    max(a.max, b.max),
		left:   min(a.left, b.left),
		right:  max(a.right, b.right),
		top:    min(a.top, b.top),
		bottom: max(a.bottom, b.bottom),
	}
}

func (s *roomState) chunkRequestAllowed(sess *session, chunkY int) bool {
	aoi := s.sessionAOI(sess)
	return chunkY >= max(0, aoi.min-DefaultChunkRequestSlack) && chunkY <= aoi.max+DefaultChunkRequestSlack
}

func (s *roomState) playerFramesForAOI(aoi chunkAOI, frames map[string]PlayerEntityFrame) []PlayerEntityFrame {
	out := make([]PlayerEntityFrame, 0, len(frames))
	for _, sess := range s.sessions {
		if !sess.connected || !chunkInAOI(aoi, ChunkYForWorldY(sess.player.Position.Y)) ||
			!rectIntersectsAOI(aoi, sess.player.Position.X, sess.player.Position.Y, PlayerWidth, PlayerHeight) {
			continue
		}
		if frame, ok := frames[sess.playerID]; ok {
			out = append(out, frame)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func enemiesForAOI(aoi chunkAOI, enemies []EnemyState) []EnemyState {
	out := make([]EnemyState, 0, len(enemies))
	for _, enemy := range enemies {
		if chunkInAOI(aoi, enemy.ChunkY) && rectIntersectsAOI(aoi, enemy.Position.X, enemy.Position.Y, 22, 28) {
			out = append(out, enemy)
		}
	}
	return out
}

func collectiblesForAOI(aoi chunkAOI, collectibles []CollectibleState) []CollectibleState {
	out := make([]CollectibleState, 0, len(collectibles))
	for _, collectible := range collectibles {
		if chunkInAOI(aoi, ChunkYForWorldY(collectible.Y)) && pointInAOI(aoi, collectible.X, collectible.Y) {
			out = append(out, collectible)
		}
	}
	return out
}

func chunkInAOI(aoi chunkAOI, chunkY int) bool {
	return chunkY >= aoi.min && chunkY <= aoi.max
}

func rectIntersectsAOI(aoi chunkAOI, x, y, width, height float64) bool {
	return x+width >= float64(aoi.left) &&
		x <= float64(aoi.right) &&
		y+height >= float64(aoi.top) &&
		y <= float64(aoi.bottom)
}

func pointInAOI(aoi chunkAOI, x, y float64) bool {
	return x >= float64(aoi.left) &&
		x <= float64(aoi.right) &&
		y >= float64(aoi.top) &&
		y <= float64(aoi.bottom)
}

func (s *roomState) enrichEvents(events []MatchEvent, serverTick, snapshotSeq uint64) []MatchEvent {
	if len(events) == 0 {
		return events
	}
	out := make([]MatchEvent, 0, len(events))
	for _, event := range events {
		if event == nil {
			continue
		}
		enriched := make(MatchEvent, len(event)+3)
		for key, value := range event {
			enriched[key] = value
		}
		if _, ok := enriched["eventId"]; !ok {
			s.eventSeq++
			enriched["eventId"] = fmt.Sprintf("%s:%d", s.room.cfg.ID, s.eventSeq)
		}
		if _, ok := enriched["serverTick"]; !ok {
			enriched["serverTick"] = serverTick
		}
		if _, ok := enriched["snapshotSeq"]; !ok {
			enriched["snapshotSeq"] = snapshotSeq
		}
		out = append(out, enriched)
	}
	return out
}

func (s *roomState) broadcastJSON(payload any) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return
	}
	recipients := 0
	started := time.Now()
	for _, sess := range s.sessions {
		if sess.connected && sess.client.EnqueueEncoded(encoded) {
			recipients++
		}
	}
	s.metrics.recordBroadcast(time.Since(started), recipients)
}

func quantize2(value float64) float64 {
	return math.Round(value*100) / 100
}

func (s *roomState) checkRelicCollection(sess *session) {
	player := &sess.player
	px := player.Position.X + float64(PlayerWidth)/2
	py := player.Position.Y + float64(PlayerHeight)/2
	centerChunkY := ChunkYForWorldY(player.Position.Y)

	for chunkY := max(0, centerChunkY-1); chunkY <= centerChunkY+1; chunkY++ {
		chunk := GenerateChunk(s.room.seed, chunkY)
		for _, relic := range chunk.Relics {
			if _, ok := s.collectedRelics[relic.ID]; ok {
				continue
			}
			worldX := float64(relic.X*TileSize) + float64(TileSize)/2
			worldY := float64((chunk.WorldTileY+relic.Y)*TileSize) + float64(TileSize)/2
			if math.Hypot(px-worldX, py-worldY) > math.Max(PickupRadius, player.PickupRadius) {
				continue
			}
			contested, ok := s.canCollectRelic(sess, relic, worldX, worldY, chunk)
			if !ok {
				continue
			}
			s.collectedRelics[relic.ID] = struct{}{}
			if s.relicClaims != nil {
				delete(s.relicClaims, relic.ID)
			}
			pickupType := collectibleKindForRelicID(relic.ID)
			beforeLevel := player.Level
			applyCollectible(player, pickupType)
			s.queueLevelUpChoices(sess, beforeLevel)
			player.Coins++
			s.emitPlayerStats(sess)
			s.pendingEvents = append(s.pendingEvents, MatchEvent{
				"type":       "COIN_COLLECTED",
				"playerId":   sess.playerID,
				"coinId":     relic.ID,
				"value":      1,
				"x":          worldX,
				"y":          worldY,
				"pickupType": pickupType,
				"xpGranted":  XPCollectibleValue,
				"level":      player.Level,
				"contested":  contested,
				"hotspot":    relicHotspotKind(relic.ID),
				"regionId":   chunk.RegionID,
				"chunkY":     chunk.ChunkY,
			})
		}
	}
}

func (s *roomState) canCollectRelic(sess *session, relic RelicSpawn, worldX, worldY float64, chunk GeneratedChunk) (bool, bool) {
	contenders := s.relicContenders(sess, worldX, worldY)
	if len(contenders) <= 1 {
		if s.relicClaims != nil {
			delete(s.relicClaims, relic.ID)
		}
		return false, true
	}
	if s.relicClaims == nil {
		s.relicClaims = map[string]relicClaimState{}
	}
	ownerID := contenders[0].playerID
	claim := s.relicClaims[relic.ID]
	if claim.playerID != ownerID {
		claim = relicClaimState{playerID: ownerID, sinceTick: s.tick}
	}
	claim.lastSeenTick = s.tick
	claim.lastContenderCount = len(contenders)
	shouldEmit := claim.lastEventTick == 0 && claim.sinceTick == s.tick
	if !shouldEmit && s.tick > claim.lastEventTick {
		shouldEmit = s.tick-claim.lastEventTick >= s.secondsToTicks(relicContestEventCooldownSecs)
	}
	if shouldEmit {
		claim.lastEventTick = s.tick
		s.pendingEvents = append(s.pendingEvents, MatchEvent{
			"type":       "RELIC_CONTESTED",
			"relicId":    relic.ID,
			"playerId":   ownerID,
			"contenders": len(contenders),
			"x":          worldX,
			"y":          worldY,
			"hotspot":    relicHotspotKind(relic.ID),
			"regionId":   chunk.RegionID,
			"chunkY":     chunk.ChunkY,
		})
	}
	s.relicClaims[relic.ID] = claim
	heldLongEnough := s.tick-claim.sinceTick >= s.secondsToTicks(relicContestHoldSeconds)
	return true, sess.playerID == ownerID && heldLongEnough
}

type relicContender struct {
	playerID string
	distance float64
}

func (s *roomState) relicContenders(sess *session, worldX, worldY float64) []relicContender {
	seen := map[string]struct{}{}
	out := make([]relicContender, 0, len(s.sessions)+1)
	add := func(candidate *session) {
		if candidate == nil || candidate.player.Health <= 0 {
			return
		}
		if _, ok := seen[candidate.playerID]; ok {
			return
		}
		seen[candidate.playerID] = struct{}{}
		px := candidate.player.Position.X + float64(PlayerWidth)/2
		py := candidate.player.Position.Y + float64(PlayerHeight)/2
		distance := math.Hypot(px-worldX, py-worldY)
		radius := math.Max(PickupRadius, candidate.player.PickupRadius) + relicContestRadiusPadding
		if distance <= radius {
			out = append(out, relicContender{playerID: candidate.playerID, distance: distance})
		}
	}
	add(sess)
	for _, candidate := range s.sessions {
		if candidate == sess || !candidate.connected {
			continue
		}
		add(candidate)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].distance == out[j].distance {
			return out[i].playerID < out[j].playerID
		}
		return out[i].distance < out[j].distance
	})
	return out
}

func relicHotspotKind(id string) string {
	switch {
	case strings.HasPrefix(id, "riskRelic:"):
		return "risk"
	case strings.HasPrefix(id, "relic:"):
		return "relic"
	default:
		return "reward"
	}
}

func (s *roomState) emitPlayerStats(sess *session) {
	s.pendingEvents = append(s.pendingEvents, MatchEvent{
		"type":           "PLAYER_STATS",
		"playerId":       sess.playerID,
		"xp":             sess.player.Relics,
		"level":          sess.player.Level,
		"hp":             sess.player.Health,
		"maxHp":          sess.player.MaxHealth,
		"atk":            sess.player.Damage,
		"shield":         sess.player.Shield,
		"maxShield":      sess.player.MaxShield,
		"hitRange":       sess.player.HitRange,
		"selectedSkills": sess.player.SelectedSkills,
	})
}

func (s *roomState) queueLevelUpChoices(sess *session, beforeLevel int) {
	gainedLevels := sess.player.Level - beforeLevel
	if gainedLevels <= 0 {
		return
	}
	sess.pendingLevelChoices += gainedLevels
	s.maybeSendNextSkillOffer(sess)
}

func (s *roomState) maybeSendNextSkillOffer(sess *session) {
	if sess == nil || !sess.connected || sess.currentSkillOffer != nil || sess.pendingLevelChoices <= 0 {
		return
	}
	offerID := fmt.Sprintf("%s:%d:%d:%d", sess.playerID, sess.player.Level, s.tick, sess.pendingLevelChoices)
	offer, ok := generateSkillCardOffer(sess.player, offerID, s.room.seed^uint32(s.tick)^HashString(offerID))
	if !ok {
		sess.pendingLevelChoices = 0
		return
	}
	sess.pendingLevelChoices--
	sess.currentSkillOffer = &offer
	_ = sess.client.EnqueueJSON(SkillCardOfferMessage{Type: "skill_card_offer", Offer: offer})
}

func (s *roomState) collectedRelicList() []string {
	relics := make([]string, 0, len(s.collectedRelics))
	for id := range s.collectedRelics {
		relics = append(relics, id)
	}
	sort.Strings(relics)
	return relics
}

func (s *roomState) collectibleList() []CollectibleState {
	collectibles := make([]CollectibleState, 0, len(s.collectibles))
	for _, collectible := range s.collectibles {
		if !collectible.Picked {
			collectibles = append(collectibles, collectible)
		}
	}
	sort.Slice(collectibles, func(i, j int) bool { return collectibles[i].ID < collectibles[j].ID })
	return collectibles
}

func (s *roomState) checkDynamicCollectibleCollection(sess *session) {
	centerChunkY := ChunkYForWorldY(sess.player.Position.Y)
	minChunkY := max(0, centerChunkY-1)
	maxChunkY := centerChunkY + 1
	for id, collectible := range s.collectibles {
		if collectible.Picked {
			continue
		}
		chunkY := ChunkYForWorldY(collectible.Y)
		if chunkY < minChunkY || chunkY > maxChunkY {
			continue
		}
		s.tryPickupCollectible(sess, id)
	}
}

func (s *roomState) tryPickupCollectible(sess *session, collectibleID string) bool {
	if s.collectibles == nil {
		s.collectibles = map[string]CollectibleState{}
	}
	collectible, ok := s.collectibles[collectibleID]
	if !ok || collectible.Picked {
		return false
	}

	player := &sess.player
	px := player.Position.X + float64(PlayerWidth)/2
	py := player.Position.Y + float64(PlayerHeight)/2
	if math.Hypot(px-collectible.X, py-collectible.Y) > math.Max(PickupRadius, player.PickupRadius) {
		return false
	}

	xpValue := collectible.XPValue
	if collectible.Type == "xp" {
		xpValue = int(math.Round(float64(xpValue) * player.XPGainMultiplier))
	}
	beforeLevel := player.Level
	xpGranted := addPlayerXP(player, xpValue)
	s.queueLevelUpChoices(sess, beforeLevel)
	if collectible.Type == "coin" {
		player.Coins++
	}
	s.emitPlayerStats(sess)
	s.pendingEvents = append(s.pendingEvents, MatchEvent{
		"type":          "COLLECTIBLE_PICKED",
		"playerId":      sess.playerID,
		"collectibleId": collectible.ID,
		"xpGranted":     xpGranted,
	})
	s.pendingEvents = append(s.pendingEvents, MatchEvent{
		"type":       "COIN_COLLECTED",
		"playerId":   sess.playerID,
		"coinId":     collectible.ID,
		"value":      boolInt(collectible.Type == "coin"),
		"x":          collectible.X,
		"y":          collectible.Y,
		"pickupType": collectible.Type,
		"xpGranted":  xpGranted,
		"level":      player.Level,
	})
	delete(s.collectibles, collectibleID)
	return true
}

func (s *roomState) ensureEnemiesAround(player PlayerState) {
	centerChunkY := ChunkYForWorldY(player.Position.Y)
	for chunkY := max(0, centerChunkY-1); chunkY <= centerChunkY+2; chunkY++ {
		chunk := GenerateChunk(s.room.seed, chunkY)
		for _, spawn := range chunk.Enemies {
			if _, defeated := s.defeatedEnemies[spawn.ID]; defeated {
				continue
			}
			if _, exists := s.enemies[spawn.ID]; exists {
				continue
			}
			s.enemies[spawn.ID] = EnemyStateFromSpawn(chunk, spawn)
		}
	}
}

func (s *roomState) enemyList() []EnemyState {
	enemies := make([]EnemyState, 0, len(s.enemies))
	for _, enemy := range s.enemies {
		if enemy.Health > 0 {
			enemies = append(enemies, enemy)
		}
	}
	sort.Slice(enemies, func(i, j int) bool { return enemies[i].ID < enemies[j].ID })
	return enemies
}

func (s *roomState) simulateEnemies(dt float64) {
	activePlayers := make([]*session, 0, len(s.sessions))
	for _, sess := range s.sessions {
		if sess.connected && sess.player.Health > 0 {
			activePlayers = append(activePlayers, sess)
		}
	}

	for id, enemy := range s.enemies {
		if enemy.Health <= 0 {
			delete(s.enemies, id)
			continue
		}

		enemy.AttackCooldown = math.Max(0, enemy.AttackCooldown-dt)
		enemy.HurtCooldown = math.Max(0, enemy.HurtCooldown-dt)

		target := closestEnemyTarget(enemy, activePlayers)
		enemyHitPlayer := (*session)(nil)
		enemy = stepServerEnemyBehavior(enemy, target, dt)

		for _, sess := range activePlayers {
			if playerKickHitsEnemy(sess.player, enemy) {
				damage := max(1, sess.player.Damage)
				enemy.Health = max(0, enemy.Health-damage)
				enemy.HurtCooldown = 0.28
				enemy.Behavior = "recover"
				enemy.AttackWindup = 0
				enemy.AttackActive = 0
				enemy.AttackHasHit = false
				enemy.Velocity.X = float64(sess.player.Facing) * 22
				s.maybeTriggerShockwave(sess, enemy)
				s.pendingEvents = append(s.pendingEvents, MatchEvent{
					"type":     "ENEMY_HIT",
					"playerId": sess.playerID,
					"enemyId":  enemy.ID,
					"x":        enemy.Position.X + 11,
					"y":        enemy.Position.Y + 12,
					"damage":   damage,
				})
				if enemy.Health <= 0 {
					s.defeatedEnemies[enemy.ID] = struct{}{}
					drops := s.makeEnemyDrops(enemy)
					beforeLevel := sess.player.Level
					xpGranted := addPlayerXP(&sess.player, int(math.Round(float64(EnemyKillXP)*sess.player.KillXPMultiplier)))
					s.queueLevelUpChoices(sess, beforeLevel)
					s.emitPlayerStats(sess)
					for _, drop := range drops {
						if s.collectibles == nil {
							s.collectibles = map[string]CollectibleState{}
						}
						s.collectibles[drop.ID] = drop
						s.pendingEvents = append(s.pendingEvents, MatchEvent{
							"type":        "COLLECTIBLE_SPAWNED",
							"collectible": drop,
						})
					}
					delete(s.enemies, id)
					s.pendingEvents = append(s.pendingEvents, MatchEvent{
						"type":      "ENEMY_KILLED",
						"playerId":  sess.playerID,
						"enemyId":   enemy.ID,
						"x":         enemy.Position.X + 11,
						"y":         enemy.Position.Y + 12,
						"drops":     drops,
						"xpGranted": xpGranted,
					})
					goto nextEnemy
				}
			}

			if enemyHitPlayer == nil && !enemy.AttackHasHit && sess.player.Invulnerable <= 0 && enemy.Behavior == "attack" && enemyActiveAttackHitsPlayer(enemy, sess.player) {
				enemyHitPlayer = sess
			}
		}

		if enemyHitPlayer != nil {
			dir := 1.0
			if enemyHitPlayer.player.Position.X+float64(PlayerWidth)/2 < enemy.Position.X+11 {
				dir = -1
			}
			applyDamage(&enemyHitPlayer.player, enemyDamageForChunk(enemy.ChunkY), dir*125, -70, HitStunSeconds)
			enemy.AttackHasHit = true
			enemy.AttackCooldown = enemyAttackCooldownSeconds
			s.pendingEvents = append(s.pendingEvents, MatchEvent{
				"type":     "ENEMY_ATTACK",
				"playerId": enemyHitPlayer.playerID,
				"enemyId":  enemy.ID,
				"x":        enemy.Position.X + 11,
				"y":        enemy.Position.Y + 12,
			})
		}

		s.enemies[id] = enemy
	nextEnemy:
	}
}

func closestEnemyTarget(enemy EnemyState, players []*session) *session {
	var best *session
	bestDistance := math.MaxFloat64
	for _, sess := range players {
		if !playerOnEnemyPlatformNetwork(sess.player, enemy) {
			continue
		}
		playerCenterX := sess.player.Position.X + float64(PlayerWidth)/2
		enemyCenterX := enemy.Position.X + 11
		distance := math.Abs(playerCenterX - enemyCenterX)
		if distance > enemyDetectionRange || distance >= bestDistance {
			continue
		}
		best = sess
		bestDistance = distance
	}
	return best
}

func playerOnEnemyPlatformNetwork(player PlayerState, enemy EnemyState) bool {
	playerFeetY := player.Position.Y + float64(PlayerHeight)
	playerCenterX := player.Position.X + float64(PlayerWidth)/2
	minX := math.Min(enemy.PatrolMinX, enemy.PatrolMaxX)
	maxX := math.Max(enemy.PatrolMinX, enemy.PatrolMaxX) + 22
	return math.Abs(playerFeetY-enemy.PlatformY) <= enemyPlatformTolerance &&
		playerCenterX >= minX-enemyDetectionRange*0.35 &&
		playerCenterX <= maxX+enemyDetectionRange*0.35
}

func stepServerEnemyBehavior(enemy EnemyState, target *session, dt float64) EnemyState {
	if enemy.Behavior == "" {
		enemy.Behavior = "patrol"
	}
	targetDir := enemy.Facing
	targetDistanceX := math.MaxFloat64
	if target != nil {
		playerCenterX := target.player.Position.X + float64(PlayerWidth)/2
		enemyCenterX := enemy.Position.X + 11
		targetDir = 1
		if playerCenterX < enemyCenterX {
			targetDir = -1
		}
		targetDistanceX = math.Abs(playerCenterX - enemyCenterX)
	}
	canReachTarget := target != nil && targetDistanceX <= enemyAttackRange+float64(PlayerWidth+22)/2

	switch enemy.Behavior {
	case "windup":
		enemy.Velocity.X = 0
		if target != nil {
			enemy.Facing = targetDir
		}
		enemy.AttackWindup += dt
		if enemy.AttackWindup >= enemyAttackWindupSeconds {
			enemy.Behavior = "attack"
			enemy.AttackWindup = 0
			enemy.AttackActive = 0
			enemy.AttackHasHit = false
		}
	case "attack":
		enemy.Velocity.X = 0
		enemy.AttackActive += dt
		if enemy.AttackActive >= enemyAttackActiveSeconds {
			enemy.Behavior = "recover"
			enemy.AttackActive = 0
		}
	case "recover":
		enemy.Velocity.X = 0
		enemy.AttackActive += dt
		if enemy.AttackActive >= enemyAttackRecoverySeconds {
			enemy.Behavior = "patrol"
			enemy.AttackActive = 0
			enemy.AttackCooldown = enemyAttackCooldownSeconds
			enemy.AttackHasHit = false
			enemy.TargetID = ""
		}
	default:
		if target != nil {
			enemy.TargetID = target.playerID
			enemy.Facing = targetDir
			if canReachTarget && enemy.AttackCooldown <= 0 {
				enemy.Behavior = "windup"
				enemy.AttackWindup = 0
				enemy.AttackActive = 0
				enemy.AttackHasHit = false
				enemy.Velocity.X = 0
			} else {
				enemy.Behavior = "chase"
				enemy.Velocity.X = float64(targetDir) * enemySpeed(enemy.Kind, true)
			}
		} else {
			enemy.Behavior = "patrol"
			enemy.TargetID = ""
			patrolDir := enemy.Facing
			if enemy.Velocity.X < 0 {
				patrolDir = -1
			}
			enemy.Facing = patrolDir
			enemy.Velocity.X = float64(patrolDir) * enemySpeed(enemy.Kind, false)
		}
	}

	enemy.Position.X += enemy.Velocity.X * dt
	if enemy.Position.X <= enemy.PatrolMinX {
		enemy.Position.X = enemy.PatrolMinX
		if enemy.Behavior == "patrol" {
			enemy.Velocity.X = math.Abs(enemy.Velocity.X)
			enemy.Facing = 1
		} else {
			enemy.Velocity.X = 0
		}
	} else if enemy.Position.X >= enemy.PatrolMaxX {
		enemy.Position.X = enemy.PatrolMaxX
		if enemy.Behavior == "patrol" {
			enemy.Velocity.X = -math.Abs(enemy.Velocity.X)
			enemy.Facing = -1
		} else {
			enemy.Velocity.X = 0
		}
	}
	enemy.Position.Y = enemy.PlatformY - 24
	return enemy
}

func enemySpeed(kind string, chasing bool) float64 {
	speed := enemyPatrolSpeed
	if chasing {
		speed = enemyChaseSpeed
	}
	switch kind {
	case "goblinScout", "iceBat", "windSpirit":
		return speed * 1.12
	case "goblinChief", "skeletonArmored", "yeti", "iceGolem":
		return speed * 0.82
	default:
		return speed
	}
}

func enemyActiveAttackHitsPlayer(enemy EnemyState, player PlayerState) bool {
	return rectsOverlap(playerBounds{
		x:      enemyAttackX(enemy),
		y:      enemy.Position.Y + 2,
		width:  enemyAttackRange,
		height: 20,
	}, playerRect(player))
}

func enemyAttackX(enemy EnemyState) float64 {
	if enemy.Facing > 0 {
		return enemy.Position.X + 20
	}
	return enemy.Position.X - enemyAttackRange + 2
}

func (s *roomState) maybeTriggerShockwave(sess *session, source EnemyState) {
	stacks := skillStacks(sess.player, "shockwave_hit")
	if stacks <= 0 {
		return
	}
	sess.player.ShockwaveCounter++
	interval := max(3, 7-stacks)
	if sess.player.ShockwaveCounter%interval != 0 {
		return
	}
	radius := 44.0 + float64(stacks)*12
	originX := source.Position.X + 11
	originY := source.Position.Y + 12
	for id, enemy := range s.enemies {
		if id == source.ID || enemy.Health <= 0 {
			continue
		}
		ex := enemy.Position.X + 11
		ey := enemy.Position.Y + 12
		if math.Hypot(ex-originX, ey-originY) > radius {
			continue
		}
		damage := max(1, sess.player.Damage/2)
		enemy.Health = max(1, enemy.Health-damage)
		enemy.HurtCooldown = 0.22
		s.enemies[id] = enemy
		s.pendingEvents = append(s.pendingEvents, MatchEvent{
			"type":      "ENEMY_HIT",
			"playerId":  sess.playerID,
			"enemyId":   enemy.ID,
			"x":         ex,
			"y":         ey,
			"damage":    damage,
			"shockwave": true,
		})
	}
}

func enemyDamageForChunk(chunkY int) int {
	return 1 + min(3, max(0, chunkY)/10)
}

func (s *roomState) handleDeaths() {
	for _, sess := range s.sessions {
		if !sess.connected {
			continue
		}
		if sess.player.Health > 0 && sess.player.Position.Y < 900 {
			continue
		}
		s.pendingEvents = append(s.pendingEvents, MatchEvent{"type": "PLAYER_DIED", "playerId": sess.playerID})
		s.awardPvPKillCredit(sess)
		s.respawn(sess)
		s.pendingEvents = append(s.pendingEvents, MatchEvent{"type": "PLAYER_RESPAWNED", "playerId": sess.playerID})
	}
}

func (s *roomState) respawn(sess *session) {
	checkpoint := max(0, sess.player.CheckpointChunkY)
	x, y := SpawnPosition(s.room.seed, checkpoint)
	sess.player.Position = Vec2{X: x, Y: y}
	sess.player.Velocity = Vec2{}
	sess.player.Grounded = false
	sess.player.CoyoteTimer = 0
	sess.player.JumpBufferTimer = 0
	sess.player.KickPhase = "idle"
	sess.player.KickTimer = 0
	sess.player.KickCooldown = 0
	sess.player.KickInvulnerable = 0
	sess.player.Invulnerable = math.Max(sess.player.Invulnerable, pvpRespawnProtectionSeconds)
	sess.player.StunTimer = 0
	sess.player.Health = sess.player.MaxHealth
	sess.player.FallStartY = nil
	sess.player.CheckpointChunkY = checkpoint
	s.clearCombatState(sess.playerID)
}

func (s *roomState) awardPvPKillCredit(victim *session) {
	if victim == nil {
		return
	}
	state := s.combatState(victim.playerID)
	if state.lastAttackerID == "" || s.tick-state.lastDamageTick > s.secondsToTicks(pvpKillCreditSeconds) {
		return
	}
	attacker := s.sessions[state.lastAttackerID]
	if attacker == nil || !attacker.connected || attacker.player.Health <= 0 || attacker.playerID == victim.playerID {
		return
	}
	beforeLevel := attacker.player.Level
	xpGranted := addPlayerXP(&attacker.player, int(math.Round(float64(pvpKillXP)*attacker.player.KillXPMultiplier)))
	s.queueLevelUpChoices(attacker, beforeLevel)
	attacker.player.Coins += pvpKillCoins
	s.emitPlayerStats(attacker)
	s.pendingEvents = append(s.pendingEvents, MatchEvent{
		"type":      "PLAYER_KILLED",
		"playerId":  attacker.playerID,
		"targetId":  victim.playerID,
		"xpGranted": xpGranted,
		"coins":     pvpKillCoins,
	})
}

func (s *roomState) makeEnemyDrops(enemy EnemyState) []CollectibleState {
	seed := HashString(enemy.ID + ":" + itoa(int(s.tick)))
	countRange := max(0, EnemyDropMax-EnemyDropMin)
	count := EnemyDropMin
	if countRange > 0 {
		count += int(seed % uint32(countRange+1))
	}
	drops := make([]CollectibleState, 0, count)
	for i := 0; i < count; i++ {
		n := HashString(enemy.ID + ":drop:" + itoa(i) + ":" + itoa(int(s.tick)))
		scatterX := float64(int(n%25)) - 12
		popY := -float64(8 + int((n>>5)%10))
		kind := "coin"
		if float64((n>>11)%100)/100.0 < EnemyXPDropChance {
			kind = "xp"
		}
		drops = append(drops, CollectibleState{
			ID:        "drop:" + enemy.ID + ":" + kind + ":" + itoa(int(s.tick)) + ":" + itoa(i),
			Type:      kind,
			X:         math.Max(8, math.Min(float64(ChunkWidthTiles*TileSize-8), enemy.Position.X+11+scatterX)),
			Y:         enemy.Position.Y + 12 + popY,
			XPValue:   XPCollectibleValue,
			Picked:    false,
			SpawnedBy: "enemy_drop",
		})
	}
	return drops
}

func (s *roomState) applyPlayerInteractions(dt float64) {
	active := make([]*session, 0, len(s.sessions))
	for _, sess := range s.sessions {
		if sess.connected && sess.player.Health > 0 {
			active = append(active, sess)
		}
	}

	for i := 0; i < len(active); i++ {
		a := active[i]
		for j := i + 1; j < len(active); j++ {
			b := active[j]
			s.applyPassivePush(&a.player, &b.player, dt)
			if a.player.KickPhase == "active" && inKickRange(a.player, b.player) {
				s.applyPvPKickHit(a, b)
			}
			if b.player.KickPhase == "active" && inKickRange(b.player, a.player) {
				s.applyPvPKickHit(b, a)
			}
		}
	}
}

func (s *roomState) applyPvPKickHit(attacker, target *session) bool {
	if attacker == nil || target == nil || attacker.playerID == target.playerID {
		return false
	}
	if attacker.player.Health <= 0 || target.player.Health <= 0 {
		return false
	}
	if attacker.player.Invulnerable > 0 || target.player.Invulnerable > 0 || target.player.KickInvulnerable > 0 {
		return false
	}
	s.ensurePvPState()
	key := pvpHitCooldownKey(attacker.playerID, target.playerID)
	if s.pvpHitCooldowns[key] > s.tick {
		return false
	}

	stunMultiplier, knockbackMultiplier, chainHits := s.pvpHitMultipliers(target.playerID)
	force := KickForceAir
	if attacker.player.Grounded {
		force = KickForceGround
	}
	dir := 1.0
	if attacker.player.Facing < 0 {
		dir = -1
	}
	knockbackY := 0.0
	if target.player.Velocity.Y > -60 {
		knockbackY = -60 * knockbackMultiplier
	}

	beforeHealth := target.player.Health
	beforeShield := target.player.Shield
	applyDamage(&target.player, max(1, attacker.player.Damage), dir*force*knockbackMultiplier, knockbackY, HitStunSeconds*stunMultiplier)
	if chainHits >= pvpAntiStunChainHits {
		target.player.StunTimer = math.Min(target.player.StunTimer, HitStunSeconds*0.25)
		target.player.KickInvulnerable = math.Max(target.player.KickInvulnerable, pvpAntiStunInvulnerable)
		target.player.Invulnerable = math.Max(target.player.Invulnerable, pvpAntiStunInvulnerable)
	} else {
		target.player.KickInvulnerable = math.Max(target.player.KickInvulnerable, KickHitInvulnerableSeconds)
	}
	attacker.player.ShockwaveCounter++
	s.pvpHitCooldowns[key] = s.tick + s.secondsToTicks(pvpPairHitCooldownSeconds)
	s.recordPvPHit(attacker.playerID, target.playerID, chainHits)

	damageDone := max(0, beforeHealth-target.player.Health)
	shieldDamage := math.Max(0, beforeShield-target.player.Shield)
	s.pendingEvents = append(s.pendingEvents, MatchEvent{
		"type":             "PLAYER_KICK_HIT",
		"playerId":         attacker.playerID,
		"targetId":         target.playerID,
		"damage":           damageDone,
		"shieldDamage":     shieldDamage,
		"chainHits":        chainHits,
		"stunMultiplier":   stunMultiplier,
		"knockMultiplier":  knockbackMultiplier,
		"antiStunApplied":  chainHits >= pvpAntiStunChainHits,
		"targetHealth":     target.player.Health,
		"targetInvulnSecs": target.player.Invulnerable,
	})
	return true
}

func (s *roomState) pvpHitMultipliers(targetID string) (float64, float64, int) {
	state := s.combatState(targetID)
	chainHits := 1
	if state.chainHits > 0 && s.tick-state.lastHitTick <= s.secondsToTicks(pvpStunWindowSeconds) {
		chainHits = state.chainHits + 1
	}
	repeatedHits := max(0, chainHits-1)
	stunMultiplier := math.Max(0.20, 1-float64(repeatedHits)*pvpStunDiminishPerChainHit)
	if chainHits >= pvpAntiStunChainHits {
		stunMultiplier = 0
	}
	knockbackMultiplier := math.Max(0.50, 1-float64(repeatedHits)*pvpKnockbackDiminishPerHit)
	return stunMultiplier, knockbackMultiplier, chainHits
}

func (s *roomState) recordPvPHit(attackerID, targetID string, chainHits int) {
	state := s.combatState(targetID)
	state.lastAttackerID = attackerID
	state.lastDamageTick = s.tick
	state.lastHitTick = s.tick
	state.chainHits = chainHits
}

func (s *roomState) applyPassivePush(a, b *PlayerState, dt float64) {
	if !rectsOverlap(playerRect(*a), playerRect(*b)) {
		return
	}
	overlapRight := math.Min(a.Position.X+PlayerWidth, b.Position.X+PlayerWidth)
	overlapLeft := math.Max(a.Position.X, b.Position.X)
	overlapX := math.Max(0, overlapRight-overlapLeft)
	centerA := a.Position.X + float64(PlayerWidth)/2
	centerB := b.Position.X + float64(PlayerWidth)/2
	if math.Abs(centerA-centerB) <= 0.5 {
		return
	}
	pushDir := 1.0
	if centerA < centerB {
		pushDir = -1
	}
	airFactor := AirPushFactor
	if a.Grounded && b.Grounded {
		airFactor = 1
	}
	impulse := math.Min(overlapX*15*airFactor, PlayerMaxPushVelocity)
	a.Velocity.X += pushDir * impulse * dt * PlayerPushForce / PlayerMaxPushVelocity
	b.Velocity.X -= pushDir * impulse * dt * PlayerPushForce / PlayerMaxPushVelocity
	a.Velocity.X = math.Max(-PlayerMaxPushVelocity, math.Min(PlayerMaxPushVelocity, a.Velocity.X))
	b.Velocity.X = math.Max(-PlayerMaxPushVelocity, math.Min(PlayerMaxPushVelocity, b.Velocity.X))
}

func activeSessions(s *roomState) int {
	count := 0
	for _, sess := range s.sessions {
		if sess.connected {
			count++
		}
	}
	return count
}
