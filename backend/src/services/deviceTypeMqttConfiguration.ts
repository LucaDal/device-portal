import { MQTT_AVAILABILITY_TOPIC } from "@shared/constants/mqtt";
import { validateWidgetTopics } from "@shared/widgets";
import { loadDeviceTypeWidgets } from "../repositories/deviceTypeWidgetRepository";
import { findDeviceType } from "../repositories/deviceTypeRepository";
import { getDeviceTypeMqttTopics, parseDeviceTypeMqttTopics } from "@shared/types/device_type_mqtt";
import { normalizeDeviceTypeMqttTopics } from "../utils/deviceTypeMqtt";
import { validateMqttTopicTemplate } from "../utils/mqttTopicTemplate";

export function normalizeMqttTopics(raw: unknown, deviceTypeId: string): string {
    const input = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(input)) throw new Error("mqttTopics must be an array");
    const topics = normalizeDeviceTypeMqttTopics(parseDeviceTypeMqttTopics(input));
    if (topics.length !== input.length) throw new Error("One or more MQTT topics are invalid");
    const keys = new Set<string>();
    for (const topic of topics) {
        if (topic.key === MQTT_AVAILABILITY_TOPIC.key) throw new Error(`MQTT topic key "${topic.key}" is reserved`);
        if (keys.has(topic.key)) throw new Error(`Duplicate MQTT topic key "${topic.key}"`);
        keys.add(topic.key);
        if (topic.linkedTopic) {
            const row = findDeviceType(topic.linkedTopic.deviceTypeId);
            const target = (topic.linkedTopic.deviceTypeId === deviceTypeId ? topics : parseDeviceTypeMqttTopics(row?.mqttTopics)).find((candidate) => candidate.key === topic.linkedTopic?.topicKey);
            if (!target || target.linkedTopic) throw new Error("Linked MQTT topic must reference an existing direct topic");
            const error = validateMqttTopicTemplate(target.topic || "");
            if (error) throw new Error(error);
            if (!target.topic?.split("/").includes("{ownerId}")) {
                throw new Error("Linked MQTT topics require an {ownerId} path segment to isolate owners");
            }
            if (topic.action !== "subscribe" && target.topic.includes("{deviceCode}")) {
                throw new Error("Publishing to a linked topic requires a topic without {deviceCode}; MQTT cannot publish to wildcards");
            }
            topic.topic = target.topic;
            topic.label = target.label || "";
        } else {
            const error = validateMqttTopicTemplate(topic.topic || "");
            if (error) throw new Error(error);
        }
    }
    for (const widget of loadDeviceTypeWidgets(deviceTypeId)) {
        try { validateWidgetTopics(widget, getDeviceTypeMqttTopics(topics)); }
        catch (error) { throw new Error(`Device type ${deviceTypeId}: ${error instanceof Error ? error.message : "Invalid widget topic"}`); }
    }
    return JSON.stringify(topics);
}
