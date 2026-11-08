const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-database-'));
process.env.DB_PATH = path.join(directory, 'test.db');
process.env.DOTENV_CONFIG_PATH = path.join(directory, 'unused.env');
process.env.DEVICE_PROPERTIES_ENCRYPTION_KEY = randomBytes(32).toString('hex');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true, preferTsExts: true });
require('tsconfig-paths').register({ baseUrl: path.join(__dirname, '..'), paths: { '@shared/*': ['../shared/*'] } });
const Database = require('better-sqlite3');
const { getTableName } = require('drizzle-orm');
const { DB } = require('../src/config/database.ts');
const { openDatabase } = require('../src/db/openDatabase.ts');
const schema = require('../src/db/schema');
const { createUser } = require('../src/services/userService.ts');
const users = require('../src/repositories/userRepository.ts');
const devices = require('../src/repositories/deviceRepository.ts');
const types = require('../src/repositories/deviceTypeRepository.ts');
const widgets = require('../src/repositories/deviceTypeWidgetRepository.ts');
const shares = require('../src/repositories/deviceShareRepository.ts');
const mqtt = require('../src/repositories/mqttDynsecRepository.ts');
const acls = require('../src/repositories/mqttAclRepository.ts');
const logs = require('../src/repositories/deviceRequestLogRepository.ts');
const settings = require('../src/repositories/settingsRepository.ts');

after(() => { DB.close(); fs.rmSync(directory, { recursive: true, force: true }); });

const owner = users.insertUser({ email: 'owner@example.test', password_hash: 'fixture-hash' }).id;
const reader = users.insertUser({ email: 'reader@example.test', password_hash: 'fixture-hash' }).id;
types.insertDeviceType({ id: 'sensor', firmware_version: '1', firmware_build: Buffer.from('firmware'), mqtt_enabled: 1 });
const replaceWidgets = (code, definitions) => {
  const type = types.findDeviceType(devices.findDevice(code).device_type_id);
  widgets.replaceDeviceTypeWidgets(type.id, definitions, type.widgets_revision);
};
const createDevice = (code) => devices.createDevice({ name: code, code, device_type_id: 'sensor', owner_id: owner, activated: 1, device_secret_hash: 'fixture-hash' });

function sqliteError(code) {
  return (error) => error.code === code || error.cause?.code === code;
}

test('fresh databases match the object schema and reopen without resetting data or rebuilding triggers', () => {
  const filename = path.join(directory, 'reopen.db');
  let connection = openDatabase(filename);
  const tables = connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name).sort();
  assert.deepEqual(tables, Object.values(schema).map(getTableName).sort());
  assert.equal(connection.pragma('foreign_keys', { simple: true }), 1);
  assert.equal(connection.pragma('journal_mode', { simple: true }), 'wal');
  assert.equal(connection.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0);
  connection.prepare("INSERT INTO users(email, password_hash) VALUES ('saved@example.test', 'fixture-hash')").run();
  const triggers = connection.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all();
  assert.equal(triggers.length, 10);
  connection.close();
  connection = openDatabase(filename);
  try {
    assert.equal(connection.prepare('SELECT email FROM users').get().email, 'saved@example.test');
    assert.deepEqual(connection.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all(), triggers);
  } finally { connection.close(); }
});

test('legacy and mismatched databases are rejected without migrating or modifying existing data', () => {
  const filename = path.join(directory, 'legacy.db');
  const legacy = new Database(filename);
  legacy.exec("CREATE TABLE users(email TEXT); INSERT INTO users VALUES ('keep@example.test')");
  legacy.close();
  const before = fs.readFileSync(filename);
  assert.throws(() => openDatabase(filename), /Set DB_PATH to a new database/);
  assert.deepEqual(fs.readFileSync(filename), before);
  const mismatch = path.join(directory, 'mismatch.db');
  const connection = openDatabase(mismatch);
  connection.pragma('user_version = 0');
  connection.close();
  assert.throws(() => openDatabase(mismatch), /schema differs/);
});

