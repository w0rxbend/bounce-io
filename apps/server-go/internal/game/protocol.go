package game

import "time"

const (
	GameVersion     = "0.1.0"
	ProtocolVersion = 2

	TileSize                       = 16
	ChunkWidthTiles                = 36
	ChunkHeightTiles               = 18
	CheckpointPortalWidthTiles     = 4
	PlayerWidth                    = 14
	PlayerHeight                   = 22
	PhysicsStepSeconds             = 1.0 / 60.0
	MaxDeltaSeconds                = 1.0 / 15.0
	MaxReachableVerticalGapTiles   = 3
	MaxReachableHorizontalGapTiles = 6
	DefaultTickRate                = 60
	DefaultSnapshotRate            = 20
	DefaultRoomID                  = "demo"
	DefaultMaxPlayers              = 8
	DefaultOutboundQueue           = 32
	DefaultReconnectGrace          = 30 * time.Second
	DefaultAOIChunksBehind         = 3
	DefaultAOIChunksAhead          = 5
	DefaultChunkRequestSlack       = 1
	MaxClientAOIChunksBehind       = 6
	MaxClientAOIChunksAhead        = 8
	AOIHysteresisTicks             = 12
	AOIHysteresisPixels            = 32
)

const (
	MoveAcceleration   = 1200.0
	GroundFriction     = 1450.0
	AirAcceleration    = 760.0
	MaxRunSpeed        = 150.0
	Gravity            = 820.0
	JumpSpeed          = 315.0
	MaxFallSpeed       = 420.0
	CoyoteTimeSeconds  = 0.09
	JumpBufferSeconds  = 0.10
	ShortHopCutoff     = 0.45
	BaseMaxHealth      = 5
	ReconcileTolerance = 6.0

	KickWindupSeconds          = 0.10
	KickActiveSeconds          = 0.08
	KickRecoverySeconds        = 0.22
	KickCooldownSeconds        = 0.80
	KickRangePX                = 20
	KickForceGround            = 260.0
	KickForceAir               = 160.0
	KickHitInvulnerableSeconds = 0.35
	HitStunSeconds             = 0.16
	PlayerPushForce            = 800.0
	PlayerMaxPushVelocity      = 120.0
	AirPushFactor              = 0.35
	RelicsPerLevel             = 5
	FatalFallDistancePX        = 12 * 32.0
	EnemyKillXP                = 25
	XPCollectibleValue         = 10
	EnemyDropMin               = 1
	EnemyDropMax               = 3
	EnemyXPDropChance          = 0.75
	PickupRadius               = 24.0
	XPPerLevelBase             = 100.0
	XPPerLevelGrowth           = 1.25
)

type MessageEnvelope struct {
	Type string `json:"type"`
}

type ClientHello struct {
	Type            string `json:"type"`
	Protocol        int    `json:"protocol"`
	Version         string `json:"version"`
	Name            string `json:"name"`
	SkinID          string `json:"skinId,omitempty"`
	Token           string `json:"token,omitempty"`
	BinarySnapshots bool   `json:"binarySnapshots,omitempty"`
}

type ClientJoin struct {
	Type            string `json:"type"`
	Protocol        int    `json:"protocol"`
	Version         string `json:"version"`
	Name            string `json:"name"`
	SkinID          string `json:"skinId,omitempty"`
	Token           string `json:"token,omitempty"`
	ClientID        string `json:"clientId,omitempty"`
	ClientTime      int64  `json:"clientTime,omitempty"`
	BinarySnapshots bool   `json:"binarySnapshots,omitempty"`
}

type ClientPing struct {
	Type       string `json:"type"`
	ClientTime int64  `json:"clientTime"`
}

type ClientLeave struct {
	Type     string `json:"type"`
	ClientID string `json:"clientId,omitempty"`
	PlayerID string `json:"playerId,omitempty"`
}

type ClientRequestChunk struct {
	Type   string `json:"type"`
	ChunkY int    `json:"chunkY"`
}

type ClientViewport struct {
	Type          string  `json:"type"`
	MinChunkY     int     `json:"minChunkY"`
	MaxChunkY     int     `json:"maxChunkY"`
	X1            float64 `json:"x1"`
	Y1            float64 `json:"y1"`
	X2            float64 `json:"x2"`
	Y2            float64 `json:"y2"`
	VisibleWidth  float64 `json:"visibleWidth"`
	VisibleHeight float64 `json:"visibleHeight"`
	Zoom          float64 `json:"zoom"`
}

