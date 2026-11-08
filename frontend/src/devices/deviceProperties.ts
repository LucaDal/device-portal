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
        const value = savedProp
            ? String(savedProp.value)
            : def.notNull === false || typeof def.defaultValue === "undefined"
                ? ""
                : String(def.defaultValue);

        return {
            key,
            label: def.label || "",
            type: def.type,
            sensitive: Boolean(def.sensitive),
            notNull: def.notNull !== false,
            defaultValue: def.defaultValue,
            value,
        };
    });
};
