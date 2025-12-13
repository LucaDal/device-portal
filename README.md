# Device Portal

Quick setup notes for environment variables and the Nginx reverse proxy.

## Environment variables (.env)
Create a `.env` in the project root. Suggested template:
```
# Admin created at first boot only
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin

# JWT signing secret: use a long random value
JWT_SECRET=change-me-please

# SQLite path inside the container and on the host
DB_PATH=/app/backend/data.db
DB_PATH_HOST=./backend/data.db

# Frontend build-time backend URL (baked into the bundle)
# Leave empty to auto-detect:
# - If UI served on :5173, it will call http(s)://<host>:3000
# - Otherwise it will call /api on the same origin (behind a reverse proxy)
VITE_BACKEND_URL=

# Request logs for the API (true/false)
ENABLE_REQUEST_LOGS=false
```
Notes:
- `ADMIN_EMAIL`/`ADMIN_PASSWORD` are only used on first start to create the admin user.
- `DB_PATH_HOST` controls where the SQLite file lives on the host; `DB_PATH` is the in-container path (rarely needs changing).
- `VITE_BACKEND_URL` is read at frontend build time: leave it empty for auto-detect, or set it to `/api` (behind Nginx) or a full URL (e.g., `http://localhost:3000`). Rebuild the `ui` image after changes.
- CORS is handled automatically by reflecting the caller's `Origin`, so you don't need to set a dedicated `CORS_ORIGIN`.
- `ENABLE_REQUEST_LOGS=false` keeps logs to explicit app messages only.

## Running with Docker Compose
- Local build: `docker compose build` then `docker compose up -d`.
- Using published images: set `image:` on services (e.g. `lucadal/device-portal:api` and `lucadal/device-portal:ui`), then `docker compose pull && docker compose up -d`.

## Multi-arch builds with Buildx
If you need both amd64 and arm64 (e.g., Raspberry Pi) from one build:
- Install buildx (Arch: `sudo pacman -S docker-buildx`; Debian/Ubuntu: `sudo apt-get install docker-buildx-plugin`).
- Create and bootstrap a builder:
  ```bash
  docker buildx create --name multi --use
  docker buildx inspect --bootstrap
  ```
- Build and push multi-arch images:
  ```bash
  docker buildx build --platform linux/amd64,linux/arm64 \
    -t lucadal/device-portal:api \
    -f backend/Dockerfile . \
    --push

  docker buildx build --platform linux/amd64,linux/arm64 \
    -t lucadal/device-portal:ui \
    -f frontend/Dockerfile . \
    --push
  ```
Use separate tags (e.g., `:api`, `:ui`, or versioned tags) as needed. After pushing, `docker pull` will grab the right architecture automatically.

## Nginx reverse proxy
The `nginx.conf` file fronts API and UI.
1) Rename `nginx.conf - cpy` to `nginx.conf` and update upstreams to your Compose service names (e.g. `api` and `ui`):
   ```nginx
      server {
        listen 80;
        server_name _;

        # API -> backend
        location /api/ {
          proxy_pass http://localhost:3000/;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
        }

        # Frontend (Vite dev server, includes websocket upgrade)
        location / {
          proxy_pass http://localhost:5173/;
          proxy_http_version 1.1;
          proxy_set_header Host $host;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection "upgrade";
        }
      }
   ```

## Quick troubleshooting
- 401/403 from the frontend: check `JWT_SECRET` consistency and `CORS_ORIGIN`.
- DB not found: ensure `DB_PATH_HOST` exists on the host and matches the volume target.
- Bind mount fails with "not a directory": the host path in `DB_PATH_HOST` must be a file, not a directory. If you point to a new path, create it first (e.g., `mkdir -p /home/pi/device-portal && touch /home/pi/device-portal/data.db`) before `docker compose up`.
- Frontend can’t reach backend: verify `VITE_BACKEND_URL` (build-time) and `CORS_ORIGIN` (API runtime) point to the correct host/ports, and that ports 3000/5173 are exposed.
