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
}

export interface DevicePropertyDefinition {
    type: PropertyType;
    sensitive?: boolean;
}

export type DevicePropertyMap = Record<string, DevicePropertyDefinition>;

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
        return { type: value, sensitive: false };
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const rawType = (value as any).type;
        if (!isPropertyType(rawType)) return null;
        const sensitive = rawType === PropertyType.STRING && Boolean((value as any).sensitive);
        return { type: rawType, sensitive };
    }
    return null;
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
