# Device Portal

Quick setup notes for environment variables and the Nginx reverse proxy.

## Environment variables (.env)
Create a `.env` in the project root. Suggested template (or in backend folder while developing):
```
# Admin created at first boot only
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin

# JWT signing secret: use a long random value
JWT_SECRET=change-me-please

# Encryption key for sensitive device properties (string fields with sensitive=true)
# Use 64 hex chars (32 bytes) or base64 for 32 raw bytes
DEVICE_PROPERTIES_ENCRYPTION_KEY=change-me

# Backend CORS allowlist (comma-separated).
# With the current docker-compose defaults, localhost:5173 is already used if this is omitted.
# Set this only when UI origin changes (for example a public domain).
# CORS_ALLOWED_ORIGINS=http://localhost:5173,https://dashboard.example.com

# SQLite path inside the container and on the host
DB_PATH=/app/backend/data/data.db
DB_PATH_HOST=./data

# Request logs for the API (true/false)
ENABLE_REQUEST_LOGS=false
```
Notes:
- `ADMIN_EMAIL`/`ADMIN_PASSWORD` are only used on first start to create the admin user.
- `DB_PATH_HOST` controls the host directory mounted into the container; `DB_PATH` is the SQLite file path inside that mounted directory.
- CORS is allowlist-based via `CORS_ALLOWED_ORIGINS`.
- In the current `docker-compose.yml`, API defaults to `CORS_ALLOWED_ORIGINS=http://localhost:5173`, so local setup works without extra changes.
- The frontend does not use build-time backend env variables anymore:
  - on `:5173` it calls `http(s)://<host>:3000`
  - behind a reverse proxy it calls `/api`
- `ENABLE_REQUEST_LOGS=false` keeps logs to explicit app messages only.
- `DEVICE_PROPERTIES_ENCRYPTION_KEY` is required if you enable sensitive encrypted device properties.

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
2) If the public UI origin is, for example, `https://deviceportal.lucaexample.org`, set:
   ```env
   CORS_ALLOWED_ORIGINS=https://deviceportal.lucaexample.org
   ```

## Quick troubleshooting
- 401/403 from the frontend: check `JWT_SECRET` consistency and ensure frontend origin is included in `CORS_ALLOWED_ORIGINS`.
- DB not found: ensure `DB_PATH_HOST` exists on the host and matches the mounted directory.
- If you point `DB_PATH_HOST` to a new location, create the directory first (e.g. `mkdir -p /home/pi/device-portal/data`) before `docker compose up`.
- Frontend can’t reach backend: verify the reverse proxy path `/api` or direct backend port `3000`, and ensure `CORS_ALLOWED_ORIGINS` matches the frontend origin.

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

Requirements:
- HTTPS in production.
- `Authorization: Basic <base64(email:password)>`.
- MQTT broker settings configured from Dashboard `Settings` (admin only).
- User enabled by admin for MQTT publish and allowed by user ACL topic rules.

Security recommendation:
- Do not send credentials in query parameters.
- Use only `POST /mqtt/publish`.

### POST example
```bash
curl -X POST "https://localhost:3000/mqtt/publish" \
  -H "Authorization: Basic <BASE64_EMAIL_PASSWORD>" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "devices/ESP32-001/commands",
    "content": {
      "action": "reboot",
      "delaySec": 3
    }
  }'
```

Generate Basic token example:
```bash
printf '%s' 'device@example.com:my-secret' | base64
```

## OTA API

Sensitive device identifiers are no longer passed in URL paths or request bodies.
Use request headers instead:
- `x-device-code` for device-specific requests.
- `x-device-secret` for device authentication.
- `x-device-type-id` for device-type resolution.

Request model:
- properties: `x-device-code` + `x-device-secret`
- version: `x-device-type-id` + `x-device-secret`, or `x-device-type-id` + `Authorization: Basic ...` with an admin account
- build: `x-device-code` + `x-device-type-id` + `x-device-secret`

### Retrieve properties

```bash
curl "http://localhost:3000/ota/properties" \
  -H "x-device-code: ESP32-001" \
  -H "x-device-secret: <DEVICE_SECRET>"
```

### Retrieve build metadata for one device

```bash
curl "http://localhost:3000/ota/version" \
  -H "x-device-type-id: esp32-devkit" \
  -H "x-device-secret: <DEVICE_SECRET>"
```

Admin alternative:

```bash
curl "http://localhost:3000/ota/version" \
  -H "Authorization: Basic <BASE64_ADMIN_EMAIL_PASSWORD>" \
  -H "x-device-type-id: esp32-devkit"
```

### Download build for one device

```bash
curl "http://localhost:3000/ota/build" \
  -H "x-device-code: ESP32-001" \
  -H "x-device-type-id: esp32-devkit" \
  -H "x-device-secret: <DEVICE_SECRET>" \
  -o firmware.bin
```

### Upload a new build

Requirements:
- `Authorization: Basic <base64(email:password)>`
- authenticated user role must be `admin`
- `x-device-type-id` header is required

```bash
curl -X POST "http://localhost:3000/ota/upload" \
  -H "Authorization: Basic <BASE64_EMAIL_PASSWORD>" \
  -H "x-device-type-id: esp32-devkit" \
  -F "version=1.2.3" \
  -F "file=@firmware.bin"
```

Response format (generic):

```json
{
  "propertyA": "value",
  "propertyB": 123,
  "propertyC": true
}
```
