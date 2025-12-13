FROM node:20-slim AS builder

WORKDIR /app/backend

# Install backend dependencies
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
# Force native builds (e.g., bcrypt) for the target arch
ENV npm_config_python=/usr/bin/python3
ENV npm_config_build_from_source=true
RUN npm ci

# Copy source code
COPY backend ./
WORKDIR /app
COPY shared ./shared

# Build TypeScript and prune dev deps
WORKDIR /app/backend
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-slim
WORKDIR /app/backend
ENV NODE_ENV=production

COPY --from=builder /app/backend/package*.json ./
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/shared ../shared

# Ensure native modules (e.g., bcrypt) are built for the target arch in the final image
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && npm_config_python=/usr/bin/python3 npm_config_build_from_source=true \
       npm rebuild bcrypt better-sqlite3 --build-from-source \
  && apt-get purge -y python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Provide runtime alias for "@shared/*" imports
RUN ln -s /app/shared /app/backend/node_modules/@shared

EXPOSE 3000
CMD ["node", "dist/backend/src/server.js"]
