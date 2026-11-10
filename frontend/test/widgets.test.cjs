const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
require('../../backend/node_modules/ts-node').register({
  project: path.join(__dirname, '../../backend/tsconfig.json'), transpileOnly: true, preferTsExts: true,
  compilerOptions: { jsx: 'react-jsx' }, moduleTypes: { [path.join(__dirname, '../src/**/*')]: 'cjs' },
});
require('../../backend/node_modules/tsconfig-paths').register({ baseUrl: path.join(__dirname, '../..'), paths: { '@shared/*': ['shared/*'] } });
require.extensions['.css'] = () => {};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const Switch = require('../src/widgets/SwitchWidget.tsx').default;
const Value = require('../src/widgets/ValueWidget.tsx').default;
const Input = require('../src/widgets/InputWidget.tsx').default;
const Button = require('../src/widgets/ButtonWidget.tsx').default;
const Editor = require('../src/widgets/WidgetDefinitionEditor.tsx').default;
const AddButton = require('../src/components/AddButton.tsx').default;
const service = require('../src/devices/deviceService.ts');
function treeNodes(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(treeNodes)];
}
const render = (component, widget, observation) => renderToStaticMarkup(React.createElement(component, { widget, observation, deviceCode: 'A', connected: true }));
const switchWidget = { id: 'relay', label: 'Relay', kind: 'switch', configured: true, state: { topic: 'devices/A/state', onValue: true, offValue: false } };

test('switch without feedback shows Unknown with explicit actions, not a false OFF state', () => {
  const html = render(Switch, switchWidget);
  assert.match(html, /<strong>Unknown<\/strong>/);
  assert.match(html, /Relay: turn on/);
  assert.match(html, /Relay: turn off/);
  assert.doesNotMatch(html, /aria-checked="false"/);
});

test('a switch uses the exact reported state and preserves false as a confirmed value', () => {
  const html = render(Switch, switchWidget, { value: false, sequence: 1, replayed: false });
  assert.match(html, /<strong>Off<\/strong>/);
  assert.match(html, /role="switch" aria-checked="false"/);
  const incompatible = render(Switch, switchWidget, { value: 'false', sequence: 1, replayed: false });
  assert.match(incompatible, /<strong>Unknown<\/strong>/);
});

test('value display preserves zero and input controls match their declared type', () => {
  const html = render(Value, { id: 'v', label: 'Value', kind: 'value', configured: true, state: { topic: 'state' } }, { value: 0, sequence: 1, replayed: false });
  assert.match(html, /<strong>0<\/strong>/);
  const input = render(Input, { id: 'i', label: 'Enabled', kind: 'input', configured: true, input: { valueType: 'boolean' } });
  assert.match(input, /<select aria-label="Enabled"/);
  assert.match(input, /value="false"/);
  const button = render(Button, { id: 'b', label: 'Button', kind: 'button', configured: false, configurationError: 'Unavailable topic' });
  assert.match(button, /Unavailable topic/);
  assert.match(button, /disabled=""/);
});

test('the editor exposes only the fields of the specific widget object', () => {
  const topics = [{ key: 'state', action: 'publish', topic: 'state' }, { key: 'command', action: 'subscribe', topic: 'command' }];
  const editor = (widget) => renderToStaticMarkup(React.createElement(Editor, { widget, topics, onChange() {}, onKindChange() {}, onValidationError() {} }));
  const value = editor({ id: 'v', label: 'Value', kind: 'value', state: { topicKey: 'state' } });
  assert.match(value, /State to read/);
  assert.doesNotMatch(value, /Command to send|Input value type|Command format/);
  const button = editor({ id: 'b', label: 'Code', kind: 'button', command: { topicKey: 'command', mode: 'value', value: '001' } });
  assert.match(button, /value="001"/);
  assert.match(button, /value="string" selected=""/);
  assert.doesNotMatch(button, /Command value for ON|Input value type/);
});

test('the web client rejects an incompatible API contract before rendering widgets', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, json: async () => ({ schemaVersion: 1, widgets: [] }) });
    await assert.rejects(service.getDeviceDashboardWidgets('A'), /Unsupported widget format/);
    global.fetch = async () => ({ ok: true, json: async () => ({ schemaVersion: 2, widgets: [] }) });
    assert.equal((await service.getDeviceDashboardWidgets('A')).schemaVersion, 2);
  } finally { global.fetch = original; }
});

