package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"math/rand"
	"net/url"
	"os"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
)

type stats struct {
	connected    atomic.Int64
	messagesIn   atomic.Int64
	messagesOut  atomic.Int64
	bytesIn      atomic.Int64
	bytesOut     atomic.Int64
	snapshots    atomic.Int64
	outOfOrder   atomic.Int64
	errors       atomic.Int64
	rttsMu       sync.Mutex
	rtts         []float64
	snapshotAges []float64
}

type welcome struct {
	Type     string `json:"type"`
	PlayerID string `json:"playerId"`
}

type pong struct {
	Type       string `json:"type"`
	ClientTime int64  `json:"clientTime"`
	ServerTime int64  `json:"serverTime"`
}

type snapshot struct {
	Type        string `json:"type"`
	SnapshotSeq int64  `json:"snapshotSeq"`
	ServerTime  int64  `json:"serverTime"`
}

func main() {
	target := flag.String("url", "ws://127.0.0.1:8787/ws?room=load", "websocket URL")
	clients := flag.Int("clients", 25, "number of clients")
	duration := flag.Duration("duration", 30*time.Second, "test duration")
	latency := flag.Duration("latency", 0, "artificial one-way send latency")
	jitter := flag.Duration("jitter", 0, "additional random send jitter")
	burstEvery := flag.Duration("burst-every", 0, "send short input bursts at this interval")
	slowClients := flag.Int("slow-clients", 0, "number of clients that delay reads")
	flag.Parse()

	if _, err := url.Parse(*target); err != nil {
		fmt.Fprintln(os.Stderr, "invalid url:", err)
		os.Exit(2)
	}

	ctx, cancel := context.WithTimeout(context.Background(), *duration)
	defer cancel()
	var wg sync.WaitGroup
	s := &stats{}
	started := time.Now()
	for i := 0; i < *clients; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			runClient(ctx, id, *target, *latency, *jitter, *burstEvery, id < *slowClients, s)
		}(i)
	}

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	for {
		select {
		case <-ticker.C:
			printStats("progress", s, time.Since(started))
		case <-done:
			printStats("final", s, time.Since(started))
			return
		}
	}
}

func runClient(ctx context.Context, id int, target string, latency, jitter, burstEvery time.Duration, slow bool, s *stats) {
	conn, _, err := websocket.Dial(ctx, target, nil)
	if err != nil {
		s.errors.Add(1)
		return
	}
	defer conn.Close(websocket.StatusNormalClosure, "")
	s.connected.Add(1)
	defer s.connected.Add(-1)

	send := func(payload any) bool {
		if latency > 0 || jitter > 0 {
			delay := latency
			if jitter > 0 {
				delay += time.Duration(rand.Int63n(int64(jitter)))
			}
			select {
			case <-time.After(delay):
			case <-ctx.Done():
				return false
			}
		}
		raw, _ := json.Marshal(payload)
		writeCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		err := conn.Write(writeCtx, websocket.MessageText, raw)
		cancel()
		if err != nil {
			s.errors.Add(1)
			return false
		}
		s.messagesOut.Add(1)
		s.bytesOut.Add(int64(len(raw)))
		return true
	}

	send(map[string]any{"type": "join", "protocol": 2, "version": "0.1.0", "name": fmt.Sprintf("bot-%03d", id), "clientTime": nowMS()})

	readDone := make(chan struct{}, 1)
	welcomeC := make(chan string, 1)
	go func() {
		lastSnapshotSeq := int64(-1)
		for {
			if slow {
				time.Sleep(250 * time.Millisecond)
			}
			_, raw, err := conn.Read(ctx)
			if err != nil {
				readDone <- struct{}{}
				return
			}
			s.messagesIn.Add(1)
			s.bytesIn.Add(int64(len(raw)))
			var env struct {
				Type string `json:"type"`
			}
			if json.Unmarshal(raw, &env) != nil {
				continue
			}
			switch env.Type {
			case "welcome":
				var msg welcome
				if json.Unmarshal(raw, &msg) == nil {
					select {
					case welcomeC <- msg.PlayerID:
					default:
					}
				}
			case "pong":
				var msg pong
				if json.Unmarshal(raw, &msg) == nil {
					s.addRTT(float64(nowMS() - msg.ClientTime))
				}
			case "snapshot":
				var msg snapshot
				if json.Unmarshal(raw, &msg) == nil {
					if msg.SnapshotSeq <= lastSnapshotSeq {
						s.outOfOrder.Add(1)
					}
					lastSnapshotSeq = msg.SnapshotSeq
					s.snapshots.Add(1)
					s.addSnapshotAge(float64(nowMS() - msg.ServerTime))
				}
			case "error":
				s.errors.Add(1)
			}
		}
	}()

	inputTicker := time.NewTicker(time.Second / 60)
	pingTicker := time.NewTicker(time.Second)
	var burstTicker *time.Ticker
	var burstC <-chan time.Time
	if burstEvery > 0 {
		burstTicker = time.NewTicker(burstEvery)
		burstC = burstTicker.C
	}
	defer inputTicker.Stop()
	defer pingTicker.Stop()
	if burstTicker != nil {
		defer burstTicker.Stop()
	}

	seq := int64(0)
	playerID := ""
	for {
		select {
		case <-ctx.Done():
			return
		case <-readDone:
			return
		case playerID = <-welcomeC:
		case <-inputTicker.C:
			if playerID == "" {
				continue
			}
			seq++
			phase := (seq / 60) % 4
			send(inputPayload(playerID, seq, phase))
		case <-pingTicker.C:
			send(map[string]any{"type": "ping", "clientTime": nowMS()})
		case <-burstC:
			if playerID == "" {
				continue
			}
			for i := 0; i < 8; i++ {
				seq++
				send(inputPayload(playerID, seq, int64(i%4)))
			}
		}
	}
}

