export type MqttTopicTemplateContext = {
    deviceCode: string;
    deviceTypeId: string;
    ownerId: number | string | null;
};

const REQUIRED_SCOPE_PLACEHOLDERS = ["{deviceCode}", "{ownerId}"];

export function resolveMqttTopicTemplate(
    topic: string,
    context: MqttTopicTemplateContext
): string {
    return String(topic || "")
        .replace(/\{deviceCode\}/g, context.deviceCode)
        .replace(/\{ownerId\}/g, context.ownerId ? String(context.ownerId) : "")
        .replace(/\{deviceTypeId\}/g, context.deviceTypeId);
}

export function hasMqttTopicScopePlaceholder(topic: string): boolean {
    return REQUIRED_SCOPE_PLACEHOLDERS.some((placeholder) => topic.includes(placeholder));
}

export function validateMqttTopicTemplate(topic: string): string | null {
    const normalized = String(topic || "").trim();
    if (!normalized) return "MQTT topic is required.";
    if (hasMqttTopicScopePlaceholder(normalized)) return null;

    return "MQTT topic must include {deviceCode} or {ownerId} to avoid global topics shared across users. Available placeholders: {deviceCode}, {ownerId}, {deviceTypeId}.";
}
