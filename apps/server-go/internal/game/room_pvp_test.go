package game

import (
	"testing"
)

func TestRespawnProtectionPreventsPvPOffenseAndDamage(t *testing.T) {
	state := &roomState{pendingEvents: []MatchEvent{}}
	attacker := &session{
		playerID:  "attacker",
		player:    CreatePlayerState("attacker", 100, 100),
		connected: true,
	}
	target := &session{
		playerID:  "target",
		player:    CreatePlayerState("target", 115, 100),
		connected: true,
	}
	attacker.player.KickPhase = "active"
	attacker.player.Invulnerable = pvpRespawnProtectionSeconds
	state.sessions = map[string]*session{"attacker": attacker, "target": target}

	state.applyPlayerInteractions(PhysicsStepSeconds)

	if target.player.Health != target.player.MaxHealth {
		t.Fatalf("respawn-protected attacker should not damage target, got %d/%d", target.player.Health, target.player.MaxHealth)
	}
	if len(state.pendingEvents) != 0 {
		t.Fatalf("respawn-protected attacker should not emit PvP hit events, got %#v", state.pendingEvents)
	}

	attacker.player.Invulnerable = 0
	target.player.Invulnerable = pvpRespawnProtectionSeconds
	state.applyPlayerInteractions(PhysicsStepSeconds)

	if target.player.Health != target.player.MaxHealth {
		t.Fatalf("respawn-protected target should not take damage, got %d/%d", target.player.Health, target.player.MaxHealth)
	}
	if len(state.pendingEvents) != 0 {
		t.Fatalf("respawn-protected target should not emit PvP hit events, got %#v", state.pendingEvents)
	}
}

func TestPvPHitsApplyAntiStunlockDiminishingReturns(t *testing.T) {
	state := &roomState{pendingEvents: []MatchEvent{}}
	attacker := &session{
		playerID:  "attacker",
		player:    CreatePlayerState("attacker", 100, 100),
		connected: true,
	}
	target := &session{
		playerID:  "target",
		player:    CreatePlayerState("target", 115, 100),
		connected: true,
	}
	attacker.player.KickPhase = "active"
	attacker.player.Grounded = true
	state.sessions = map[string]*session{"attacker": attacker, "target": target}

	for hit := 1; hit <= pvpAntiStunChainHits; hit++ {
		target.player.Invulnerable = 0
		target.player.KickInvulnerable = 0
		if !state.applyPvPKickHit(attacker, target) {
			t.Fatalf("expected hit %d to apply", hit)
		}
		state.tick += state.secondsToTicks(pvpPairHitCooldownSeconds)
	}

	combat := state.combatState(target.playerID)
	if combat.chainHits != pvpAntiStunChainHits {
		t.Fatalf("expected %d chained hits, got %d", pvpAntiStunChainHits, combat.chainHits)
	}
	if target.player.Invulnerable < pvpAntiStunInvulnerable {
		t.Fatalf("expected anti-stunlock invulnerability %.2f, got %.2f", pvpAntiStunInvulnerable, target.player.Invulnerable)
	}
	if target.player.StunTimer > HitStunSeconds*0.25 {
		t.Fatalf("expected stun to be clamped by anti-stunlock, got %.3f", target.player.StunTimer)
	}
	last := state.pendingEvents[len(state.pendingEvents)-1]
	if last["antiStunApplied"] != true || last["chainHits"] != pvpAntiStunChainHits {
		t.Fatalf("expected anti-stun hit event, got %#v", last)
	}
}

func TestContestedRelicRequiresServerSideHold(t *testing.T) {
	seed := HashString("demo")
	chunk := GenerateChunk(seed, 0)
	relic := chunk.Relics[0]
	worldX := float64(relic.X*TileSize) + float64(TileSize)/2
	worldY := float64((chunk.WorldTileY+relic.Y)*TileSize) + float64(TileSize)/2
	owner := &session{
		playerID:  "owner",
		player:    CreatePlayerState("owner", worldX-float64(PlayerWidth)/2, worldY-float64(PlayerHeight)/2),
		connected: true,
	}
	challenger := &session{
		playerID:  "challenger",
		player:    CreatePlayerState("challenger", worldX-float64(PlayerWidth)/2+10, worldY-float64(PlayerHeight)/2),
		connected: true,
	}
	state := &roomState{
		room:            &Room{seed: seed, cfg: RoomConfig{TickRate: DefaultTickRate}},
		collectedRelics: map[string]uint64{},
		pendingEvents:   []MatchEvent{},
		sessions:        map[string]*session{"owner": owner, "challenger": challenger},
	}

	state.checkRelicCollection(owner)

	if _, ok := state.collectedRelics[relic.ID]; ok {
		t.Fatalf("contested relic should not be collected before hold completes")
	}
	if len(state.pendingEvents) == 0 || state.pendingEvents[0]["type"] != "RELIC_CONTESTED" {
		t.Fatalf("expected RELIC_CONTESTED event, got %#v", state.pendingEvents)
	}

	state.tick += state.secondsToTicks(relicContestHoldSeconds) + 1
	state.checkRelicCollection(owner)

	if _, ok := state.collectedRelics[relic.ID]; !ok {
		t.Fatalf("contested relic should be collected after owner holds the hotspot")
	}
	foundContestedPickup := false
	for _, event := range state.pendingEvents {
		if event["type"] == "COIN_COLLECTED" && event["coinId"] == relic.ID && event["contested"] == true {
			foundContestedPickup = true
			break
		}
	}
	if !foundContestedPickup {
		t.Fatalf("expected contested COIN_COLLECTED event, got %#v", state.pendingEvents)
	}
}

func TestPvPKillCreditGrantsRewardBeforeRespawn(t *testing.T) {
	seed := HashString("demo")
	attacker := &session{
		playerID:  "attacker",
		player:    CreatePlayerState("attacker", 100, 100),
		connected: true,
	}
	victim := &session{
		playerID:  "victim",
		player:    CreatePlayerState("victim", 115, 100),
		connected: true,
	}
	attacker.player.KickPhase = "active"
	attacker.player.Grounded = true
	attacker.player.Damage = victim.player.Health
	state := &roomState{
		room:          &Room{seed: seed, cfg: RoomConfig{TickRate: DefaultTickRate}},
		pendingEvents: []MatchEvent{},
		sessions:      map[string]*session{"attacker": attacker, "victim": victim},
	}

	state.applyPlayerInteractions(PhysicsStepSeconds)
	state.handleDeaths()

	if victim.player.Health != victim.player.MaxHealth {
		t.Fatalf("victim should respawn healed, got %d/%d", victim.player.Health, victim.player.MaxHealth)
	}
	if attacker.player.Coins != pvpKillCoins {
		t.Fatalf("expected PvP coin reward %d, got %d", pvpKillCoins, attacker.player.Coins)
	}
	if attacker.player.Relics != pvpKillXP {
		t.Fatalf("expected PvP XP reward %d, got %d", pvpKillXP, attacker.player.Relics)
	}
	foundKill := false
	for _, event := range state.pendingEvents {
		if event["type"] == "PLAYER_KILLED" && event["playerId"] == attacker.playerID && event["targetId"] == victim.playerID {
			foundKill = true
			break
		}
	}
	if !foundKill {
		t.Fatalf("expected PLAYER_KILLED event, got %#v", state.pendingEvents)
	}
}