func inputPayload(playerID string, seq int64, phase int64) map[string]any {
	return map[string]any{
		"type":       "input",
		"playerId":   playerID,
		"inputSeq":   seq,
		"clientTime": nowMS(),
		"movement": map[string]any{
			"left":        phase == 2,
			"right":       phase == 0,
			"jumpPressed": seq%90 == 0,
			"jumpHeld":    seq%90 < 16,
			"drop":        false,
		},
		"action": map[string]any{"kick": seq%120 == 0},
	}
}

func (s *stats) addRTT(v float64) {
	s.rttsMu.Lock()
	defer s.rttsMu.Unlock()
	s.rtts = append(s.rtts, v)
}

func (s *stats) addSnapshotAge(v float64) {
	s.rttsMu.Lock()
	defer s.rttsMu.Unlock()
	s.snapshotAges = append(s.snapshotAges, v)
}

func printStats(label string, s *stats, elapsed time.Duration) {
	s.rttsMu.Lock()
	rtts := append([]float64(nil), s.rtts...)
	ages := append([]float64(nil), s.snapshotAges...)
	s.rttsMu.Unlock()
	fmt.Printf("%s elapsed=%s connected=%d in=%d/s out=%d/s snapshots=%d errors=%d outOfOrder=%d rtt_p50=%.1f rtt_p95=%.1f snapshotAge_p95=%.1f bytesIn=%d bytesOut=%d\n",
		label,
		elapsed.Truncate(time.Second),
		s.connected.Load(),
		int64(float64(s.messagesIn.Load())/elapsed.Seconds()),
		int64(float64(s.messagesOut.Load())/elapsed.Seconds()),
		s.snapshots.Load(),
		s.errors.Load(),
		s.outOfOrder.Load(),
		percentile(rtts, 0.50),
		percentile(rtts, 0.95),
		percentile(ages, 0.95),
		s.bytesIn.Load(),
		s.bytesOut.Load(),
	)
}

func percentile(values []float64, p float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sort.Float64s(values)
	idx := int(float64(len(values)-1) * p)
	return values[idx]
}

func nowMS() int64 {
	return time.Now().UnixNano() / int64(time.Millisecond)
}
