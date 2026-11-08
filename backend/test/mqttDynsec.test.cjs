const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-dynsec-'));
process.env.DB_PATH = path.join(temporary, 'test.db');
process.env.DOTENV_CONFIG_PATH = path.join(temporary, 'unused.env');
process.env.ADMIN_EMAIL = 'dynsec-test@example.test';
process.env.ADMIN_PASSWORD = crypto.randomBytes(32).toString('hex');
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.DEVICE_PROPERTIES_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.MQTT_DYNSEC_ENABLED = 'true';
process.env.MQTT_DYNSEC_USERNAME = 'dp-sync';
process.env.MQTT_DYNSEC_BACKEND_PASSWORD = crypto.randomBytes(32).toString('hex');
process.env.MQTT_PUBLIC_HOST = 'mqtt.example.test';

require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true, preferTsExts: true });
require('tsconfig-paths').register({ baseUrl: path.join(__dirname, '..'), paths: { '@shared/*': ['../shared/*'] } });
const { connectAsync } = require('mqtt');
const { DEFAULT_DEVICE_TYPE_MQTT_TOPICS } = require('../../shared/constants/mqtt');
const { DB } = require('../src/config/database.ts');
const { createUser } = require('../src/services/userService.ts');
require('../src/config/bootstrap.ts').ensureAdminUser();
const { getMqttDevicePassword, mqttDeviceUsername, mqttDeviceRole } = require('../src/services/mqttDeviceCredentials.ts');
const { MqttDynsecClient } = require('../src/services/mqttDynsecClient.ts');
const { MqttDynsecService, buildDynsecAcls } = require('../src/services/mqttDynsecService.ts');
const { MqttDynsecController } = require('../src/controllers/mqttDynsecController.ts');
const { publishForAuthenticatedUser } = require('../src/controllers/mqttController.ts');
const { syncGeneratedMqttUserAclRulesForUser, canUserAccessMqttTopic } = require('../src/utils/mqttUserAcl.ts');
const { requireDeviceCodeSecret } = require('../src/middleware/deviceAuth.ts');
const { DeviceTypeController } = require('../src/controllers/deviceTypeController.ts');
const { DeviceController } = require('../src/controllers/deviceController.ts');
const { getDeviceDashboardWidgets, buildDeviceDashboardWidgetAction } = require('../src/services/deviceDashboardService.ts');
const { getDeviceMqttTopicMap, syncGeneratedMqttAclRulesForDevice, resolveDeviceTypeMqttTopicsForDevice } = require('../src/utils/deviceTypeMqtt.ts');
const { brokerSettingsView, loadBrokerSettings, saveBrokerSettings, brokerClientOptions } = require('../src/utils/mqttBrokerSettings.ts');
const { generateToken } = require('../src/utils/jwt.ts');
const express = require('express');

let broker, control, service, url, api, apiUrl;
const clients = [];
const owner = Number(DB.prepare("INSERT INTO users(email, role, password_hash) VALUES ('device-owner@example.test', 'user', 'fixture-hash')").run().lastInsertRowid);
DB.prepare("INSERT INTO device_types(id, firmware_version, firmware_build, mqtt_enabled, mqttTopics) VALUES ('test', '1', ?, 1, ?)").run(Buffer.alloc(0), JSON.stringify(DEFAULT_DEVICE_TYPE_MQTT_TOPICS));
for (const code of ['A', 'B']) {
  DB.prepare("INSERT INTO devices (name, code, device_type_id, owner_id, activated, device_secret_hash) VALUES ('Fixture device', ?, 'test', ?, 1, 'test')").run(code, owner);
  syncGeneratedMqttAclRulesForDevice(code);
}

function response() {
  return { code: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(value) { this.code = value; return this; }, send(body) { this.body = body; return this; },
    json(body) { return this.send(body); } };
}

before(async () => {
  const listener = net.createServer();
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const adminPassword = crypto.randomBytes(32).toString('hex');
  const secretFile = path.join(temporary, 'admin-password');
  fs.writeFileSync(secretFile, adminPassword, { mode: 0o600 });
  execFileSync(process.execPath, [path.join(__dirname, '../../mosquitto/init-dynsec.cjs')], {
    env: { ...process.env, DYNSEC_DATA_DIR: temporary, MQTT_DYNSEC_PASSWORD_FILE: secretFile },
  });
  // Run the exact same offline initializer twice; it must preserve the broker state.
  const initial = fs.readFileSync(path.join(temporary, 'dynamic-security.json'), 'utf8');
  execFileSync(process.execPath, [path.join(__dirname, '../../mosquitto/init-dynsec.cjs')], {
    env: { ...process.env, DYNSEC_DATA_DIR: temporary, MQTT_DYNSEC_PASSWORD_FILE: secretFile },
  });
  assert.equal(fs.readFileSync(path.join(temporary, 'dynamic-security.json'), 'utf8'), initial);
  const plugin = process.env.MOSQUITTO_DYNSEC_PLUGIN || '/usr/lib/mosquitto_dynamic_security.so';
  const config = path.join(temporary, 'mosquitto.conf');
  fs.writeFileSync(config, `user ${os.userInfo().username}\nlistener ${port} 127.0.0.1\nallow_anonymous false\nplugin ${plugin}\nplugin_opt_config_file ${temporary}/dynamic-security.json\n`);
  broker = spawn('mosquitto', ['-c', config], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Test broker did not start')), 5000);
    let output = '';
    broker.once('error', reject);
    broker.once('exit', () => { clearTimeout(timeout); reject(new Error(`Test broker stopped: ${output}`)); });
    broker.stderr.on('data', (chunk) => {
      output += chunk;
      if (output.includes(' running')) { clearTimeout(timeout); resolve(); }
    });
  });
  url = `mqtt://127.0.0.1:${port}`;
  process.env.MQTT_DYNSEC_URL = url;
  process.env.MQTT_DYNSEC_PASSWORD = adminPassword;
  control = new MqttDynsecClient(url, { username: 'dp-sync', password: adminPassword });
  service = new MqttDynsecService(control);
  await service.drain();
  await service.drain(); // First credential creation increments the durable queue revision.
  const app = express();
  app.use('/device-types', require('../src/routes/deviceTypeRoutes.ts').default);
  app.use('/devices', express.json(), require('../src/routes/deviceRoutes.ts').default);
  app.use('/manage', express.json(), require('../src/routes/managementRoute.ts').default);
  app.use('/mqtt', express.json(), require('../src/routes/mqttRoutes.ts').default);
  app.use('/auth', express.json(), require('../src/routes/authRoutes.ts').default);
  api = app.listen(0, '127.0.0.1');
  await once(api, 'listening');
  apiUrl = 'http://127.0.0.1:' + api.address().port;
});

