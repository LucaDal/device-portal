const fs = require('node:fs');
const crypto = require('node:crypto');

// Offline initializer. Existing broker configuration is never overwritten.
const directory = process.env.DYNSEC_DATA_DIR || '/mosquitto/data';
const target = `${directory}/dynamic-security.json`;
if (fs.existsSync(target)) {
  console.log('Dynamic Security configuration already exists; preserving it');
  process.exit(0);
}
const secretPath = process.env.MQTT_DYNSEC_PASSWORD_FILE || '/run/secrets/mqtt_dynsec_password';
const password = fs.readFileSync(secretPath, 'utf8').trim();
if (password.length < 32) throw new Error('Dynamic Security password must be at least 32 characters');
const salt = crypto.randomBytes(12);
const iterations = 210000;
const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512');
const config = {
  defaultACLAccess: { publishClientSend: false, publishClientReceive: false, subscribe: false, unsubscribe: true },
  clients: [{
    username: 'dp-sync',
    password: hash.toString('base64'), salt: salt.toString('base64'), iterations,
    roles: [{ rolename: 'dp-control', priority: 0 }],
  }],
  groups: [],
  roles: [{
    rolename: 'dp-control',
    acls: [
      { acltype: 'publishClientSend', topic: '$CONTROL/dynamic-security/v1', allow: true, priority: 1 },
      { acltype: 'publishClientReceive', topic: '$CONTROL/dynamic-security/v1/response', allow: true, priority: 1 },
      { acltype: 'subscribeLiteral', topic: '$CONTROL/dynamic-security/v1/response', allow: true, priority: 1 },
    ],
  }],
};
fs.mkdirSync(directory, { recursive: true });
const temporary = `${target}.${crypto.randomUUID()}.tmp`;
try {
  fs.writeFileSync(temporary, JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 });
  // Official Mosquitto image runs the broker as UID/GID 1883.
  if (process.getuid?.() === 0) {
    fs.chownSync(directory, 1883, 1883);
    fs.chownSync(temporary, 1883, 1883);
  }
  fs.linkSync(temporary, target);
} finally {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
console.log('Dynamic Security initialized with a control-only account');
