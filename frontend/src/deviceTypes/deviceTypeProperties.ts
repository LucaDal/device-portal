import { DeviceType } from "@shared/types/device_type";
import {
    DevicePropertyMap,
    PropertyRow,
    PropertyType,
    SavedProperties,
    castPropertyValue,
    parseDevicePropertyMap,
    parseSavedPropertyMap,
} from "@shared/types/properties";
import {
    DeviceTypeDashboardWidget,
    DeviceTypeMqttTopic,
    parseDeviceTypeDashboardWidgets,
    parseDeviceTypeMqttTopics,
} from "@shared/types/device_type_mqtt";

export type GenericPropertyRow = PropertyRow & { value: string };
export type DeviceTypePropertyEditorRow = GenericPropertyRow & { isGlobal: boolean };

export type DeviceTypePropertiesFormState = {
    properties: DeviceTypePropertyEditorRow[];
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
        label: def.label || "",
        type: def.type,
        sensitive: Boolean(def.sensitive),
        visible: def.visible !== false,
        defaultValue: def.defaultValue,
        mqtt: def.mqtt,
    }));
};

export const parseGenericProperties = (raw: unknown): GenericPropertyRow[] => {
    const props = parseSavedPropertyMap(raw);
    return Object.entries(props).map(([key, saved]) => ({
        key,
        label: saved?.label || "",
        type: saved?.type || PropertyType.STRING,
        global: Boolean(saved?.global),
        value: typeof saved?.value === "undefined" ? "" : String(saved.value),
    }));
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
    properties: [
        ...parseDeviceProperties(device.deviceProperties).map((row) => ({
            ...row,
            value: typeof row.defaultValue === "undefined" ? "" : String(row.defaultValue),
            isGlobal: false,
        })),
        ...parseGenericProperties(device.genericProperties).map((row) => ({
            ...row,
            sensitive: false,
            visible: true,
            isGlobal: true,
        })),
    ],
    mqttTopics: parseMqttTopics(device.mqttTopics),
    dashboardWidgets: parseDashboardWidgets(device.dashboardWidgets),
});

const castGenericValue = (
    row: GenericPropertyRow
): { ok: true; value: string | number | boolean } | { ok: false; error: string } => {
    const key = row.key.trim();
    return castPropertyValue(row.type, row.value, key);
};

export const buildDeviceTypePropertiesPayload = (
    propertyRows: DeviceTypePropertyEditorRow[]
): BuildPropertiesPayloadResult => {
    const deviceProperties: DevicePropertyMap = {};
    const genericProperties: SavedProperties = {};
    const seenKeys = new Set<string>();

    for (const row of propertyRows) {
        const key = row.key.trim();
        if (!key) continue;
        if (seenKeys.has(key)) {
            return { ok: false, error: `Duplicate property key "${key}".` };
        }
        seenKeys.add(key);

        if (row.isGlobal) {
            const cast = castGenericValue(row);
            if (!cast.ok) return cast;

            genericProperties[key] = {
                type: row.type,
                ...(row.label?.trim() ? { label: row.label.trim() } : {}),
                global: true,
                value: cast.value,
            };
            continue;
        }

        const nextDefinition: DevicePropertyMap[string] = {
            type: row.type,
            ...(row.label?.trim() ? { label: row.label.trim() } : {}),
            sensitive: row.type === PropertyType.STRING && Boolean(row.sensitive),
            visible: row.visible !== false,
        };
        if (row.value.trim() !== "") {
            const cast = castPropertyValue(row.type, row.value, key);
            if (!cast.ok) return cast;
            nextDefinition.defaultValue = cast.value;
        }
        deviceProperties[key] = nextDefinition;
    }

    return {
        ok: true,
        deviceProperties,
        genericProperties,
    };
};