after(async () => {
  require('../src/services/mqttSseService.ts').closeMqttStreams();
  for (const client of clients) await client.endAsync(true);
  await service?.stop();
  if (api) {
    const closed = new Promise((resolve) => api.close(resolve));
    api.closeIdleConnections();
    await closed;
  }
  if (broker && broker.exitCode === null) { const exit = once(broker, 'exit'); broker.kill('SIGTERM'); await exit; }
  DB.close();
  fs.rmSync(temporary, { recursive: true, force: true });
});

test('device credentials are unique, recoverable, encrypted and bound to the device', () => {
  const a = getMqttDevicePassword('A');
  const b = getMqttDevicePassword('B');
  assert.notEqual(a, b);
  assert.equal(getMqttDevicePassword('A'), a);
  const row = DB.prepare("SELECT encrypted_password FROM mqtt_device_credentials WHERE device_code = 'A'").get();
  assert.ok(!row.encrypted_password.includes(a));
  const original = DB.prepare("SELECT encrypted_password FROM mqtt_device_credentials WHERE device_code = 'B'").get();
  DB.prepare("UPDATE mqtt_device_credentials SET encrypted_password = ? WHERE device_code = 'B'").run(row.encrypted_password);
  assert.throws(() => getMqttDevicePassword('B'));
  DB.prepare("UPDATE mqtt_device_credentials SET encrypted_password = ? WHERE device_code = 'B'").run(original.encrypted_password);
});

test('device provisioning requires HTTPS, enabled devices and a non-cacheable response', () => {
  const otaSecret = crypto.randomBytes(24).toString('hex');
  DB.prepare("UPDATE devices SET device_secret_hash = ? WHERE code = 'A'")
    .run(crypto.createHash('sha256').update(otaSecret).digest('hex'));
  const authenticated = { headers: { 'x-device-code': 'A', 'x-device-secret': otaSecret } };
  let accepted = false;
  requireDeviceCodeSecret(authenticated, response(), () => { accepted = true; });
  assert.equal(accepted, true);
  assert.equal(authenticated.deviceAuth.deviceCode, 'A');
  const unauthorized = response();
  requireDeviceCodeSecret({ headers: { 'x-device-code': 'B', 'x-device-secret': otaSecret } }, unauthorized,
    () => assert.fail('A device must not provision credentials for another device'));
  assert.equal(unauthorized.code, 401);
  const insecure = response();
  MqttDynsecController.deviceCredentials({ secure: false, deviceAuth: { deviceCode: 'A' } }, insecure);
  assert.equal(insecure.code, 403);
  assert.equal(insecure.body.password, undefined);
  const secure = response();
  MqttDynsecController.deviceCredentials({ secure: true, deviceAuth: { deviceCode: 'A' } }, secure);
  assert.equal(secure.code, 200);
  assert.equal(secure.headers['Cache-Control'], 'no-store');
  assert.equal(secure.body.username, mqttDeviceUsername('A'));
  assert.equal(secure.body.password, getMqttDevicePassword('A'));
});

test('queue changes roll back with device transactions and retain deletion tombstones', async () => {
  const before = DB.prepare("SELECT * FROM mqtt_dynsec_queue WHERE device_code = 'A'").get();
  assert.throws(() => DB.transaction(() => {
    DB.prepare("UPDATE devices SET activated = 0 WHERE code = 'A'").run();
    throw new Error('rollback');
  })());
  assert.deepEqual(DB.prepare("SELECT * FROM mqtt_dynsec_queue WHERE device_code = 'A'").get(), before);
  DB.prepare("INSERT INTO devices (name, code, device_type_id, device_secret_hash) VALUES ('Fixture device', 'DELETED', 'test', 'x')").run();
  DB.prepare("DELETE FROM devices WHERE code = 'DELETED'").run();
  assert.ok(DB.prepare("SELECT 1 FROM mqtt_dynsec_queue WHERE device_code = 'DELETED'").get());
  await service.drain();
  assert.equal(DB.prepare("SELECT 1 FROM mqtt_dynsec_queue WHERE device_code = 'DELETED'").get(), undefined);
});

test('ACL conversion preserves denies and blocks system and control topics', () => {
  const acls = buildDynsecAcls('A', [
    { action: 'publish', topic_pattern: 'devices/A/telemetry/private', permission: 'deny', priority: 1 },
    { action: 'publish', topic_pattern: 'devices/A/telemetry/private', permission: 'allow', priority: 50 },
    { action: 'publish', topic_pattern: 'devices/A/telemetry/#', permission: 'allow', priority: 100 },
  ]);
  const deny = acls.find((acl) => acl.topic === 'devices/A/telemetry/private');
  const allow = acls.find((acl) => acl.topic === 'devices/A/telemetry/#');
  assert.equal(deny.allow, false);
  assert.ok(deny.priority > allow.priority);
  assert.ok(acls.some((acl) => acl.topic === '$CONTROL/#' && !acl.allow));
  assert.throws(() => buildDynsecAcls('A/#', []));
  assert.equal(buildDynsecAcls('A', []).some((acl) => acl.allow && acl.topic.startsWith('devices/')), false);
});

