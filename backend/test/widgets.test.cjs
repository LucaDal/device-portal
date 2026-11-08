const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-widgets-'));
process.env.DB_PATH = path.join(directory, 'widgets.db');
process.env.DOTENV_CONFIG_PATH = path.join(directory, 'unused.env');
process.env.MQTT_DYNSEC_ENABLED = 'false';
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true, preferTsExts: true });
require('tsconfig-paths').register({ baseUrl: path.join(__dirname, '..'), paths: { '@shared/*': ['../shared/*'] } });
const model = require('../../shared/widgets');
const { DB } = require('../src/config/database.ts');
const users = require('../src/repositories/userRepository.ts');
const devices = require('../src/repositories/deviceRepository.ts');
const types = require('../src/repositories/deviceTypeRepository.ts');
const repository = require('../src/repositories/deviceTypeWidgetRepository.ts');
const dashboard = require('../src/services/deviceDashboardService.ts');
const typeWidgets = require('../src/services/deviceTypeWidgetsService.ts');
const acls = require('../src/repositories/mqttAclRepository.ts');
const shares = require('../src/repositories/deviceShareRepository.ts');
const { normalizeMqttTopics } = require('../src/services/deviceTypeMqttConfiguration.ts');
const { mqttAclEvents, MQTT_USER_ACL_SYNCED_EVENT } = require('../src/services/mqttAclEvents.ts');
const editor = { id: users.insertUser({ email: 'editor@example.test', password_hash: 'fixture', role: 'admin' }).id, role: 'admin' };
const viewer = { id: users.insertUser({ email: 'owner@example.test', password_hash: 'fixture' }).id, role: 'user' };
const topics = [
  { key: 'reported', action: 'publish', topic: 'devices/{deviceCode}/state' },
  { key: 'command', action: 'subscribe', topic: 'devices/{deviceCode}/command' },
];
types.insertDeviceType({ id: 'widget-type', firmware_version: '1', firmware_build: Buffer.alloc(0), mqtt_enabled: 1, mqttTopics: JSON.stringify(topics) });
devices.createDevice({ name: 'Fixture device', code: 'WIDGET', device_type_id: 'widget-type', owner_id: viewer.id, activated: 1, device_secret_hash: 'fixture' });
const definitions = [
  { id: 'temperature', label: 'Temperature', kind: 'value', state: { topicKey: 'reported', path: '/temperature' } },
  { id: 'name', label: 'Name', kind: 'text', state: { topicKey: 'reported', path: '/name' } },
  { id: 'relay', label: 'Relay', kind: 'switch', state: { topicKey: 'reported', path: '/reported/enabled', onValue: 'ON', offValue: 'OFF' }, command: { topicKey: 'command', path: '/desired/enabled', onValue: true, offValue: false } },
  { id: 'button', label: 'Code', kind: 'button', command: { topicKey: 'command', mode: 'value', path: '/code', value: '001' } },
  { id: 'reset', label: 'Reset', kind: 'button', command: { topicKey: 'command', mode: 'payload', payload: { reset: true, mode: 'soft' } } },
  { id: 'setpoint', label: 'Setpoint', kind: 'input', command: { topicKey: 'command', path: '/setpoint', valueType: 'number', min: 0, max: 100 } },
];
after(() => { DB.close(); fs.rmSync(directory, { recursive: true, force: true }); });
const status = (expected) => (error) => error.status === expected;

test('every kind has its own complete object and no unrelated fields', () => {
  assert.deepEqual(model.parseDeviceDashboardWidgets(definitions, topics), definitions);
  const invalid = [
    { id: 'x', label: 'Value', kind: 'value' },
    { id: 'x', label: 'Button', kind: 'button' },
    { ...definitions[0], command: definitions[3].command },
    { ...definitions[2], command: { topicKey: 'command', onValue: true } },
    { ...definitions[2], state: { ...definitions[2].state, offValue: 'ON' } },
    { ...definitions[3], command: { ...definitions[3].command, value: null } },
    { ...definitions[4], command: { ...definitions[4].command, payload: { nested: {} } } },
    { ...definitions[5], command: { ...definitions[5].command, min: 101 } },
    { ...definitions[5], command: { ...definitions[5].command, valueType: 'string' } },
  ];
  for (const widget of invalid) assert.throws(() => model.parseDeviceDashboardWidget(widget), model.WidgetValidationError);
  assert.throws(() => model.parseDeviceDashboardWidgets([definitions[0], definitions[0]]), /duplicated/);
  assert.throws(() => model.parseDeviceDashboardWidgets([{ ...definitions[3], command: { ...definitions[3].command, topicKey: 'reported' } }], topics), /subscribes/);
  assert.throws(() => model.parseDeviceDashboardWidgets([{ ...definitions[0], state: { topicKey: 'missing' } }], topics), /unknown topic/);
});

