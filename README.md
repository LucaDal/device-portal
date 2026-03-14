# Device Portal

Deployment notes for the Docker setup, the host-level Nginx reverse proxy, and the required runtime secrets.

## Security model
- Docker publishes API and UI on `127.0.0.1` only.
- Nginx runs on the host and is the only public entrypoint.
- Browser authentication uses an `HttpOnly` session cookie instead of storing the JWT in `localStorage`.
- Sensitive HTTP paths use lightweight in-memory rate limiting.
- MQTT ACL integration requires a shared secret and validates TLS certificates when using `mqtts`.

This setup works well on low-power hosts such as Raspberry Pi 4 as long as you keep a single API instance per host.

## Environment variables
Create `.env` in the project root from `.env.example`.

```env
# Admin bootstrap user. Used only if the admin account does not exist yet.
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-strong-admin-password

# JWT signing secret for the HttpOnly session cookie.
JWT_SECRET=replace-with-a-strong-random-secret-at-least-32-chars

# Shared secret required by the EMQX/HTTP ACL hook.
MQTT_HTTP_AUTH_SECRET=replace-with-a-strong-random-secret-at-least-32-chars

# Encryption key for sensitive device string properties.
# Use 64 hex chars (32 bytes) or base64 for 32 raw bytes.
DEVICE_PROPERTIES_ENCRYPTION_KEY=a7ff4c72a483f6ea9cabc39a0c6ddd3ece36f55a3d0f9cdb8c26a1d13c0378d3

# Comma-separated browser allowlist for API requests.
CORS_ALLOWED_ORIGINS=http://localhost:5173,https://deviceportal.example.org

# SQLite file path inside the API container.
DB_PATH=/app/backend/data/data.db

# Host directory mounted into the API container.
DB_PATH_HOST=./data

# Optional API request logging.
ENABLE_REQUEST_LOGS=false
```

