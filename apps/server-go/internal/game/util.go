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