test('MQTT placeholders reject typos, wrong case and malformed braces with one shared rule', () => {
  const { getMqttTopicPlaceholderError, resolveMqttTopicTemplate } = require('../../shared/types/device_type_mqtt');
  const { validateMqttTopicTemplate } = require('../src/utils/mqttTopicTemplate.ts');
  assert.equal(getMqttTopicPlaceholderError('devices/{ownerId}/{deviceTypeId}/{deviceCode}/sensors'), null);
  for (const topic of ['devices/{ownerID}/{deviceCode}', 'devices/{devicecode}/sensor', 'devices/{deviceCode/sensor', 'devices/deviceCode}/sensor', 'devices/{{deviceCode}}/sensor', 'devices/{}/sensor']) {
    assert.ok(getMqttTopicPlaceholderError(topic));
    assert.equal(validateMqttTopicTemplate(topic), getMqttTopicPlaceholderError(topic));
  }
  assert.equal(resolveMqttTopicTemplate('devices/{ownerId}/{deviceTypeId}/{deviceCode}/sensors', { ownerId: 42, deviceTypeId: 'source-type', deviceCode: '+' }), 'devices/42/source-type/+/sensors');
});

test('JSON pointers use own properties, valid escapes and distinct read and command paths', () => {
  const payload = model.buildDashboardValuePayload(true, '/desired/enabled');
  assert.deepEqual(payload, { desired: { enabled: true } });
  assert.equal(model.readDashboardStateValue({ reported: { enabled: 'ON' } }, '/reported/enabled'), 'ON');
  assert.equal(model.readDashboardStateValue({ 'a/b': { '~key': 0 } }, '/a~1b/~0key'), 0);
  assert.equal(model.readDashboardStateValue({ list: [false, true] }, '/list/0'), false);
  assert.equal(model.readDashboardStateValue({ list: [false, true] }, '/list/01'), undefined);
  assert.equal(model.readDashboardStateValue({}, '/toString'), undefined);
  for (const pointer of ['/bad~2', '/bad~', 'state']) {
    assert.equal(model.isValidDashboardStateValuePath(pointer), false);
    assert.throws(() => model.buildDashboardValuePayload(true, pointer), /pointer/);
  }
  const crafted = model.buildDashboardValuePayload(true, '/__proto__/polluted');
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(Object.hasOwn(crafted, '__proto__'), true);
});

test('input conversion is explicit and preserves string payloads, false and zero', () => {
  assert.equal(model.parseWidgetInput('001', { valueType: 'string' }), '001');
  assert.equal(model.parseWidgetInput('true', { valueType: 'string' }), 'true');
  assert.equal(model.parseWidgetInput('', { valueType: 'string' }), '');
  assert.equal(model.parseWidgetInput('0', { valueType: 'number', min: 0 }), 0);
  assert.equal(model.parseWidgetInput('false', { valueType: 'boolean' }), false);
  for (const raw of ['', 'abc', 'Infinity']) assert.throws(() => model.parseWidgetInput(raw, { valueType: 'number' }));
  assert.throws(() => model.parseWidgetInput('101', { valueType: 'number', max: 100 }), /Maximum/);
  assert.ok(model.validateWidgetInput('1', { valueType: 'number' }));
});

