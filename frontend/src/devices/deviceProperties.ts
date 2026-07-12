import { DeviceWithRelations } from "@shared/types/device";
import {
    DevicePropertyMap,
    PropertyRow,
    SavedProperties,
    parseDevicePropertyMap,
} from "@shared/types/properties";

export type DevicePropertyRow = PropertyRow & { value: string };

export const parseTypePropertyDefinitions = (raw: unknown): DevicePropertyMap => {
    return parseDevicePropertyMap(raw);
};

export const parseDeviceProperties = (raw: unknown): SavedProperties => {
    if (!raw) return {};
    try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
            return obj as SavedProperties;
        }
    } catch (e) {
        console.error("Could not parse device properties", e);
    }
    return {};
};

export const buildPropertyRows = (device: DeviceWithRelations): DevicePropertyRow[] => {
    const typeDefs = parseTypePropertyDefinitions(device.type_deviceProperties);
    const devProps = parseDeviceProperties(device.device_properties);

    return Object.entries(typeDefs).map(([key, def]) => {
        const savedProp = devProps[key];
        return {
            key,
            type: def.type,
            sensitive: Boolean(def.sensitive),
            visible: def.visible !== false,
            mqtt: def.mqtt,
            value: savedProp ? String(savedProp.value) : "",
        };
    });
};

export const buildGenericPropertyRows = (device: DeviceWithRelations): DevicePropertyRow[] => {
    const genericProps = parseDeviceProperties(device.type_genericProperties);
    return Object.entries(genericProps).map(([key, saved]) => ({
        key,
        type: saved.type,
        value: String(saved.value),
    }));
};
