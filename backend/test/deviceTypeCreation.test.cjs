const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-type-creation-'));
process.env.DB_PATH = path.join(directory, 'test.db');
process.env.DOTENV_CONFIG_PATH = path.join(directory, 'unused.env');
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.MQTT_DYNSEC_ENABLED = 'false';
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true, preferTsExts: true });
require('tsconfig-paths').register({ baseUrl: path.join(__dirname, '..'), paths: { '@shared/*': ['../shared/*'] } });
const express = require('express');
const { DB } = require('../src/config/database.ts');
const { insertUser } = require('../src/repositories/userRepository.ts');
const types = require('../src/repositories/deviceTypeRepository.ts');
const widgets = require('../src/repositories/deviceTypeWidgetRepository.ts');
const { createDevice } = require('../src/repositories/deviceRepository.ts');
const { generateToken } = require('../src/utils/jwt.ts');
const admin = insertUser({ email: 'admin@example.test', role: 'admin', password_hash: 'fixture' });
const user = insertUser({ email: 'owner@example.test', password_hash: 'fixture' });
const dev = insertUser({ email: 'dev@example.test', role: 'dev', password_hash: 'fixture' });
const firmware = Buffer.from('source-firmware');
const properties = { threshold: { type: 'int', defaultValue: 20 }, password: { type: 'string', sensitive: true } };
const globals = { mode: { type: 'string', global: true, value: 'auto' } };
const topics = [
  { key: 'telemetry', action: 'publish', topic: 'devices/{deviceCode}/telemetry/#' },
  { key: 'command', action: 'subscribe', topic: 'owners/{ownerId}/{deviceTypeId}/command' },
  { key: 'mirror', action: 'publish', linkedTopic: { deviceTypeId: 'source', topicKey: 'command' } },
];
const definitions = [
  { id: 'temperature', kind: 'value', label: 'Temperature', state: { topicKey: 'telemetry', topicSuffix: 'state', path: '/temperature' } },
  { id: 'relay', kind: 'button', label: 'Relay', command: { topicKey: 'command', mode: 'value', value: true } },
];
types.insertDeviceType({ id: 'source', description: 'Source type', firmware_version: '1.2.3', firmware_build: firmware,
  mqtt_enabled: 1, deviceProperties: JSON.stringify(properties), genericProperties: JSON.stringify(globals), mqttTopics: JSON.stringify(topics) });
widgets.replaceDeviceTypeWidgets('source', definitions, 0);
createDevice({ code: 'EXISTING', name: 'Existing device', device_type_id: 'source', owner_id: user.id, activated: 1, device_secret_hash: 'fixture' });
let server, baseUrl;
before(async () => {
  const app = express();
  app.use('/device-types', require('../src/routes/deviceTypeRoutes.ts').default);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  const closed = new Promise((resolve) => server.close(resolve));
  server.closeAllConnections();
  await closed;
  DB.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
function request(fields, actor = admin, file) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  if (file) body.append('firmware_build', new Blob([file]), 'firmware.bin');
  return fetch(baseUrl + '/device-types', { method: 'POST', headers: actor ? { Authorization: 'Bearer ' + generateToken(actor) } : {}, body });
}

test('clones the full Device Type without moving devices, and keeps widgets and firmware independent', async () => {
  const response = await request({ id: 'copy', clone_from_type_id: 'source' });
  assert.equal(response.status, 201);
  const copy = await response.json();
  assert.equal(copy.id, 'copy');
  assert.equal(copy.description, 'Source type');
  assert.equal(copy.mqtt_enabled, 1);
  assert.equal(copy.firmware_version, '1.2.3');
  assert.deepEqual(types.getFirmware('copy').fb, firmware);
  assert.deepEqual(JSON.parse(copy.deviceProperties), properties);
  assert.deepEqual(JSON.parse(copy.genericProperties), globals);
  assert.equal(JSON.parse(copy.mqttTopics).find((topic) => topic.key === 'mirror').linkedTopic.deviceTypeId, 'copy');
  assert.deepEqual(widgets.loadDeviceTypeWidgets('copy'), definitions);
  assert.equal(DB.prepare("SELECT COUNT(*) AS count FROM devices WHERE device_type_id = 'copy'").get().count, 0);
  assert.equal(DB.prepare("SELECT device_type_id FROM devices WHERE code = 'EXISTING'").get().device_type_id, 'source');
  widgets.replaceDeviceTypeWidgets('copy', [{ ...definitions[0], label: 'Changed in copy' }], copy.widgets_revision);
  assert.deepEqual(widgets.loadDeviceTypeWidgets('source'), definitions);
  types.updateDeviceType('copy', { genericProperties: '{}', mqtt_enabled: 0 });
  assert.equal(types.findDeviceType('source').mqtt_enabled, 1);
  assert.deepEqual(JSON.parse(types.findDeviceType('source').genericProperties), globals);
});

test('cloning can override description and firmware without changing the source', async () => {
  const replacement = Buffer.from('replacement-firmware');
  const response = await request({ id: 'with-firmware', clone_from_type_id: 'source', description: 'New description', firmware_version: '2.0.0' }, admin, replacement);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).description, 'New description');
  assert.deepEqual(types.getFirmware('with-firmware'), { fb: replacement, fv: '2.0.0' });
  assert.deepEqual(types.getFirmware('source'), { fb: firmware, fv: '1.2.3' });
});