test('unknown switch state is not OFF and replayed or old packets cannot confirm commands', () => {
  const mapping = { onValue: 'ON', offValue: 'OFF' };
  assert.equal(model.switchState(undefined, mapping), undefined);
  assert.equal(model.switchState(false, mapping), undefined);
  assert.equal(model.switchState('ON', mapping), true);
  assert.equal(model.switchState('OFF', mapping), false);
  const observation = { value: false, sequence: 11, replayed: false };
  assert.equal(model.matchesWidgetFeedback(observation, 10, false), true);
  assert.equal(model.matchesWidgetFeedback({ ...observation, sequence: 10 }, 10, false), false);
  assert.equal(model.matchesWidgetFeedback({ ...observation, replayed: true }, 10, false), false);
  assert.equal(model.matchesWidgetFeedback({ ...observation, value: 'false' }, 10, false), false);
  assert.equal(model.matchesWidgetFeedback(undefined, 10, false), false);
  assert.equal(model.latestMqttEntry({ 'devices/a/state': { ...observation, receivedAt: '2026-01-01' }, 'devices/b/state': { ...observation, sequence: 12, receivedAt: '2026-01-01' } }, 'devices/+/state').sequence, 12);
});

test('widget objects round-trip through storage and runtime exposes only allowed fields', () => {
  const saved = typeWidgets.saveDeviceTypeWidgets('widget-type', definitions, 0, editor);
  assert.equal(saved.schemaVersion, 2);
  assert.equal(saved.configuration.revision, 1);
  assert.deepEqual(saved.configuration.widgets, definitions);
  assert.deepEqual(repository.loadDeviceWidgets('WIDGET'), definitions);
  const stored = JSON.parse(DB.prepare("SELECT definition FROM device_type_widgets WHERE widget_id = 'relay'").get().definition);
  assert.deepEqual(stored, definitions[2]);
  const runtime = dashboard.getDeviceDashboardWidgets('WIDGET', viewer);
  assert.equal(runtime.canConfigure, false);
  assert.equal(runtime.configuration, undefined);
  assert.ok(runtime.widgets.every((widget) => !Object.hasOwn(widget, 'command')));
  assert.deepEqual(runtime.widgets.find((w) => w.id === 'relay').state, { topic: 'devices/WIDGET/state', path: '/reported/enabled', onValue: 'ON', offValue: 'OFF' });
  assert.deepEqual(runtime.widgets.find((w) => w.id === 'setpoint').input, { valueType: 'number', min: 0, max: 100 });
});

test('stale or invalid edits cannot overwrite saved widgets or advance their revision', () => {
  assert.throws(() => typeWidgets.saveDeviceTypeWidgets('widget-type', [], 0, editor), status(409));
  assert.throws(() => typeWidgets.saveDeviceTypeWidgets('widget-type', [], undefined, editor), status(400));
  assert.throws(() => typeWidgets.saveDeviceTypeWidgets('widget-type', [{ id: 'invalid' }], 1, editor), status(400));
  assert.throws(() => typeWidgets.saveDeviceTypeWidgets('widget-type', [], 1, viewer), status(403));
  assert.equal(types.findDeviceType('widget-type').widgets_revision, 1);
  assert.deepEqual(repository.loadDeviceWidgets('WIDGET'), definitions);
});

test('actions use the command object and validate the configured input type and range', () => {
  const action = (id, input = {}) => dashboard.buildDeviceDashboardWidgetAction('WIDGET', id, input, viewer).publish;
  assert.deepEqual(action('relay', { state: true }), { topic: 'devices/WIDGET/command', content: { desired: { enabled: true } } });
  assert.deepEqual(action('relay', { state: false }).content, { desired: { enabled: false } });
  assert.deepEqual(action('button').content, { code: '001' });
  assert.deepEqual(action('reset').content, { reset: true, mode: 'soft' });
  assert.deepEqual(action('setpoint', { value: 0 }).content, { setpoint: 0 });
  for (const value of ['1', true, -1, 101]) assert.throws(() => action('setpoint', { value }), status(400));
  assert.throws(() => action('relay', { state: 'true' }), status(400));
  assert.throws(() => action('temperature'), status(400));
});

test('topic edits cannot remove bindings used by existing widgets', () => {
  const before = types.findDeviceType('widget-type');
  assert.throws(() => normalizeMqttTopics(topics.filter((topic) => topic.key !== 'reported'), 'widget-type'), /Device type widget-type.*state.topicKey/);
  assert.throws(() => normalizeMqttTopics(topics.map((topic) => ({ ...topic, action: 'publish' })), 'widget-type'), /subscribes/);
  assert.equal(types.findDeviceType('widget-type').mqttTopics, before.mqttTopics);
});

