const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const { once } = require('node:events');

const directory = mkdtempSync(path.join(tmpdir(), 'device-routes-'));
process.env.DB_PATH = path.join(directory, 'test.db');
process.env.DOTENV_CONFIG_PATH = path.join(directory, 'unused.env');
process.env.ADMIN_EMAIL = 'routes-admin@example.test';
process.env.ADMIN_PASSWORD = randomBytes(24).toString('hex');
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.DEVICE_PROPERTIES_ENCRYPTION_KEY = randomBytes(32).toString('hex');
process.env.MQTT_DYNSEC_ENABLED = 'true';
process.env.MQTT_PUBLIC_HOST = 'mqtt.example.test';
process.env.MQTT_PUBLIC_PORT = '8883';

require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true, preferTsExts: true });
require('tsconfig-paths').register({ baseUrl: path.join(__dirname, '..'), paths: { '@shared/*': ['../shared/*'] } });
const express = require('express');
const { DB } = require('../src/config/database.ts');
require('../src/config/bootstrap.ts').ensureAdminUser();
const { createUser } = require('../src/services/userService.ts');
const { encryptSensitiveDeviceProperties } = require('../src/utils/devicePropertiesSecurity.ts');
const { sensitiveIpRateLimitMiddleware } = require('../src/middleware/rateLimit.ts');

const deviceSecret = randomBytes(24).toString('hex');
const otherSecret = randomBytes(24).toString('hex');
const userPassword = randomBytes(24).toString('hex');
const owner = Number(createUser('routes-owner@example.test', userPassword).id);
const firmware = Buffer.from('test-firmware');
const insertType = DB.prepare(`INSERT INTO device_types(id, firmware_version, firmware_build, mqtt_enabled, genericProperties, mqttTopics)
  VALUES (?, '1.0', ?, 1, ?, ?)`);
insertType.run('sensor', firmware, JSON.stringify({ mode: { type: 'string', value: 'default' } }),
  JSON.stringify([
    { key: 'telemetry', action: 'publish', topic: 'devices/{deviceCode}/telemetry/state' },
    { key: 'commands', action: 'subscribe', topic: 'devices/{deviceCode}/commands/#' },
    { key: 'shared', action: 'all', topic: 'owners/{ownerId}/{deviceTypeId}/shared' },
  ]));
insertType.run('other', firmware, '{}', '[]');
const insertDevice = DB.prepare(`INSERT INTO devices (name, code, device_type_id, owner_id, activated, device_secret_hash) VALUES ('Fixture device', ?, ?, ?, 1, ?)`);
insertDevice.run('A', 'sensor', owner, createHash('sha256').update(deviceSecret).digest('hex'));
insertDevice.run('B', 'other', owner, createHash('sha256').update(otherSecret).digest('hex'));
const properties = encryptSensitiveDeviceProperties({
  mode: { type: 'string', value: 'custom' },
  wifiPassword: { type: 'string', value: 'fixture-password' },
}, { wifiPassword: { type: 'string', sensitive: true } });
DB.prepare('INSERT INTO device_properties(device_code, properties) VALUES (?, ?)').run('A', JSON.stringify(properties));

let server, baseUrl;
const headers = { 'x-device-code': 'A', 'x-device-secret': deviceSecret, 'x-device-type-id': 'sensor' };
const basic = (email, password) => 'Basic ' + Buffer.from(email + ':' + password).toString('base64');

before(async () => {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use('/device', sensitiveIpRateLimitMiddleware, require('../src/routes/deviceProvisioningRoutes.ts').default);
  app.use('/ota', sensitiveIpRateLimitMiddleware, require('../src/routes/otaRoutes.ts').default);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  if (server) {
    const closed = new Promise((resolve) => server.close(resolve));
    server.closeAllConnections();
    await closed;
  }
  DB.close();
  rmSync(directory, { recursive: true, force: true });
});

test('device configuration requires the device secret and returns uncached properties without MQTT topics', async () => {
  for (const auth of [{}, { ...headers, 'x-device-secret': otherSecret }]) {
    assert.equal((await fetch(baseUrl + '/device/configuration', { headers: auth })).status, 401);
  }
  const response = await fetch(baseUrl + '/device/configuration', { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    mode: 'default', wifiPassword: 'fixture-password',
  });
  const log = DB.prepare("SELECT * FROM device_request_logs WHERE event_type = 'device_configuration' AND status_code = 200").get();
  assert.equal(log.path, '/device/configuration');
  assert.equal(log.device_code, 'A');
  assert.equal(log.device_type_id, 'sensor');
  assert.equal(log.response_summary, null);
  assert.ok(!JSON.stringify(log).includes(deviceSecret));
  assert.ok(!JSON.stringify(log).includes('fixture-password'));
});

