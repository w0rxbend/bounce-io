# Docker Deployment

Build and run both services:

```sh
docker compose up --build
```

The frontend is served at http://localhost:8080. The backend runs on the private Compose network and is reached through the frontend's `/ws` nginx proxy.

If the frontend port is already in use, override it:

```sh
FRONTEND_PORT=18080 docker compose up --build
```

The frontend image serves static files with nginx and proxies `/ws` to the backend service. For deployments where the WebSocket server lives at a different public URL, build with `VITE_WS_URL`:

```sh
VITE_WS_URL=wss://example.com/ws docker compose up --build
```

Build images individually:

```sh
docker build -f apps/server/Dockerfile -t bounce-io-backend .
docker build -f apps/client/Dockerfile -t bounce-io-frontend .
```