test('ACL synchronization failure rolls back widgets, their revision and generated rules together', () => {
  const before = repository.loadDeviceWidgets('WIDGET');
  const fail = () => { throw new Error('sync failed'); };
  mqttAclEvents.on(MQTT_USER_ACL_SYNCED_EVENT, fail);
  try {
    assert.throws(() => typeWidgets.saveDeviceTypeWidgets('widget-type', [], 1, editor), /sync failed/);
    assert.deepEqual(repository.loadDeviceWidgets('WIDGET'), before);
    assert.equal(types.findDeviceType('widget-type').widgets_revision, 1);
  } finally { mqttAclEvents.off(MQTT_USER_ACL_SYNCED_EVENT, fail); }
});

test('types can define widgets before devices exist and while MQTT is disabled', () => {
  types.insertDeviceType({ id: 'future-type', firmware_version: '1', firmware_build: Buffer.alloc(0), mqttTopics: JSON.stringify(topics) });
  const saved = typeWidgets.saveDeviceTypeWidgets('future-type', [definitions[0]], 0, editor);
  assert.equal(saved.configuration.revision, 1);
  assert.deepEqual(typeWidgets.getDeviceTypeWidgets('future-type', editor).configuration.widgets, [definitions[0]]);
  assert.throws(() => normalizeMqttTopics([], 'future-type'), /state.topicKey/);
  devices.createDevice({ name: 'Future', code: 'FUTURE', device_type_id: 'future-type', owner_id: viewer.id, activated: 1, device_secret_hash: 'fixture' });
  assert.deepEqual(repository.loadDeviceWidgets('FUTURE'), [definitions[0]]);
  assert.deepEqual(dashboard.getDeviceDashboardWidgets('FUTURE', viewer).widgets, []);
  types.updateDeviceType('future-type', { mqtt_enabled: 1 });
  assert.equal(dashboard.getDeviceDashboardWidgets('FUTURE', viewer).widgets[0].state.topic, 'devices/FUTURE/state');
  devices.deleteDevice('FUTURE');
  assert.deepEqual(repository.loadDeviceTypeWidgets('future-type'), [definitions[0]]);
  types.deleteDeviceType('future-type');
  assert.deepEqual(repository.loadDeviceTypeWidgets('future-type'), []);
});

test('one type definition updates all devices and ACLs while preserving owner isolation', () => {
  const other = { id: users.insertUser({ email: 'other@example.test', password_hash: 'fixture' }).id, role: 'user' };
  const developer = { id: users.insertUser({ email: 'dev@example.test', password_hash: 'fixture', role: 'dev' }).id, role: 'dev' };
  types.insertDeviceType({ id: 'inherited', firmware_version: '1', firmware_build: Buffer.alloc(0), mqtt_enabled: 1, mqttTopics: JSON.stringify(topics) });
  for (const [code, owner] of [['FIRST', viewer], ['SECOND', other]]) {
    devices.createDevice({ name: code, code, device_type_id: 'inherited', owner_id: owner.id, activated: 1, device_secret_hash: 'fixture' });
  }
  shares.saveDeviceShare('FIRST', developer.id, viewer.id);
  const widget = { ...definitions[2], state: { topicKey: 'command', onValue: true, offValue: false } };
  typeWidgets.saveDeviceTypeWidgets('inherited', [widget], 0, editor);
  for (const [code, owner] of [['FIRST', viewer], ['SECOND', other]]) {
    assert.deepEqual(repository.loadDeviceWidgets(code), [widget]);
    const runtime = dashboard.getDeviceDashboardWidgets(code, owner);
    assert.equal(runtime.widgets[0].state.topic, `devices/${code}/command`);
    assert.equal(dashboard.buildDeviceDashboardWidgetAction(code, 'relay', { state: true }, owner).publish.topic, `devices/${code}/command`);
    assert.ok(acls.listDeviceAclRules(code).some((rule) => rule.source_key === 'widget_state:command' && rule.action === 'publish'));
    assert.ok(acls.listUserAclRules(owner.id).some((rule) => rule.source_device_code === code && rule.action === 'subscribe' && rule.topic_pattern === `devices/${code}/command`));
  }
  assert.ok(acls.listUserAclRules(developer.id).some((rule) => rule.source_device_code === 'FIRST' && rule.action === 'subscribe' && rule.topic_pattern === 'devices/FIRST/command'));
  assert.throws(() => dashboard.getDeviceDashboardWidgets('SECOND', viewer), status(403));
  assert.throws(() => typeWidgets.getDeviceTypeWidgets('inherited', developer), status(403));
  assert.throws(() => typeWidgets.saveDeviceTypeWidgets('inherited', [], 1, developer), status(403));
  const adminRuntime = dashboard.getDeviceDashboardWidgets('FIRST', editor);
  assert.equal(adminRuntime.canConfigure, false);
  assert.equal(adminRuntime.configuration, undefined);
  devices.createDevice({ name: 'Later', code: 'LATER', device_type_id: 'inherited', owner_id: other.id, activated: 1, device_secret_hash: 'fixture' });
  assert.deepEqual(repository.loadDeviceWidgets('LATER'), [widget]);
  assert.equal(DB.prepare("SELECT COUNT(*) AS count FROM device_type_widgets WHERE device_type_id = 'inherited'").get().count, 1);
  const { state, ...commandOnly } = widget;
  commandOnly.label = 'Updated everywhere';
  typeWidgets.saveDeviceTypeWidgets('inherited', [commandOnly], 1, editor);
  for (const code of ['FIRST', 'SECOND', 'LATER']) {
    assert.deepEqual(repository.loadDeviceWidgets(code), [commandOnly]);
    assert.equal(acls.listDeviceAclRules(code).some((rule) => rule.source_key === 'widget_state:command'), false);
  }
  for (const owner of [viewer, other, developer]) {
    assert.equal(acls.listUserAclRules(owner.id).some((rule) => ['FIRST', 'SECOND', 'LATER'].includes(rule.source_device_code) && rule.action === 'subscribe' && rule.topic_pattern.endsWith('/command')), false);
  }
  assert.deepEqual(repository.loadDeviceWidgets('WIDGET'), definitions);
  assert.throws(() => dashboard.buildDeviceDashboardWidgetAction('FIRST', 'temperature', {}, viewer), status(404));
  assert.throws(() => typeWidgets.saveDeviceTypeWidgets('inherited', [], 1, editor), status(409));
});

