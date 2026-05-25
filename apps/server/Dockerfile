# syntax=docker/dockerfile:1.7

FROM docker.io/library/node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/client/package.json ./apps/client/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci

FROM deps AS build
WORKDIR /app

COPY tsconfig.base.json ./
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared

RUN npx esbuild apps/server/src/index.ts \
  --bundle \
  --platform=node \
  --format=cjs \
  --target=node22 \
  --outfile=dist/server.cjs

FROM docker.io/library/node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0

COPY --from=build /app/dist/server.cjs ./server.cjs

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8787)).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.cjs"]
