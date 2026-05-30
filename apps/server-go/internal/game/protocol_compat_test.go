package game

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestPixiClientProtocolCompatibility(t *testing.T) {
	server := NewServer(ServerConfig{TickRate: 60, SnapshotRate: 20}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	httpServer := httptest.NewServer(server.Routes())
	defer httpServer.Close()
	defer server.Shutdown()

	wsURL := "ws" + strings.TrimPrefix(httpServer.URL, "http") + "/ws?room=compat"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	writeJSONFrame(t, ctx, conn, map[string]any{
		"type":     "hello",
		"protocol": ProtocolVersion,
		"version":  GameVersion,
		"name":     "Compat",
	})

	welcome := readMessageType(t, ctx, conn, "welcome")
	playerID, ok := welcome["playerId"].(string)
	if !ok || playerID == "" {
		t.Fatalf("welcome missing playerId: %#v", welcome)
	}
	if _, ok := welcome["sessionToken"].(string); !ok {
		t.Fatalf("welcome missing sessionToken: %#v", welcome)
	}
	if _, ok := welcome["seed"].(float64); !ok {
		t.Fatalf("welcome missing numeric seed: %#v", welcome)
	}

	chunk := readMessageType(t, ctx, conn, "chunk")
	assertChunkShape(t, chunk)

	writeJSONFrame(t, ctx, conn, map[string]any{"type": "requestChunk", "chunkY": 1})
	chunkOne := readMessageType(t, ctx, conn, "chunk")
	assertChunkShape(t, chunkOne)
	chunkPayload := chunkOne["chunk"].(map[string]any)
	if enemies, ok := chunkPayload["enemies"].([]any); !ok || len(enemies) == 0 {
		t.Fatalf("chunk 1 should include compatible enemy spawns: %#v", chunkPayload["enemies"])
	}

	writeJSONFrame(t, ctx, conn, map[string]any{
		"type":     "input",
		"playerId": playerID,
		"input": map[string]any{
			"left":        false,
			"right":       true,
			"jumpPressed": false,
			"jumpHeld":    false,
			"drop":        false,
			"kick":        false,
			"sequence":    0,
		},
	})
	snapshot := readMessageType(t, ctx, conn, "snapshot")
	assertSnapshotShape(t, snapshot, playerID)

	now := time.Now().UnixMilli()
	writeJSONFrame(t, ctx, conn, map[string]any{"type": "ping", "clientTime": now})
	pong := readMessageType(t, ctx, conn, "pong")
	if int64(pong["clientTime"].(float64)) != now {
		t.Fatalf("pong did not echo clientTime: %#v", pong)
	}

	writeJSONFrame(t, ctx, conn, map[string]any{"type": "unsupportedForCompatTest"})
	errMsg := readMessageType(t, ctx, conn, "error")
	if errMsg["code"] != "UNKNOWN_TYPE" {
		t.Fatalf("expected UNKNOWN_TYPE error, got %#v", errMsg)
	}
}

func TestPixiClientRoomMembershipCompatibility(t *testing.T) {
	server := NewServer(ServerConfig{TickRate: 60, SnapshotRate: 20}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	httpServer := httptest.NewServer(server.Routes())
	defer httpServer.Close()
	defer server.Shutdown()

	wsURL := "ws" + strings.TrimPrefix(httpServer.URL, "http") + "/ws?room=membership"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	first := dialCompatClient(t, ctx, wsURL, "One", "")
	defer first.conn.Close(websocket.StatusNormalClosure, "")
	second := dialCompatClient(t, ctx, wsURL, "Two", "")

	joined := readMessageType(t, ctx, first.conn, "playerJoined")
	if joined["name"] != "Two" {
		t.Fatalf("expected first client to see second join, got %#v", joined)
	}

	second.conn.Close(websocket.StatusNormalClosure, "")
	left := readMessageType(t, ctx, first.conn, "playerLeft")
	if left["playerId"] != second.playerID {
		t.Fatalf("expected playerLeft for second player %s, got %#v", second.playerID, left)
	}
}

func TestPixiClientReconnectCompatibility(t *testing.T) {
	server := NewServer(ServerConfig{TickRate: 60, SnapshotRate: 20}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	httpServer := httptest.NewServer(server.Routes())
	defer httpServer.Close()
	defer server.Shutdown()

	wsURL := "ws" + strings.TrimPrefix(httpServer.URL, "http") + "/ws?room=reconnect"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	first := dialCompatClient(t, ctx, wsURL, "One", "")
	first.conn.Close(websocket.StatusNormalClosure, "")

	reconnected := dialRaw(t, ctx, wsURL)
	defer reconnected.Close(websocket.StatusNormalClosure, "")
	writeJSONFrame(t, ctx, reconnected, map[string]any{
		"type":     "hello",
		"protocol": ProtocolVersion,
		"version":  GameVersion,
		"name":     "One",
		"token":    first.token,
	})
	resumed := readMessageType(t, ctx, reconnected, "resumed")
	if resumed["playerId"] != first.playerID {
		t.Fatalf("expected resumed player %s, got %#v", first.playerID, resumed)
	}
	if _, ok := resumed["playerState"].(map[string]any); !ok {
		t.Fatalf("resumed missing playerState: %#v", resumed)
	}
}

func TestMalformedMessageCompatibility(t *testing.T) {
	server := NewServer(ServerConfig{TickRate: 60, SnapshotRate: 20}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	httpServer := httptest.NewServer(server.Routes())
	defer httpServer.Close()
	defer server.Shutdown()

	wsURL := "ws" + strings.TrimPrefix(httpServer.URL, "http") + "/ws?room=malformed"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn := dialRaw(t, ctx, wsURL)
	defer conn.Close(websocket.StatusNormalClosure, "")

	if err := conn.Write(ctx, websocket.MessageText, []byte("{")); err != nil {
		t.Fatalf("write malformed json: %v", err)
	}
	errMsg := readMessageType(t, ctx, conn, "error")
	if errMsg["code"] != "PARSE_ERROR" {
		t.Fatalf("expected PARSE_ERROR, got %#v", errMsg)
	}
}

type compatClient struct {
	conn     *websocket.Conn
	playerID string
	token    string
}

func dialCompatClient(t *testing.T, ctx context.Context, wsURL string, name string, token string) compatClient {
	t.Helper()
	conn := dialRaw(t, ctx, wsURL)
	writeJSONFrame(t, ctx, conn, map[string]any{
		"type":     "hello",
		"protocol": ProtocolVersion,
		"version":  GameVersion,
		"name":     name,
		"token":    token,
	})
	welcome := readMessageType(t, ctx, conn, "welcome")
	playerID, _ := welcome["playerId"].(string)
	sessionToken, _ := welcome["sessionToken"].(string)
	if playerID == "" || sessionToken == "" {
		t.Fatalf("invalid welcome: %#v", welcome)
	}
	return compatClient{conn: conn, playerID: playerID, token: sessionToken}
}

func dialRaw(t *testing.T, ctx context.Context, wsURL string) *websocket.Conn {
	t.Helper()
	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	return conn
}

func writeJSONFrame(t *testing.T, ctx context.Context, conn *websocket.Conn, payload any) {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := conn.Write(ctx, websocket.MessageText, raw); err != nil {
		t.Fatalf("write: %v", err)
	}
}

func readMessageType(t *testing.T, ctx context.Context, conn *websocket.Conn, typ string) map[string]any {
	t.Helper()
	for {
		_, raw, err := conn.Read(ctx)
		if err != nil {
			t.Fatalf("read %q: %v", typ, err)
		}
		var msg map[string]any
		if err := json.Unmarshal(raw, &msg); err != nil {
			t.Fatalf("unmarshal %q: %v", typ, err)
		}
		if msg["type"] == typ {
			return msg
		}
	}
}

func assertChunkShape(t *testing.T, msg map[string]any) {
	t.Helper()
	chunk, ok := msg["chunk"].(map[string]any)
	if !ok {
		t.Fatalf("chunk message missing chunk object: %#v", msg)
	}
	requiredArrays := []string{"tiles", "platforms", "relics", "enemies", "jumpPads", "windZones", "landmarks", "routes"}
	for _, key := range requiredArrays {
		if _, ok := chunk[key].([]any); !ok {
			t.Fatalf("chunk.%s must be an array: %#v", key, chunk[key])
		}
	}
	if _, ok := chunk["regionId"].(string); !ok {
		t.Fatalf("chunk.regionId missing: %#v", chunk)
	}
	if _, ok := chunk["regionName"].(string); !ok {
		t.Fatalf("chunk.regionName missing: %#v", chunk)
	}
	if _, ok := chunk["checkpoint"].(bool); !ok {
		t.Fatalf("chunk.checkpoint missing: %#v", chunk)
	}
	if _, ok := chunk["entry"].(map[string]any); !ok {
		t.Fatalf("chunk.entry missing: %#v", chunk)
	}
	if _, ok := chunk["exit"].(map[string]any); !ok {
		t.Fatalf("chunk.exit missing: %#v", chunk)
	}
}

func assertSnapshotShape(t *testing.T, msg map[string]any, playerID string) {
	t.Helper()
	if _, ok := msg["tick"].(float64); !ok {
		t.Fatalf("snapshot.tick must be numeric: %#v", msg)
	}
	if _, ok := msg["snapshotSeq"].(float64); !ok {
		t.Fatalf("snapshot.snapshotSeq must be numeric: %#v", msg)
	}
	if _, ok := msg["players"].([]any); !ok {
		t.Fatalf("snapshot.players must be array: %#v", msg)
	}
	if _, ok := msg["enemies"].([]any); !ok {
		t.Fatalf("snapshot.enemies must be array: %#v", msg)
	}
	if _, ok := msg["collectedRelics"].([]any); !ok {
		t.Fatalf("snapshot.collectedRelics must be array: %#v", msg)
	}
	if _, ok := msg["events"].([]any); !ok {
		t.Fatalf("snapshot.events must be array: %#v", msg)
	}
	lastProcessed, ok := msg["lastProcessedSeq"].(map[string]any)
	if !ok {
		t.Fatalf("snapshot.lastProcessedSeq must be object: %#v", msg)
	}
	if _, ok := lastProcessed[playerID].(float64); !ok {
		t.Fatalf("snapshot.lastProcessedSeq missing local player %s: %#v", playerID, lastProcessed)
	}
}
