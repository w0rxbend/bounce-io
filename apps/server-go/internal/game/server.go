package game

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/pprof"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/coder/websocket"
)

type ServerConfig struct {
	Host              string
	Port              int
	TickRate          int
	SnapshotRate      int
	MaxPlayers        int
	MaxMessageBytes   int64
	OutboundQueueSize int
	MaxOutboundDrops  uint64
}

type Server struct {
	cfg     ServerConfig
	log     *slog.Logger
	stats   *ServerMetrics
	mu      sync.Mutex
	rooms   map[string]*Room
	started time.Time
}

type RoomSnapshot struct {
	ID            string           `json:"id"`
	Phase         string           `json:"phase"`
	Tick          uint64           `json:"tick"`
	SnapshotSeq   uint64           `json:"snapshotSeq"`
	ActiveClients int              `json:"activeClients"`
	Players       int              `json:"players"`
	Seed          uint32           `json:"seed"`
	Metrics       RoomMetrics      `json:"metrics"`
	Clients       []ClientSnapshot `json:"clients"`
}

type ClientSnapshot struct {
	PlayerID         string        `json:"playerId"`
	Name             string        `json:"name"`
	Connected        bool          `json:"connected"`
	QueuedInputs     int           `json:"queuedInputs"`
	LastReceivedSeq  int64         `json:"lastReceivedSeq"`
	LastProcessedSeq int64         `json:"lastProcessedSeq"`
	Metrics          ClientMetrics `json:"metrics"`
}

func NewServer(cfg ServerConfig, log *slog.Logger) *Server {
	if cfg.TickRate <= 0 {
		cfg.TickRate = DefaultTickRate
	}
	if cfg.SnapshotRate <= 0 {
		cfg.SnapshotRate = DefaultSnapshotRate
	}
	if cfg.MaxPlayers <= 0 {
		cfg.MaxPlayers = DefaultMaxPlayers
	}
	if cfg.MaxMessageBytes <= 0 {
		cfg.MaxMessageBytes = 2048
	}
	if cfg.OutboundQueueSize <= 0 {
		cfg.OutboundQueueSize = DefaultOutboundQueue
	}
	if cfg.MaxOutboundDrops == 0 {
		cfg.MaxOutboundDrops = 64
	}
	return &Server{
		cfg:     cfg,
		log:     log,
		stats:   NewServerMetrics(),
		rooms:   map[string]*Room{},
		started: time.Now(),
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/debug/world", s.handleWorldDebug)
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
	mux.HandleFunc("/metrics", s.handleMetrics)
	mux.HandleFunc("/metrics/prometheus", s.handlePrometheusMetrics)
	return mux
}

func (s *Server) Addr() string {
	host := s.cfg.Host
	if host == "" {
		host = "0.0.0.0"
	}
	port := s.cfg.Port
	if port == 0 {
		port = 8787
	}
	return host + ":" + strconv.Itoa(port)
}

func (s *Server) Shutdown() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, room := range s.rooms {
		room.Stop()
	}
}

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{
		"name":      "Bounce IO Go authoritative server",
		"version":   GameVersion,
		"protocol":  ProtocolVersion,
		"rooms":     len(s.rooms),
		"websocket": "/ws?room=demo&name=Explorer",
		"transport": "coder/websocket",
	})
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.metricsSnapshot())
}

func (s *Server) handleWorldDebug(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("room")
	if roomID == "" {
		roomID = "demo"
	}
	chunkY := parseIntQuery(r, "chunk", 0)
	minChunkY := parseIntQuery(r, "minChunk", chunkY)
	maxChunkY := parseIntQuery(r, "maxChunk", chunkY)
	if r.URL.Query().Has("radius") {
		radius := parseIntQuery(r, "radius", 0)
		minChunkY = chunkY - radius
		maxChunkY = chunkY + radius
	}
	if maxChunkY < minChunkY {
		minChunkY, maxChunkY = maxChunkY, minChunkY
	}
	if minChunkY < 0 {
		minChunkY = 0
	}
	if maxChunkY < 0 {
		maxChunkY = 0
	}
	if maxChunkY-minChunkY > 24 {
		http.Error(w, `{"type":"error","code":"DEBUG_RANGE_TOO_LARGE","message":"debug world range is limited to 25 chunks"}`, http.StatusBadRequest)
		return
	}
	seed := HashString(roomID)
	s.mu.Lock()
	if room := s.rooms[roomID]; room != nil {
		seed = room.seed
	}
	s.mu.Unlock()
	writeJSON(w, BuildWorldDebugDump(roomID, seed, minChunkY, maxChunkY))
}

