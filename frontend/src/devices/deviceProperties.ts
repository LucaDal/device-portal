import { DeviceWithRelations } from "@shared/types/device";
import {
    DevicePropertyMap,
    PropertyRow,
    SavedProperties,
    parseDevicePropertyMap,
    parseSavedPropertyMap,
} from "@shared/types/properties";

export type DevicePropertyRow = PropertyRow & { value: string };

export const parseTypePropertyDefinitions = (raw: unknown): DevicePropertyMap => {
    return parseDevicePropertyMap(raw);
};

export const parseDeviceProperties = (raw: unknown): SavedProperties => {
    return parseSavedPropertyMap(raw);
};

export const buildPropertyRows = (device: DeviceWithRelations): DevicePropertyRow[] => {
    const typeDefs = parseTypePropertyDefinitions(device.type_deviceProperties);
    const devProps = parseDeviceProperties(device.device_properties);

    return Object.entries(typeDefs).map(([key, def]) => {
        const savedProp = devProps[key];
        return {
            key,
            label: def.label || "",
            type: def.type,
            sensitive: Boolean(def.sensitive),
            visible: def.visible !== false,
            mqtt: def.mqtt,
            defaultValue: def.defaultValue,
            value: savedProp
                ? String(savedProp.value)
                : typeof def.defaultValue === "undefined"
                  ? ""
                  : String(def.defaultValue),
        };
    });
};

export const buildGenericPropertyRows = (device: DeviceWithRelations): DevicePropertyRow[] => {
    const genericProps = parseDeviceProperties(device.type_genericProperties);
    return Object.entries(genericProps).map(([key, saved]) => ({
        key,
        label: saved.label || "",
        type: saved.type,
        value: String(saved.value),
    }));
};