test('invalid, duplicate and unauthorized type clones create no partial records', async () => {
  const count = DB.prepare('SELECT COUNT(*) AS count FROM device_types').get().count;
  for (const [fields, status] of [
    [{ id: ' ', clone_from_type_id: 'source' }, 400],
    [{ id: 'source', clone_from_type_id: 'source' }, 409],
    [{ id: 'missing-source', clone_from_type_id: 'missing' }, 404],
    [{ id: 'empty-source', clone_from_type_id: '' }, 400],
  ]) assert.equal((await request(fields)).status, status);
  assert.equal((await request({ id: 'missing-version', clone_from_type_id: 'source' }, admin, Buffer.from('new'))).status, 400);
  assert.equal((await request({ id: 'unauthenticated', clone_from_type_id: 'source' }, null)).status, 401);
  for (const actor of [user, dev]) assert.equal((await request({ id: 'forbidden', clone_from_type_id: 'source' }, actor)).status, 403);
  assert.equal(DB.prepare('SELECT COUNT(*) AS count FROM device_types').get().count, count);
});

test('a failed widget copy rolls back the entire new type', async () => {
  DB.exec("CREATE TRIGGER reject_widget_copy BEFORE INSERT ON device_type_widgets WHEN NEW.device_type_id = 'failed-copy' BEGIN SELECT RAISE(ABORT, 'fixture copy failure'); END");
  try {
    assert.equal((await request({ id: 'failed-copy', clone_from_type_id: 'source' })).status, 500);
    assert.equal(types.findDeviceType('failed-copy'), undefined);
    assert.deepEqual(widgets.loadDeviceTypeWidgets('failed-copy'), []);
    assert.deepEqual(widgets.loadDeviceTypeWidgets('source'), definitions);
  } finally { DB.exec('DROP TRIGGER reject_widget_copy'); }
});

test('empty type creation still works without a clone source', async () => {
  const response = await request({ id: 'empty', description: 'Empty type' });
  assert.equal(response.status, 201);
  const empty = await response.json();
  assert.equal(empty.mqtt_enabled, 0);
  assert.equal(empty.firmware_version, '0.0.0');
  assert.deepEqual(types.getFirmware('empty').fb, Buffer.alloc(0));
  assert.deepEqual(widgets.loadDeviceTypeWidgets('empty'), []);
});


test('enabling MQTT generates editable telemetry and commands, preserving admin choices', async () => {
  const response = await request({ id: 'mqtt-on', mqtt_enabled: 'true' });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.mqtt_enabled, 1);
  const defaults = JSON.parse(created.mqttTopics);
  assert.deepEqual(defaults.map((topic) => topic.key), ['telemetry', 'commands']);
  assert.ok(defaults.every((topic) => topic.topic.endsWith('/#')));
  assert.equal(defaults.some((topic) => topic.key === 'state'), false);
  const setMqtt = (id, body) => fetch(baseUrl + '/device-types/' + id + '/mqtt', { method: 'PUT', headers: {
    Authorization: 'Bearer ' + generateToken(admin), 'Content-Type': 'application/json',
  }, body: JSON.stringify(body) });
  const enabled = await setMqtt('empty', { mqtt_enabled: true });
  assert.equal(enabled.status, 200);
  assert.deepEqual(JSON.parse((await enabled.json()).mqttTopics).map((topic) => topic.key), ['telemetry', 'commands']);
  const custom = defaults.map((topic) => topic.key === 'telemetry' ? { ...topic, topic: 'devices/{deviceCode}/signals/#' } : topic);
  assert.equal((await setMqtt('mqtt-on', { mqtt_enabled: true, mqttTopics: custom })).status, 200);
  assert.equal((await setMqtt('mqtt-on', { mqtt_enabled: false, mqttTopics: 'invalid draft' })).status, 200);
  assert.equal((await setMqtt('mqtt-on', { mqtt_enabled: true })).status, 200);
  assert.equal(JSON.parse(types.findDeviceType('mqtt-on').mqttTopics).find((topic) => topic.key === 'telemetry').topic, 'devices/{deviceCode}/signals/#');
  const beforeInvalid = types.findDeviceType('mqtt-on').mqttTopics;
  for (const path of ['devices/{ownerID}/{deviceCode}/sensors', 'devices/{deviceCode/telemetry/#', 'devices/{{deviceCode}}/telemetry/#']) {
    const invalid = await setMqtt('mqtt-on', { mqtt_enabled: true, mqttTopics: [{ key: 'broken', topic: path, action: 'publish' }] });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /Unknown|Unbalanced/);
    assert.equal(types.findDeviceType('mqtt-on').mqttTopics, beforeInvalid);
  }
  assert.equal((await request({ id: 'bad-mqtt', mqtt_enabled: 'maybe' })).status, 400);
  assert.equal(types.findDeviceType('bad-mqtt'), undefined);
});