test('real broker permits own topics, rejects other devices and delivers retained state', async () => {
  const device = await connectAsync(url, { username: mqttDeviceUsername('A'), password: getMqttDevicePassword('A'),
    clientId: 'A', protocolVersion: 5, reconnectPeriod: 0 });
  clients.push(device);
  device.on('error', () => {});
  await device.subscribeAsync('devices/A/commands/#', { qos: 1 });
  await assert.rejects(device.subscribeAsync('devices/B/commands/#', { qos: 1 }));
  await assert.rejects(device.subscribeAsync('$CONTROL/#', { qos: 1 }));
  await device.publishAsync('devices/A/telemetry/state', '{"content":{"relay":false}}', { qos: 1, retain: true });
  await assert.rejects(device.publishAsync('devices/B/telemetry/state', 'invalid', { qos: 1 }));
  const backend = await connectAsync(url, { username: 'dp-backend', password: process.env.MQTT_DYNSEC_BACKEND_PASSWORD,
    clientId: 'test-data-client', protocolVersion: 5, reconnectPeriod: 0 });
  clients.push(backend);
  backend.on('error', () => {});
  const message = once(backend, 'message');
  await backend.subscribeAsync('devices/A/telemetry/state', { qos: 1 });
  const [topic, payload, packet] = await message;
  assert.equal(topic, 'devices/A/telemetry/state');
  assert.equal(JSON.parse(payload).content.relay, false);
  assert.equal(packet.retain, true);
  await assert.rejects(backend.subscribeAsync('$CONTROL/dynamic-security/v1/response', { qos: 1 }));
  await service.syncDevice('A');
  await device.publishAsync('devices/A/telemetry/state', '{}', { qos: 1 });
  assert.equal(device.connected, true, 'An unchanged reconciliation must preserve the connection');
});

test('availability publishes online and a retained offline Last Will on connection loss', { timeout: 5000 }, async () => {
  const observer = clients.find((client) => client.options.clientId === 'test-data-client');
  const topic = 'devices/B/telemetry/availability';
  await observer.subscribeAsync(topic, { qos: 1 });
  const device = await connectAsync(url, { username: mqttDeviceUsername('B'), password: getMqttDevicePassword('B'),
    clientId: 'B', reconnectPeriod: 0, will: { topic, payload: Buffer.from('offline'), qos: 1, retain: true } });
  clients.push(device);
  const online = once(observer, 'message');
  await device.publishAsync(topic, 'online', { qos: 1, retain: true });
  assert.equal((await online)[1].toString(), 'online');
  const offline = once(observer, 'message');
  await device.endAsync(true);
  assert.equal((await offline)[1].toString(), 'offline');
  await observer.unsubscribeAsync(topic);
  const retained = once(observer, 'message');
  await observer.subscribeAsync(topic, { qos: 1 });
  const [receivedTopic, payload, packet] = await retained;
  assert.equal(receivedTopic, topic);
  assert.equal(payload.toString(), 'offline');
  assert.equal(packet.retain, true);
  await observer.unsubscribeAsync(topic);
});

test('rotation replaces credentials and revocation disconnects an already connected ESP', async () => {
  const old = getMqttDevicePassword('B');
  const password = getMqttDevicePassword('B', true);
  assert.notEqual(password, old);
  await service.drain();
  await assert.rejects(connectAsync(url, { username: mqttDeviceUsername('B'), password: old, clientId: 'B', reconnectPeriod: 0 }));
  const device = await connectAsync(url, { username: mqttDeviceUsername('B'), password, clientId: 'B', reconnectPeriod: 0 });
  clients.push(device);
  device.on('error', () => {});
  const disconnected = once(device, 'close');
  DB.prepare("UPDATE devices SET mqtt_enabled = 0 WHERE code = 'B'").run();
  await service.drain();
  await disconnected;
  const res = response();
  MqttDynsecController.deviceCredentials({ secure: true, deviceAuth: { deviceCode: 'B' } }, res);
  assert.equal(res.code, 403);
  await assert.rejects(connectAsync(url, { username: mqttDeviceUsername('B'), password, clientId: 'B', reconnectPeriod: 0 }));
});

test('partial ACL synchronization fails closed, persists a retry, and recovers', async () => {
  DB.prepare(`INSERT INTO mqtt_acl_rules(device_code, action, topic_pattern, permission, priority)
    VALUES ('A', 'publish', 'devices/A/telemetry/private', 'deny', 1)`).run();
  const failing = new MqttDynsecService({
    request(command, ...options) {
      if (command.command === 'modifyRole' && command.rolename === mqttDeviceRole('A')) {
        throw new Error('Simulated broker failure');
      }
      return control.request(command, ...options);
    },
  });
  await failing.drain();
  const job = DB.prepare("SELECT * FROM mqtt_dynsec_queue WHERE device_code = 'A'").get();
  assert.equal(job.attempts, 1);
  assert.ok(job.next_attempt_at > Date.now());
  const reply = await control.request({ command: 'getClient', username: mqttDeviceUsername('A') });
  assert.equal(reply.data.client.disabled, true);

  DB.prepare("UPDATE mqtt_dynsec_queue SET next_attempt_at = 0 WHERE device_code = 'A'").run();
  await service.drain();
  assert.equal(DB.prepare("SELECT 1 FROM mqtt_dynsec_queue WHERE device_code = 'A'").get(), undefined);
  const device = await connectAsync(url, { username: mqttDeviceUsername('A'), password: getMqttDevicePassword('A'),
    clientId: 'A', protocolVersion: 5, reconnectPeriod: 0 });
  clients.push(device);
  device.on('error', () => {});
  await assert.rejects(device.publishAsync('devices/A/telemetry/private', 'denied', { qos: 1 }));
  await device.publishAsync('devices/A/telemetry/state', '{}', { qos: 1 });
});

test('reconciliation removes orphan clients restored from an older broker backup', async () => {
  const username = mqttDeviceUsername('ORPHAN');
  await control.request({ command: 'createClient', username });
  await service.reconcileBrokerState();
  assert.ok(DB.prepare("SELECT 1 FROM mqtt_dynsec_queue WHERE device_code = 'ORPHAN'").get());
  await service.drain();
  const reply = await control.request({ command: 'getClient', username }, true);
  assert.equal(reply.error, 'Client not found');
});

test('user SSE permissions include only availability and state of accessible devices', () => {
  const unrelated = Number(DB.prepare("INSERT INTO users(email, role, password_hash) VALUES ('unrelated@example.test', 'user', 'fixture-hash')").run().lastInsertRowid);
  syncGeneratedMqttUserAclRulesForUser(owner);
  syncGeneratedMqttUserAclRulesForUser(unrelated);
  assert.equal(canUserAccessMqttTopic(owner, 'subscribe', 'devices/A/telemetry/availability'), true);
  assert.equal(canUserAccessMqttTopic(unrelated, 'subscribe', 'devices/A/telemetry/availability'), false);
});

