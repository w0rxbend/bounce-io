package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	_ "net/http/pprof"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"skybound-relics/apps/server-go/internal/game"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	cfg := game.ServerConfig{
		Host:              envString("HOST", "0.0.0.0"),
		Port:              envInt("PORT", 8787),
		TickRate:          envInt("TICK_RATE", game.DefaultTickRate),
		SnapshotRate:      envInt("SNAPSHOT_RATE", game.DefaultSnapshotRate),
		MaxMessageBytes:   int64(envInt("MAX_MESSAGE_BYTES", 2048)),
		OutboundQueueSize: envInt("OUTBOUND_QUEUE_SIZE", game.DefaultOutboundQueue),
		MaxOutboundDrops:  uint64(envInt("MAX_OUTBOUND_DROPS", 64)),
	}
	srv := game.NewServer(cfg, log)

	mux := http.NewServeMux()
	mux.Handle("/", srv.Routes())
	mux.Handle("/debug/pprof/", http.DefaultServeMux)

	httpServer := &http.Server{
		Addr:              srv.Addr(),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Info("Bounce IO Go server listening", "addr", srv.Addr(), "tickRate", cfg.TickRate, "snapshotRate", cfg.SnapshotRate)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Info("shutting down")
	srv.Shutdown()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Error("shutdown failed", "error", err)
		os.Exit(1)
	}
}

func envString(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
