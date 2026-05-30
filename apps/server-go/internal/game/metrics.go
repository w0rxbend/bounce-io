package game

import (
	"runtime"
	"sync/atomic"
	"time"
)

type ServerMetrics struct {
	StartedAt              time.Time
	ActiveConnections      atomic.Int64
	MessagesReceived       atomic.Uint64
	BytesReceived          atomic.Uint64
	MessagesSent           atomic.Uint64
	BytesSent              atomic.Uint64
	DroppedOutbound        atomic.Uint64
	BackpressureDisconnect atomic.Uint64
}

func NewServerMetrics() *ServerMetrics {
	return &ServerMetrics{StartedAt: time.Now()}
}

type RoomMetrics struct {
	Ticks                  uint64  `json:"ticks"`
	TickDurationAvgMS      float64 `json:"tickDurationAvgMs"`
	TickDurationMaxMS      float64 `json:"tickDurationMaxMs"`
	TickIntervalAvgMS      float64 `json:"tickIntervalAvgMs"`
	TickIntervalMaxMS      float64 `json:"tickIntervalMaxMs"`
	TickOverruns           uint64  `json:"tickOverruns"`
	Broadcasts             uint64  `json:"broadcasts"`
	BroadcastDurationAvgMS float64 `json:"broadcastDurationAvgMs"`
	BroadcastDurationMaxMS float64 `json:"broadcastDurationMaxMs"`
	SerializationAvgMS     float64 `json:"serializationAvgMs"`
	SerializationMaxMS     float64 `json:"serializationMaxMs"`
	JSONEncodeAvgMS        float64 `json:"jsonEncodeAvgMs"`
	JSONEncodeMaxMS        float64 `json:"jsonEncodeMaxMs"`
	MessagesReceived       uint64  `json:"messagesReceived"`
	BytesReceived          uint64  `json:"bytesReceived"`
	MessagesSent           uint64  `json:"messagesSent"`
	BytesSent              uint64  `json:"bytesSent"`
	DroppedOutbound        uint64  `json:"droppedOutboundMessages"`
	BackpressureDisconnect uint64  `json:"backpressureDisconnects"`
	LastSnapshotBytes      int     `json:"lastSnapshotBytes"`
	SnapshotBytesAvg       float64 `json:"snapshotBytesAvg"`
	SnapshotBytesMax       int     `json:"snapshotBytesMax"`
	BroadcastRecipients    int     `json:"broadcastRecipients"`
	BroadcastDurationMS    float64 `json:"lastBroadcastDurationMs"`
}

type ClientMetrics struct {
	MessagesReceived  uint64  `json:"messagesReceived"`
	BytesReceived     uint64  `json:"bytesReceived"`
	MessagesSent      uint64  `json:"messagesSent"`
	BytesSent         uint64  `json:"bytesSent"`
	DroppedOutbound   uint64  `json:"droppedOutboundMessages"`
	WriteLatencyAvgMS float64 `json:"writeLatencyAvgMs"`
	WriteLatencyMaxMS float64 `json:"writeLatencyMaxMs"`
	ReadLatencyAvgMS  float64 `json:"readLatencyAvgMs"`
	ReadLatencyMaxMS  float64 `json:"readLatencyMaxMs"`
	JSONDecodeAvgMS   float64 `json:"jsonDecodeAvgMs"`
	JSONDecodeMaxMS   float64 `json:"jsonDecodeMaxMs"`
	RTTMS             float64 `json:"rttMs"`
	JitterMS          float64 `json:"jitterMs"`
	LastPacketAgeMS   float64 `json:"lastPacketAgeMs"`
	QueueDepth        int     `json:"queueDepth"`
	LastInputSeq      int64   `json:"lastInputSeq"`
	LastAckInputSeq   int64   `json:"lastAckInputSeq"`
}

func recordEMA(previous, next, alpha float64) float64 {
	if previous == 0 {
		return next
	}
	return previous + (next-previous)*alpha
}