func parseIntQuery(r *http.Request, key string, fallback int) int {
	value := r.URL.Query().Get(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func (s *Server) handlePrometheusMetrics(w http.ResponseWriter, r *http.Request) {
	snap := s.metricsSnapshot()
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	_, _ = w.Write([]byte("# HELP skybound_messages_received_total WebSocket messages received.\n"))
	_, _ = w.Write([]byte("# TYPE skybound_messages_received_total counter\n"))
	_, _ = w.Write([]byte("skybound_messages_received_total " + strconv.FormatUint(snap.WebSocket.MessagesReceived, 10) + "\n"))
	_, _ = w.Write([]byte("# HELP skybound_messages_sent_total WebSocket messages sent.\n"))
	_, _ = w.Write([]byte("# TYPE skybound_messages_sent_total counter\n"))
	_, _ = w.Write([]byte("skybound_messages_sent_total " + strconv.FormatUint(snap.WebSocket.MessagesSent, 10) + "\n"))
	_, _ = w.Write([]byte("# HELP skybound_dropped_outbound_total Dropped outbound messages.\n"))
	_, _ = w.Write([]byte("# TYPE skybound_dropped_outbound_total counter\n"))
	_, _ = w.Write([]byte("skybound_dropped_outbound_total " + strconv.FormatUint(snap.WebSocket.DroppedOutbound, 10) + "\n"))
	for _, room := range snap.Rooms {
		labels := `{room="` + room.ID + `"}`
		_, _ = w.Write([]byte("skybound_room_tick" + labels + " " + strconv.FormatUint(room.Tick, 10) + "\n"))
		_, _ = w.Write([]byte("skybound_room_tick_duration_avg_ms" + labels + " " + strconv.FormatFloat(room.Metrics.TickDurationAvgMS, 'f', 3, 64) + "\n"))
		_, _ = w.Write([]byte("skybound_room_tick_overruns_total" + labels + " " + strconv.FormatUint(room.Metrics.TickOverruns, 10) + "\n"))
		_, _ = w.Write([]byte("skybound_room_outbound_drops_total" + labels + " " + strconv.FormatUint(room.Metrics.DroppedOutbound, 10) + "\n"))
	}
}

type MetricsSnapshot struct {
	UptimeSeconds int64          `json:"uptimeSeconds"`
	Process       ProcessMetrics `json:"process"`
	WebSocket     struct {
		ActiveConnections      int64   `json:"activeConnections"`
		MessagesReceived       uint64  `json:"messagesReceived"`
		MessagesSent           uint64  `json:"messagesSent"`
		BytesReceived          uint64  `json:"bytesReceived"`
		BytesSent              uint64  `json:"bytesSent"`
		MessagesReceivedPerSec float64 `json:"messagesReceivedPerSecond"`
		MessagesSentPerSec     float64 `json:"messagesSentPerSecond"`
		BytesReceivedPerSec    float64 `json:"bytesReceivedPerSecond"`
		BytesSentPerSec        float64 `json:"bytesSentPerSecond"`
		DroppedOutbound        uint64  `json:"droppedOutboundMessages"`
		BackpressureDisconnect uint64  `json:"backpressureDisconnects"`
	} `json:"websocket"`
	Rooms []RoomSnapshot `json:"rooms"`
}

func (s *Server) metricsSnapshot() MetricsSnapshot {
	uptime := time.Since(s.stats.StartedAt).Seconds()
	if uptime < 1 {
		uptime = 1
	}
	out := MetricsSnapshot{
		UptimeSeconds: int64(uptime),
		Process:       BuildProcessMetrics(s.stats.StartedAt),
	}
	out.WebSocket.ActiveConnections = s.stats.ActiveConnections.Load()
	out.WebSocket.MessagesReceived = s.stats.MessagesReceived.Load()
	out.WebSocket.MessagesSent = s.stats.MessagesSent.Load()
	out.WebSocket.BytesReceived = s.stats.BytesReceived.Load()
	out.WebSocket.BytesSent = s.stats.BytesSent.Load()
	out.WebSocket.DroppedOutbound = s.stats.DroppedOutbound.Load()
	out.WebSocket.BackpressureDisconnect = s.stats.BackpressureDisconnect.Load()
	out.WebSocket.MessagesReceivedPerSec = float64(out.WebSocket.MessagesReceived) / uptime
	out.WebSocket.MessagesSentPerSec = float64(out.WebSocket.MessagesSent) / uptime
	out.WebSocket.BytesReceivedPerSec = float64(out.WebSocket.BytesReceived) / uptime
	out.WebSocket.BytesSentPerSec = float64(out.WebSocket.BytesSent) / uptime

	s.mu.Lock()
	rooms := make([]*Room, 0, len(s.rooms))
	for _, room := range s.rooms {
		rooms = append(rooms, room)
	}
	s.mu.Unlock()
	sort.Slice(rooms, func(i, j int) bool { return rooms[i].cfg.ID < rooms[j].cfg.ID })
	for _, room := range rooms {
		if snap, ok := room.Snapshot(150 * time.Millisecond); ok {
			out.Rooms = append(out.Rooms, snap)
		}
	}
	return out
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"},
	})
	if err != nil {
		s.log.Debug("websocket accept failed", "error", err)
		return
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	ctx := r.Context()
	client := NewClient(conn, s.cfg.OutboundQueueSize, s.cfg.MaxOutboundDrops, s.stats, s.log)
	s.stats.ActiveConnections.Add(1)
	defer s.stats.ActiveConnections.Add(-1)
	go client.WriteLoop(ctx)
	s.readLoop(ctx, client, conn, r)
	<-client.done
}

func (s *Server) readLoop(ctx context.Context, client *Client, conn *websocket.Conn, r *http.Request) {
	closeReason := "client disconnected"
	defer func() {
		if room, playerID, _ := client.Session(); room != nil && playerID != "" {
			room.Leave(playerID, closeReason)
		}
		client.Close(websocket.StatusNormalClosure, closeReason)
	}()

	for {
		readStart := time.Now()
		msgType, data, err := conn.Read(ctx)
		client.RecordReadLatency(time.Since(readStart))
		if err != nil {
			if !errors.Is(err, context.Canceled) {
				s.log.Debug("websocket read closed", "error", err)
			}
			return
		}
		if msgType != websocket.MessageText {
			_ = client.EnqueueJSON(ErrorMessage{Type: "error", Code: "BINARY_UNSUPPORTED", Message: "send JSON text messages"})
			continue
		}
		if int64(len(data)) > s.cfg.MaxMessageBytes {
			_ = client.EnqueueJSON(ErrorMessage{Type: "error", Code: "TOO_LARGE", Message: "message too large"})
			continue
		}
		client.RecordInbound(len(data))

		var env MessageEnvelope
		decodeStart := time.Now()
		if err := json.Unmarshal(data, &env); err != nil {
			client.RecordJSONDecode(time.Since(decodeStart))
			s.logParseError(client, r, "PARSE_ERROR", err)
			_ = client.EnqueueJSON(ErrorMessage{Type: "error", Code: "PARSE_ERROR", Message: "invalid JSON"})
			continue
		}
		client.RecordJSONDecode(time.Since(decodeStart))
		s.logInbound(client, r, env.Type)
		switch env.Type {
		case "hello", "join":
			s.handleJoin(ctx, client, data, r)
		case "input":
			s.handleInput(client, data)
		case "requestChunk":
			s.handleRequestChunk(client, data)
		case "ping":
			var ping ClientPing
			if json.Unmarshal(data, &ping) == nil {
				client.RecordRTT(time.Since(time.UnixMilli(ping.ClientTime)))
				_ = client.EnqueueJSON(PongMessage{Type: "pong", ClientTime: ping.ClientTime, ServerTime: nowMillis()})
			} else {
				s.logParseError(client, r, "PARSE_ERROR", errors.New("invalid ping"))
			}
		case "leave":
			if room, playerID, _ := client.Session(); room != nil && playerID != "" {
				closeReason = "client left"
				room.Leave(playerID, closeReason)
			}
			return
		default:
			s.log.Warn("unsupported websocket message", s.logAttrs(client, r, env.Type)...)
			_ = client.EnqueueJSON(ErrorMessage{Type: "error", Code: "UNKNOWN_TYPE", Message: "unknown or malformed message"})
		}
	}
}

func (s *Server) handleJoin(ctx context.Context, client *Client, data []byte, r *http.Request) {
	if room, _, _ := client.Session(); room != nil {
		_ = client.EnqueueJSON(ErrorMessage{Type: "error", Code: "ALREADY_JOINED", Message: "session already joined"})
		return
	}
	var join ClientJoin
	if err := json.Unmarshal(data, &join); err != nil {
		s.logParseError(client, r, "PARSE_ERROR", err)
		_ = client.EnqueueJSON(ErrorMessage{Type: "error", Code: "PARSE_ERROR", Message: "invalid join"})
		return
	}
	if join.Protocol != ProtocolVersion || join.Version != GameVersion {
		_ = client.EnqueueJSON(ErrorMessage{Type: "error", Code: "VERSION_MISMATCH", Message: "unsupported protocol or game version"})
		return
	}
	roomID := r.URL.Query().Get("room")
	if roomID == "" {
		roomID = DefaultRoomID
	}
	room := s.getOrCreateRoom(roomID)
	result := room.Join(ctx.Done(), client, join.Name, join.Token, join.SkinID)
	if result.err != "" {
		_ = client.EnqueueJSON(ErrorMessage{Type: "error", Code: result.err, Message: "join failed"})
		if result.err == "ROOM_FULL" || result.err == "ALREADY_CONNECTED" {
			client.Close(websocket.StatusPolicyViolation, result.err)
		}
	}
}

func (s *Server) handleInput(client *Client, data []byte) {
	room, playerID, _ := client.Session()
	if room == nil || playerID == "" {
		_ = client.EnqueueJSON(ErrorMessage{Type: "error", Code: "NOT_JOINED", Message: "send join first"})
		return
	}
	var msg ClientInput
	if err := json.Unmarshal(data, &msg); err != nil {
		s.logParseError(client, nil, "PARSE_ERROR", err)
		_ = client.EnqueueJSON(ErrorMessage{Type: "error", Code: "PARSE_ERROR", Message: "invalid input"})
		return
	}
	if msg.PlayerID != "" && msg.PlayerID != playerID {
		return
	}
	input := NormalizeInput(msg)
	if input.Sequence < 0 {
		return
	}
	ageMS := 0.0
	if input.ClientTime > 0 {
		ageMS = float64(nowMillis() - input.ClientTime)
	}
	room.Input(playerID, input, ageMS, client)
}

func (s *Server) handleRequestChunk(client *Client, data []byte) {
	room, playerID, _ := client.Session()
	if room == nil || playerID == "" {
		return
	}
	var msg ClientRequestChunk
	if err := json.Unmarshal(data, &msg); err == nil {
		room.RequestChunk(playerID, msg.ChunkY)
	} else {
		s.logParseError(client, nil, "PARSE_ERROR", err)
	}
}

func (s *Server) getOrCreateRoom(id string) *Room {
	s.mu.Lock()
	defer s.mu.Unlock()
	if room, ok := s.rooms[id]; ok {
		return room
	}
	room := NewRoom(RoomConfig{
		ID:           id,
		TickRate:     s.cfg.TickRate,
		SnapshotRate: s.cfg.SnapshotRate,
		MaxPlayers:   s.cfg.MaxPlayers,
	}, s.stats, s.log)
	s.rooms[id] = room
	return room
}

func writeJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(payload)
}

func (s *Server) logInbound(client *Client, r *http.Request, msgType string) {
	s.log.Debug("websocket message received", s.logAttrs(client, r, msgType)...)
}

func (s *Server) logParseError(client *Client, r *http.Request, code string, err error) {
	attrs := s.logAttrs(client, r, "")
	attrs = append(attrs, "code", code, "error", err)
	s.log.Warn("websocket message parse failed", attrs...)
}

func (s *Server) logAttrs(client *Client, r *http.Request, msgType string) []any {
	room, playerID, _ := client.Session()
	roomID := ""
	if room != nil {
		roomID = room.cfg.ID
	} else if r != nil {
		roomID = r.URL.Query().Get("room")
	}
	return []any{
		"type", msgType,
		"playerId", playerID,
		"roomId", roomID,
	}
}
