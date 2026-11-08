const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

// Import the real controller against an isolated database, never the runtime DB or .env.
const testDirectory = mkdtempSync(path.join(tmpdir(), 'device-properties-access-'));
process.env.DB_PATH = path.join(testDirectory, 'test.db');
process.env.DOTENV_CONFIG_PATH = path.join(testDirectory, 'unused.env');
process.env.ADMIN_EMAIL = 'admin-properties@example.test';
process.env.ADMIN_PASSWORD = randomBytes(24).toString('hex');
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.DEVICE_PROPERTIES_ENCRYPTION_KEY = randomBytes(32).toString('hex');

require('ts-node').register({
  project: path.join(__dirname, '../tsconfig.json'),
  transpileOnly: true,
  preferTsExts: true,
});
require('tsconfig-paths').register({
  baseUrl: path.join(__dirname, '..'),
  paths: { '@shared/*': ['../shared/*'] },
});

const { DB } = require('../src/config/database.ts');
require('../src/config/bootstrap.ts').ensureAdminUser();
const { DeviceController } = require('../src/controllers/deviceController.ts');
const {
  encryptSensitiveDeviceProperties,
} = require('../src/utils/devicePropertiesSecurity.ts');

after(() => {
  DB.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

const adminId = DB.prepare('SELECT id FROM users WHERE email = ?')
  .get(process.env.ADMIN_EMAIL).id;
const insertUser = DB.prepare("INSERT INTO users (email, role, password_hash) VALUES (?, ?, 'fixture-hash')");
const ownerId = Number(insertUser.run('owner@example.test', 'user').lastInsertRowid);
const sharedId = Number(insertUser.run('shared@example.test', 'user').lastInsertRowid);
const developerId = Number(insertUser.run('developer@example.test', 'dev').lastInsertRowid);
const strangerId = Number(insertUser.run('stranger@example.test', 'user').lastInsertRowid);

const definitions = {
  enabled: { type: 'bool' },
  password: { type: 'string', sensitive: true },
  hidden: { type: 'string', visible: false },
};
const savedProperties = encryptSensitiveDeviceProperties({
  enabled: { type: 'bool', value: false },
  password: { type: 'string', value: 'fixture-secret' },
  hidden: { type: 'string', value: 'internal-value' },
}, definitions);

DB.prepare(`
  INSERT INTO device_types (id, firmware_version, firmware_build, deviceProperties, genericProperties)
  VALUES (?, ?, ?, ?, ?)
`).run('fixture-type', '1.0', Buffer.alloc(0), JSON.stringify(definitions), JSON.stringify({ globalOnly: { type: 'string', value: 'type-only' } }));

const insertDevice = DB.prepare(`
  INSERT INTO devices (name, code, device_type_id, owner_id, device_secret_hash) VALUES ('Fixture device', ?, 'fixture-type', ?, 'fixture-hash')
`);
insertDevice.run('OWNED', ownerId);
insertDevice.run('EMPTY', ownerId);
insertDevice.run('UNASSIGNED', null);

const insertProperties = DB.prepare(`
  INSERT INTO device_properties (device_code, properties) VALUES (?, ?)
`);
insertProperties.run('OWNED', JSON.stringify(savedProperties));
insertProperties.run('UNASSIGNED', JSON.stringify(savedProperties));

const insertShare = DB.prepare(`
  INSERT INTO device_shares (device_code, user_id, shared_by) VALUES ('OWNED', ?, ?)
`);
insertShare.run(sharedId, ownerId);
insertShare.run(developerId, ownerId);

function listDevices(id, role) {
  let result;
  DeviceController.list({ user: { id, role } }, {
    json(value) { result = value; },
  });
  return result;
}

function assertVisibleProperties(row) {
  const properties = JSON.parse(row.device_properties);
  assert.equal(properties.enabled.value, false);
  assert.equal(properties.password.value, 'fixture-secret');
  assert.equal(properties.password.encrypted, false);
  assert.equal(properties.hidden.value, 'internal-value');
  assert.equal(JSON.parse(row.type_deviceProperties).hidden.visible, undefined);
  assert.deepEqual(JSON.parse(row.type_genericProperties), {});
}

test('admin reads properties of owned-by-others and unassigned devices', () => {
  const rows = listDevices(adminId, 'admin');
  assert.equal(rows.length, 3);
  assertVisibleProperties(rows.find((row) => row.code === 'OWNED'));
  assertVisibleProperties(rows.find((row) => row.code === 'UNASSIGNED'));
});

test('owner keeps access to properties without gaining access to other devices', () => {
  const rows = listDevices(ownerId, 'user');
  assert.deepEqual(rows.map((row) => row.code), ['EMPTY', 'OWNED']);
  assertVisibleProperties(rows.find((row) => row.code === 'OWNED'));
});

test('authorized readers receive an empty object when properties have not been saved', () => {
  for (const [id, role] of [[adminId, 'admin'], [ownerId, 'user']]) {
    const row = listDevices(id, role).find((row) => row.code === 'EMPTY');
    assert.equal(row.device_properties, '{}');
  }
});

test('shared users and developers see the device but not its property values', () => {
  for (const [id, role] of [[sharedId, 'user'], [developerId, 'dev']]) {
    const rows = listDevices(id, role);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].code, 'OWNED');
    assert.equal(rows[0].is_shared, 1);
    assert.equal(rows[0].device_properties, null);
  }
});

test('unrelated users and users without the admin role have no expanded access', () => {
  assert.deepEqual(listDevices(strangerId, 'user'), []);
  assert.deepEqual(listDevices(adminId, 'user'), []);
});
