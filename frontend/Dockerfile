FROM node:20-slim AS builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./

# Bring in shared TypeScript types used by the frontend build
WORKDIR /app
COPY shared ./shared
WORKDIR /app/frontend

# Build static assets
RUN npm run build

FROM node:20-slim
WORKDIR /app/frontend

# Simple static server
RUN npm install -g serve

COPY --from=builder /app/frontend/dist ./dist

EXPOSE 5173

CMD ["serve", "-s", "dist", "-l", "tcp://0.0.0.0:5173"]