test('availability uses MQTT data, handles missing connectivity, and disappears when MQTT is disabled', () => {
  const Availability = require('../src/devices/DeviceAvailability.tsx').default;
  const device = { code: 'A', mqtt_available: true, activated: 1 };
  const props = { device, connected: true, entries: { 'devices/A/telemetry/availability': { value: 'online', sequence: 1, replayed: true } } };
  const html = (next) => renderToStaticMarkup(React.createElement(Availability, { ...props, ...next }));
  assert.match(html({}), /aria-label="Online"/);
  assert.match(html({ entries: { 'devices/A/telemetry/availability': { value: 'offline' } } }), /aria-label="Offline"/);
  assert.match(html({ entries: {} }), /Availability unknown/);
  assert.match(html({ connected: false }), /Availability unknown/);
  assert.match(html({ entries: { 'devices/B/telemetry/availability': { value: 'online' } } }), /Availability unknown/);
  assert.equal(html({ device: { ...device, mqtt_available: false } }), '');
  assert.equal(html({ device: { ...device, mqtt_available: false, activated: 0 } }), '');
});

test('global properties stay in the type while every non-global property is listed without visibility flags', () => {
  const { buildPropertyRows } = require('../src/devices/deviceProperties.ts');
  const { parseDeviceTypePropertiesForm, buildDeviceTypePropertiesPayload } = require('../src/deviceTypes/deviceTypeProperties.ts');
  const type = { deviceProperties: { local: { type: 'string', visible: false, defaultValue: 'default' } }, genericProperties: { globalValue: { type: 'int', global: true, value: 12 } },
    mqttTopics: [{ key: 'commands', topic: 'devices/{deviceCode}/commands/#', action: 'subscribe' }] };
  const form = parseDeviceTypePropertiesForm(type);
  assert.deepEqual(Object.keys(form), ['properties']);
  const payload = buildDeviceTypePropertiesPayload(form.properties);
  assert.equal(payload.ok, true);
  assert.equal(payload.deviceProperties.local.visible, undefined);
  assert.equal(payload.genericProperties.globalValue.value, 12);
  const rows = buildPropertyRows({ type_deviceProperties: payload.deviceProperties, type_genericProperties: payload.genericProperties });
  assert.deepEqual(rows.map(row => row.key), ['local']);
  assert.equal(rows[0].value, 'default');
  assert.equal(rows[0].visible, undefined);
});

test('wildcard widget topics expose a required suffix and preview the final topic in both button modes', () => {
  const topics = [{ key: 'telemetry', topic: 'devices/{deviceCode}/telemetry/#', action: 'publish' }, { key: 'commands', topic: 'devices/{deviceCode}/commands/#', action: 'subscribe' }];
  const editor = widget => renderToStaticMarkup(React.createElement(Editor, { widget, topics, onChange() {}, onKindChange() {}, onValidationError() {} }));
  const value = editor({ id: 'v', label: 'Reading', kind: 'value', state: { topicKey: 'telemetry', topicSuffix: 'temperature' } });
  assert.match(value, /Topic suffix/);
  assert.match(value, /required=""/);
  assert.match(value, /devices\/\{deviceCode\}\/telemetry\/temperature/);
  assert.doesNotMatch(value, /Show topic preview/);
  for (const command of [{ mode: 'value', value: true }, { mode: 'payload', payload: { reset: true } }]) {
    const button = editor({ id: 'b', label: 'Button', kind: 'button', command: { topicKey: 'commands', topicSuffix: 'relay/set', ...command } });
    assert.match(button, /devices\/\{deviceCode\}\/commands\/relay\/set/);
    assert.doesNotMatch(button, /Show topic preview/);
  }
});

