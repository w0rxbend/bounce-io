package game

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/coder/websocket"
)

type Client struct {
	conn           *websocket.Conn
	send           chan []byte
	snapshotSignal chan struct{}
	done           chan struct{}
	ctx            context.Context
	cancel         context.CancelFunc
	log            *slog.Logger

	mu              sync.RWMutex
	id              string
	token           string
	name            string
	room            *Room
	lastRTT         float64
	jitter          float64
	lastPacket      time.Time
	lastInput       int64
	lastAck         int64
	dropped         uint64
	msgIn           uint64
	bytesIn         uint64
	msgOut          uint64
	bytesOut        uint64
	writeLatencyAvg float64
	writeLatencyMax float64
	readLatencyAvg  float64
	readLatencyMax  float64
	jsonDecodeAvg   float64
	jsonDecodeMax   float64
	latestSnapshot  []byte
	snapshotPending bool
	closeOnce       sync.Once
	maxDrops        uint64
	serverStats     *ServerMetrics
}

func NewClient(conn *websocket.Conn, queueSize int, maxDrops uint64, stats *ServerMetrics, log *slog.Logger) *Client {
	ctx, cancel := context.WithCancel(context.Background())
	_ = ctx
	return &Client{
		conn:           conn,
		send:           make(chan []byte, queueSize),
		snapshotSignal: make(chan struct{}, 1),
		done:           make(chan struct{}),
		ctx:            ctx,
		cancel:         cancel,
		log:            log,
		lastPacket:     time.Now(),
		maxDrops:       maxDrops,
		serverStats:    stats,
	}
}

func (c *Client) SetSession(room *Room, id, token, name string) {
	c.mu.Lock()
	c.room = room
	c.id = id
	c.token = token
	c.name = name
	c.mu.Unlock()
}

func (c *Client) Session() (*Room, string, string) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.room, c.id, c.token
}

func (c *Client) Name() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.name
}

func (c *Client) RecordInput(seq int64, packetAgeMS float64) {
	c.mu.Lock()
	c.lastInput = seq
	c.lastPacket = time.Now().Add(-time.Duration(packetAgeMS * float64(time.Millisecond)))
	c.mu.Unlock()
}

func (c *Client) SetAck(seq int64) {
	c.mu.Lock()
	c.lastAck = seq
	c.mu.Unlock()
}

func (c *Client) RecordRTT(rtt time.Duration) {
	rttMS := float64(rtt.Microseconds()) / 1000
	c.mu.Lock()
	if c.lastRTT == 0 {
		c.lastRTT = rttMS
	} else {
		delta := rttMS - c.lastRTT
		if delta < 0 {
			delta = -delta
		}
		c.jitter = recordEMA(c.jitter, delta, 0.12)
		c.lastRTT = recordEMA(c.lastRTT, rttMS, 0.25)
	}
	c.mu.Unlock()
}

func (c *Client) Metrics() ClientMetrics {
	c.mu.RLock()
	defer c.mu.RUnlock()
	packetAge := float64(time.Since(c.lastPacket).Microseconds()) / 1000
	return ClientMetrics{
		MessagesReceived:  c.msgIn,
		BytesReceived:     c.bytesIn,
		MessagesSent:      c.msgOut,
		BytesSent:         c.bytesOut,
		DroppedOutbound:   c.dropped,
		WriteLatencyAvgMS: c.writeLatencyAvg,
		WriteLatencyMaxMS: c.writeLatencyMax,
		ReadLatencyAvgMS:  c.readLatencyAvg,
		ReadLatencyMaxMS:  c.readLatencyMax,
		JSONDecodeAvgMS:   c.jsonDecodeAvg,
		JSONDecodeMaxMS:   c.jsonDecodeMax,
		RTTMS:             c.lastRTT,
		JitterMS:          c.jitter,
		LastPacketAgeMS:   packetAge,
		QueueDepth:        len(c.send) + boolInt(c.snapshotPending),
		LastInputSeq:      c.lastInput,
		LastAckInputSeq:   c.lastAck,
	}
}

func (c *Client) EnqueueJSON(payload any) bool {
	encoded, err := json.Marshal(payload)
	if err != nil {
		c.log.Error("marshal outbound message", "error", err)
		return false
	}
	return c.EnqueueEncoded(encoded)
}

