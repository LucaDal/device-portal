import { getMqttTopicPlaceholderError } from "@shared/types/device_type_mqtt";

const REQUIRED_SCOPE_PLACEHOLDERS = ["{deviceCode}", "{ownerId}"];

export function validateMqttTopicTemplate(topic: string): string | null {
    const normalized = String(topic || "").trim();
    if (!normalized) return "MQTT topic is required.";
    if (Buffer.byteLength(normalized) > 65535 || /[\u0000+#]/.test(normalized.endsWith("/#") ? normalized.slice(0, -2) : normalized) || normalized.startsWith("$")) {
        return "MQTT topics must be application topics without null characters; only a final /# wildcard is allowed.";
    }
    const placeholderError = getMqttTopicPlaceholderError(normalized);
    if (placeholderError) return placeholderError;
    if (!normalized.split("/").some((part) => REQUIRED_SCOPE_PLACEHOLDERS.includes(part))) {
        return "MQTT topics must contain a full {deviceCode} or {ownerId} path segment.";
    }
    return null;
}