test('MQTT settings and toggles require admin authorization on the actual HTTP routes', async () => {
  const ownerToken = generateToken({ id: owner, role: 'user' });
  const admin = DB.prepare('SELECT * FROM users WHERE email = ?').get(process.env.ADMIN_EMAIL);
  const adminToken = generateToken(admin);
  const cases = [
    ['PUT', '/devices/A/mqtt', { mqtt_enabled: false }],
    ['PUT', '/device-types/test/mqtt', { mqtt_enabled: true, mqttTopics: [] }],
    ['GET', '/manage/settings/mqtt'],
  ];
  for (const [method, pathname, body] of cases) {
    const denied = await fetch(apiUrl + pathname, { method, headers: {
      Authorization: 'Bearer ' + ownerToken, 'Content-Type': 'application/json',
    }, body: body ? JSON.stringify(body) : undefined });
    assert.equal(denied.status, 403);
    await denied.text();
  }
  const invalid = await fetch(apiUrl + '/device-types/test/mqtt', { method: 'PUT', headers: {
    Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json',
  }, body: JSON.stringify({ mqtt_enabled: 'yes', mqttTopics: [] }) });
  assert.equal(invalid.status, 400);
  const allowed = await fetch(apiUrl + '/devices/A/mqtt', { method: 'PUT', headers: {
    Authorization: 'Bearer ' + adminToken, 'Content-Type': 'application/json',
  }, body: JSON.stringify({ mqtt_enabled: true }) });
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).mqtt_available, true);
});

test('MQTT opt-out removes credentials, actions, OTA topics and user subscriptions', async () => {
  const admin = DB.prepare('SELECT * FROM users WHERE email = ?').get(process.env.ADMIN_EMAIL);
  const user = { id: owner, role: 'user' };
  const topics = [...DEFAULT_DEVICE_TYPE_MQTT_TOPICS, { key: 'relayCommand', topic: 'devices/{deviceCode}/commands/#', action: 'subscribe' }];
  let res = response();
  DeviceTypeController.updateMqtt({ params: { id: 'test' }, body: { mqtt_enabled: true, mqttTopics: topics } }, res);
  assert.equal(res.code, 200);
  require('../src/repositories/deviceTypeWidgetRepository.ts').replaceDeviceTypeWidgets('test', [{
    id: 'relay', label: 'Relay', kind: 'switch', command: { topicKey: 'relayCommand', topicSuffix: 'relay', onValue: true, offValue: false },
  }], DB.prepare("SELECT widgets_revision FROM device_types WHERE id = 'test'").get().widgets_revision);
  assert.equal(getDeviceDashboardWidgets('A', user).widgets.length, 1);
  const oldPassword = getMqttDevicePassword('A');

  res = response();
  DeviceTypeController.updateMqtt({ params: { id: 'test' }, body: { mqtt_enabled: false } }, res);
  assert.equal(res.code, 200);
  assert.equal(getDeviceDashboardWidgets('A', user).widgets.length, 0);
  assert.throws(() => buildDeviceDashboardWidgetAction('A', 'relay', { state: true }, user), (error) => error.status === 409);
  assert.deepEqual(getDeviceMqttTopicMap('A'), {});
  assert.equal(canUserAccessMqttTopic(owner, 'subscribe', 'devices/A/telemetry/state'), false);
  const list = response();
  DeviceController.list({ user: admin }, list);
  const device = list.body.find((row) => row.code === 'A');
  assert.equal(device.mqtt_available, false);
  assert.equal(device.type_mqttTopics, '[]');
  const provisioning = response();
  MqttDynsecController.deviceCredentials({ secure: true, deviceAuth: { deviceCode: 'A' } }, provisioning);
  assert.equal(provisioning.code, 403);
  await service.drain();
  assert.equal((await control.request({ command: 'getClient', username: mqttDeviceUsername('A') }, true)).error, 'Client not found');
  assert.equal(DB.prepare("SELECT 1 FROM mqtt_device_credentials WHERE device_code = 'A'").get(), undefined);
  // Definitions are preserved, but reenabling provisions a fresh password.
  res = response();
  DeviceTypeController.updateMqtt({ params: { id: 'test' }, body: { mqtt_enabled: true } }, res);
  assert.equal(res.code, 200);
  await service.drain();
  assert.notEqual(getMqttDevicePassword('A'), oldPassword);
  assert.equal(getDeviceDashboardWidgets('A', user).widgets.length, 1);
});

test('new types default to MQTT off and cannot be overridden by a single device', () => {
  DB.prepare("INSERT INTO device_types(id, firmware_version, firmware_build) VALUES ('no-mqtt', '1', ?)").run(Buffer.alloc(0));
  DB.prepare("INSERT INTO devices (name, code, device_type_id, owner_id, activated, device_secret_hash) VALUES ('Fixture device', 'NO-MQTT', 'no-mqtt', ?, 1, 'x')").run(owner);
  const res = response();
  DeviceController.updateMqtt({ params: { code: 'NO-MQTT' }, body: { mqtt_enabled: true } }, res);
  assert.equal(res.code, 409);
  assert.equal(DB.prepare("SELECT 1 FROM mqtt_device_credentials WHERE device_code = 'NO-MQTT'").get(), undefined);
  assert.equal(DB.prepare("SELECT 1 FROM mqtt_dynsec_queue WHERE device_code = 'NO-MQTT'").get(), undefined);
});

test('broker passwords are never returned; standalone saves encrypt and preserve them', () => {
  const managed = brokerSettingsView();
  assert.equal(managed.managed, true);
  assert.equal(managed.password, undefined);
  assert.throws(() => saveBrokerSettings({ host: 'ignored' }), /managed/);
  process.env.MQTT_DYNSEC_ENABLED = 'false';
  try {
    const input = { host: 'localhost', port: 1883, protocol: 'mqtt', username: 'portal', password: 'broker-test-secret' };
    const view = saveBrokerSettings(input);
    assert.equal(view.password, undefined);
    assert.equal(view.passwordSet, true);
    const stored = DB.prepare("SELECT value FROM app_settings WHERE key = 'mqtt_broker_settings'").get().value;
    assert.ok(!stored.includes(input.password));
    assert.equal(loadBrokerSettings().password, input.password);
    saveBrokerSettings({ ...input, password: '' });
    assert.equal(loadBrokerSettings().password, input.password);
    saveBrokerSettings({ ...input, password: null });
    assert.equal(loadBrokerSettings().password, '');
  } finally { process.env.MQTT_DYNSEC_ENABLED = 'true'; }
});