test('command templates reject unavailable linked topics and wildcard destinations without needing a device', () => {
  types.insertDeviceType({ id: 'linked-target', firmware_version: '1', firmware_build: Buffer.alloc(0), mqttTopics: JSON.stringify([{ key: 'relay', topic: 'owners/{ownerId}/devices/{deviceCode}/command', action: 'subscribe' }]) });
  types.insertDeviceType({ id: 'linked-editor', firmware_version: '1', firmware_build: Buffer.alloc(0), mqttTopics: JSON.stringify([{ key: 'command', action: 'subscribe', linkedTopic: { deviceTypeId: 'linked-target', topicKey: 'relay' } }]) });
  assert.throws(() => typeWidgets.saveDeviceTypeWidgets('linked-editor', [definitions[3]], 0, editor), status(400));
  types.updateDeviceType('linked-target', { mqttTopics: JSON.stringify([{ key: 'relay', topic: 'owners/{ownerId}/command', action: 'subscribe' }]) });
  assert.equal(typeWidgets.saveDeviceTypeWidgets('linked-editor', [definitions[3]], 0, editor).configuration.widgets.length, 1);
  assert.throws(() => typeWidgets.getDeviceTypeWidgets('missing', editor), status(404));
});

test('availability is the only built-in and state is an ordinary admin-defined topic', () => {
  types.insertDeviceType({ id: 'system-topics', firmware_version: '1', firmware_build: Buffer.alloc(0), mqtt_enabled: 1 });
  assert.deepEqual(typeWidgets.getDeviceTypeWidgets('system-topics', editor).configuration.topics.map((topic) => topic.key), ['availability']);
  const widget = { id: 'reported-state', kind: 'value', label: 'Reported', state: { topicKey: 'state', path: '/temperature' } };
  assert.throws(() => typeWidgets.saveDeviceTypeWidgets('system-topics', [widget], 0, editor), status(400));
  types.updateDeviceType('system-topics', { mqttTopics: normalizeMqttTopics([{ key: 'state', topic: 'devices/{deviceCode}/reported', action: 'publish' }], 'system-topics') });
  typeWidgets.saveDeviceTypeWidgets('system-topics', [widget], 0, editor);
  devices.createDevice({ code: 'SYSTEM', name: 'System', device_type_id: 'system-topics', owner_id: viewer.id, activated: 1, device_secret_hash: 'fixture' });
  assert.equal(dashboard.getDeviceDashboardWidgets('SYSTEM', viewer).widgets[0].state.topic, 'devices/SYSTEM/reported');
  assert.throws(() => normalizeMqttTopics([{ key: 'availability', topic: 'devices/{deviceCode}/override', action: 'publish' }], 'system-topics'), /reserved/);
});

