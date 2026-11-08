import { DeviceType } from "@shared/types/device_type";
import { DeviceTypeMqttTopic, getMqttTopicPlaceholderError, parseDeviceTypeMqttTopics, resolveMqttTopicTemplate } from "@shared/types/device_type_mqtt";
import { MQTT_ACL_ACTIONS, MqttAclAction } from "@shared/constants/mqtt";

type Props = {
    topics: DeviceTypeMqttTopic[];
    deviceTypes: DeviceType[];
    deviceTypeId: string;
    onChange: (topics: DeviceTypeMqttTopic[]) => void;
};

export default function DeviceTypeMqttTopicsEditor({ topics, deviceTypes, deviceTypeId, onChange }: Props) {
    const rows = topics.map((topic, index) => ({ topic, index }));
    const update = (index: number, patch: Partial<DeviceTypeMqttTopic>) => onChange(topics.map((topic, i) => i === index ? { ...topic, ...patch } : topic));
    const targets = (typeId: string) => (typeId === deviceTypeId ? topics : parseDeviceTypeMqttTopics(deviceTypes.find((type) => type.id === typeId)?.mqttTopics))
        .filter((topic) => topic.key.trim() && !topic.linkedTopic);

    return <div className="mqtt-topic-sections">
        {[false, true].map((linked) => {
            const visibleRows = rows.filter(({ topic }) => Boolean(topic.linkedTopic) === linked);
            const title = linked ? "Linked topics" : "Direct topics";
            return <section key={title} className="mqtt-topic-section" aria-label={title}>
                <div className="mqtt-topic-section-header">
                    <div className="dt-section-heading">
                        <h3>{title} <span className="dt-chip">{visibleRows.length}</span></h3>
                    </div>
                    <button type="button" className="dt-btn dt-btn-primary mqtt-topic-add" onClick={() => onChange([...topics, {
                        key: "", label: "", topic: "", action: linked ? MQTT_ACL_ACTIONS.SUBSCRIBE : MQTT_ACL_ACTIONS.PUBLISH,
                        ...(linked ? { linkedTopic: { deviceTypeId: "", topicKey: "" } } : {}),
                    }])}>
                        <span className="mqtt-topic-add-icon" aria-hidden="true">+</span>
                        {linked ? "Add linked topic" : "Add topic"}
                    </button>
                </div>
                {visibleRows.length === 0 ? <p className="mqtt-topic-empty">{linked ? "No linked topics yet." : "No direct topics yet."}</p>
                    : <div className="dt-table-wrapper">
                        <table className="dt-table mqtt-topic-table" aria-label={title}>
                            <thead><tr>
                                <th scope="col" className="mqtt-topic-key">Key</th>
                                {linked ? <><th scope="col">Device type</th><th scope="col">Source topic</th></> : <th scope="col">Topic</th>}
                                <th scope="col" className="mqtt-topic-action">Device action</th>
                                <th scope="col" className="mqtt-topic-remove"><span className="mqtt-topic-sr-only">Remove</span></th>
                            </tr></thead>
                            <tbody>{visibleRows.map(({ topic, index }) => {
                                const source = linked ? targets(topic.linkedTopic!.deviceTypeId).find((candidate) => candidate.key === topic.linkedTopic!.topicKey) : topic;
                                const template = source?.topic || "";
                                const error = getMqttTopicPlaceholderError(template);
                                const errorId = `mqtt-topic-error-${index}`;
                                const context = {
                                    deviceCode: linked ? "+" : "{deviceCode}",
                                    ownerId: "{ownerId}",
                                    deviceTypeId: linked ? topic.linkedTopic!.deviceTypeId : deviceTypeId,
                                };
                                const detail = error ? <small id={errorId} className="mqtt-topic-error" role="alert">{error}</small>
                                    : template ? <code className="mqtt-topic-template">{resolveMqttTopicTemplate(template, context)}</code> : null;
                                return <tr key={index}>
                                    <td data-label="Key"><input aria-label={`Topic key ${index + 1}`} type="text" placeholder="e.g. telemetry" value={topic.key}
                                        onChange={(event) => update(index, { key: event.target.value })} /></td>
                                    {linked ? <>
                                        <td data-label="Device type"><select aria-label={`Linked device type ${index + 1}`} value={topic.linkedTopic?.deviceTypeId || ""}
                                            onChange={(event) => update(index, { label: "", topic: "", linkedTopic: { deviceTypeId: event.target.value, topicKey: "" } })}>
                                            <option value="">Select a device type…</option>
                                            {deviceTypes.map((type) => <option key={type.id} value={type.id}>{type.id}</option>)}
                                        </select></td>
                                        <td data-label="Source topic"><select aria-label={`Linked source topic ${index + 1}`} value={topic.linkedTopic?.topicKey || ""}
                                            disabled={!topic.linkedTopic?.deviceTypeId} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => {
                                                const source = targets(topic.linkedTopic!.deviceTypeId).find((candidate) => candidate.key === event.target.value);
                                                update(index, { key: topic.key || source?.key || "", label: source?.label || "", topic: source?.topic || "",
                                                    linkedTopic: { deviceTypeId: topic.linkedTopic!.deviceTypeId, topicKey: event.target.value } });
                                            }}>
                                            <option value="">Select a topic…</option>
                                            {targets(topic.linkedTopic?.deviceTypeId || "").map((source) => <option key={source.key} value={source.key}>{source.label || source.key}</option>)}
                                        </select>
                                            {detail}
                                        </td>
                                    </> : <td data-label="Topic"><input aria-label={`Topic path ${index + 1}`} type="text" placeholder="devices/{deviceCode}/telemetry/#" value={topic.topic || ""} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
                                        onChange={(event) => update(index, { topic: event.target.value })} />{detail}</td>}
                                    <td data-label="Device action"><select aria-label={`Device action ${index + 1}`} value={topic.action}
                                        onChange={(event) => update(index, { action: event.target.value as MqttAclAction })}>
                                        {Object.values(MQTT_ACL_ACTIONS).map((action) => <option key={action} value={action}>{action}</option>)}
                                    </select></td>
                                    <td><button type="button" className="dt-btn dt-btn-xs dt-btn-danger" aria-label={`Remove topic ${topic.key || index + 1}`}
                                        onClick={() => onChange(topics.filter((_, i) => i !== index))}>✕</button></td>
                            </tr>;
                            })}</tbody>
                        </table>
                    </div>}
            </section>;
        })}
    </div>;
}
