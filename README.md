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

# Backend CORS allowlist (comma-separated).
# With the current docker-compose defaults, localhost:5173 is already used if this is omitted.
# Set this only when UI origin changes (for example a public domain).
# CORS_ALLOWED_ORIGINS=http://localhost:5173,https://dashboard.example.com

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
- CORS is allowlist-based via `CORS_ALLOWED_ORIGINS`.
- In the current `docker-compose.yml`, API defaults to `CORS_ALLOWED_ORIGINS=http://localhost:5173`, so local setup works without extra changes.
- `ENABLE_REQUEST_LOGS=false` keeps logs to explicit app messages only.

## Running with Docker Compose
- Local build: `docker compose build` then `docker compose up -d`.
- Using published images: set `image:` on services (e.g. `lucadal/device-portal:api` and `lucadal/device-portal:ui`), then `docker compose pull && docker compose up -d`.
- If UI origin changes, override `CORS_ALLOWED_ORIGINS` in `.env` (or in compose environment) with a comma-separated list of allowed origins.

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
- 401/403 from the frontend: check `JWT_SECRET` consistency and ensure frontend origin is included in `CORS_ALLOWED_ORIGINS`.
- DB not found: ensure `DB_PATH_HOST` exists on the host and matches the volume target.
- Bind mount fails with "not a directory": the host path in `DB_PATH_HOST` must be a file, not a directory. If you point to a new path, create it first (e.g., `mkdir -p /home/pi/device-portal && touch /home/pi/device-portal/data.db`) before `docker compose up`.
- Frontend can’t reach backend: verify `VITE_BACKEND_URL` (build-time) and `CORS_ALLOWED_ORIGINS` (API runtime) point to the correct host/ports, and that ports 3000/5173 are exposed.

## EMQX 5 HTTP Auth/ACL integration
Backend now exposes:
- `POST /mqtt/acl`

Add this runtime secret in backend `.env`:
```bash
MQTT_HTTP_AUTH_SECRET=replace-with-a-long-random-secret
```

### EMQX 5 Dashboard setup (recommended)
Use this checklist in EMQX Dashboard (no `base.hocon` editing required).

1. Configure listener with mTLS (if you use certificate auth):
   - `Dashboard` -> `Management` -> `Listeners` -> select/create SSL listener (e.g. `8883`)
   - Enable TLS and set:
     - CA cert
     - Server cert
     - Server key
   - Enable client certificate verification (`verify_peer` / require client cert)

2. Configure Authorization (HTTP ACL):
   - `Dashboard` -> `Access Control` -> `Authorization`
   - Set `No Match = Deny`
   - `Add Source` -> `HTTP Server`
   - `Method`: `POST`
   - `URL`: `http://<YOUR_BACKEND_HOST>:3000/mqtt/acl`
   - `Headers`:
     - `content-type: application/json`
     - `x-emqx-auth-secret: <same value as MQTT_HTTP_AUTH_SECRET>`
   - `Body`:
     ```json
     {
       "clientid": "${clientid}",
       "topic": "${topic}",
       "action": "${action}"
     }
     ```
   - Save, enable, and move this source to top priority if multiple sources exist.

3. Verify:
   - Ensure backend endpoint is reachable from EMQX host/container.
   - Test a device connection with valid mTLS auth configured directly in EMQX.
   - Test publish/subscribe on allowed and denied topics.
   - Check EMQX auth/authz logs for allow/deny decisions.

### MQTT `clientId` rules (important)
- `clientId` is the unique MQTT connection identifier for each device.
- In this project, `clientId` must match an existing device `code` in the `devices` table.
- Recommended format: stable and unique, e.g. `ESP32-001` (letters/numbers with `-` or `_`).
- Do not use random `clientId` values at every reboot: ACL and session behavior become unreliable.
- If a client connects with an unknown `clientId` (no matching device code), backend ACL returns deny:
  the client cannot publish or subscribe to any topic.

Notes:
- Protect hooks with `MQTT_HTTP_AUTH_SECRET` and send the same value from EMQX in `x-emqx-auth-secret`.
- Device authentication is handled natively by EMQX (mTLS). Backend only handles ACL decisions via `/mqtt/acl`.
- Dynamic ACL rules are stored in `mqtt_acl_rules` and can be managed by admin users only via `/mqtt/admin/*`.

## MQTT publish API
The backend exposes a publish endpoint:
- `POST /mqtt/publish`
- `GET /mqtt/publish`

Requirements:
- Authenticated user (`Authorization: Bearer <token>`).
- MQTT broker settings configured from Dashboard `Settings` (admin only).
- User enabled by admin for MQTT publish and allowed by user ACL topic rules.

### POST example
```bash
curl -X POST "http://localhost:3000/mqtt/publish" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "device@example.com",
    "password": "my-secret",
    "topic": "devices/ESP32-001/commands",
    "content": {
      "action": "reboot",
      "delaySec": 3
    }
  }'
```

### GET example with query parameters
`content` must be valid JSON (URL-encoded).
```bash
curl -G "http://localhost:3000/mqtt/publish" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  --data-urlencode "email=device@example.com" \
  --data-urlencode "password=my-secret" \
  --data-urlencode "topic=devices/ESP32-001/commands" \
  --data-urlencode "content={\"action\":\"reboot\",\"delaySec\":3}"
```

Example URL format:
```text
http://localhost:3000/mqtt/publish?email=device@example.com&password=my-secret&topic=devices/ESP32-001/commands&content=%7B%22action%22%3A%22reboot%22%2C%22delaySec%22%3A3%7D
```
