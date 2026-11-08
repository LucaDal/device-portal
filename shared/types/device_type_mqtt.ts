import { DEFAULT_DEVICE_TYPE_MQTT_TOPICS, MQTT_AVAILABILITY_TOPIC, MqttAclAction } from "../constants/mqtt";

export interface DeviceTypeMqttTopic {
    key: string;
    label?: string;
    topic?: string;
    action: MqttAclAction;
    linkedTopic?: {
        deviceTypeId: string;
        topicKey: string;
    };
}

export function normalizeMqttTopicPath(value: string): string {
    return String(value || "")
        .trim()
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
}

export function parseDeviceTypeMqttTopics(raw: unknown): DeviceTypeMqttTopic[] {
    if (!raw) return [];
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((row) => {
                const linkedTopic = row?.linkedTopic && typeof row.linkedTopic === "object"
                    ? {
                        deviceTypeId: String(row.linkedTopic.deviceTypeId || "").trim(),
                        topicKey: String(row.linkedTopic.topicKey || "").trim(),
                    }
                    : undefined;
                return {
                    key: String(row?.key || linkedTopic?.topicKey || "").trim(),
                    label: String(row?.label || "").trim(),
                    topic: normalizeMqttTopicPath(String(row?.topic || "")),
                    action: row?.action,
                    linkedTopic,
                };
            })
            .filter((row) =>
                row.key &&
                (row.topic || (row.linkedTopic?.deviceTypeId && row.linkedTopic?.topicKey)) &&
                (row.action === "publish" || row.action === "subscribe" || row.action === "all")
            );
    } catch {
        return [];
    }
}

export function getDeviceTypeMqttTopics(raw: unknown): DeviceTypeMqttTopic[] {
    return [MQTT_AVAILABILITY_TOPIC, ...parseDeviceTypeMqttTopics(raw).filter((topic) => topic.key !== MQTT_AVAILABILITY_TOPIC.key)];
}

export function withDefaultDeviceTypeMqttTopics(topics: DeviceTypeMqttTopic[]): DeviceTypeMqttTopic[] {
    const keys = new Set(topics.map((topic) => topic.key));
    return [...topics, ...DEFAULT_DEVICE_TYPE_MQTT_TOPICS.filter((topic) => !keys.has(topic.key)).map((topic) => ({ ...topic }))];
}

export type MqttTopicTemplateContext = {
    deviceCode: string;
    deviceTypeId: string;
    ownerId: number | string | null;
};

export function resolveMqttTopicTemplate(
    topic: string,
    context: MqttTopicTemplateContext
): string {
    return String(topic || "")
        .replace(/\{deviceCode\}/g, context.deviceCode)
        .replace(/\{ownerId\}/g, context.ownerId ? String(context.ownerId) : "")
        .replace(/\{deviceTypeId\}/g, context.deviceTypeId);
}

export const MQTT_TOPIC_PLACEHOLDERS = ["{deviceCode}", "{ownerId}", "{deviceTypeId}"] as const;

export function getMqttTopicPlaceholderError(topic: string): string | null {
    const unknown: string[] = [];
    const remainder = topic.replace(/\{[^{}]*\}/g, (token) => {
        if (!MQTT_TOPIC_PLACEHOLDERS.some((allowed) => allowed === token)) unknown.push(token);
        return "";
    });
    const allowed = `Allowed: ${MQTT_TOPIC_PLACEHOLDERS.join(", ")}.`;
    if (/[{}]/.test(remainder)) return `Unbalanced MQTT placeholder braces. ${allowed}`;
    if (unknown.length) return `Unknown MQTT topic placeholder ${[...new Set(unknown)].join(", ")}. ${allowed}`;
    return null;
}
