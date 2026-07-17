package game

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"time"
	"unicode"
)

func unixMillis(t time.Time) int64 {
	return t.UnixNano() / int64(time.Millisecond)
}

func nowMillis() int64 {
	return unixMillis(time.Now())
}

func newID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return hex.EncodeToString([]byte(time.Now().Format(time.RFC3339Nano)))
	}
	return hex.EncodeToString(b[:])
}

func sanitizeName(value string) string {
	value = strings.TrimSpace(value)
	var out []rune
	for _, r := range value {
		if len(out) >= 16 {
			break
		}
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' || r == '-' || r == ' ' {
			out = append(out, r)
		}
	}
	if len(out) == 0 {
		return "Explorer"
	}
	return string(out)
}

// sanitizeSkinID validates the client-supplied cosmetics string before it's
// stored and rebroadcast. The server treats it as an opaque identifier (the
// client encodes/decodes the per-body-part swatch selection — see
// apps/client/src/cosmetics.ts); '.' is allowed since that's the field
// separator used by that encoding.
func sanitizeSkinID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "default"
	}
	for _, r := range value {
		if !(unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' || r == '-' || r == '.') {
			return "default"
		}
	}
	if len(value) > 48 {
		return "default"
	}
	return value
}

// sanitizeChatText allows general printable text (letters, punctuation,
// emoji, spaces) unlike sanitizeName/sanitizeSkinID's restrictive charsets,
// but strips control characters and caps length so a malicious client can't
// broadcast an oversized or terminal-control-laden payload to the room.
func sanitizeChatText(value string) string {
	value = strings.TrimSpace(value)
	out := make([]rune, 0, len(value))
	for _, r := range value {
		if len(out) >= 240 {
			break
		}
		if r == '\n' || r == '\t' {
			out = append(out, ' ')
			continue
		}
		if unicode.IsControl(r) {
			continue
		}
		out = append(out, r)
	}
	return strings.TrimSpace(string(out))
}