test('topic matching enforces MQTT system-topic and wildcard rules', () => {
  const { mqttTopicMatches } = require('../../shared/types/mqtt.ts');
  assert.equal(mqttTopicMatches('#', '$SYS/status'), false);
  assert.equal(mqttTopicMatches('+/#', '$CONTROL/dynamic-security/v1'), false);
  assert.equal(mqttTopicMatches('$SYS/#', '$SYS/status'), true);
  assert.equal(mqttTopicMatches('devices/A/#', 'devices/A'), true);
  assert.equal(mqttTopicMatches('devices/+/state', 'devices/A/state'), true);
  assert.equal(mqttTopicMatches('devices/A+', 'devices/A1'), false);
  assert.equal(mqttTopicMatches('devices/#/state', 'devices/A/state'), false);
});

test('TLS uses the system trust store by default and accepts explicit insecure mode without a CA', () => {
  process.env.MQTT_DYNSEC_ENABLED = 'false';
  try {
    const input = { host: 'localhost', port: 8883, protocol: 'mqtts', password: null };
    saveBrokerSettings(input);
    let options = brokerClientOptions(loadBrokerSettings());
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.ca, undefined);
    assert.equal(options.protocol, 'mqtts');
    saveBrokerSettings({ ...input, allowInsecureTls: true });
    options = brokerClientOptions(loadBrokerSettings());
    assert.equal(options.rejectUnauthorized, false);
    assert.equal(options.ca, undefined);
    assert.throws(() => saveBrokerSettings({ ...input, host: 'mqtt://localhost' }), /hostname/);
    assert.throws(() => saveBrokerSettings({ ...input, allowInsecureTls: 'false' }), /boolean/);
    assert.throws(() => saveBrokerSettings({ ...input, clientCertFile: '/missing/cert' }), /together/);
  } finally { process.env.MQTT_DYNSEC_ENABLED = 'true'; }
});