func (c *Client) EnqueueEncoded(encoded []byte) bool {
	select {
	case c.send <- encoded:
		return true
	default:
		c.mu.Lock()
		c.dropped++
		dropped := c.dropped
		c.mu.Unlock()
		c.serverStats.DroppedOutbound.Add(1)
		if dropped >= c.maxDrops {
			c.serverStats.BackpressureDisconnect.Add(1)
			c.Close(websocket.StatusPolicyViolation, "outbound queue overflow")
		}
		return false
	}
}

func (c *Client) EnqueueSnapshotEncoded(encoded []byte) bool {
	c.mu.Lock()
	overwrotePending := c.snapshotPending
	c.latestSnapshot = encoded
	c.snapshotPending = true
	if overwrotePending {
		c.dropped++
	}
	dropped := c.dropped
	c.mu.Unlock()

	if overwrotePending {
		c.serverStats.DroppedOutbound.Add(1)
		if dropped >= c.maxDrops {
			c.serverStats.BackpressureDisconnect.Add(1)
			c.Close(websocket.StatusPolicyViolation, "outbound snapshot overflow")
			return false
		}
	}

	select {
	case c.snapshotSignal <- struct{}{}:
	default:
	}
	return true
}

func (c *Client) takeLatestSnapshot() []byte {
	c.mu.Lock()
	defer c.mu.Unlock()
	msg := c.latestSnapshot
	c.latestSnapshot = nil
	c.snapshotPending = false
	return msg
}

func (c *Client) WriteLoop(ctx context.Context) {
	defer close(c.done)
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	go func() {
		select {
		case <-c.ctx.Done():
			cancel()
		case <-ctx.Done():
		}
	}()
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-c.send:
			if !c.writeMessage(ctx, msg) {
				return
			}
		case <-c.snapshotSignal:
			if !c.writePendingReliable(ctx) {
				return
			}
			msg := c.takeLatestSnapshot()
			if len(msg) == 0 {
				continue
			}
			if !c.writeMessage(ctx, msg) {
				return
			}
		}
	}
}

func (c *Client) writePendingReliable(ctx context.Context) bool {
	for {
		select {
		case msg := <-c.send:
			if !c.writeMessage(ctx, msg) {
				return false
			}
		default:
			return true
		}
	}
}

func (c *Client) writeMessage(ctx context.Context, msg []byte) bool {
	writeCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	start := time.Now()
	err := c.conn.Write(writeCtx, websocket.MessageText, msg)
	latency := time.Since(start)
	cancel()
	if err != nil {
		if !errors.Is(err, context.Canceled) {
			c.log.Debug("websocket write failed", "error", err)
		}
		c.Close(websocket.StatusGoingAway, "write failed")
		return false
	}
	latencyMS := float64(latency.Microseconds()) / 1000
	c.mu.Lock()
	c.msgOut++
	c.bytesOut += uint64(len(msg))
	c.writeLatencyAvg = recordEMA(c.writeLatencyAvg, latencyMS, 0.12)
	if latencyMS > c.writeLatencyMax {
		c.writeLatencyMax = latencyMS
	}
	c.mu.Unlock()
	c.serverStats.MessagesSent.Add(1)
	c.serverStats.BytesSent.Add(uint64(len(msg)))
	return true
}

func (c *Client) Close(code websocket.StatusCode, reason string) {
	c.closeOnce.Do(func() {
		c.cancel()
		_ = c.conn.Close(code, reason)
	})
}

func (c *Client) RecordInbound(bytes int) {
	c.mu.Lock()
	c.msgIn++
	c.bytesIn += uint64(bytes)
	c.lastPacket = time.Now()
	c.mu.Unlock()
	c.serverStats.MessagesReceived.Add(1)
	c.serverStats.BytesReceived.Add(uint64(bytes))
}

func (c *Client) RecordReadLatency(duration time.Duration) {
	ms := float64(duration.Microseconds()) / 1000
	c.mu.Lock()
	c.readLatencyAvg = recordEMA(c.readLatencyAvg, ms, 0.12)
	if ms > c.readLatencyMax {
		c.readLatencyMax = ms
	}
	c.mu.Unlock()
}

func (c *Client) RecordJSONDecode(duration time.Duration) {
	ms := float64(duration.Microseconds()) / 1000
	c.mu.Lock()
	c.jsonDecodeAvg = recordEMA(c.jsonDecodeAvg, ms, 0.12)
	if ms > c.jsonDecodeMax {
		c.jsonDecodeMax = ms
	}
	c.mu.Unlock()
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
