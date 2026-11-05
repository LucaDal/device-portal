import { DB } from "../config/database";
import { SavedProperties } from "@shared/types/properties";
import { decryptSensitiveDeviceProperties } from "../utils/devicePropertiesSecurity";
import { mapDeviceTypeMqttTopicsToProperties } from "../utils/deviceTypeMqtt";

type DeviceConfiguration = Record<string, string | number | boolean>;

function parseSavedProperties(raw: unknown): SavedProperties {
    if (!raw) return {};
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as SavedProperties;
        }
    } catch (e) {
        console.error("Error parsing device configuration", e);
    }
    return {};
}

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
            const data = DB.prepare(
                `SELECT
                    dp.properties AS device_properties,
                    dt.genericProperties AS generic_properties
                 FROM devices d
                 LEFT JOIN device_properties dp ON dp.device_code = d.code
                 LEFT JOIN device_types dt ON dt.id = d.device_type_id
                 WHERE d.code = ?`
            ).get(deviceCode) as
                | {
                    device_properties?: string;
                    generic_properties?: string;
                }
                | undefined;
            if (!data) {
                return res.status(400).json({ error: "Device not found" });
            }

            const genericProps = parseSavedProperties(data.generic_properties);
            const savedProps = decryptSensitiveDeviceProperties(parseSavedProperties(data.device_properties));
            const merged = { ...genericProps, ...savedProps };
            const mqttProps = mapDeviceTypeMqttTopicsToProperties(deviceCode);
            const configuration = { ...mapToDeviceConfiguration(merged), ...mqttProps };
            res.json(configuration);
        } catch (err) {
            console.error("Error loading device configuration", err);
            return res.status(500).json({ error: "Failed to load device configuration" });
        }
    },
};
