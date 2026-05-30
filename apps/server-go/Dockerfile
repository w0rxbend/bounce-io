# syntax=docker/dockerfile:1.7

FROM docker.io/library/golang:1.23-alpine AS build
WORKDIR /src

COPY apps/server-go/go.mod ./apps/server-go/go.mod
WORKDIR /src/apps/server-go
RUN go mod download

WORKDIR /src
COPY apps/server-go ./apps/server-go

WORKDIR /src/apps/server-go
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM docker.io/library/alpine:3.20
WORKDIR /app

ENV PORT=8787
ENV HOST=0.0.0.0
ENV TICK_RATE=60
ENV SNAPSHOT_RATE=20

COPY --from=build /out/server ./server

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null || exit 1

CMD ["./server"]

