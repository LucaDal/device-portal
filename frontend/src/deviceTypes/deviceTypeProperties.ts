import { DeviceType } from "@shared/types/device_type";
import {
    DevicePropertyMap,
    PropertyRow,
    PropertyType,
    SavedProperties,
    parseDevicePropertyMap,
} from "@shared/types/properties";
import {
    DeviceTypeDashboardWidget,
    DeviceTypeMqttTopic,
    parseDeviceTypeDashboardWidgets,
    parseDeviceTypeMqttTopics,
} from "@shared/types/device_type_mqtt";

export type GenericPropertyRow = PropertyRow & { value: string };

export type DeviceTypePropertiesFormState = {
    deviceProperties: PropertyRow[];
    genericProperties: GenericPropertyRow[];
    mqttTopics: DeviceTypeMqttTopic[];
    dashboardWidgets: DeviceTypeDashboardWidget[];
};

type BuildPropertiesPayloadResult =
    | {
        ok: true;
        deviceProperties: DevicePropertyMap;
        genericProperties: SavedProperties;
    }
    | { ok: false; error: string };

export const parseDeviceProperties = (raw: unknown): PropertyRow[] => {
    const parsed = parseDevicePropertyMap(raw);
    return Object.entries(parsed).map(([key, def]) => ({
        key,
        type: def.type,
        sensitive: Boolean(def.sensitive),
        visible: def.visible !== false,
        mqtt: def.mqtt,
    }));
};

export const parseGenericProperties = (raw: unknown): GenericPropertyRow[] => {
    if (!raw) return [];
    try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
            const props = obj as SavedProperties;
            return Object.entries(props).map(([key, saved]) => ({
                key,
                type: saved?.type || PropertyType.STRING,
                value: typeof saved?.value === "undefined" ? "" : String(saved.value),
            }));
        }
    } catch (e) {
        console.error("Could not parse genericProperties", e);
    }
    return [];
};

export const parseMqttTopics = (raw: unknown): DeviceTypeMqttTopic[] => {
    return parseDeviceTypeMqttTopics(raw);
};

export const parseDashboardWidgets = (raw: unknown): DeviceTypeDashboardWidget[] => {
    return parseDeviceTypeDashboardWidgets(raw);
};

export const parseDeviceTypePropertiesForm = (
    device: Pick<DeviceType, "deviceProperties" | "genericProperties" | "mqttTopics" | "dashboardWidgets">
): DeviceTypePropertiesFormState => ({
    deviceProperties: parseDeviceProperties(device.deviceProperties),
    genericProperties: parseGenericProperties(device.genericProperties),
    mqttTopics: parseMqttTopics(device.mqttTopics),
    dashboardWidgets: parseDashboardWidgets(device.dashboardWidgets),
});

const castGenericValue = (
    row: GenericPropertyRow
): { ok: true; value: string | number | boolean } | { ok: false; error: string } => {
    const key = row.key.trim();
    switch (row.type) {
        case PropertyType.INT: {
            const n = parseInt(row.value, 10);
            if (Number.isNaN(n)) {
                return { ok: false, error: `Invalid value for "${key}" (int expected).` };
            }
            return { ok: true, value: n };
        }
        case PropertyType.FLOAT: {
            const normalized = row.value.replace(",", ".");
            const n = parseFloat(normalized);
            if (Number.isNaN(n)) {
                return { ok: false, error: `Invalid value for "${key}" (float expected).` };
            }
            return { ok: true, value: n };
        }
        case PropertyType.BOOL: {
            const lower = row.value.toLowerCase();
            if (lower !== "true" && lower !== "false") {
                return { ok: false, error: `Invalid value for "${key}" (true/false expected).` };
            }
            return { ok: true, value: lower === "true" };
        }
        case PropertyType.STRING:
        default:
            return { ok: true, value: row.value };
    }
};

export const buildDeviceTypePropertiesPayload = (
    devicePropertiesRows: PropertyRow[],
    genericPropertiesRows: GenericPropertyRow[]
): BuildPropertiesPayloadResult => {
    const deviceProperties: DevicePropertyMap = {};
    const genericProperties: SavedProperties = {};

    for (const row of devicePropertiesRows) {
        const key = row.key.trim();
        if (!key) continue;
        deviceProperties[key] = {
            type: row.type,
            sensitive: row.type === PropertyType.STRING && Boolean(row.sensitive),
            visible: row.visible !== false,
        };
    }

    for (const row of genericPropertiesRows) {
        const key = row.key.trim();
        if (!key) continue;

        const cast = castGenericValue(row);
        if (!cast.ok) return cast;

        genericProperties[key] = {
            type: row.type,
            value: cast.value,
        };
    }

    return {
        ok: true,
        deviceProperties,
        genericProperties,
    };
};
