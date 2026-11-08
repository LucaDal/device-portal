const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-device-creation-'));
process.env.DB_PATH = path.join(directory, 'test.db');
process.env.DOTENV_CONFIG_PATH = path.join(directory, 'unused.env');
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.DEVICE_PROPERTIES_ENCRYPTION_KEY = randomBytes(32).toString('hex');
process.env.MQTT_DYNSEC_ENABLED = 'false';
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true, preferTsExts: true });
require('tsconfig-paths').register({ baseUrl: path.join(__dirname, '..'), paths: { '@shared/*': ['../shared/*'] } });
const express = require('express');
const { DB } = require('../src/config/database.ts');
const { insertUser } = require('../src/repositories/userRepository.ts');
const { insertDeviceType } = require('../src/repositories/deviceTypeRepository.ts');
const { findDevice } = require('../src/repositories/deviceRepository.ts');
const { generateToken } = require('../src/utils/jwt.ts');
const { hashDeviceSecret, verifyDeviceSecret } = require('../src/utils/deviceSecrets.ts');
const admin = insertUser({ email: 'admin@example.test', role: 'admin', password_hash: 'fixture' });
const owner = insertUser({ email: 'owner@example.test', password_hash: 'fixture' });
const other = insertUser({ email: 'other@example.test', password_hash: 'fixture' });
insertDeviceType({ id: 'sensor', firmware_version: '1', firmware_build: Buffer.alloc(0), mqtt_enabled: 1,
  genericProperties: JSON.stringify({ mode: { type: 'string', value: 'factory' } }),
  deviceProperties: JSON.stringify({ threshold: { type: 'int' }, password: { type: 'string', sensitive: true } }),
  mqttTopics: JSON.stringify([{ key: 'reported', topic: 'devices/{deviceCode}/state', action: 'publish' }]),
});
let server, baseUrl;
before(async () => {
  const app = express();
  app.use('/devices', express.json(), require('../src/routes/deviceRoutes.ts').default);
  app.use('/device', require('../src/routes/deviceProvisioningRoutes.ts').default);
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

function request(url, actor, method = 'GET', body) {
  return fetch(baseUrl + url, { method, headers: {
    'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + generateToken(actor) } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function create(body = {}) {
  const response = await request('/devices', admin, 'POST', { name: 'Room sensor', device_type_id: 'sensor', ...body });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return response.json();
}

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

test('creation generates the code, assigns a registered email and activates without an Activate field', async () => {
  const device = await create({ name: '  Living room / #1  ', owner_email: ' OWNER@EXAMPLE.TEST ', activated: false, code: 'caller-code' });
  assert.equal(device.name, 'Living room / #1');
  assert.match(device.code, uuid);
  assert.notEqual(device.code, 'caller-code');
  assert.equal(device.owner_id, owner.id);
  assert.equal(device.owner_email, 'owner@example.test');
  assert.equal(device.activated, 1);
  const stored = findDevice(device.code);
  assert.equal(stored.name, device.name);
  assert.equal(stored.device_secret_hash, hashDeviceSecret(device.secret_code));
  assert.equal(verifyDeviceSecret(device.secret_code, stored.device_secret_hash), true);
  assert.notEqual(stored.device_secret_hash, device.secret_code);
  for (const name of ['', '   ', ' '.repeat(200) + 'x']) {
    assert.throws(() => DB.prepare('UPDATE devices SET name = ? WHERE code = ?').run(name, device.code),
      (error) => error.code === 'SQLITE_CONSTRAINT_CHECK');
  }
  const visible = await (await request('/devices', owner)).json();
  const row = visible.find((item) => item.code === device.code);
  assert.equal(row.name, device.name);
  assert.equal(Object.hasOwn(row, 'secret_code'), false);
  assert.equal(Object.hasOwn(row, 'device_secret_hash'), false);
  const regenerate = await request(`/devices/${device.code}/secret-code/regenerate`, admin, 'POST', {});
  assert.equal(regenerate.status, 404);
});

test('devices without an email remain unassigned and inactive; names do not control their identity', async () => {
  const first = await create({ activated: true, owner_id: owner.id });
  const second = await create({ owner_email: '  ' });
  assert.equal(first.owner_id, null);
  assert.equal(first.activated, 0);
  assert.equal(second.owner_id, null);
  assert.equal(second.activated, 0);
  assert.match(first.code, uuid);
  assert.match(second.code, uuid);
  assert.notEqual(first.code, second.code);
  assert.notEqual(first.secret_code, second.secret_code);
});

test('invalid names, types and owner emails are rejected without creating partial devices', async () => {
  const before = DB.prepare('SELECT COUNT(*) AS count FROM devices').get().count;
  for (const body of [
    { name: '' }, { name: '   ' }, { name: 'x'.repeat(129) }, { name: [] },
    { device_type_id: '' }, { device_type_id: 'missing' },
    { owner_email: 'missing@example.test' }, { owner_email: 'invalid' }, { owner_email: [] },
  ]) {
    const response = await request('/devices', admin, 'POST', { name: 'Room sensor', device_type_id: 'sensor', ...body });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(Object.hasOwn(await response.json(), 'secret_code'), false);
  }
  assert.equal(DB.prepare('SELECT COUNT(*) AS count FROM devices').get().count, before);
  assert.equal((await request('/devices', owner, 'POST', { name: 'Denied', device_type_id: 'sensor' })).status, 403);
  assert.equal((await request('/devices', undefined, 'POST', { name: 'Denied', device_type_id: 'sensor' })).status, 401);
});

test('Add device needs only the public code and never changes an existing assignment', async () => {
  const device = await create();
  const hash = findDevice(device.code).device_secret_hash;
  const accepted = await request('/devices/register', owner, 'POST', { code: ' ' + device.code + ' ' });
  assert.equal(accepted.status, 200);
  assert.equal(findDevice(device.code).owner_id, owner.id);
  assert.equal(findDevice(device.code).activated, 1);
  assert.equal(findDevice(device.code).device_secret_hash, hash);
  assert.equal(Object.hasOwn(await accepted.json(), 'secret_code'), false);
  assert.equal((await request('/devices/register', other, 'POST', { code: device.code })).status, 409);
  assert.equal((await request('/devices/register', owner, 'POST', { code: device.code })).status, 409);
  assert.equal(findDevice(device.code).owner_id, owner.id);
  assert.equal((await request('/devices/register', owner, 'POST', { code: 'missing' })).status, 404);
  for (const code of [undefined, '', '   ', []]) assert.equal((await request('/devices/register', owner, 'POST', { code })).status, 400);
});

test('competing claims have one winner and an email-assigned device cannot be acquired by another user', async () => {
  const device = await create();
  const results = await Promise.all([owner, other].map((actor) => request('/devices/register', actor, 'POST', { code: device.code })));
  assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
  const winner = results[0].status === 200 ? owner : other;
  assert.equal(findDevice(device.code).owner_id, winner.id);
  const assigned = await create({ owner_email: 'owner@example.test' });
  assert.equal((await request('/devices/register', other, 'POST', { code: assigned.code })).status, 409);
  assert.equal(findDevice(assigned.code).owner_id, owner.id);
});

test('the physical device still needs its private secret after an account adds it by code', async () => {
  const device = await create();
  assert.equal((await request('/devices/register', owner, 'POST', { code: device.code })).status, 200);
  for (const secret of [undefined, 'wrong']) {
    const response = await fetch(baseUrl + '/device/configuration', { headers: { 'x-device-code': device.code,
      ...(secret ? { 'x-device-secret': secret } : {}), Authorization: 'Bearer ' + generateToken(owner) } });
    assert.equal(response.status, 401);
  }
  const response = await fetch(baseUrl + '/device/configuration', { headers: { 'x-device-code': device.code, 'x-device-secret': device.secret_code } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mode, 'factory');
});


test('devices cannot be cloned: callers must clone a Device Type instead', async () => {
  const source = await create();
  const count = DB.prepare('SELECT COUNT(*) AS count FROM devices').get().count;
  for (const clone_from_code of [source.code, 'missing', false]) {
    const result = await request('/devices', admin, 'POST', { name: 'Rejected clone', device_type_id: 'sensor', clone_from_code });
    assert.equal(result.status, 400);
    assert.match((await result.json()).error, /Device Type/);
  }
  assert.equal(DB.prepare('SELECT COUNT(*) AS count FROM devices').get().count, count);
});