type ClientInput struct {
	Type       string       `json:"type"`
	ClientID   string       `json:"clientId,omitempty"`
	PlayerID   string       `json:"playerId,omitempty"`
	InputSeq   int64        `json:"inputSeq,omitempty"`
	ClientTime int64        `json:"clientTime,omitempty"`
	Input      PlayerInput  `json:"input,omitempty"`
	Movement   *InputState  `json:"movement,omitempty"`
	Aim        *AimState    `json:"aim,omitempty"`
	Action     *ActionState `json:"action,omitempty"`
}

type ClientPickupCollectible struct {
	Type          string `json:"type"`
	CollectibleID string `json:"collectibleId"`
}

type ClientSelectSkillCard struct {
	Type    string `json:"type"`
	OfferID string `json:"offerId"`
	CardID  string `json:"cardId"`
}

type InputState struct {
	Left        bool `json:"left"`
	Right       bool `json:"right"`
	JumpPressed bool `json:"jumpPressed"`
	JumpHeld    bool `json:"jumpHeld"`
	Drop        bool `json:"drop"`
}

type AimState struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type ActionState struct {
	Kick bool `json:"kick"`
}

type PlayerInput struct {
	Left        bool  `json:"left"`
	Right       bool  `json:"right"`
	JumpPressed bool  `json:"jumpPressed"`
	JumpHeld    bool  `json:"jumpHeld"`
	Drop        bool  `json:"drop"`
	Kick        bool  `json:"kick"`
	Dash        bool  `json:"dash,omitempty"`
	Sequence    int64 `json:"sequence"`
	ClientTime  int64 `json:"clientTime,omitempty"`
}

type Vec2 struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type PlayerState struct {
	ID                      string         `json:"id"`
	SkinID                  string         `json:"skinId,omitempty"`
	Position                Vec2           `json:"position"`
	Velocity                Vec2           `json:"velocity"`
	Facing                  int            `json:"facing"`
	Grounded                bool           `json:"grounded"`
	CoyoteTimer             float64        `json:"coyoteTimer"`
	JumpBufferTimer         float64        `json:"jumpBufferTimer"`
	KickCooldown            float64        `json:"kickCooldown"`
	KickPhase               string         `json:"kickPhase"`
	KickTimer               float64        `json:"kickTimer"`
	KickInvulnerable        float64        `json:"kickInvulnerable"`
	Invulnerable            float64        `json:"invulnerable"`
	StunTimer               float64        `json:"stunTimer"`
	CheckpointChunkY        int            `json:"checkpointChunkY"`
	Coins                   int            `json:"coins"`
	Health                  int            `json:"health"`
	MaxHealth               int            `json:"maxHealth"`
	Damage                  int            `json:"damage"`
	AttackSpeed             float64        `json:"attackSpeed"`
	JumpPower               float64        `json:"jumpPower"`
	AirControl              float64        `json:"airControl"`
	KnockbackResistance     float64        `json:"knockbackResistance"`
	MovementSpeed           float64        `json:"movementSpeed"`
	Level                   int            `json:"level"`
	Relics                  int            `json:"relics"`
	Crystals                int            `json:"crystals"`
	RelicFragments          int            `json:"relicFragments"`
	HitRange                float64        `json:"hitRange"`
	AttackCooldownMs        float64        `json:"attackCooldownMs"`
	DamageReduction         float64        `json:"damageReduction"`
	Shield                  float64        `json:"shield"`
	MaxShield               float64        `json:"maxShield"`
	ShieldRegenPerSec       float64        `json:"shieldRegenPerSecond"`
	ShieldRegenDelayMs      float64        `json:"shieldRegenDelayMs"`
	LastDamageAt            int64          `json:"lastDamageAt"`
	ShieldRegenCooldown     float64        `json:"shieldRegenCooldownMs"`
	JumpPowerMultiplier     float64        `json:"jumpPowerMultiplier"`
	AirControlMultiplier    float64        `json:"airControlMultiplier"`
	ExtraJumps              int            `json:"extraJumps"`
	ExtraJumpsUsed          int            `json:"extraJumpsUsed"`
	DashUnlocked            bool           `json:"dashUnlocked"`
	DashCooldownMs          float64        `json:"dashCooldownMs"`
	DashCooldownRemainingMs float64        `json:"dashCooldownRemainingMs"`
	DashTimerMs             float64        `json:"dashTimerMs"`
	PickupRadius            float64        `json:"pickupRadius"`
	XPGainMultiplier        float64        `json:"xpGainMultiplier"`
	KillXPMultiplier        float64        `json:"killXpMultiplier"`
	SelectedSkills          map[string]int `json:"selectedSkills"`
	ShockwaveCounter        int            `json:"shockwaveCounter"`
	FallStartY              *float64       `json:"fallStartY"`
}

