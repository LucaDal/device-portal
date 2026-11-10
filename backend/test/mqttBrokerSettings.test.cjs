const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mqtt-settings-'));
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true, preferTsExts: true });
require('tsconfig-paths').register({ baseUrl: path.join(__dirname, '..'), paths: { '@shared/*': ['../shared/*'] } });
const { SettingsController } = require('../src/controllers/settingsController.ts');
const { brokerSettingsView, loadBrokerSettings, brokerClientOptions } = require('../src/utils/mqttBrokerSettings.ts');
const { getPublicMqttEndpoint } = require('../src/utils/mqttConfiguration.ts');
const names = ['MQTT_BROKER_URL', 'MQTT_BROKER_USERNAME', 'MQTT_BROKER_PASSWORD', 'MQTT_BROKER_PASSWORD_FILE',
  'MQTT_BROKER_CA_FILE', 'MQTT_BROKER_CLIENT_CERT_FILE', 'MQTT_BROKER_CLIENT_KEY_FILE',
  'MQTT_DYNSEC_ENABLED', 'MQTT_PUBLIC_HOST', 'MQTT_PUBLIC_PORT'];
function environment(values, action) {
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, values);
  try { return action(); }
  finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}
after(() => fs.rmSync(directory, { recursive: true, force: true }));

test('an absent environment endpoint leaves MQTT unconfigured without consulting a database', () => environment({}, () => {
  assert.equal(loadBrokerSettings(), null);
  assert.deepEqual(brokerSettingsView(), { connection: null, passwordSet: false, dynamicSecurity: false, publicEndpoint: null });
}));

test('runtime and read-only Settings use the same environment and never expose the password', () => environment({
  MQTT_BROKER_URL: 'mqtts://broker.env.test:9883', MQTT_BROKER_USERNAME: 'portal',
  MQTT_BROKER_PASSWORD: 'external-password', MQTT_PUBLIC_HOST: 'mqtt.env.test',
}, () => {
  const runtime = loadBrokerSettings();
  const view = brokerSettingsView();
  assert.equal(runtime.host, 'broker.env.test');
  assert.equal(runtime.port, 9883);
  assert.equal(runtime.protocol, 'mqtts');
  assert.equal(runtime.username, 'portal');
  assert.equal(runtime.password, 'external-password');
  for (const key of ['host', 'port', 'protocol', 'username', 'caFile', 'clientCertFile', 'clientKeyFile']) {
    assert.equal(view.connection[key], runtime[key]);
  }
  assert.deepEqual(view.publicEndpoint, { host: 'mqtt.env.test', port: 8883, protocol: 'mqtts' });
  assert.equal(view.passwordSet, true);
  assert.ok(!JSON.stringify(view).includes('external-password'));
  assert.equal(brokerClientOptions(runtime).rejectUnauthorized, true);
}));

test('Settings remain readable when a configured secret file cannot be read', () => environment({
  MQTT_BROKER_URL: 'mqtt://mosquitto:1883', MQTT_BROKER_PASSWORD_FILE: path.join(directory, 'missing'),
}, () => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, send(body) { this.body = body; } };
  SettingsController.getMqttBrokerSettings({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.connection.host, 'mosquitto');
  assert.equal(res.body.passwordSet, true);
  assert.equal(res.body.password, undefined);
  assert.throws(() => loadBrokerSettings(), /ENOENT/);
}));

test('password files take precedence and Dynamic Security preserves its minimum secret length', () => {
  const filename = path.join(directory, 'password');
  fs.writeFileSync(filename, 'external-password\n', { mode: 0o600 });
  environment({ MQTT_BROKER_URL: 'mqtt://broker', MQTT_BROKER_PASSWORD_FILE: filename, MQTT_BROKER_PASSWORD: 'ignored' }, () => {
    assert.equal(loadBrokerSettings().password, 'external-password');
    process.env.MQTT_DYNSEC_ENABLED = 'true';
    assert.throws(() => loadBrokerSettings(), /at least 32 characters/);
  });
});

test('invalid endpoints reject credentials, unsupported transports, paths and query parameters without leaking secrets', () => {
  for (const url of ['https://broker', 'mqtt://user:private-password@broker', 'mqtt://broker/topic',
    'mqtt://broker?password=private-password', 'mqtt://broker#topic', 'mqtt://broker:65536', 'mqtt://bad host', 'not a URL']) {
    environment({ MQTT_BROKER_URL: url }, () => {
      assert.throws(() => loadBrokerSettings(), error => /MQTT_BROKER_URL/.test(error.message) && !error.message.includes('private-password'));
    });
  }
});

test('endpoint defaults and IPv6 addresses produce usable client options', () => {
  for (const [url, host, port] of [['mqtt://broker', 'broker', 1883], ['mqtts://broker', 'broker', 8883], ['mqtts://[::1]:9883', '::1', 9883]]) {
    environment({ MQTT_BROKER_URL: url }, () => {
      const options = brokerClientOptions(loadBrokerSettings());
      assert.equal(options.host, host);
      assert.equal(options.port, port);
      assert.equal(options.rejectUnauthorized, true);
    });
  }
});

test('private CA and mutual TLS files are supplied through environment and must be readable and paired', () => {
  const ca = path.join(directory, 'ca.pem');
  const cert = path.join(directory, 'client.pem');
  const key = path.join(directory, 'client-key.pem');
  for (const [filename, value] of [[ca, 'CA fixture'], [cert, 'certificate fixture'], [key, 'key fixture']]) fs.writeFileSync(filename, value, { mode: 0o600 });
  environment({ MQTT_BROKER_URL: 'mqtts://broker', MQTT_BROKER_CA_FILE: ca, MQTT_BROKER_CLIENT_CERT_FILE: cert, MQTT_BROKER_CLIENT_KEY_FILE: key }, () => {
    const options = brokerClientOptions(loadBrokerSettings());
    assert.equal(options.ca.toString(), 'CA fixture');
    assert.equal(options.cert.toString(), 'certificate fixture');
    assert.equal(options.key.toString(), 'key fixture');
    assert.equal(options.rejectUnauthorized, true);
    delete process.env.MQTT_BROKER_CLIENT_KEY_FILE;
    assert.throws(() => loadBrokerSettings(), /provided together/);
  });
  environment({ MQTT_BROKER_URL: 'mqtts://broker', MQTT_BROKER_CA_FILE: path.join(directory, 'missing') }, () => {
    assert.throws(() => brokerClientOptions(loadBrokerSettings()), /ENOENT/);
  });
});

test('public endpoint defaults and invalid overrides have the same validation as provisioning', () => environment({ MQTT_PUBLIC_HOST: ' mqtt.example.test ' }, () => {
  assert.equal(getPublicMqttEndpoint().port, 8883);
  process.env.MQTT_PUBLIC_PORT = '9883';
  assert.equal(getPublicMqttEndpoint().port, 9883);
  for (const [host, port] of [['', '8883'], ['mqtt://invalid', '8883'], ['mqtt.example.test', 'invalid'], ['mqtt.example.test', '65536']]) {
    process.env.MQTT_PUBLIC_HOST = host;
    process.env.MQTT_PUBLIC_PORT = port;
    assert.equal(getPublicMqttEndpoint(), null);
  }
}));