test('new devices generate their code and inherit type widgets without copying properties', () => {
  const res = response();
  DeviceController.create({ body: { name: 'Fresh device', code: 'FRESH', device_type_id: 'test', activated: true, owner_id: owner } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.name, 'Fresh device');
  assert.match(res.body.code, /^[a-f0-9-]{36}$/);
  assert.notEqual(res.body.code, 'FRESH');
  assert.equal(res.body.activated, 0);
  assert.equal(res.body.owner_id, null);
  assert.equal(res.body.cloned_from_code, undefined);
  assert.equal(DB.prepare('SELECT properties FROM device_properties WHERE device_code = ?').get(res.body.code).properties, '{}');
  const widgets = require('../src/repositories/deviceTypeWidgetRepository.ts');
  assert.deepEqual(widgets.loadDeviceWidgets(res.body.code), widgets.loadDeviceTypeWidgets('test'));
  for (const name of ['', '   ', 'x'.repeat(129)]) {
    const invalid = response();
    DeviceController.create({ body: { name, device_type_id: 'test' } }, invalid);
    assert.equal(invalid.code, 400);
  }
});

test('linked topics preserve local widget keys, isolate owners, and reject invalid references', () => {
  const { normalizeMqttTopics } = require('../src/services/deviceTypeMqttConfiguration.ts');
  const { syncGeneratedMqttAclRulesForAllDevices } = require('../src/utils/deviceTypeMqtt.ts');
  const { normalizeAllDeviceTypeMqttTopicLinks } = require('../src/utils/deviceTypeMqtt.ts');
  const otherOwner = Number(DB.prepare("INSERT INTO users(email, role, password_hash) VALUES ('linked-other@example.test', 'user', 'fixture-hash')").run().lastInsertRowid);
  const targetTopics = [
    { key: 'reported_state', topic: 'owners/{ownerId}/{deviceTypeId}/{deviceCode}/state', action: 'publish' },
    { key: 'command', topic: 'owners/{ownerId}/{deviceTypeId}/command', action: 'subscribe' },
    { key: 'unscoped', topic: 'devices/{deviceCode}/state', action: 'publish' },
  ];
  DB.prepare("INSERT INTO device_types(id, firmware_version, firmware_build, mqtt_enabled, mqttTopics) VALUES ('link-target', '1', ?, 1, ?)")
    .run(Buffer.alloc(0), JSON.stringify(targetTopics));
  const links = [
    { key: 'monitor', linkedTopic: { deviceTypeId: 'link-target', topicKey: 'reported_state' }, action: 'subscribe' },
    { key: 'control', linkedTopic: { deviceTypeId: 'link-target', topicKey: 'command' }, action: 'publish' },
  ];
  const normalized = normalizeMqttTopics(links, 'link-source');
  assert.equal(JSON.parse(normalized)[0].key, 'monitor');
  DB.prepare("INSERT INTO device_types(id, firmware_version, firmware_build, mqtt_enabled, mqttTopics) VALUES ('link-source', '1', ?, 1, ?)")
    .run(Buffer.alloc(0), normalized);
  const insert = DB.prepare(`INSERT INTO devices (name, code, device_type_id, owner_id, activated, device_secret_hash) VALUES ('Fixture device', ?, ?, ?, 1, ?)`);
  insert.run('LINK-SOURCE', 'link-source', owner, 'x');
  insert.run('LINK-OWN', 'link-target', owner, 'x');
  insert.run('LINK-OTHER', 'link-target', otherOwner, 'x');
  normalizeAllDeviceTypeMqttTopicLinks();
  syncGeneratedMqttAclRulesForAllDevices();
  const resolved = resolveDeviceTypeMqttTopicsForDevice('LINK-SOURCE');
  assert.equal(resolved.find((topic) => topic.key === 'monitor').resolvedTopic, `owners/${owner}/link-target/+/state`);
  assert.equal(resolved.find((topic) => topic.key === 'control').resolvedTopic, `owners/${owner}/link-target/command`);
  syncGeneratedMqttUserAclRulesForUser(owner);
  assert.equal(canUserAccessMqttTopic(owner, 'publish', `owners/${owner}/link-target/LINK-OWN/state`), true);
  assert.equal(canUserAccessMqttTopic(owner, 'publish', `owners/${otherOwner}/link-target/LINK-OTHER/state`), false);
  const broken = (topicKey, action = 'subscribe') => [{ key: 'local', linkedTopic: { deviceTypeId: 'link-target', topicKey }, action }];
  assert.throws(() => normalizeMqttTopics(broken('missing'), 'link-source'), /existing direct topic/);
  assert.throws(() => normalizeMqttTopics(broken('unscoped'), 'link-source'), /ownerId/);
  assert.throws(() => normalizeMqttTopics(broken('reported_state', 'publish'), 'link-source'), /wildcard/);
  assert.throws(() => normalizeMqttTopics([{ key: 'x', topic: 'owners/{ownerId}/#/bad', action: 'publish' }], 'test'), /wildcard/);
  assert.throws(() => normalizeMqttTopics([{ key: 'x', topic: 'devices/prefix{deviceCode}', action: 'publish' }], 'test'), /full/);
  assert.throws(() => normalizeMqttTopics([{ key: 'x', topic: 'devices/{deviceCode}/{unknown}', action: 'publish' }], 'test'), /Unknown/);
});

test('invited users get generated ACL immediately and accepted shares get ACL at first login', async () => {
  const { UsersController } = require('../src/controllers/usersController.ts');
  const { AuthController } = require('../src/controllers/authController.ts');
  const admin = DB.prepare('SELECT * FROM users WHERE email = ?').get(process.env.ADMIN_EMAIL);
  const existingInvite = response();
  UsersController.invite({ user: admin, body: { email: 'invited-admin@example.test', role: 'admin' } }, existingInvite);
  assert.equal(existingInvite.code, 201);
  const invitedAdmin = DB.prepare('SELECT id FROM users WHERE email = ?').get(existingInvite.body.email);
  assert.ok(DB.prepare('SELECT 1 FROM mqtt_user_acl_rules WHERE user_id = ?').get(invitedAdmin.id));

  const invite = response();
  UsersController.invite({ user: admin, body: { email: 'invited-user@example.test', role: 'user' } }, invite);
  const invited = DB.prepare('SELECT id FROM users WHERE email = ?').get(invite.body.email);
  const share = response();
  DeviceController.createShare({ user: { id: owner, role: 'user' }, params: { code: 'A' }, body: { email: invite.body.email } }, share);
  assert.equal(share.code, 201);
  assert.ok(DB.prepare('SELECT 1 FROM mqtt_user_acl_rules WHERE user_id = ? AND source_device_code = ?').get(invited.id, 'A'));
  DB.prepare(`INSERT INTO device_share_invitations(device_code, email, invitation_token, invited_by, expires_at)
    VALUES ('LINK-SOURCE', ?, 'test-pending-share', ?, datetime('now', '+1 day'))`).run(invite.body.email, owner);
  const login = response();
  login.cookie = () => login;
  await AuthController.login({ body: { email: invite.body.email, password: invite.body.temporaryPassword }, headers: {}, secure: true }, login);
  assert.equal(login.code, 200);
  assert.ok(DB.prepare("SELECT 1 FROM device_shares WHERE device_code = 'LINK-SOURCE' AND user_id = ?").get(invited.id));
  assert.ok(DB.prepare("SELECT 1 FROM mqtt_user_acl_rules WHERE source_device_code = 'LINK-SOURCE' AND user_id = ?").get(invited.id));
  const revoked = response();
  DeviceController.removeShare({ user: { id: owner, role: 'user' }, params: { code: 'A', userId: String(invited.id) } }, revoked);
  assert.equal(revoked.code, 200);
  assert.equal(canUserAccessMqttTopic(invited.id, 'subscribe', 'devices/A/telemetry/state'), false);
  const malformed = response();
  await AuthController.login({ body: { email: [], password: {} } }, malformed);
  assert.equal(malformed.code, 400);
});

test('administrator diagnostics read the applied broker ACL without exposing credentials', async () => {
  await service.drain();
  const admin = DB.prepare('SELECT * FROM users WHERE email = ?').get(process.env.ADMIN_EMAIL);
  const path = '/mqtt/admin/dynsec/A/acl';
  const forbidden = await fetch(apiUrl + path, { headers: { Authorization: 'Bearer ' + generateToken({ id: owner }) } });
  assert.equal(forbidden.status, 403);
  await forbidden.text();
  const result = await fetch(apiUrl + path, { headers: { Authorization: 'Bearer ' + generateToken(admin) } });
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.ok(data.expected.length > 0);
  assert.ok(data.applied.length > 0);
  assert.equal(data.clientEnabled, true);
  assert.equal(data.brokerError, undefined);
  assert.ok(!JSON.stringify(data).includes(getMqttDevicePassword('A')));
  assert.ok(!JSON.stringify(data).includes(process.env.MQTT_DYNSEC_PASSWORD));
  const oldHook = await fetch(apiUrl + '/mqtt/acl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(oldHook.status, 404);
});

test('MQTT.js publish delivers JSON content and rejects wildcard publish topics', async () => {
  const monitor = await connectAsync(url, { username: 'dp-backend', password: process.env.MQTT_DYNSEC_BACKEND_PASSWORD,
    clientId: 'test-publish-monitor', protocolVersion: 5, reconnectPeriod: 0 });
  clients.push(monitor);
  monitor.on('error', () => {});
  await monitor.subscribeAsync('devices/A/commands/relay', { qos: 1 });
  const message = once(monitor, 'message');
  const result = await publishForAuthenticatedUser({ topic: 'devices/A/commands/relay', content: { value: true } },
    { id: owner, email: 'device-owner@example.test' });
  assert.equal(result.ok, true);
  const [topic, payload] = await message;
  assert.equal(topic, 'devices/A/commands/relay');
  assert.deepEqual(JSON.parse(payload).content, { value: true });
  const invalid = await publishForAuthenticatedUser({ topic: 'devices/+/commands/relay', content: {} }, { id: owner });
  assert.equal(invalid.status, 400);
});

test('widget API v2 publishes its command without claiming device confirmation and rejects stale edits', async () => {
  const monitor = clients.find((client) => client.options.clientId === 'test-publish-monitor');
  const headers = { Authorization: 'Bearer ' + generateToken({ id: owner }), 'Content-Type': 'application/json' };
  const received = once(monitor, 'message');
  const action = await fetch(apiUrl + '/devices/A/widgets/relay/action', { method: 'POST', headers, body: JSON.stringify({ state: false }) });
  assert.equal(action.status, 200);
  const result = await action.json();
  assert.equal(result.status, 'published');
  assert.equal(Object.hasOwn(result, 'state'), false);
  const [topic, payload] = await received;
  assert.equal(topic, 'devices/A/commands/relay');
  assert.deepEqual(JSON.parse(payload).content, { value: false });
  const admin = DB.prepare('SELECT id FROM users WHERE email = ?').get(process.env.ADMIN_EMAIL);
  const adminHeaders = { Authorization: 'Bearer ' + generateToken(admin), 'Content-Type': 'application/json' };
  const runtime = await (await fetch(apiUrl + '/devices/A/widgets', { headers: adminHeaders })).json();
  assert.equal(runtime.canConfigure, false);
  assert.equal(runtime.configuration, undefined);
  const current = await (await fetch(apiUrl + '/device-types/test/widgets', { headers: adminHeaders })).json();
  assert.equal(current.schemaVersion, 2);
  const retired = await fetch(apiUrl + '/devices/A/widgets', { method: 'PUT', headers: adminHeaders, body: '{}' });
  assert.equal(retired.status, 404);
  await retired.text();
  for (const role of ['user', 'dev']) {
    const id = DB.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get(role)?.id
      || Number(DB.prepare('INSERT INTO users(email, role, password_hash) VALUES (?, ?, ?)').run('widget-dev@example.test', role, 'fixture').lastInsertRowid);
    const deniedHeaders = { ...headers, Authorization: 'Bearer ' + generateToken({ id }) };
    for (const method of ['GET', 'PUT']) {
      const denied = await fetch(apiUrl + '/device-types/test/widgets', { method, headers: deniedHeaders,
        ...(method === 'PUT' ? { body: '{}' } : {}) });
      assert.equal(denied.status, 403);
      await denied.text();
    }
  }
  const body = JSON.stringify({ widgets: current.configuration.widgets, revision: current.configuration.revision });
  const saved = await fetch(apiUrl + '/device-types/test/widgets', { method: 'PUT', headers: adminHeaders, body });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).configuration.revision, current.configuration.revision + 1);
  const stale = await fetch(apiUrl + '/device-types/test/widgets', { method: 'PUT', headers: adminHeaders, body });
  assert.equal(stale.status, 409);
  assert.match((await stale.json()).error, /changed/);
});

