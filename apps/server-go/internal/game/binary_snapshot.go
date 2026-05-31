package game

import (
	"bytes"
	"encoding/binary"
	"math"
)

const (
	binarySnapshotMessageType = 1
	binaryEntityPlayer       = 1
	binaryEntityEnemyBase    = 16
	binaryEntityCollectible  = 64

	binaryFlagGrounded = 1 << 10
	binaryFlagFacing   = 1 << 11
	binaryFlagWindup   = 1 << 12
	binaryFlagActive   = 1 << 13
	binaryFlagRecovery = 1 << 14

	maxBinaryEntities = 65535
	minInt16Value     = -32768
	maxInt16Value     = 32767
	minInt32Value     = -2147483648
	maxInt32Value     = 2147483647
)

type binarySnapshotEntity struct {
	id         string
	entityType uint8
	x          float64
	y          float64
	vx         float64
	vy         float64
	rotation   int16
	flags      uint16
}

func encodeBinarySnapshot(serverTick, snapshotSeq, baselineTick uint64, serverTime int64, ackInputSeq int64, entities []binarySnapshotEntity, removed []uint32) []byte {
	if len(entities) > maxBinaryEntities {
		entities = entities[:maxBinaryEntities]
	}
	if len(removed) > maxBinaryEntities {
		removed = removed[:maxBinaryEntities]
	}
	var buf bytes.Buffer
	buf.Grow(1 + 4 + 4 + 4 + 4 + 8 + 2 + len(entities)*21 + 2 + len(removed)*4)
	buf.WriteByte(binarySnapshotMessageType)
	writeUint32(&buf, uint32(serverTick))
	writeUint32(&buf, uint32(baselineTick))
	writeUint32(&buf, uint32(snapshotSeq))
	writeInt32(&buf, clampInt32(ackInputSeq))
	writeUint64(&buf, uint64(serverTime))
	writeUint16(&buf, uint16(len(entities)))
	for _, entity := range entities {
		writeUint32(&buf, HashString(entity.id))
		buf.WriteByte(entity.entityType)
		writeInt32(&buf, quantizeI32(entity.x, 100))
		writeInt32(&buf, quantizeI32(entity.y, 100))
		writeInt16(&buf, quantizeI16(entity.vx, 100))
		writeInt16(&buf, quantizeI16(entity.vy, 100))
		writeInt16(&buf, entity.rotation)
		writeUint16(&buf, entity.flags)
	}
	writeUint16(&buf, uint16(len(removed)))
	for _, id := range removed {
		writeUint32(&buf, id)
	}
	return buf.Bytes()
}

func binaryEntitiesFromSnapshot(players []PlayerEntityFrame, enemies []EnemyState, collectibles []CollectibleState) []binarySnapshotEntity {
	out := make([]binarySnapshotEntity, 0, len(players)+len(enemies)+len(collectibles))
	for _, player := range players {
		out = append(out, binarySnapshotEntity{
			id:         player.ID,
			entityType: binaryEntityPlayer,
			x:          player.X,
			y:          player.Y,
			vx:         player.VX,
			vy:         player.VY,
			rotation:   int16(player.Facing),
			flags:      playerFlags(player),
		})
	}
	for _, enemy := range enemies {
		out = append(out, binarySnapshotEntity{
			id:         enemy.ID,
			entityType: binaryEntityEnemyBase + enemyKindCode(enemy.Kind),
			x:          enemy.Position.X,
			y:          enemy.Position.Y,
			vx:         enemy.Velocity.X,
			vy:         enemy.Velocity.Y,
			rotation:   int16(enemy.Facing),
			flags:      packHealth(enemy.Health, enemy.MaxHealth),
		})
	}
	for _, collectible := range collectibles {
		out = append(out, binarySnapshotEntity{
			id:         collectible.ID,
			entityType: binaryEntityCollectible,
			x:          collectible.X,
			y:          collectible.Y,
			flags:      collectibleFlags(collectible),
		})
	}
	return out
}

func removedBinaryEntities(previous map[uint32]struct{}, entities []binarySnapshotEntity) ([]uint32, map[uint32]struct{}) {
	next := make(map[uint32]struct{}, len(entities))
	for _, entity := range entities {
		next[HashString(entity.id)] = struct{}{}
	}
	removed := make([]uint32, 0)
	for id := range previous {
		if _, ok := next[id]; !ok {
			removed = append(removed, id)
		}
	}
	return removed, next
}

func playerFlags(player PlayerEntityFrame) uint16 {
	flags := packHealth(player.Health, player.MaxHealth)
	if player.Grounded {
		flags |= binaryFlagGrounded
	}
	if player.Facing >= 0 {
		flags |= binaryFlagFacing
	}
	switch player.KickPhase {
	case "windup":
		flags |= binaryFlagWindup
	case "active":
		flags |= binaryFlagActive
	case "recovery":
		flags |= binaryFlagRecovery
	}
	return flags
}

func packHealth(health, maxHealth int) uint16 {
	return uint16(max(0, min(31, health))) | uint16(max(0, min(31, maxHealth)))<<5
}

func collectibleFlags(collectible CollectibleState) uint16 {
	if collectible.Type == "coin" {
		return 1
	}
	return 0
}

func enemyKindCode(kind string) uint8 {
	switch kind {
	case "skeleton":
		return 1
	case "skeletonArmored":
		return 2
	case "skeletonMage":
		return 3
	case "goblin":
		return 4
	case "goblinScout":
		return 5
	case "goblinChief":
		return 6
	case "iceBat":
		return 7
	case "iceGolem":
		return 8
	case "yeti":
		return 9
	case "windSpirit":
		return 10
	case "archer":
		return 11
	case "armoredBrute":
		return 12
	case "skullBat":
		return 13
	default:
		return 0
	}
}

func writeUint16(buf *bytes.Buffer, value uint16) {
	var tmp [2]byte
	binary.LittleEndian.PutUint16(tmp[:], value)
	buf.Write(tmp[:])
}

func writeInt16(buf *bytes.Buffer, value int16) {
	writeUint16(buf, uint16(value))
}

func writeUint32(buf *bytes.Buffer, value uint32) {
	var tmp [4]byte
	binary.LittleEndian.PutUint32(tmp[:], value)
	buf.Write(tmp[:])
}

func writeInt32(buf *bytes.Buffer, value int32) {
	writeUint32(buf, uint32(value))
}

func writeUint64(buf *bytes.Buffer, value uint64) {
	var tmp [8]byte
	binary.LittleEndian.PutUint64(tmp[:], value)
	buf.Write(tmp[:])
}

func quantizeI32(value float64, scale float64) int32 {
	return clampInt32(int64(math.Round(value * scale)))
}

func quantizeI16(value float64, scale float64) int16 {
	out := int64(math.Round(value * scale))
	if out < minInt16Value {
		return minInt16Value
	}
	if out > maxInt16Value {
		return maxInt16Value
	}
	return int16(out)
}

func clampInt32(value int64) int32 {
	if value < minInt32Value {
		return minInt32Value
	}
	if value > maxInt32Value {
		return maxInt32Value
	}
	return int32(value)
}
