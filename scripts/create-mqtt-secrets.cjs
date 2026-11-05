const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const directory = path.resolve(__dirname, '../secrets');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
for (const name of ['mqtt-dynsec-password', 'mqtt-backend-password']) {
  const filename = path.join(directory, name);
  try {
    fs.writeFileSync(filename, `${crypto.randomBytes(32).toString('base64url')}\n`, { flag: 'wx', mode: 0o600 });
    console.log(`Created secrets/${name}`);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log(`Preserved existing secrets/${name}`);
  }
}
