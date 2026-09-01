# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=20

# TypeScript output is architecture-independent, so build it on the host platform.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-slim AS builder

WORKDIR /app/backend

COPY backend/package*.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --ignore-scripts

COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY shared /app/shared

RUN npm run build

# Install production modules once for each target architecture. bcrypt and
# better-sqlite3 provide prebuilt binaries for the supported Node platforms.
FROM node:${NODE_VERSION}-slim AS production-dependencies

WORKDIR /app/backend

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
ENV npm_config_python=/usr/bin/python3
RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev

FROM node:${NODE_VERSION}-slim

WORKDIR /app/backend
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends mosquitto-clients ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=production-dependencies /app/backend/package*.json ./
COPY --from=production-dependencies /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./dist

# Provide runtime alias for "@shared/*" imports using compiled JS output
RUN ln -s /app/backend/dist/shared /app/backend/node_modules/@shared

EXPOSE 3000
CMD ["node", "dist/backend/src/server.js"]