test('schema rejects missing credentials, invalid roles, flags, JSON and orphan devices', () => {
  assert.throws(() => DB.prepare("INSERT INTO users(email) VALUES ('invalid@example.test')").run(), sqliteError('SQLITE_CONSTRAINT_NOTNULL'));
  assert.throws(() => DB.prepare("UPDATE users SET role = 'root' WHERE id = ?").run(owner), sqliteError('SQLITE_CONSTRAINT_CHECK'));
  createDevice('VALIDATION');
  assert.throws(() => DB.prepare("UPDATE devices SET mqtt_enabled = 2 WHERE code = 'VALIDATION'").run(), sqliteError('SQLITE_CONSTRAINT_CHECK'));
  assert.throws(() => devices.saveDeviceProperties('VALIDATION', '[]'), sqliteError('SQLITE_CONSTRAINT_CHECK'));
  assert.throws(() => types.updateDeviceType('sensor', { mqttTopics: '{}' }), sqliteError('SQLITE_CONSTRAINT_CHECK'));
  assert.throws(() => devices.createDevice({ name: 'Fixture device', code: 'ORPHAN', device_type_id: 'missing', device_secret_hash: 'fixture-hash' }), sqliteError('SQLITE_CONSTRAINT_FOREIGNKEY'));
  assert.equal(devices.findDevice('ORPHAN'), undefined);
});

test('property saves update the single device row and duplicate device creation preserves its configuration', () => {
  createDevice('PROPERTIES');
  devices.saveDeviceProperties('PROPERTIES', '{"value":{"type":"int","value":1}}');
  devices.saveDeviceProperties('PROPERTIES', '{"value":{"type":"int","value":2}}');
  assert.equal(DB.prepare("SELECT COUNT(*) AS count FROM device_properties WHERE device_code = 'PROPERTIES'").get().count, 1);
  assert.equal(JSON.parse(devices.getDeviceProperties('PROPERTIES').properties).value.value, 2);
  assert.throws(() => DB.prepare("INSERT INTO device_properties(device_code) VALUES ('PROPERTIES')").run(), sqliteError('SQLITE_CONSTRAINT_PRIMARYKEY'));
  assert.throws(() => createDevice('PROPERTIES'), sqliteError('SQLITE_CONSTRAINT_PRIMARYKEY'));
  assert.equal(JSON.parse(devices.getDeviceProperties('PROPERTIES').properties).value.value, 2);
});

test('widget and default-property replacements roll back entirely on a constraint error', () => {
  createDevice('WIDGETS');
  const original = [{ id: 'reading', label: 'Reading', kind: 'value', state: { topicKey: 'telemetry' } }];
  replaceWidgets('WIDGETS', original);
  assert.throws(() => replaceWidgets('WIDGETS', [...original, ...original]), sqliteError('SQLITE_CONSTRAINT_PRIMARYKEY'));
  assert.deepEqual(widgets.loadDeviceWidgets('WIDGETS'), original);
  settings.replaceDefaultProperties({ mode: { type: 'string', value: 'auto' } });
  assert.throws(() => settings.replaceDefaultProperties({ valid: { type: 'int', value: 1 }, broken: { type: 'invalid', value: 2 } }), sqliteError('SQLITE_CONSTRAINT_CHECK'));
  assert.deepEqual(settings.listDefaultProperties().map((p) => p.key), ['mode']);
});

test('device deletion cascades live configuration, retaining logs and the broker deletion job', () => {
  createDevice('DELETE');
  shares.saveDeviceShare('DELETE', reader, owner);
  shares.saveDeviceShareInvitation('DELETE', 'future@example.test', 'token', owner, new Date(Date.now() + 60000).toISOString());
  replaceWidgets('DELETE', [{ id: 'reading', label: 'Reading', kind: 'value', state: { topicKey: 'telemetry' } }]);
  mqtt.saveDeviceCredentials('DELETE', 'encrypted-fixture');
  acls.replaceGeneratedDeviceAclRules('DELETE', [{ device_code: 'DELETE', action: 'publish', topic_pattern: 'devices/DELETE/state', permission: 'allow', priority: 50, source: 'device_type_mqtt', source_key: 'state' }]);
  acls.replaceGeneratedUserAclRules(reader, [{ user_id: reader, action: 'subscribe', topic_pattern: 'devices/DELETE/state', permission: 'allow', source: 'generated_shared_device', source_device_code: 'DELETE', source_key: 'state' }]);
  logs.insertDeviceRequestLog({ event_type: 'device_configuration', method: 'GET', path: '/device/configuration', device_code: 'DELETE' });
  devices.deleteDevice('DELETE');
  assert.equal(devices.getDeviceProperties('DELETE'), undefined);
  assert.deepEqual(widgets.loadDeviceWidgets('DELETE'), []);
  assert.equal(widgets.loadDeviceTypeWidgets('sensor').length, 1);
  assert.deepEqual(widgets.loadDeviceWidgets('WIDGETS'), widgets.loadDeviceTypeWidgets('sensor'));
  assert.deepEqual(shares.listDeviceShares('DELETE'), []);
  assert.deepEqual(shares.listDeviceShareInvitations('DELETE'), []);
  assert.equal(mqtt.getDeviceCredentials('DELETE'), undefined);
  assert.deepEqual(acls.listDeviceAclRules('DELETE'), []);
  assert.deepEqual(acls.listUserAclRules(reader), []);
  assert.ok(mqtt.getDynsecJob('DELETE'));
  assert.equal(logs.listDeviceRequestLogs({ deviceCode: 'DELETE' }).length, 1);
});

