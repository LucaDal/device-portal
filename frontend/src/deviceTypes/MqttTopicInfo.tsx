export default function MqttTopicInfo() {
    return <details className="mqtt-info">
        <summary className="dt-btn dt-btn-outline"><span aria-hidden="true">ⓘ</span> MQTT info</summary>
        <div className="mqtt-info-panel">
            <h3>Topic placeholders</h3>
            <ul>
                <li><code>{"{deviceCode}"}</code>: the device code. In a linked subscription it becomes <code>+</code>, matching device codes.</li>
                <li><code>{"{ownerId}"}</code>: the owner of the device that uses the topic or link.</li>
                <li><code>{"{deviceTypeId}"}</code>: the current type for direct topics, the source type for linked topics.</li>
            </ul>
            <p>Device Type previews keep code and owner as placeholders. Actual values are resolved for devices and users. Placeholder names are case-sensitive.</p>
            <h3>Linked subscriptions</h3>
            <p>Links require an <code>{"{ownerId}"}</code> path segment. For owner <code>42</code>, the template</p>
            <code>{"devices/{ownerId}/{deviceCode}/sensors/termoIgro"}</code>
            <p>becomes <code>devices/42/+/sensors/termoIgro</code>. It receives matching topics from that owner. To distinguish device types, include <code>{"{deviceTypeId}"}</code>:</p>
            <code>{"devices/{ownerId}/{deviceTypeId}/{deviceCode}/sensors/termoIgro"}</code>
            <p>Linked publishing requires a topic without <code>{"{deviceCode}"}</code>, so that the destination has no device-code wildcard.</p>
            <h3>Wildcards and actions</h3>
            <p>A final <code>/#</code> includes subtopics. Widgets must supply a concrete suffix, such as <code>relay/set</code>, before publishing or reading their topic.</p>
            <p>Actions describe the device: <code>publish</code> sends telemetry, <code>subscribe</code> receives commands, and <code>all</code> permits both.</p>
            <p><code>availability</code> is the only built-in topic, used for online/offline. Enabling MQTT creates editable <code>telemetry</code> and <code>commands</code> entries. An admin can add <code>state</code> if needed.</p>
        </div>
    </details>;
}
