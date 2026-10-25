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
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /api/mqtt/stream {
        proxy_pass http://127.0.0.1:3000/mqtt/stream;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
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

## MQTT
MQTT has four separate responsibilities in this project:
- broker/device ACL decisions through the EMQX HTTP authorization hook;
- user ACL decisions generated from owned/shared devices;
- user-initiated publish actions from the API;
- realtime dashboard updates through Server-Sent Events.

Runtime requirement:
- the API host/container must have `mosquitto_pub` for publish actions;
- the API host/container must have `mosquitto_sub` for realtime SSE updates.

The provided backend Docker image installs these through `mosquitto-clients`. If you run the backend directly on a host, install the same package there.

### Broker ACL integration
The backend exposes:
- `POST /mqtt/acl`

Requirements:
- `MQTT_HTTP_AUTH_SECRET` must be configured.
- EMQX must send the same secret in `x-mqtt-auth-secret`.
- For device clients, the MQTT `clientId` must match an existing device `code`.
- For user clients, EMQX must pass the MQTT username, normally the user's email.
- Missing/invalid secrets are always denied.

Example EMQX HTTP authorization body:

```json
{
  "clientid": "${clientid}",
  "username": "${username}",
  "topic": "${topic}",
  "action": "${action}"
}
```

Use this backend URL from EMQX:

```text
http://127.0.0.1:3000/mqtt/acl
```

Adjust it if EMQX runs in another host or container namespace.

Built-in device ACL behavior:
- a device can publish to `devices/{deviceCode}/telemetry/#`;
- a device can subscribe to `devices/{deviceCode}/commands/#`;
- device-type generated rules are stored in `mqtt_acl_rules`.

Admin users can inspect generated device ACL rules through:
- `GET /mqtt/admin/acl/:deviceCode`

The UI does not expose manual ACL editing for devices. Rules are generated from device type MQTT topics.

### EMQX 5 dashboard setup
Use this checklist in EMQX Dashboard.

1. Configure listener with mTLS if you use certificate auth:
   - `Dashboard` -> `Management` -> `Listeners` -> select/create SSL listener, for example `8883`
   - enable TLS and configure CA cert, server cert, and server key
   - enable client certificate verification when required

2. Configure Authorization:
   - `Dashboard` -> `Access Control` -> `Authorization`
   - set `No Match = Deny`
   - `Add Source` -> `HTTP Server`
   - `Method`: `POST`
   - `URL`: `http://<YOUR_BACKEND_HOST>:3000/mqtt/acl`
   - headers:
     - `content-type: application/json`
     - `x-mqtt-auth-secret: <same value as MQTT_HTTP_AUTH_SECRET>`
   - body:
     ```json
     {
       "clientid": "${clientid}",
       "username": "${username}",
       "topic": "${topic}",
       "action": "${action}"
     }
     ```
   - save, enable, and move this source to top priority if multiple authorization sources exist.

### User ACL model
User MQTT permissions are stored in `mqtt_user_acl_rules`.

They are generated from the devices an account can access:
- owned devices;
- devices shared with that user;
- all devices for admin users.

Generated user ACL rules are recalculated when:
- a user logs in;
- a user is created or updated by an admin;
- a device is created, registered, revoked, or shared;
- a device type is updated.

Action mapping:
- device topic `publish` gives the user `subscribe` permission on that topic;
- device topic `subscribe` gives the user `publish` permission on that topic;
- device topic `all` gives the user `all` permission on that topic.

This inversion is intentional. If a device publishes telemetry, the user dashboard needs permission to subscribe to that telemetry. If a device subscribes to commands, the user needs permission to publish those commands.

Shared devices:
- when a device is shared, the invited user receives generated ACL rules for that shared device;
- when sharing is removed, only the invited user's generated ACL rules are removed/rebuilt;
- the owner keeps their own generated ACL rules.

Linked topics:
- a topic can link a topic from another device type;
- linked ACLs are generated only for target devices that the same user can access;
- this means two devices can communicate through linked topics only when the user has access to both devices, except for devices explicitly shared with that user.

### User publish APIs
The backend exposes two publish endpoints:
- `POST /mqtt/session-publish`
- `POST /mqtt/publish`

Both endpoints use the same backend checks:
- MQTT broker settings must be configured by an admin user.
- The topic must be allowed by that user's generated `mqtt_user_acl_rules`.
- The payload is published by the backend using `mosquitto_pub`.

`POST /mqtt/session-publish` is for the web dashboard and uses the existing HttpOnly session cookie. The browser never receives or resends the user's password.

```bash
curl -X POST "https://deviceportal.example.org/api/mqtt/session-publish" \
  -H "Content-Type: application/json" \
  -b "device_portal_session=<SESSION_COOKIE>" \
  -d '{
    "topic": "devices/ESP32-001/commands/relay",
    "content": {
      "value": true
    }
  }'
```

`POST /mqtt/publish` remains available for external clients that can use Basic Auth with `email:password`.

```bash
curl -X POST "https://deviceportal.example.org/api/mqtt/publish" \
  -H "Authorization: Basic <BASE64_EMAIL_PASSWORD>" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "devices/ESP32-001/commands/relay",
    "content": {
      "value": true
    }
  }'
```

Generate Basic token example:

```bash
printf '%s' 'user@example.com:my-password' | base64
```

Security recommendation:
- prefer `/mqtt/session-publish` for browser UI actions;
- keep `/mqtt/publish` for API clients, tools, or integrations;
- never send credentials in query parameters.

### Realtime dashboard stream
The backend exposes:
- `GET /mqtt/stream`

This endpoint is authenticated with the normal HttpOnly session cookie and uses Server-Sent Events.

How it works:
- the browser opens one SSE connection for the logged-in user;
- the backend reads the user's allowed `subscribe` and `all` ACL topic patterns;
- the backend starts one shared `mosquitto_sub` process for the active topic set;
- subscriber output is length-framed, so JSON payloads containing newlines are preserved;
- multiple browsers/users reuse the same subscriber process when they need the same topics;
- when the last client disconnects, unused topic subscriptions are removed and the subscriber stops if no topics remain.

Server load controls:
- one SSE connection per browser session;
- heartbeat every 25 seconds;
- outgoing MQTT messages are grouped per client every 250ms;
- the backend keeps only the last 500 received MQTT messages in memory;
- ACL changes update already-open SSE clients without requiring a page refresh.

SSE event names:
- `ready`: stream opened or ACL topic set changed;
- `mqtt-message`: new MQTT message visible to that user;
- `mqtt-error`: backend subscriber error.

Example `mqtt-message` event payload:

```json
{
  "topic": "users/12/devices/ESP32-001/telemetry/temperature",
  "payload": "{\"content\":{\"value\":23.4}}",
  "content": {
    "value": 23.4
  },
  "receivedAt": "2026-07-12T10:30:00.000Z"
}
```

Browser code should not send MQTT credentials to the frontend. Publish actions continue to use `/mqtt/session-publish`; realtime reads use `/mqtt/stream`.

### MQTT broker TLS settings
When `protocol` is `mqtts`:
- `CA file path` is required unless `Allow insecure TLS` is enabled.
- `Client certificate path` and `Client key path` are optional, but they must be set together when the broker requires mutual TLS.
- For a self-signed broker, mount the certificate files into the API container and use the in-container paths in the Settings page.
- `Allow insecure TLS` enables Mosquitto client `--insecure` and skips server certificate validation.

Certificate files are not uploaded from the browser. The API process reads them directly from the container filesystem when it runs `mosquitto_pub` or `mosquitto_sub`.

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

### Device type properties and MQTT topics
Device Types define reusable device properties and the `mqttTopics` catalog. Dashboard widgets are
not part of a Device Type: every device owns its widget definitions independently.

A `deviceProperties` definition supports `notNull`:

- omitted or `true`: the value is required (the backward-compatible default);
- `false`: the Devices form accepts an empty value and removes that property from the device data.
- boolean properties are always non-null and default to `false` unless an explicit `true` default is configured.

This flag lives in the existing JSON column, so no property-table migration is required.

`GET /devices` includes saved `device_properties` for the device owner and admin users.
Other users with shared access receive `null` for this field. For an authorized reader, a device
without saved properties returns the JSON string `"{}"`. Property visibility filters still apply,
and sensitive values are decrypted only for authorized readers. Updating properties through
`PUT /devices/:code/properties` remains restricted to the device owner.

### Device cloning

Administrators can optionally select an existing device while creating a new one. `POST /devices`
accepts `clone_from_code` together with the new `code` and `device_type_id`. The source and target
must use the same Device Type.

Cloning copies saved device properties (including sensitive encrypted values) and the complete
per-device widget configuration. The new device always receives a new secret; ownership,
activation, shares and invitations come from the creation form or start empty and are never copied.
The device, properties and widgets are inserted in one SQLite transaction.

Topic rows contain:
- `key`: stable internal topic key, for example `relayCommand`;
- `topic`: MQTT topic or template; required unless `linkedTopic` is used;
- `action`: `publish`, `subscribe`, or `all`.
- `linkedTopic`: optional reference to another device type topic.

Topic templates can use these placeholders:
- `{deviceCode}`
- `{ownerId}`
- `{deviceTypeId}`

Every topic template should include `{deviceCode}` or `{ownerId}` to avoid global topics shared across unrelated users or devices.

When a device calls `GET /ota/properties`, the backend joins `mqttTopics` into the returned properties object. Each topic becomes a normal `key: value` entry where `value` is the resolved topic string. This keeps firmware consumption simple: the device reads all settings and MQTT topics from the same response.

Example `/ota/properties` response:

```json
{
  "relayEnabled": true,
  "relayCommand": "devices/ESP32-001/commands/relay"
}
```

Example topic catalog:

```json
[
  {
    "key": "relayCommand",
    "topic": "devices/{deviceCode}/commands/relay",
    "action": "publish"
  }
]
```

Example linked topic:

```json
[
  {
    "key": "remoteTemperature",
    "action": "subscribe",
    "linkedTopic": {
      "deviceTypeId": "temperature_sensor",
      "topicKey": "temperatureTelemetry"
    }
  }
]
```

When a topic links another device type topic, the backend resolves the target topic template when generating device properties and ACLs. For linked topics, `{deviceCode}` in the target template is resolved as `+`, so a subscriber can match devices of that target type by topic pattern. If you need same-owner isolation, include `{ownerId}` in the topic template, for example:

```text
users/{ownerId}/devices/{deviceCode}/telemetry/temperature
```

### Automatic device ACL rules from device types
When a device is created by an admin or registered by a user, the backend regenerates broker/device ACL rules from its device type `mqttTopics`.

Generated rules:
- are inserted into `mqtt_acl_rules`;
- use `permission = allow`;
- use `priority = 50`;
- are marked with `source = device_type_mqtt`;
- use `source_key = <mqttTopic.key>`.

On regeneration, only rules with `source = device_type_mqtt` for that device are deleted and recreated.

ACL regeneration runs when:
- an admin creates a device;
- a user registers/adds a device;
- an admin updates a device type, because topic changes can affect existing devices;
- device ownership is revoked, so owner-based topic templates are recalculated.

### Per-device dashboard widgets

Widget definitions are stored in `device_widgets`, keyed by `(device_code, widget_id)`. A widget row
contains its complete portable definition:

- `id`: stable widget id;
- `label`: UI label;
- `kind`: `text`, `value`, `switch`, `input`, or `button`;
- `topicKey`: key from the device's Device Type MQTT topic catalog;
- `stateTopicKey`: optional topic key used for live state;
- `stateValuePath`: optional RFC 6901 JSON Pointer used for state and scalar commands;
- `publishValue`: optional scalar sent by a button;
- `onValue` and `offValue`: optional switch values;
- `payload`: optional object payload for button actions.

Example widget definition:

```json
[
  {
    "id": "relayOn",
    "label": "Relay ON",
    "kind": "button",
    "topicKey": "relayCommand",
    "publishValue": true
  }
]
```

Web and future mobile clients use the same authenticated, versioned JSON API. Responses include
`schemaVersion: 1`; clients should select their decoder from this value before interpreting widget
kinds and fields.

- `GET /devices/:code/widgets` returns runtime widgets. MQTT configuration details are included only
  for an authorized admin or developer. Switch runtime data includes its effective `onValue` and
  `offValue`, so web and mobile clients can interpret custom states without hardcoded values.
- `PUT /devices/:code/widgets` replaces the device's widget definitions. Admin can configure
  every device; developer can configure only owned or shared devices.
- `POST /devices/:code/widgets/:widgetId/action` executes a button, switch, or input action.

Switch action example:

```json
{
  "state": true
}
```

The backend resolves device, widget, topic, and configured payload. It then uses the same
authenticated MQTT publishing path and ACL checks as `/mqtt/session-publish`; clients cannot provide
an arbitrary topic or payload for a widget action.

A widget can define `stateTopicKey` and `stateValuePath`. The path is an RFC 6901 JSON Pointer
evaluated against the MQTT `content` received by the realtime stream. For example, `/relay/enabled`
reads `true` from:

```json
{
  "relay": {
    "enabled": true
  }
}
```

For switches, clients compare the extracted value with the effective `onValue` and `offValue`.
Values matching neither configuration are ignored, so an unknown payload does not change the last
valid switch state.

The backend also uses `stateValuePath` when building scalar widget commands. For example, a switch
value `spento` is published as `{ "state": "spento" }` for `/state`, and as
`{ "state": { "enabled": "spento" } }` for `/state/enabled`. Without a pointer, the backward-compatible
payload remains `{ "value": "spento" }`. An explicit object payload defined for a button is preserved.

When `stateTopicKey` points to a topic that the device normally only subscribes to, generated ACLs
are extended for that device widget: the device receives publish access and authorized users
receive subscribe access. This supports command and state on the same topic without changing the
device type topic catalog.

Compatibility note:
- existing `deviceProperties` without `notNull` remain required;
- `mqttTopics` are joined only in the API response for devices;
- `device_widgets` is the only supported widget storage; databases must already use the current
  schema before starting this backend;
- older backend versions that require Device Type widget catalogs are not compatible with the
  current database. Back up the SQLite file before deploying if rollback is required.

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
- EMQX ACL denies a device: verify `MQTT_HTTP_AUTH_SECRET` on both sides and confirm the device code matches the MQTT `clientId`.
- EMQX ACL denies a user: verify EMQX sends `username` and that the username matches the user's email.
- Realtime dashboard does not update: verify `mosquitto_sub` is installed in the API runtime, MQTT broker settings are configured, and the configured backend MQTT account can subscribe to the widget state topics. Publish permission alone is not sufficient.
- A widget marked `waiting` has an open SSE connection but has not received a matching MQTT state yet. A widget is marked `live` only after a message matching its resolved state topic has arrived and its JSON Pointer has returned a value.