test('ACL replacement preserves manual rules and rolls back generated rules on failure', () => {
  createDevice('ACL');
  const rule = { device_code: 'ACL', action: 'publish', topic_pattern: 'devices/ACL/state', permission: 'allow', priority: 50, source: 'device_type_mqtt', source_key: 'state' };
  DB.prepare("INSERT INTO mqtt_acl_rules(device_code, action, topic_pattern, source) VALUES ('ACL', 'subscribe', 'manual/#', 'manual')").run();
  acls.replaceGeneratedDeviceAclRules('ACL', [rule]);
  const before = acls.listDeviceAclRules('ACL');
  assert.throws(() => acls.replaceGeneratedDeviceAclRules('ACL', [rule, { ...rule, action: 'invalid' }]), sqliteError('SQLITE_CONSTRAINT_CHECK'));
  assert.deepEqual(acls.listDeviceAclRules('ACL'), before);
});

test('owner and shared access return one device and never expose credential columns', () => {
  createDevice('ACCESS');
  shares.saveDeviceShare('ACCESS', owner, owner);
  shares.saveDeviceShare('ACCESS', reader, owner);
  assert.equal(devices.listAccessibleMqttDevices(owner, 'user').filter((d) => d.code === 'ACCESS').length, 1);
  assert.equal(devices.canAccessDevice(reader, 'user', 'ACCESS'), true);
  assert.equal(devices.isDeviceOwner(reader, 'ACCESS'), false);
  const device = devices.listDevicesForUser(reader, 'user').find((d) => d.code === 'ACCESS');
  assert.equal(device.device_properties, null);
  assert.equal(Object.hasOwn(device, 'device_secret_hash'), false);
  assert.equal(Object.hasOwn(users.getUserSession(owner), 'password_hash'), false);
  assert.equal(Object.hasOwn(users.listUsers()[0], 'password_hash'), false);
});

test('log ordering is deterministic and uses indexes for timestamp and device filters', () => {
  const insert = DB.prepare("INSERT INTO device_request_logs(created_at, event_type, method, path, device_code) VALUES (?, 'ota_version', 'GET', '/ota/firmware/version', 'LOGS')");
  const older = Number(insert.run('2026-11-06 12:00:00').lastInsertRowid);
  const first = Number(insert.run('2026-11-06 12:01:00').lastInsertRowid);
  const second = Number(insert.run('2026-11-06 12:01:00').lastInsertRowid);
  assert.deepEqual(logs.listDeviceRequestLogs({ deviceCode: 'LOGS', limit: 2 }).map((r) => r.id), [second, first]);
  assert.ok(logs.listDeviceRequestLogs({ eventType: 'ota_version' }).some((r) => r.id === older));
  for (const where of ['', "WHERE device_code = 'LOGS'", "WHERE event_type = 'ota_version'"]) {
    const plan = DB.prepare(`EXPLAIN QUERY PLAN SELECT * FROM device_request_logs ${where} ORDER BY created_at DESC, id DESC LIMIT 100`).all();
    assert.ok(!plan.some((r) => r.detail.includes('TEMP B-TREE')), JSON.stringify(plan));
  }
});

test('user creation normalizes email and retains the duplicate-email error contract', () => {
  createUser(' Duplicate@Example.Test ', 'fixture-password');
  assert.ok(users.findUserByEmail('duplicate@example.test'));
  assert.throws(() => createUser('duplicate@example.test', 'fixture-password'), /EMAIL_EXISTS/);
});