type EntityState struct {
	ID             string         `json:"id"`
	SkinID         string         `json:"skinId,omitempty"`
	Kind           string         `json:"kind"`
	Type           string         `json:"type"`
	Position       Vec2           `json:"position"`
	Velocity       Vec2           `json:"velocity"`
	Facing         int            `json:"facing"`
	Grounded       bool           `json:"grounded"`
	KickPhase      string         `json:"kickPhase,omitempty"`
	KickTimer      float64        `json:"kickTimer,omitempty"`
	Invulnerable   float64        `json:"invulnerable,omitempty"`
	Health         int            `json:"health"`
	Coins          int            `json:"coins"`
	MaxHealth      int            `json:"maxHealth,omitempty"`
	Shield         float64        `json:"shield,omitempty"`
	MaxShield      float64        `json:"maxShield,omitempty"`
	HitRange       float64        `json:"hitRange,omitempty"`
	SelectedSkills map[string]int `json:"selectedSkills,omitempty"`
}

type PlayerEntityFrame struct {
	ID             string         `json:"id"`
	SkinID         string         `json:"s,omitempty"`
	X              float64        `json:"x"`
	Y              float64        `json:"y"`
	VX             float64        `json:"vx"`
	VY             float64        `json:"vy"`
	Facing         int            `json:"f"`
	Grounded       bool           `json:"g"`
	KickPhase      string         `json:"k,omitempty"`
	KickTimer      float64        `json:"kt,omitempty"`
	Invulnerable   float64        `json:"iv,omitempty"`
	Health         int            `json:"h"`
	Coins          int            `json:"c"`
	MaxHealth      int            `json:"mh,omitempty"`
	Shield         float64        `json:"sh,omitempty"`
	MaxShield      float64        `json:"ms,omitempty"`
	HitRange       float64        `json:"hr,omitempty"`
	SelectedSkills map[string]int `json:"sk,omitempty"`
}

type EnemySpawn struct {
	ID   string `json:"id"`
	Kind string `json:"kind"`
	X    int    `json:"x"`
	Y    int    `json:"y"`
}

type EnemyState struct {
	ID             string  `json:"id"`
	Kind           string  `json:"kind"`
	Position       Vec2    `json:"position"`
	Velocity       Vec2    `json:"velocity"`
	Facing         int     `json:"facing"`
	Health         int     `json:"health"`
	MaxHealth      int     `json:"maxHealth"`
	ChunkY         int     `json:"chunkY"`
	PatrolMinX     float64 `json:"patrolMinX"`
	PatrolMaxX     float64 `json:"patrolMaxX"`
	PlatformY      float64 `json:"platformY"`
	AttackCooldown float64 `json:"attackCooldown"`
	HurtCooldown   float64 `json:"hurtCooldown"`
}