test('MQTT provisioning keeps device authentication, HTTPS and availability checks', async () => {
  const endpoint = baseUrl + '/device/mqtt-configuration';
  assert.equal((await fetch(endpoint)).status, 401);
  assert.equal((await fetch(endpoint, { headers })).status, 403);
  const secure = { ...headers, 'x-forwarded-proto': 'https' };
  const response = await fetch(endpoint, { headers: secure });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const credentials = await response.json();
  assert.equal(credentials.username, 'dp-device:A');
  assert.equal(credentials.host, 'mqtt.example.test');
  assert.ok(credentials.password);
  assert.equal(credentials.schemaVersion, 3);
  assert.deepEqual(credentials.topics, {
    publish: { availability: 'devices/A/telemetry/availability', telemetry: 'devices/A/telemetry/state' },
    subscribe: { commands: 'devices/A/commands/#' },
    all: { shared: `owners/${owner}/sensor/shared` },
  });
  const other = await fetch(endpoint, { headers: { 'x-device-code': 'B', 'x-device-secret': otherSecret, 'x-forwarded-proto': 'https' } });
  assert.equal(other.status, 200);
  assert.deepEqual((await other.json()).topics, { publish: { availability: 'devices/B/telemetry/availability' }, subscribe: {}, all: {} });
  DB.prepare("UPDATE devices SET mqtt_enabled = 0 WHERE code = 'A'").run();
  try { assert.equal((await fetch(endpoint, { headers: secure })).status, 403); }
  finally { DB.prepare("UPDATE devices SET mqtt_enabled = 1 WHERE code = 'A'").run(); }
});

test('OTA firmware and version preserve authentication, payload and checksum', async () => {
  assert.equal((await fetch(baseUrl + '/ota/firmware')).status, 401);
  assert.equal((await fetch(baseUrl + '/ota/firmware', { headers: { ...headers, 'x-device-type-id': 'other' } })).status, 401);
  const download = await fetch(baseUrl + '/ota/firmware', { headers });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('x-md5'), createHash('md5').update(firmware).digest('hex'));
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), firmware);
  const version = await fetch(baseUrl + '/ota/firmware/version', { headers });
  assert.equal(version.status, 200);
  assert.deepEqual(await version.json(), { version: '1.0', md5Checksum: createHash('md5').update(firmware).digest('hex') });
  const adminVersion = await fetch(baseUrl + '/ota/firmware/version', { headers: {
    Authorization: basic(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD), 'x-device-type-id': 'sensor',
  } });
  assert.equal(adminVersion.status, 200);
  const forbidden = await fetch(baseUrl + '/ota/firmware/version', { headers: { ...headers, 'x-device-secret': otherSecret } });
  assert.equal(forbidden.status, 401);
});

test('firmware upload accepts only admin Basic authentication and preserves multipart validation', async () => {
  const endpoint = baseUrl + '/ota/firmware';
  assert.equal((await fetch(endpoint, { method: 'PUT', headers })).status, 401);
  const user = { Authorization: basic('routes-owner@example.test', userPassword), 'x-device-type-id': 'sensor' };
  assert.equal((await fetch(endpoint, { method: 'PUT', headers: user })).status, 403);
  const admin = { Authorization: basic(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD), 'x-device-type-id': 'sensor' };
  assert.equal((await fetch(endpoint, { method: 'PUT', headers: admin })).status, 400);
  const invalid = new FormData();
  invalid.append('version', '1');
  invalid.append('version', '2');
  invalid.set('file', new Blob(['invalid-version']), 'firmware.bin');
  assert.equal((await fetch(endpoint, { method: 'PUT', headers: admin, body: invalid })).status, 400);
  const body = new FormData();
  body.set('version', '2.0');
  body.set('file', new Blob(['updated-firmware']), 'firmware.bin');
  assert.equal((await fetch(endpoint, { method: 'PUT', headers: admin, body })).status, 200);
  const updated = DB.prepare("SELECT firmware_version, firmware_build FROM device_types WHERE id = 'sensor'").get();
  assert.equal(updated.firmware_version, '2.0');
  assert.equal(updated.firmware_build.toString(), 'updated-firmware');
});

test('old mixed-purpose OTA paths are removed without aliases', async () => {
  for (const endpoint of ['/ota/properties', '/ota/mqtt', '/ota/build', '/ota/version']) {
    assert.equal((await fetch(baseUrl + endpoint, { headers })).status, 404);
  }
  assert.equal((await fetch(baseUrl + '/ota/upload', { method: 'POST', headers })).status, 404);
});
