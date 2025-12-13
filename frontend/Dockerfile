FROM node:20-slim AS builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./

# Bring in shared TypeScript types used by the frontend build
WORKDIR /app
COPY shared ./shared
WORKDIR /app/frontend

# Optional backend URL at build time; leave empty to auto-detect at runtime
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}

# Build static assets
RUN npm run build

FROM node:20-slim
WORKDIR /app/frontend

# Simple static server
RUN npm install -g serve

COPY --from=builder /app/frontend/dist ./dist

EXPOSE 5173

CMD ["serve", "-s", "dist", "-l", "tcp://0.0.0.0:5173"]