test('wildcard bindings require safe suffixes for state, commands, input and payload buttons', () => {
  const catalog = [
    { key: 'telemetry', topic: 'devices/{deviceCode}/telemetry/#', action: 'publish' },
    { key: 'commands', topic: 'devices/{deviceCode}/commands/#', action: 'subscribe' },
  ];
  types.insertDeviceType({ id: 'suffixes', firmware_version: '1', firmware_build: Buffer.alloc(0), mqtt_enabled: 1, mqttTopics: normalizeMqttTopics(catalog, 'suffixes') });
  for (const code of ['SUFFIX-A', 'SUFFIX-B']) devices.createDevice({ code, name: code, device_type_id: 'suffixes', owner_id: viewer.id, activated: 1, device_secret_hash: 'fixture' });
  const configured = [
    { id: 'relay', kind: 'switch', label: 'Relay', state: { topicKey: 'telemetry', topicSuffix: 'relay/state', onValue: true, offValue: false }, command: { topicKey: 'commands', topicSuffix: 'relay/set', onValue: true, offValue: false } },
    { id: 'input', kind: 'input', label: 'Setpoint', state: { topicKey: 'commands', topicSuffix: 'setpoint/state' }, command: { topicKey: 'commands', topicSuffix: 'setpoint/set', valueType: 'number' } },
    { id: 'reset', kind: 'button', label: 'Reset', command: { topicKey: 'commands', topicSuffix: 'reset', mode: 'payload', payload: { reset: true } } },
    { id: 'reading', kind: 'value', label: 'Reading', state: { topicKey: 'telemetry', topicSuffix: 'room/temperature' } },
    { id: 'text', kind: 'text', label: 'Name', state: { topicKey: 'telemetry', topicSuffix: 'name' } },
    { id: 'code', kind: 'button', label: 'Code', command: { topicKey: 'commands', topicSuffix: 'code', mode: 'value', value: '001' } },
  ];
  assert.deepEqual(typeWidgets.saveDeviceTypeWidgets('suffixes', configured, 0, editor).configuration.widgets, configured);
  for (const code of ['SUFFIX-A', 'SUFFIX-B']) {
    const runtime = dashboard.getDeviceDashboardWidgets(code, viewer);
    assert.equal(runtime.widgets[0].state.topic, `devices/${code}/telemetry/relay/state`);
    assert.equal(runtime.widgets[3].state.topic, `devices/${code}/telemetry/room/temperature`);
    assert.deepEqual(runtime.widgets[1].input, { valueType: 'number' });
    assert.equal(dashboard.buildDeviceDashboardWidgetAction(code, 'relay', { state: true }, viewer).publish.topic, `devices/${code}/commands/relay/set`);
    assert.deepEqual(dashboard.buildDeviceDashboardWidgetAction(code, 'reset', {}, viewer).publish, { topic: `devices/${code}/commands/reset`, content: { reset: true } });
    const rules = acls.listDeviceAclRules(code).filter((rule) => rule.source_key === 'widget_state:commands');
    assert.deepEqual(rules.map((rule) => rule.topic_pattern), [`devices/${code}/commands/setpoint/state`]);
    assert.ok(acls.listUserAclRules(viewer.id).some((rule) => rule.source_device_code === code && rule.action === 'subscribe' && rule.topic_pattern === `devices/${code}/commands/setpoint/state`));
    assert.equal(acls.listUserAclRules(viewer.id).some((rule) => rule.source_device_code === code && rule.action === 'subscribe' && rule.topic_pattern === `devices/${code}/commands/#`), false);
  }
  for (const suffix of ['', '/other', 'end/', 'a//b', 'a/#', '+', '{deviceCode}', 'a\u0000b']) {
    assert.throws(() => typeWidgets.saveDeviceTypeWidgets('suffixes', [{ ...configured[0], command: { ...configured[0].command, topicSuffix: suffix } }], 1, editor), status(400));
  }
  const { topicSuffix, ...missing } = configured[0].command;
  assert.throws(() => typeWidgets.saveDeviceTypeWidgets('suffixes', [{ ...configured[0], command: missing }], 1, editor), status(400));
  assert.throws(() => typeWidgets.saveDeviceTypeWidgets('suffixes', [{ ...configured[3], state: { topicKey: 'availability', topicSuffix: 'extra' } }], 1, editor), status(400));
  assert.throws(() => normalizeMqttTopics(catalog.map((topic) => ({ ...topic, topic: topic.topic.replace('/#', '/exact') })), 'suffixes'), /only allowed/);
  assert.equal(types.findDeviceType('suffixes').widgets_revision, 1);
  assert.throws(() => model.resolveWidgetTopic({ topicKey: 'x', topicSuffix: 'long' }, 'x'.repeat(65532) + '/#'), /byte limit/);
});