test('MQTT rows are separated into direct and linked tables with their own add controls', () => {
  const Topics = require('../src/deviceTypes/DeviceTypeMqttTopicsEditor.tsx').default;
  const topics = [
    { key: 'telemetry', topic: 'devices/{deviceCode}/telemetry/#', action: 'publish' },
    { key: 'external', action: 'subscribe', linkedTopic: { deviceTypeId: 'source', topicKey: 'reading' } },
  ];
  const html = renderToStaticMarkup(React.createElement(Topics, { topics, deviceTypeId: 'current', deviceTypes: [], onChange() {} }));
  const tables = html.match(/<table[\s\S]*?<\/table>/g);
  assert.equal(tables.length, 2);
  assert.match(tables[0], /aria-label="Direct topics"/);
  assert.doesNotMatch(tables[0], /Linked device type|Linked source topic|Source topic/);
  assert.match(tables[1], /aria-label="Linked topics"/);
  assert.match(tables[1], /Linked device type|Linked source topic/);
  assert.doesNotMatch(tables[1], /aria-label="Topic path/);
  assert.match(html, /Add topic/);
  assert.match(html, /Add linked topic/);
});

test('MQTT row edits and deletion retain original indexes, and an empty linked row stays linked', () => {
  const Topics = require('../src/deviceTypes/DeviceTypeMqttTopicsEditor.tsx').default;
  let topics = [
    { key: 'first', topic: 'devices/{deviceCode}/first', action: 'publish' },
    { key: 'linked', action: 'subscribe', linkedTopic: { deviceTypeId: 'source', topicKey: 'reading' } },
    { key: 'last', topic: 'devices/{deviceCode}/last', action: 'publish' },
  ];
  const view = () => treeNodes(Topics({ topics, deviceTypeId: 'current', deviceTypes: [
    { id: 'source', mqttTopics: JSON.stringify([{ key: 'reading', topic: 'owners/{ownerId}/reading', action: 'publish' }]) },
  ], onChange: value => { topics = value; } }));
  view().find(node => node.props['aria-label'] === 'Topic path 3').props.onChange({ target: { value: 'devices/{deviceCode}/changed' } });
  assert.equal(topics[2].topic, 'devices/{deviceCode}/changed');
  assert.equal(topics[1].linkedTopic.topicKey, 'reading');
  view().find(node => node.props['aria-label'] === 'Remove topic first').props.onClick();
  assert.deepEqual(topics.map(topic => topic.key), ['linked', 'last']);
  view().find(node => node.props['aria-label'] === 'Linked device type 1').props.onChange({ target: { value: '' } });
  assert.deepEqual(topics[0].linkedTopic, { deviceTypeId: '', topicKey: '' });
  view().find(node => node.type === AddButton && node.props.children === 'Add linked topic').props.onClick();
  assert.deepEqual(topics[2].linkedTopic, { deviceTypeId: '', topicKey: '' });
  view().find(node => node.props['aria-label'] === 'Linked device type 3').props.onChange({ target: { value: 'source' } });
  view().find(node => node.props['aria-label'] === 'Linked source topic 3').props.onChange({ target: { value: 'reading' } });
  assert.equal(topics[2].key, 'reading');
  assert.equal(topics[2].topic, 'owners/{ownerId}/reading');
  view().find(node => node.type === AddButton && node.props.children === 'Add topic').props.onClick();
  assert.equal(topics[3].linkedTopic, undefined);
});

test('Device Type previews stay generic and visible, while links use the current source template', () => {
  const Topics = require('../src/deviceTypes/DeviceTypeMqttTopicsEditor.tsx').default;
  const template = 'devices/{ownerId}/{deviceTypeId}/{deviceCode}/sensors/termoIgro';
  const props = { deviceTypeId: 'current-type', deviceTypes: [{ id: 'source-type', mqttTopics: JSON.stringify([{ key: 'reading', topic: template, action: 'publish' }]) }],
    topics: [{ key: 'direct', topic: template, action: 'publish' }, { key: 'linked', topic: 'stale/snapshot', action: 'subscribe', linkedTopic: { deviceTypeId: 'source-type', topicKey: 'reading' } }], onChange() {} };
  const previews = () => treeNodes(Topics(props)).filter(node => node.type === 'code').map(node => node.props.children);
  assert.deepEqual(previews(), ['devices/{ownerId}/current-type/{deviceCode}/sensors/termoIgro', 'devices/{ownerId}/source-type/+/sensors/termoIgro']);
  props.deviceTypes[0].mqttTopics = JSON.stringify([{ key: 'reading', topic: 'owners/{ownerId}/{deviceTypeId}/updated', action: 'publish' }]);
  assert.equal(previews()[1], 'owners/{ownerId}/source-type/updated');
  const html = renderToStaticMarkup(React.createElement(Topics, props));
  assert.match(html, /<code[^>]*>owners\/\{ownerId\}\/source-type\/updated<\/code>/);
  assert.doesNotMatch(html, /Show topic preview|stale\/snapshot/);
});

test('topic placeholder errors are shown inline and invalid templates do not produce a preview', () => {
  const Topics = require('../src/deviceTypes/DeviceTypeMqttTopicsEditor.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Topics, { deviceTypeId: 'current', deviceTypes: [], onChange() {},
    topics: [{ key: 'typo', action: 'publish', topic: 'devices/{devicecode}/readings' }] }));
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="mqtt-topic-error-0"/);
  assert.match(html, /Unknown MQTT topic placeholder \{devicecode\}/);
  assert.doesNotMatch(html, /Show topic preview/);
});

