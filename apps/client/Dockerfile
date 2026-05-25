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

ARG VITE_WS_URL
ENV VITE_WS_URL=$VITE_WS_URL

COPY tsconfig.base.json ./
COPY apps/client ./apps/client
COPY packages/shared ./packages/shared

RUN npm --workspace apps/client run build

FROM docker.io/library/nginx:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
