export enum PropertyType {
    STRING = "string",
    INT = "int",
    FLOAT = "float",
    BOOL = "bool",
}

export interface PropertyRow {
    key: string;
    type: PropertyType;
    sensitive?: boolean;
    visible?: boolean;
    mqtt?: DevicePropertyMqttConfig;
}

export interface DevicePropertyDefinition {
    type: PropertyType;
    sensitive?: boolean;
    visible?: boolean;
    mqtt?: DevicePropertyMqttConfig;
}

export type DevicePropertyMap = Record<string, DevicePropertyDefinition>;

export interface DevicePropertyMqttConfig {
    publishTopic?: string;
    subscribeTopic?: string;
}

// Struttura salvata nel DB per ogni proprietà del *device*:
// {
//   "maxTemp": { "type": "int", "value": 30 },
//   "label":   { "type": "string", "value": "TEST" }
// }
export interface SavedProperty {
    type: PropertyType;
    value: string | number | boolean;
    encrypted?: boolean;
}

export type SavedProperties = Record<string, SavedProperty>;

export function isPropertyType(value: unknown): value is PropertyType {
    return (
        value === PropertyType.STRING ||
        value === PropertyType.INT ||
        value === PropertyType.FLOAT ||
        value === PropertyType.BOOL
    );
}

export function normalizeDevicePropertyDefinition(value: unknown): DevicePropertyDefinition | null {
    if (typeof value === "string" && isPropertyType(value)) {
        return { type: value, sensitive: false, visible: true };
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const rawType = (value as any).type;
        if (!isPropertyType(rawType)) return null;
        const sensitive = rawType === PropertyType.STRING && Boolean((value as any).sensitive);
        const visible = (value as any).visible !== false;
        const rawMqtt = (value as any).mqtt;
        const mqtt = normalizeDevicePropertyMqttConfig(rawMqtt);
        return {
            type: rawType,
            sensitive,
            visible,
            ...(mqtt ? { mqtt } : {}),
        };
    }
    return null;
}

export function normalizeMqttTopicTemplate(value: unknown): string {
    return String(value || "")
        .trim()
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
}

export function normalizeDevicePropertyMqttConfig(raw: unknown): DevicePropertyMqttConfig | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

    const publishTopic = normalizeMqttTopicTemplate((raw as any).publishTopic);
    const subscribeTopic = normalizeMqttTopicTemplate((raw as any).subscribeTopic);
    if (!publishTopic && !subscribeTopic) return undefined;

    return {
        ...(publishTopic ? { publishTopic } : {}),
        ...(subscribeTopic ? { subscribeTopic } : {}),
    };
}

export function parseDevicePropertyMap(raw: unknown): DevicePropertyMap {
    if (!raw) return {};
    try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};

        const out: DevicePropertyMap = {};
        for (const [key, value] of Object.entries(obj)) {
            const normalized = normalizeDevicePropertyDefinition(value);
            if (!normalized) continue;
            out[key] = normalized;
        }
        return out;
    } catch {
        return {};
    }
}