func (m *RoomMetrics) recordTick(duration, interval, budget time.Duration) {
	durationMS := float64(duration.Microseconds()) / 1000
	intervalMS := float64(interval.Microseconds()) / 1000
	m.Ticks++
	m.TickDurationAvgMS = recordEMA(m.TickDurationAvgMS, durationMS, 0.08)
	if durationMS > m.TickDurationMaxMS {
		m.TickDurationMaxMS = durationMS
	}
	m.TickIntervalAvgMS = recordEMA(m.TickIntervalAvgMS, intervalMS, 0.08)
	if intervalMS > m.TickIntervalMaxMS {
		m.TickIntervalMaxMS = intervalMS
	}
	if duration > budget {
		m.TickOverruns++
	}
}

func (m *RoomMetrics) recordBroadcast(duration time.Duration, recipients int) {
	durationMS := float64(duration.Microseconds()) / 1000
	m.Broadcasts++
	m.BroadcastDurationAvgMS = recordEMA(m.BroadcastDurationAvgMS, durationMS, 0.08)
	if durationMS > m.BroadcastDurationMaxMS {
		m.BroadcastDurationMaxMS = durationMS
	}
	m.BroadcastDurationMS = durationMS
	m.BroadcastRecipients = recipients
}

func (m *RoomMetrics) recordSerialization(duration time.Duration, bytes int) {
	durationMS := float64(duration.Microseconds()) / 1000
	m.SerializationAvgMS = recordEMA(m.SerializationAvgMS, durationMS, 0.08)
	if durationMS > m.SerializationMaxMS {
		m.SerializationMaxMS = durationMS
	}
	m.JSONEncodeAvgMS = recordEMA(m.JSONEncodeAvgMS, durationMS, 0.08)
	if durationMS > m.JSONEncodeMaxMS {
		m.JSONEncodeMaxMS = durationMS
	}
	m.LastSnapshotBytes = bytes
	m.SnapshotBytesAvg = recordEMA(m.SnapshotBytesAvg, float64(bytes), 0.08)
	if bytes > m.SnapshotBytesMax {
		m.SnapshotBytesMax = bytes
	}
}

type ProcessMetrics struct {
	UptimeSeconds int64  `json:"uptimeSeconds"`
	GoVersion     string `json:"goVersion"`
	Goroutines    int    `json:"goroutines"`
	Memory        struct {
		AllocBytes           uint64  `json:"allocBytes"`
		HeapAllocBytes       uint64  `json:"heapAllocBytes"`
		HeapSysBytes         uint64  `json:"heapSysBytes"`
		TotalAllocBytes      uint64  `json:"totalAllocBytes"`
		AllocRateBytesPerSec float64 `json:"allocRateBytesPerSecond"`
		NextGCBytes          uint64  `json:"nextGcBytes"`
		LastGCPauseNS        uint64  `json:"lastGcPauseNs"`
		TotalGCPauseNS       uint64  `json:"totalGcPauseNs"`
		NumGC                uint32  `json:"numGc"`
	} `json:"memory"`
}

func BuildProcessMetrics(startedAt time.Time) ProcessMetrics {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	out := ProcessMetrics{
		UptimeSeconds: int64(time.Since(startedAt).Seconds()),
		GoVersion:     runtime.Version(),
		Goroutines:    runtime.NumGoroutine(),
	}
	out.Memory.AllocBytes = mem.Alloc
	out.Memory.HeapAllocBytes = mem.HeapAlloc
	out.Memory.HeapSysBytes = mem.HeapSys
	out.Memory.TotalAllocBytes = mem.TotalAlloc
	uptime := time.Since(startedAt).Seconds()
	if uptime < 1 {
		uptime = 1
	}
	out.Memory.AllocRateBytesPerSec = float64(mem.TotalAlloc) / uptime
	out.Memory.NextGCBytes = mem.NextGC
	if mem.NumGC > 0 {
		out.Memory.LastGCPauseNS = mem.PauseNs[(mem.NumGC+255)%256]
	}
	out.Memory.TotalGCPauseNS = mem.PauseTotalNs
	out.Memory.NumGC = mem.NumGC
	return out
}
