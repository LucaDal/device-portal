export enum PropertyType {
    STRING = "string",
    INT = "int",
    UINT = "uint",
    FLOAT = "float",
    BOOL = "bool",
}

export type PropertyPrimitiveValue = string | number | boolean;

export interface PropertyRow {
    key: string;
    label?: string;
    type: PropertyType;
    global?: boolean;
    sensitive?: boolean;
    visible?: boolean;
    defaultValue?: PropertyPrimitiveValue;
    mqtt?: DevicePropertyMqttConfig;
}

export interface DevicePropertyDefinition {
    type: PropertyType;
    label?: string;
    sensitive?: boolean;
    visible?: boolean;
    defaultValue?: PropertyPrimitiveValue;
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
    value: PropertyPrimitiveValue;
    label?: string;
    global?: boolean;
    encrypted?: boolean;
}

export type SavedProperties = Record<string, SavedProperty>;

export function isPropertyType(value: unknown): value is PropertyType {
    return (
        value === PropertyType.STRING ||
        value === PropertyType.INT ||
        value === PropertyType.UINT ||
        value === PropertyType.FLOAT ||
        value === PropertyType.BOOL
    );
}

export type CastPropertyValueResult =
    | { ok: true; value: PropertyPrimitiveValue }
    | { ok: false; error: string };

export function castPropertyValue(
    type: PropertyType,
    rawValue: unknown,
    key = "value"
): CastPropertyValueResult {
    switch (type) {
        case PropertyType.INT: {
            const raw = String(rawValue ?? "").trim();
            if (!/^-?\d+$/.test(raw)) {
                return { ok: false, error: `Invalid value for "${key}" (int expected).` };
            }
            const n = Number(raw);
            if (!Number.isSafeInteger(n)) {
                return { ok: false, error: `Invalid value for "${key}" (safe int expected).` };
            }
            return { ok: true, value: n };
        }
        case PropertyType.UINT: {
            const raw = String(rawValue ?? "").trim();
            if (!/^\d+$/.test(raw)) {
                return { ok: false, error: `Invalid value for "${key}" (uint expected).` };
            }
            const n = Number(raw);
            if (!Number.isSafeInteger(n) || n < 0) {
                return { ok: false, error: `Invalid value for "${key}" (safe uint expected).` };
            }
            return { ok: true, value: n };
        }
        case PropertyType.FLOAT: {
            const raw = String(rawValue ?? "").trim().replace(",", ".");
            if (!raw || !/^-?(?:\d+|\d*\.\d+)$/.test(raw)) {
                return { ok: false, error: `Invalid value for "${key}" (float expected).` };
            }
            const n = Number(raw);
            if (!Number.isFinite(n)) {
                return { ok: false, error: `Invalid value for "${key}" (finite float expected).` };
            }
            return { ok: true, value: n };
        }
        case PropertyType.BOOL: {
            if (typeof rawValue === "boolean") {
                return { ok: true, value: rawValue };
            }
            const raw = String(rawValue ?? "").trim().toLowerCase();
            if (raw !== "true" && raw !== "false") {
                return { ok: false, error: `Invalid value for "${key}" (true/false expected).` };
            }
            return { ok: true, value: raw === "true" };
        }
        case PropertyType.STRING:
        default:
            return { ok: true, value: String(rawValue ?? "") };
    }
}

export function normalizeDevicePropertyDefinition(value: unknown): DevicePropertyDefinition | null {
    if (typeof value === "string" && isPropertyType(value)) {
        return { type: value, sensitive: false, visible: true };
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const rawType = (value as any).type;
        if (!isPropertyType(rawType)) return null;
        const label = String((value as any).label || "").trim();
        const sensitive = rawType === PropertyType.STRING && Boolean((value as any).sensitive);
        const visible = (value as any).visible !== false;
        const rawMqtt = (value as any).mqtt;
        const mqtt = normalizeDevicePropertyMqttConfig(rawMqtt);
        const hasDefaultValue = Object.prototype.hasOwnProperty.call(value, "defaultValue");
        const defaultValue = hasDefaultValue
            ? castPropertyValue(rawType, (value as any).defaultValue, "defaultValue")
            : null;
        if (defaultValue && !defaultValue.ok) return null;
        return {
            type: rawType,
            ...(label ? { label } : {}),
            sensitive,
            visible,
            ...(defaultValue?.ok ? { defaultValue: defaultValue.value } : {}),
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

export function parseSavedPropertyMap(raw: unknown): SavedProperties {
    if (!raw) return {};
    try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};

        const out: SavedProperties = {};
        for (const [key, value] of Object.entries(obj)) {
            if (!value || typeof value !== "object" || Array.isArray(value)) continue;
            const rawType = (value as any).type;
            if (!isPropertyType(rawType)) continue;
            const cast = castPropertyValue(rawType, (value as any).value, key);
            if (!cast.ok) continue;
            out[key] = {
                type: rawType,
                value: cast.value,
                ...(String((value as any).label || "").trim()
                    ? { label: String((value as any).label || "").trim() }
                    : {}),
                global: Boolean((value as any).global),
                encrypted: Boolean((value as any).encrypted),
            };
        }
        return out;
    } catch {
        return {};
    }
}
