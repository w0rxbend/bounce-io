package game

import "testing"

func TestBinaryEnemyFlagsCarryAttackPhase(t *testing.T) {
	enemies := []EnemyState{
		{
			ID:        "enemy:windup",
			Kind:      "skeleton",
			Health:    2,
			MaxHealth: 3,
			Facing:    1,
			Behavior:  "windup",
		},
		{
			ID:        "enemy:attack",
			Kind:      "goblin",
			Health:    3,
			MaxHealth: 3,
			Facing:    -1,
			Behavior:  "attack",
		},
		{
			ID:        "enemy:recover",
			Kind:      "iceBat",
			Health:    1,
			MaxHealth: 2,
			Facing:    1,
			Behavior:  "recover",
		},
	}

	entities := binaryEntitiesFromSnapshot(nil, enemies, nil)
	if len(entities) != len(enemies) {
		t.Fatalf("expected %d enemy entities, got %d", len(enemies), len(entities))
	}
	if entities[0].flags&binaryFlagWindup == 0 {
		t.Fatalf("windup enemy should carry windup flag: %#016b", entities[0].flags)
	}
	if entities[1].flags&binaryFlagActive == 0 {
		t.Fatalf("attacking enemy should carry active flag: %#016b", entities[1].flags)
	}
	if entities[1].flags&binaryFlagFacing != 0 {
		t.Fatalf("left-facing enemy should not carry facing flag: %#016b", entities[1].flags)
	}
	if entities[2].flags&binaryFlagRecovery == 0 {
		t.Fatalf("recovering enemy should carry recovery flag: %#016b", entities[2].flags)
	}
}