function readMqttEvents(reader, onReady = () => {}) {
  let buffer = '';
  const decoder = new TextDecoder();
  return async (predicate) => {
    for (;;) {
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame.split('\n').find((line) => line.startsWith('data: '));
        if (!data) continue;
        const message = JSON.parse(data.slice(6));
        if (frame.startsWith('event: ready\n')) { onReady(message); continue; }
        if (!frame.startsWith('event: mqtt-message\n')) continue;
        if (predicate(message)) return message;
      }
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  };
}

test('realtime stream labels live, retained and cached states and honors explicit deny ACLs', async () => {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 10000);
  const headers = { Authorization: 'Bearer ' + generateToken({ id: owner }) };
  const stream = await fetch(apiUrl + '/mqtt/stream', { signal: abort.signal, headers });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const readiness = [];
  const read = readMqttEvents(reader, (status) => readiness.push(status));
  let cachedReader;
  try {
    const initial = await read((message) => message.topic === 'devices/A/telemetry/state');
    assert.equal(typeof initial.retained, 'boolean');
    assert.ok(initial.retained || initial.cached);
    assert.ok(readiness.some((status) => status.connected === true));
    const firstRule = DB.prepare('SELECT MIN(id) AS id FROM mqtt_user_acl_rules').get().id;
    const denyId = firstRule - 1;
    DB.prepare(`INSERT INTO mqtt_user_acl_rules(id, user_id, action, topic_pattern, permission, source)
      VALUES (?, ?, 'subscribe', 'devices/A/telemetry/state', 'deny', 'manual')`).run(denyId, owner);
    assert.equal(canUserAccessMqttTopic(owner, 'subscribe', 'devices/A/telemetry/state'), false);
    const backend = clients.find((client) => client.options.clientId === 'test-publish-monitor');
    await backend.publishAsync('devices/A/telemetry/state', '{"content":{"deniedMarker":true}}', { qos: 1 });
    await backend.publishAsync('devices/A/telemetry/availability', 'oversizedMarker' + 'x'.repeat(256 * 1024), { qos: 1 });
    await backend.publishAsync('devices/A/telemetry/availability', 'online-test-marker', { qos: 1 });
    const seen = [];
    const live = await read((message) => { seen.push(message); return message.content === 'online-test-marker'; });
    assert.equal(live.retained, false);
    assert.notEqual(live.cached, true);
    assert.ok(!JSON.stringify(seen).includes('deniedMarker'));
    assert.ok(!JSON.stringify(seen).includes('oversizedMarker'));
    DB.prepare('DELETE FROM mqtt_user_acl_rules WHERE id = ?').run(denyId);
    const cached = await fetch(apiUrl + '/mqtt/stream', { signal: abort.signal, headers });
    cachedReader = cached.body.getReader();
    const replayed = await readMqttEvents(cachedReader)((message) => message.content === 'online-test-marker');
    assert.equal(replayed.cached, true);
    assert.equal(replayed.retained, false);
  } finally {
    clearTimeout(timeout);
    await reader.cancel();
    await cachedReader?.cancel();
    abort.abort();
  }
});