test('MQTT help is collapsed initially and explains linked ownership and type scope', () => {
  const Info = require('../src/deviceTypes/MqttTopicInfo.tsx').default;
  const html = renderToStaticMarkup(React.createElement(Info));
  assert.match(html, /<details class="mqtt-info">/);
  assert.match(html, /<summary[^>]*>[\s\S]*MQTT info/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.match(html, /devices\/42\/\+\/sensors\/termoIgro/);
  assert.match(html, /To distinguish device types/);
  assert.match(html, /Device Type previews keep code and owner as placeholders/);
  assert.doesNotMatch(html, /Select a preview device/);
});

test('topic preview does not compute or render its value until explicitly opened', () => {
  const Preview = require('../src/components/TopicPreview.tsx').default;
  let resolutions = 0;
  const html = renderToStaticMarkup(React.createElement(Preview, { cacheKey: 'x', label: 'Telemetry', resolve: () => { resolutions++; return 'devices/secret-preview-value'; } }));
  assert.equal(resolutions, 0);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Show topic preview: Telemetry/);
  assert.doesNotMatch(html, /secret-preview-value/);
});

test('shared ACL cards preserve rule metadata and copying while hiding full topics initially', () => {
  const AclList = require('../src/components/MqttAclList.tsx').default;
  const topic = 'devices/owner/device/commands/relay';
  const rules = [{ id: 1, topic_pattern: topic, action: 'publish', permission: 'deny', priority: 7,
    source_device_code: 'device', source_key: 'commands', source: 'generated_owned_device' }];
  let copied;
  const props = { rules, onCopy: value => { copied = value; } };
  const html = renderToStaticMarkup(React.createElement(AclList, props));
  assert.match(html, /mqtt-acl-row/);
  assert.match(html, /Action: publish/);
  assert.match(html, /Permission: deny/);
  assert.match(html, /Priority: 7/);
  assert.match(html, /Device: device/);
  assert.doesNotMatch(html, /devices\/owner\/device\/commands\/relay/);
  treeNodes(AclList(props)).find(node => node.type === 'button' && node.props.children === 'Copy').props.onClick();
  assert.equal(copied, topic);
});


test('device type options have explicit labels and plain text even without a description', () => {
  const Options = require('../src/deviceTypes/DeviceTypeOptions.tsx').default;
  const deviceTypes = [
    { id: 'TEST_ESP8266', description: 'primo test con esp8266', firmware_version: '0.0.0' },
    { id: 'relay', description: '   ', firmware_version: '1.0.0' },
    { id: 'sensor', firmware_version: '1.0.0' },
  ];
  const options = Options({ deviceTypes });
  assert.deepEqual(options.map(option => option.props.label), ['TEST_ESP8266 — primo test con esp8266', 'relay', 'sensor']);
  for (const [index, option] of options.entries()) {
    assert.equal(option.props.value, deviceTypes[index].id);
    assert.equal(option.props.children, option.props.label);
    assert.equal(typeof option.props.children, 'string');
  }
  const html = renderToStaticMarkup(React.createElement('select', { defaultValue: 'relay' }, React.createElement(Options, { deviceTypes })));
  assert.match(html, /value="relay" label="relay" selected="">relay<\/option>/);
});
