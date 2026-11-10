const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mqtt-deployment-'));
const overlay = 'docker-compose.mosquitto.yml';
const tlsOverlay = 'docker-compose.mosquitto-tls.yml';
const bases = ['docker-compose.yml', 'docker-compose.release.yml'];
for (const filename of [...bases, overlay, tlsOverlay]) {
  fs.copyFileSync(path.join(root, filename), path.join(directory, filename));
}
fs.writeFileSync(path.join(directory, '.env'), '');
after(() => fs.rmSync(directory, { recursive: true, force: true }));

function configuration(base, tls = false, tlsDirectory = '', overrides = {}) {
  const files = [base, overlay, ...(tls ? [tlsOverlay] : [])];
  return JSON.parse(execFileSync('docker', [
    'compose', '--project-directory', directory, '--env-file', path.join(directory, '.env'),
    ...files.flatMap(filename => ['-f', path.join(directory, filename)]), 'config', '--format', 'json',
  ], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MQTT_PUBLIC_HOST: 'mqtt.example.test', MQTT_PUBLIC_PORT: '9883',
      MQTT_PROXY_PORT: '18883', MQTT_TLS_DIR: tlsDirectory, MQTT_BROKER_URL: 'mqtt://mosquitto:1883',
      MQTT_BROKER_USERNAME: 'dp-backend', ...overrides },
  }));
}

for (const base of bases) {
  test(`${base}: portal endpoint and account come from environment with standard port defaults`, () => {
    const { services } = configuration(base, false, '', { MQTT_PUBLIC_PORT: '', MQTT_PROXY_PORT: '' });
    assert.equal(services.api.environment.MQTT_DYNSEC_ENABLED, 'true');
    assert.equal(services.api.environment.MQTT_BROKER_URL, 'mqtt://mosquitto:1883');
    assert.equal(services.api.environment.MQTT_DYNSEC_USERNAME, 'dp-sync');
    assert.equal(services.api.environment.MQTT_BROKER_USERNAME, 'dp-backend');
    assert.equal(services.api.environment.MQTT_PUBLIC_HOST, 'mqtt.example.test');
    assert.equal(services.api.environment.MQTT_PUBLIC_PORT, '8883');
    assert.equal(services.mosquitto.ports[0].published, '1883');
    assert.equal(services.mosquitto.ports[0].host_ip, '127.0.0.1');
  });

  test(`${base}: Nginx mode needs no certificate directory and only exposes MQTT on localhost`, () => {
    const { services } = configuration(base);
    const broker = services.mosquitto;
    assert.equal(broker.ports.length, 1);
    assert.equal(broker.ports[0].host_ip, '127.0.0.1');
    assert.equal(broker.ports[0].published, '18883');
    assert.equal(broker.ports[0].target, 1883);
    assert.ok(!broker.volumes.some(volume => volume.target === '/mosquitto/tls'));
    assert.equal(services.api.environment.MQTT_BROKER_URL, 'mqtt://mosquitto:1883');
    assert.equal(services.api.environment.MQTT_PUBLIC_PORT, '9883');
    assert.ok(broker.volumes.some(volume => volume.type === 'volume' && volume.target === '/mosquitto/data'));
  });

  test(`${base}: direct TLS replaces the proxy port and preserves the common broker configuration`, () => {
    const tlsDirectory = path.join(directory, 'TLS certificates');
    const { services } = configuration(base, true, tlsDirectory);
    const broker = services.mosquitto;
    assert.equal(broker.ports.length, 1);
    assert.equal(broker.ports[0].target, 8883);
    assert.equal(broker.ports[0].published, '9883');
    const mounts = new Map(broker.volumes.map(volume => [volume.target, volume]));
    assert.equal(mounts.get('/mosquitto/tls').source, tlsDirectory);
    assert.equal(mounts.get('/mosquitto/tls').read_only, true);
    assert.equal(mounts.get('/mosquitto/config/mosquitto.conf').source, path.join(directory, 'mosquitto/tls.conf'));
    assert.equal(mounts.get('/mosquitto/config/base/mosquitto.conf').source, path.join(directory, 'mosquitto/mosquitto.conf'));
    assert.equal(mounts.get('/mosquitto/data').type, 'volume');
    assert.equal(services.api.environment.MQTT_BROKER_URL, 'mqtt://mosquitto:1883');
  });

  test(`${base}: missing portal connection parameters are rejected`, () => {
    for (const key of ['MQTT_BROKER_URL', 'MQTT_BROKER_USERNAME']) {
      assert.throws(() => configuration(base, false, '', { [key]: '' }), new RegExp('Set ' + key));
    }
  });

  test(`${base}: direct TLS refuses to start without MQTT_TLS_DIR`, () => {
    assert.throws(() => configuration(base, true), /Set MQTT_TLS_DIR/);
  });
}

for (const tls of [false, true]) {
  test(`Mosquitto validates the ${tls ? 'direct TLS' : 'Nginx upstream'} configuration`, () => {
    const fixture = path.join(directory, tls ? 'direct-tls' : 'nginx');
    const commonDirectory = path.join(fixture, 'base');
    const dataDirectory = path.join(fixture, 'data');
    fs.mkdirSync(commonDirectory, { recursive: true });
    fs.mkdirSync(dataDirectory);
    const common = fs.readFileSync(path.join(root, 'mosquitto/mosquitto.conf'), 'utf8')
      .replaceAll('/mosquitto/data/', `${dataDirectory}/`);
    const config = path.join(fixture, 'mosquitto.conf');
    if (tls) {
      fs.writeFileSync(path.join(commonDirectory, 'mosquitto.conf'), common);
      execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256',
        '-nodes', '-days', '1', '-subj', '/CN=mqtt.example.test',
        '-keyout', path.join(fixture, 'privkey.pem'), '-out', path.join(fixture, 'fullchain.pem')], { stdio: 'ignore' });
      fs.writeFileSync(config, fs.readFileSync(path.join(root, 'mosquitto/tls.conf'), 'utf8')
        .replace('/mosquitto/config/base', commonDirectory).replaceAll('/mosquitto/tls/', `${fixture}/`));
    } else {
      fs.writeFileSync(config, common);
    }
    const result = spawnSync('mosquitto', ['--test-config', '-c', config], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout + result.stderr, /Configuration file is OK/);
  });
}
