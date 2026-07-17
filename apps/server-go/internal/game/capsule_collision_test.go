package game

import "testing"

func TestCapsuleHorizontalOverlapIgnoresSubRadiusCornerSliver(t *testing.T) {
	// Platform spans world x [80, 96); player hitbox (width 14) placed at
	// x=67 spans [67, 81) — only a 1px sliver overlaps the platform, less
	// than PlayerCollisionCornerRadius (3), so the rounded corner should
	// report no overlap.
	if PlayerCollisionCornerRadius <= 1 {
		t.Fatalf("test assumes a corner radius greater than the 1px overlap")
	}
	if capsuleHorizontalOverlap(67, 80, 96) {
		t.Fatalf("expected sub-radius corner sliver to not count as an overlap")
	}
}

func TestCapsuleHorizontalOverlapDetectsRealOverlap(t *testing.T) {
	// Player hitbox at x=76 spans [76, 90) against platform [80, 96) —
	// well beyond the corner radius, should be a genuine overlap.
	if !capsuleHorizontalOverlap(76, 80, 96) {
		t.Fatalf("expected a real overlap beyond the corner radius to be detected")
	}
}
