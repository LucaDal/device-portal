const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const directory = mkdtempSync(path.join(tmpdir(), 'mqtt-settings-'));
process.env.DB_PATH = path.join(directory, 'test.db');
process.env.DOTENV_CONFIG_PATH = path.join(directory, 'unused.env');
process.env.ADMIN_EMAIL = 'mqtt-settings@example.test';
process.env.ADMIN_PASSWORD = randomBytes(24).toString('hex');
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.DEVICE_PROPERTIES_ENCRYPTION_KEY = randomBytes(32).toString('hex');
process.env.MQTT_DYNSEC_ENABLED = 'false';

require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true, preferTsExts: true });
require('tsconfig-paths').register({ baseUrl: path.join(__dirname, '..'), paths: { '@shared/*': ['../shared/*'] } });
const { DB } = require('../src/config/database.ts');
require('../src/config/bootstrap.ts').ensureAdminUser();
const { SettingsController } = require('../src/controllers/settingsController.ts');
const { brokerSettingsView, loadBrokerSettings, saveBrokerSettings } = require('../src/utils/mqttBrokerSettings.ts');
const input = { host: 'localhost', port: 8883, protocol: 'mqtts', username: 'portal' };

after(() => {
  DB.close();
  rmSync(directory, { recursive: true, force: true });
});

function store(password) {
  DB.prepare('INSERT OR REPLACE INTO app_settings(key, value) VALUES (?, ?)')
    .run('mqtt_broker_settings', JSON.stringify({ ...input, password }));
}

test('settings remain readable with unsupported or damaged credentials, without exposing or accepting them', () => {
  for (const password of ['old-plaintext-password', 'v1:damaged:credential:payload']) {
    store(password);
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, send(body) { this.body = body; } };
    SettingsController.getMqttBrokerSettings({}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.host, input.host);
    assert.equal(res.body.passwordSet, true);
    assert.ok(res.body.passwordError);
    assert.equal(res.body.password, undefined);
    assert.ok(!JSON.stringify(res.body).includes(password));
    assert.throws(() => loadBrokerSettings(), /Enter a new password or remove it/);
    assert.throws(() => saveBrokerSettings(input), /Enter a new password or remove it/);
  }
});

test('replacing or explicitly removing an unreadable password repairs the configuration', () => {
  store('unsupported-password');
  const password = randomBytes(32).toString('hex');
  const saved = saveBrokerSettings({ ...input, password });
  assert.equal(saved.passwordError, undefined);
  assert.equal(saved.password, undefined);
  assert.equal(loadBrokerSettings().password, password);
  assert.ok(!DB.prepare('SELECT value FROM app_settings WHERE key = ?').get('mqtt_broker_settings').value.includes(password));

  const key = process.env.DEVICE_PROPERTIES_ENCRYPTION_KEY;
  process.env.DEVICE_PROPERTIES_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  try { assert.ok(brokerSettingsView().passwordError); }
  finally { process.env.DEVICE_PROPERTIES_ENCRYPTION_KEY = key; }

  store('unsupported-password');
  const cleared = saveBrokerSettings({ ...input, password: null });
  assert.equal(cleared.passwordSet, false);
  assert.equal(cleared.passwordError, undefined);
  assert.equal(loadBrokerSettings().password, '');
});

test('managed settings can be viewed without loading deployment credentials', () => {
  process.env.MQTT_DYNSEC_ENABLED = 'true';
  process.env.MQTT_DYNSEC_BACKEND_PASSWORD_FILE = path.join(directory, 'missing-secret');
  try {
    assert.equal(brokerSettingsView().managed, true);
    assert.equal(brokerSettingsView().password, undefined);
    assert.throws(() => loadBrokerSettings());
  } finally {
    process.env.MQTT_DYNSEC_ENABLED = 'false';
    delete process.env.MQTT_DYNSEC_BACKEND_PASSWORD_FILE;
  }
});
