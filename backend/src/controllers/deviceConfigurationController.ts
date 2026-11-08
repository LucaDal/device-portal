import { getDeviceWithType, getDeviceProperties } from "../repositories/deviceRepository";
import { SavedProperties, parseSavedPropertyMap } from "@shared/types/properties";
import { decryptSensitiveDeviceProperties } from "../utils/devicePropertiesSecurity";

type DeviceConfiguration = Record<string, string | number | boolean>;

function mapToDeviceConfiguration(saved: SavedProperties): DeviceConfiguration {
    return Object.entries(saved).reduce<DeviceConfiguration>((acc, [key, entry]) => {
        if (entry && typeof entry === "object" && "value" in entry) {
            acc[key] = entry.value as string | number | boolean;
        }
        return acc;
    }, {});
}

export const DeviceConfigurationController = {
    getConfiguration(req: any, res: any) {
        res.setHeader("Cache-Control", "no-store");
        const deviceCode = String(req.deviceAuth?.deviceCode || "");
        try {
            const data = getDeviceWithType(deviceCode);
            if (!data) {
                return res.status(400).json({ error: "Device not found" });
            }

            const genericProps = parseSavedPropertyMap(data.generic_properties);
            const savedProps = decryptSensitiveDeviceProperties(parseSavedPropertyMap(getDeviceProperties(deviceCode)?.properties));
            const merged = { ...savedProps, ...genericProps };
            const configuration = mapToDeviceConfiguration(merged);
            res.json(configuration);
        } catch (err) {
            console.error("Error loading device configuration", err);
            return res.status(500).json({ error: "Failed to load device configuration" });
        }
    },
};