Notes:
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` are only used when the admin user does not exist yet.
- `JWT_SECRET` and `MQTT_HTTP_AUTH_SECRET` should both be long random values and must be kept private.
- `DB_PATH_HOST` controls the host directory mounted into the API container; `DB_PATH` is the SQLite file path inside that directory.
- `CORS_ALLOWED_ORIGINS` must match the public frontend origin served by Nginx.

## Docker Compose
Use either the published images file or the local build file.

- `docker-compose.yml`: uses published images.
- `docker-compose.release.yml`: builds locally from the repository.

Start the stack:

```bash
docker compose up -d
```

Important:
- API is bound to `127.0.0.1:3000`.
- UI is bound to `127.0.0.1:5173`.
- Neither service is meant to be exposed directly on the public network.

If you want to store database files on a different host path:

```bash
mkdir -p /home/pi/device-portal/data
```

Then update `DB_PATH_HOST` in `.env` before starting the stack.

## Reverse proxy with host Nginx
Because Nginx runs on the host, proxy to the localhost-bound container ports.

Example:

```nginx
server {
    listen 80;
    server_name _;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:5173/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

If the public frontend origin is `https://deviceportal.example.org`, set:

```env
CORS_ALLOWED_ORIGINS=https://deviceportal.example.org
```

## Multi-arch builds
To publish both `amd64` and `arm64` images, for example for Raspberry Pi:

```bash
docker buildx create --name multi --use
docker buildx inspect --bootstrap

docker buildx build --platform linux/amd64,linux/arm64 \
  -t lucadal/device-portal:api \
  -f backend/Dockerfile . \
  --push

docker buildx build --platform linux/amd64,linux/arm64 \
  -t lucadal/device-portal:ui \
  -f frontend/Dockerfile . \
  --push
```

## MQTT ACL integration
The backend exposes:
- `POST /mqtt/acl`

Requirements:
- `MQTT_HTTP_AUTH_SECRET` must be configured.
- EMQX must send the same secret in `x-mqtt-auth-secret`.
- Unknown clients and missing/invalid secrets are denied.

Example EMQX HTTP authz source:

```json
{
  "clientid": "${clientid}",
  "topic": "${topic}",
  "action": "${action}"
}
```

Use this backend URL from EMQX:

```text
http://127.0.0.1:3000/mqtt/acl
```

Adjust it if EMQX runs in another host or container namespace.

## MQTT publish API
The backend exposes:
- `POST /mqtt/publish`

Requirements:
- HTTPS in production.
- `Authorization: Basic <base64(email:password)>`.
- MQTT broker settings configured by an admin user.
- The user must be enabled for MQTT publish and allowed by topic ACL rules.

When `protocol` is `mqtts`:
- `CA file path` is required and must point to a readable file inside the API container.
- `Client certificate path` and `Client key path` are optional, but they must be set together when the broker requires mutual TLS.
- For a self-signed broker, mount the certificate files into the API container and use the in-container paths in the Settings page.
- `Allow insecure TLS` enables `mosquitto_pub --insecure` and skips server certificate validation.

Certificate files are not uploaded from the browser. The API process reads them directly from the container filesystem when it runs `mosquitto_pub`.

Recommended flow:
1. Place the TLS files on the Docker host.
2. Mount that directory into the `api` container as read-only.
3. Enter the mounted in-container paths in the Settings page.

Example host files:

```text
/home/pi/device-portal/certs/ca.crt
/home/pi/device-portal/certs/client.crt
/home/pi/device-portal/certs/client.key
```

Example `docker-compose` volume for the `api` service:

```yaml
api:
  volumes:
    - ${DB_PATH_HOST:-./data}:/app/backend/data
    - /home/pi/device-portal/certs:/etc/device-portal/mqtt:ro
```

Example Settings values:
- `CA file path`: `/etc/device-portal/mqtt/ca.crt`
- `Client certificate path`: `/etc/device-portal/mqtt/client.crt`
- `Client key path`: `/etc/device-portal/mqtt/client.key`

For a self-signed broker without mutual TLS:
- set only `CA file path`
- leave `Client certificate path` and `Client key path` empty

If the broker is on the same trusted host and you explicitly want to skip certificate validation:
- enable `Allow insecure TLS`
- `CA file path` becomes optional
- this is less secure and should only be used for controlled local deployments

For a broker that requires mutual TLS:
- set all three paths
- ensure the mounted files are readable by the API container

Example:

```bash
curl -X POST "https://deviceportal.example.org/api/mqtt/publish" \
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

## OTA API
Sensitive device identifiers are passed via headers, not in URL parameters or request bodies.

Headers:
- `x-device-code`
- `x-device-secret`
- `x-device-type-id`

Request model:
- properties: `x-device-code` + `x-device-secret`
- version: `x-device-type-id` + `x-device-secret`, or admin `Authorization: Basic ...`
- build: `x-device-code` + `x-device-type-id` + `x-device-secret`

Examples:

```bash
curl "http://127.0.0.1:3000/ota/properties" \
  -H "x-device-code: ESP32-001" \
  -H "x-device-secret: <DEVICE_SECRET>"
```

```bash
curl "http://127.0.0.1:3000/ota/version" \
  -H "x-device-type-id: esp32-devkit" \
  -H "x-device-secret: <DEVICE_SECRET>"
```

```bash
curl "http://127.0.0.1:3000/ota/build" \
  -H "x-device-code: ESP32-001" \
  -H "x-device-type-id: esp32-devkit" \
  -H "x-device-secret: <DEVICE_SECRET>" \
  -o firmware.bin
```

Admin upload example:

```bash
curl -X POST "http://127.0.0.1:3000/ota/upload" \
  -H "Authorization: Basic <BASE64_EMAIL_PASSWORD>" \
  -H "x-device-type-id: esp32-devkit" \
  -F "version=1.2.3" \
  -F "file=@firmware.bin"
```

## Troubleshooting
- `401` or `403` in the browser: verify `JWT_SECRET`, session cookie forwarding, and `CORS_ALLOWED_ORIGINS`.
- API unreachable from Nginx: check that Docker is listening on `127.0.0.1:3000` and `127.0.0.1:5173`.
- DB file missing: create the `DB_PATH_HOST` directory before starting the stack.
- EMQX ACL denies everything: verify `MQTT_HTTP_AUTH_SECRET` on both sides and confirm the device code matches the MQTT `clientId`.

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
     - `x-mqtt-auth-secret: <same value as MQTT_HTTP_AUTH_SECRET>`
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
- Protect hooks with `MQTT_HTTP_AUTH_SECRET` and send the same value from EMQX in `x-mqtt-auth-secret`.
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