type CollectibleState struct {
	ID        string  `json:"id"`
	Type      string  `json:"type"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	XPValue   int     `json:"xpValue"`
	Picked    bool    `json:"picked"`
	SpawnedBy string  `json:"spawnedBy,omitempty"`
}

type MatchEvent map[string]any

type SkillCard struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Category      string `json:"category"`
	Rarity        string `json:"rarity"`
	Description   string `json:"description"`
	Icon          string `json:"icon"`
	MaxStacks     int    `json:"maxStacks"`
	CurrentStacks int    `json:"currentStacks"`
}

type SkillCardOffer struct {
	OfferID  string      `json:"offerId"`
	PlayerID string      `json:"playerId"`
	Cards    []SkillCard `json:"cards"`
}

type SkillCardOfferMessage struct {
	Type  string         `json:"type"`
	Offer SkillCardOffer `json:"offer"`
}

type SkillAppliedMessage struct {
	Type     string         `json:"type"`
	PlayerID string         `json:"playerId"`
	SkillID  string         `json:"skillId"`
	NewStats map[string]any `json:"newStats"`
}

type PlayerStatsMessage struct {
	Type     string         `json:"type"`
	PlayerID string         `json:"playerId"`
	Stats    map[string]any `json:"stats"`
}

type WelcomeMessage struct {
	Type         string `json:"type"`
	PlayerID     string `json:"playerId"`
	SessionToken string `json:"sessionToken"`
	ServerTime   int64  `json:"serverTime"`
	TickRate     int    `json:"tickRate"`
	MatchPhase   string `json:"matchPhase"`
	Seed         uint32 `json:"seed"`
	Name         string `json:"name"`
}

type SnapshotMessage struct {
	Type             string              `json:"type"`
	Tick             uint64              `json:"tick"`
	ServerTick       uint64              `json:"serverTick"`
	SnapshotSeq      uint64              `json:"snapshotSeq"`
	ServerTime       int64               `json:"serverTime"`
	MatchPhase       string              `json:"matchPhase"`
	AckInputSeq      int64               `json:"ackInputSeq"`
	Players          []PlayerState       `json:"players"`
	Entities         []EntityState       `json:"entities"`
	PlayerEntities   []PlayerEntityFrame `json:"playerEntities"`
	Enemies          []EnemyState        `json:"enemies"`
	Collectibles     []CollectibleState  `json:"collectibles,omitempty"`
	CollectedRelics  []string            `json:"collectedRelics"`
	Events           []MatchEvent        `json:"events"`
	LastProcessedSeq map[string]int64    `json:"lastProcessedSeq"`
}

type EventsMessage struct {
	Type        string       `json:"type"`
	ServerTick  uint64       `json:"serverTick"`
	SnapshotSeq uint64       `json:"snapshotSeq"`
	ServerTime  int64        `json:"serverTime"`
	Events      []MatchEvent `json:"events"`
}

type RelicStateMessage struct {
	Type            string   `json:"type"`
	ServerTime      int64    `json:"serverTime"`
	CollectedRelics []string `json:"collectedRelics"`
}

type ErrorMessage struct {
	Type    string `json:"type"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

type PongMessage struct {
	Type       string `json:"type"`
	ClientTime int64  `json:"clientTime"`
	ServerTime int64  `json:"serverTime"`
}

type MatchPhaseMessage struct {
	Type        string `json:"type"`
	Phase       string `json:"phase"`
	CountdownMS int64  `json:"countdownMs,omitempty"`
}

type PlayerJoinedMessage struct {
	Type   string      `json:"type"`
	Player PlayerState `json:"player"`
	Name   string      `json:"name"`
}

type PlayerLeftMessage struct {
	Type     string `json:"type"`
	PlayerID string `json:"playerId"`
}

type ChunkMessage struct {
	Type  string         `json:"type"`
	Chunk GeneratedChunk `json:"chunk"`
}

type GeneratedChunk struct {
	Seed        uint32          `json:"seed"`
	ChunkY      int             `json:"chunkY"`
	Width       int             `json:"width"`
	Height      int             `json:"height"`
	WorldTileY  int             `json:"worldTileY"`
	RegionID    string          `json:"regionId"`
	RegionIndex int             `json:"regionIndex"`
	RegionName  string          `json:"regionName"`
	Checkpoint  bool            `json:"checkpoint"`
	Tiles       []string        `json:"tiles"`
	Platforms   []PlatformSpan  `json:"platforms"`
	Entry       PlatformSpan    `json:"entry"`
	Exit        PlatformSpan    `json:"exit"`
	Portal      *PortalSpawn    `json:"portal,omitempty"`
	Landmarks   []LandmarkSpawn `json:"landmarks"`
	Routes      []RouteBranch   `json:"routes"`
	Relics      []RelicSpawn    `json:"relics"`
	Enemies     []EnemySpawn    `json:"enemies"`
	JumpPads    []JumpPadSpawn  `json:"jumpPads"`
	WindZones   []WindZoneSpawn `json:"windZones"`
}

type PlatformSpan struct {
	X     int `json:"x"`
	Y     int `json:"y"`
	Width int `json:"width"`
}

type RelicSpawn struct {
	ID string `json:"id"`
	X  int    `json:"x"`
	Y  int    `json:"y"`
}

type JumpPadSpawn struct {
	ID         string  `json:"id"`
	X          int     `json:"x"`
	Y          int     `json:"y"`
	Multiplier float64 `json:"multiplier"`
}

type WindZoneSpawn struct {
	ID        string  `json:"id"`
	X         int     `json:"x"`
	Y         int     `json:"y"`
	Width     int     `json:"width"`
	Height    int     `json:"height"`
	Direction int     `json:"direction"`
	Strength  float64 `json:"strength"`
}

type TriggerBox struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type PortalSpawn struct {
	ID         string     `json:"id"`
	RegionID   string     `json:"regionId"`
	ChunkY     int        `json:"chunkY"`
	X          int        `json:"x"`
	Y          int        `json:"y"`
	Width      int        `json:"width"`
	Style      string     `json:"style"`
	Checkpoint bool       `json:"checkpoint"`
	Trigger    TriggerBox `json:"trigger"`
}

type LandmarkSpawn struct {
	ID       string `json:"id"`
	RegionID string `json:"regionId"`
	Kind     string `json:"kind"`
	X        int    `json:"x"`
	Y        int    `json:"y"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
	Hidden   bool   `json:"hidden"`
}

type RouteBranch struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"`
	Label  string `json:"label"`
	Hidden bool   `json:"hidden"`
	Reward int    `json:"reward"`
	Nodes  []Vec2 `json:"nodes"`
}