test('linked wildcard topics resolve suffixes while staying inside the owner scope', () => {
  const { canUserAccessMqttTopic } = require('../src/utils/mqttUserAcl.ts');
  const other = users.insertUser({ email: 'linked-suffix-owner@example.test', password_hash: 'fixture' });
  types.insertDeviceType({ id: 'linked-suffix-target', firmware_version: '1', firmware_build: Buffer.alloc(0), mqtt_enabled: 1, mqttTopics: JSON.stringify([
    { key: 'readings', topic: 'owners/{ownerId}/{deviceTypeId}/{deviceCode}/telemetry/#', action: 'publish' },
    { key: 'commands', topic: 'owners/{ownerId}/{deviceTypeId}/commands/#', action: 'subscribe' },
  ]) });
  const links = normalizeMqttTopics([
    { key: 'linked-readings', action: 'subscribe', linkedTopic: { deviceTypeId: 'linked-suffix-target', topicKey: 'readings' } },
    { key: 'linked-commands', action: 'subscribe', linkedTopic: { deviceTypeId: 'linked-suffix-target', topicKey: 'commands' } },
  ], 'linked-suffix-source');
  types.insertDeviceType({ id: 'linked-suffix-source', firmware_version: '1', firmware_build: Buffer.alloc(0), mqtt_enabled: 1, mqttTopics: links });
  for (const [code, type, owner] of [['LINK-TARGET', 'linked-suffix-target', viewer], ['LINK-FOREIGN', 'linked-suffix-target', other], ['LINK-SOURCE', 'linked-suffix-source', viewer]]) {
    devices.createDevice({ code, name: code, device_type_id: type, owner_id: owner.id, activated: 1, device_secret_hash: 'fixture' });
  }
  const configured = [
    { id: 'reading', label: 'Reading', kind: 'value', state: { topicKey: 'linked-readings', topicSuffix: 'temperature' } },
    { id: 'command', label: 'Set', kind: 'button', command: { topicKey: 'linked-commands', topicSuffix: 'relay/set', mode: 'value', value: true } },
  ];
  typeWidgets.saveDeviceTypeWidgets('linked-suffix-source', configured, 0, editor);
  assert.equal(dashboard.getDeviceDashboardWidgets('LINK-SOURCE', viewer).widgets[0].state.topic, `owners/${viewer.id}/linked-suffix-target/+/telemetry/temperature`);
  assert.equal(dashboard.buildDeviceDashboardWidgetAction('LINK-SOURCE', 'command', {}, viewer).publish.topic, `owners/${viewer.id}/linked-suffix-target/commands/relay/set`);
  assert.equal(canUserAccessMqttTopic(viewer.id, 'subscribe', `owners/${other.id}/linked-suffix-target/LINK-FOREIGN/telemetry/temperature`), false);
});

test('invalid stored widget objects are reported rather than silently hidden', () => {
  types.insertDeviceType({ id: 'invalid-type', firmware_version: '1', firmware_build: Buffer.alloc(0) });
  devices.createDevice({ name: 'Fixture device', code: 'INVALID', device_type_id: 'invalid-type', device_secret_hash: 'fixture' });
  DB.prepare('INSERT INTO device_type_widgets(device_type_id, widget_id, definition) VALUES (?, ?, ?)')
    .run('invalid-type', 'broken', JSON.stringify({ id: 'broken', label: 'Broken', kind: 'value' }));
  assert.throws(() => repository.loadDeviceWidgets('INVALID'), model.WidgetValidationError);
});
