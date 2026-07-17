package game

import "testing"

func TestSanitizeSkinIDAllowsEncodedCosmeticsString(t *testing.T) {
	// Matches the dot-joined encoding in apps/client/src/cosmetics.ts
	// (encodeCosmetics): four swatch ids joined by '.'.
	encoded := "amber.crimson.amber.slate"
	if got := sanitizeSkinID(encoded); got != encoded {
		t.Fatalf("expected encoded cosmetics string to pass through unchanged, got %q", got)
	}
}

func TestSanitizeSkinIDRejectsDisallowedCharacters(t *testing.T) {
	if got := sanitizeSkinID("amber;DROP TABLE"); got != "default" {
		t.Fatalf("expected disallowed characters to fall back to default, got %q", got)
	}
}

func TestSanitizeSkinIDRejectsOverlongValues(t *testing.T) {
	long := ""
	for i := 0; i < 60; i++ {
		long += "a"
	}
	if got := sanitizeSkinID(long); got != "default" {
		t.Fatalf("expected overlong value to fall back to default, got %q", got)
	}
}

func TestSanitizeSkinIDFallsBackOnEmpty(t *testing.T) {
	if got := sanitizeSkinID("   "); got != "default" {
		t.Fatalf("expected blank value to fall back to default, got %q", got)
	}
}