test('claiming uses only the generated device code and cannot take an assigned device', () => {
  const create = response();
  DeviceController.create({ body: { name: 'Claimable device', device_type_id: 'test' } }, create);
  assert.equal(create.code, 201);
  const assigned = response();
  DeviceController.create({ body: { name: 'Assigned device', device_type_id: 'test', owner_email: 'device-owner@example.test', activated: false } }, assigned);
  assert.equal(assigned.code, 201);
  assert.equal(assigned.body.owner_id, owner);
  assert.equal(assigned.body.activated, 1);
  const stranger = DB.prepare("SELECT id FROM users WHERE email = 'unrelated@example.test'").get();
  const forbidden = response();
  DeviceController.register({ user: stranger, body: { code: assigned.body.code } }, forbidden);
  assert.equal(forbidden.code, 409);
  const accepted = response();
  DeviceController.register({ user: { id: owner }, body: { code: create.body.code } }, accepted);
  assert.equal(accepted.code, 200);
  assert.equal(DB.prepare('SELECT owner_id FROM devices WHERE code = ?').get(create.body.code).owner_id, owner);
  const repeated = response();
  DeviceController.register({ user: stranger, body: { code: create.body.code } }, repeated);
  assert.equal(repeated.code, 409);
});

test('request logging never logs credentials and malformed cookies do not crash authentication', () => {
  const { logger } = require('../src/middleware/logger.ts');
  const { readAuthToken } = require('../src/utils/authCookie.ts');
  const original = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args.join(' '));
  try {
    logger({ method: 'POST', path: '/auth/login', url: '/auth/login?password=query-secret', body: { password: 'body-secret' } }, {}, () => {});
  } finally { console.log = original; }
  assert.deepEqual(logs, ['[POST] /auth/login']);
  assert.equal(readAuthToken({ headers: { cookie: 'device_portal_session=%E0%A4%A' } }), null);
  assert.equal(readAuthToken({ headers: { cookie: 'bad=%E0%A4%A; device_portal_session=valid-token' } }), 'valid-token');
});

test('TLS connections verify a custom CA, reject untrusted certificates, and support explicit insecure mode', async () => {
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const cert = path.join(temporary, 'test-cert.pem');
  const key = path.join(temporary, 'test-key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost', '-keyout', key, '-out', cert], { stdio: 'ignore' });
  const config = path.join(temporary, 'tls.conf');
  fs.writeFileSync(config, `user ${os.userInfo().username}\nlistener ${port} 127.0.0.1\nallow_anonymous true\ncertfile ${cert}\nkeyfile ${key}\n`);
  const tlsBroker = spawn('mosquitto', ['-c', config], { stdio: ['ignore', 'pipe', 'pipe'] });
  process.env.MQTT_DYNSEC_ENABLED = 'false';
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('TLS broker did not start')), 5000);
      tlsBroker.once('error', reject);
      let output = '';
      tlsBroker.stderr.on('data', (chunk) => {
        output += chunk;
        if (output.includes(' running')) { clearTimeout(timer); resolve(); }
      });
      tlsBroker.once('exit', () => { clearTimeout(timer); reject(new Error('TLS broker stopped')); });
    });
    const input = { host: '127.0.0.1', protocol: 'mqtts', port, password: null };
    saveBrokerSettings(input);
    await assert.rejects(connectAsync(brokerClientOptions(loadBrokerSettings())), /self.signed|certificate/i);
    for (const variant of [{ caFile: cert }, { allowInsecureTls: true }]) {
      saveBrokerSettings({ ...input, ...variant });
      const client = await connectAsync(brokerClientOptions(loadBrokerSettings()));
      assert.equal(client.connected, true);
      await client.endAsync(true);
    }
  } finally {
    process.env.MQTT_DYNSEC_ENABLED = 'true';
    if (tlsBroker.exitCode === null) { const closed = once(tlsBroker, 'exit'); tlsBroker.kill('SIGTERM'); await closed; }
  }
});

test('linked device broker permissions cannot subscribe across owners', async () => {
  await service.drain();
  const device = await connectAsync(url, { username: mqttDeviceUsername('LINK-SOURCE'), password: getMqttDevicePassword('LINK-SOURCE'),
    clientId: 'LINK-SOURCE', protocolVersion: 5, reconnectPeriod: 0 });
  clients.push(device);
  device.on('error', () => {});
  await device.subscribeAsync(`owners/${owner}/link-target/+/state`, { qos: 1 });
  const other = DB.prepare("SELECT owner_id FROM devices WHERE code = 'LINK-OTHER'").get().owner_id;
  await assert.rejects(device.subscribeAsync(`owners/${other}/link-target/+/state`, { qos: 1 }));
  await device.publishAsync(`owners/${owner}/link-target/command`, '{}', { qos: 1 });
  await assert.rejects(device.publishAsync(`owners/${other}/link-target/command`, '{}', { qos: 1 }));
});

test('password changes refresh the current session and revoke older sessions; role changes and reinvites revoke tokens', async () => {
  const { UsersController } = require('../src/controllers/usersController.ts');
  const password = crypto.randomBytes(24).toString('hex');
  const id = Number(createUser('sessions@example.test', password).id);
  const user = DB.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const oldToken = generateToken(user);
  const changed = await fetch(apiUrl + '/auth/change-password', { method: 'POST', headers: {
    Authorization: 'Bearer ' + oldToken, 'Content-Type': 'application/json',
  }, body: JSON.stringify({ currentPassword: password, newPassword: password + '-next' }) });
  assert.equal(changed.status, 200);
  const cookie = changed.headers.get('set-cookie').split(';')[0];
  const expired = await fetch(apiUrl + '/auth/me', { headers: { Authorization: 'Bearer ' + oldToken } });
  assert.equal(expired.status, 401);
  const current = await fetch(apiUrl + '/auth/me', { headers: { Cookie: cookie } });
  assert.equal(current.status, 200);
  const admin = DB.prepare('SELECT * FROM users WHERE email = ?').get(process.env.ADMIN_EMAIL);
  const update = response();
  UsersController.update({ params: { id }, body: { role: 'dev' } }, update);
  assert.equal(update.code, 200);
  const roleRevoked = await fetch(apiUrl + '/auth/me', { headers: { Cookie: cookie } });
  assert.equal(roleRevoked.status, 401);
  const roleToken = generateToken(DB.prepare('SELECT * FROM users WHERE id = ?').get(id));
  const reinvite = response();
  UsersController.invite({ user: admin, body: { email: user.email, role: 'user' } }, reinvite);
  assert.equal(reinvite.code, 201);
  const invitationRevoked = await fetch(apiUrl + '/auth/me', { headers: { Authorization: 'Bearer ' + roleToken } });
  assert.equal(invitationRevoked.status, 401);
});
