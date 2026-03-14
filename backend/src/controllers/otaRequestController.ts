import { DB } from "../config/database";
import crypto from "crypto";
import { SavedProperties } from "@shared/types/properties";
import { decryptSensitiveDeviceProperties } from "../utils/devicePropertiesSecurity";

type OtaProperties = Record<string, string | number | boolean>;

function parseSavedProperties(raw: unknown): SavedProperties {
    if (!raw) return {};
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as SavedProperties;
        }
    } catch (e) {
        console.error("Error parsing OTA properties", e);
    }
    return {};
}

function mapToOtaProperties(saved: SavedProperties): OtaProperties {
    return Object.entries(saved).reduce<OtaProperties>((acc, [key, entry]) => {
        if (entry && typeof entry === "object" && "value" in entry) {
            acc[key] = entry.value as string | number | boolean;
        }
        return acc;
    }, {});
}

function respondToBuildReq(data: any, res: any) {
    if (data) {
        const fileBuffer: Buffer = (data as any).fb;
        const md5Checksum = crypto.createHash("md5")
            .update(fileBuffer)
            .digest("hex");
        res.setHeader("X-MD5", md5Checksum);
        res.json({ version: (data as any).fv, md5Checksum: md5Checksum });
    } else {
        res.status(400).json({ error: "Device not found" });
    }
}

export const OtaController = {

    getProperties(req: any, res: any) {
        const dev_code = String(req.otaAuth?.deviceCode || "");
        try {
            const data = DB.prepare(
                `SELECT
                    dp.properties AS device_properties,
                    dt.genericProperties AS generic_properties
                 FROM devices d
                 LEFT JOIN device_properties dp ON dp.device_code = d.code
                 LEFT JOIN device_types dt ON dt.id = d.device_type_id
                 WHERE d.code = ?`
            ).get(dev_code) as { device_properties?: string; generic_properties?: string } | undefined;
            if (!data) {
                return res.status(400).json({ error: "Device not found" });
            }

            const genericProps = parseSavedProperties(data.generic_properties);
            const savedProps = decryptSensitiveDeviceProperties(parseSavedProperties(data.device_properties));
            const merged = { ...genericProps, ...savedProps };
            const otaProps = mapToOtaProperties(merged);
            res.json(otaProps);
        } catch (err) {
            console.error("Error loading OTA properties", err);
            return res.status(500).json({ error: "Failed to load OTA properties" });
        }
    },

    getBuildFromCode(req: any, res: any) {
        const deviceTypeId = String(req.otaAuth?.deviceTypeId || "");
        const deviceCode = String(req.otaAuth?.deviceCode || "");
        const row = DB.prepare(
            `SELECT firmware_build fb, firmware_version fv
             FROM device_types
             WHERE id = ?`
        ).get(deviceTypeId);
        if (!row) {
            return res.status(400).json({ error: "Device type not found" });
        }
        let device = "unknown";
        let version = "unknown";
        const esp8266Version = req.headers["x-esp8266-version"] as string | undefined;
        const esp8266Mac = req.headers["x-esp8266-sta-mac"] as string | undefined;

        const esp32Version = req.headers["x-esp32-version"] as string | undefined;
        const esp32Mac = req.headers["x-esp32-sta-mac"] as string | undefined;

        if (esp8266Version) {
            device = `x-esp8266[${esp8266Mac || "no-mac"}]`;
            version = esp8266Version;
        }
        if (esp32Version) {
            device = `x-esp32[${esp32Mac || "no-mac"}]`;
            version = esp32Version;
        }
        console.info(
            `client [${device}] - device [${deviceCode}] - type [${deviceTypeId}] - [${version} -> ${(row as any).fv}]`
        );

        const fileBuffer: Buffer = (row as any).fb;
        const md5Checksum = crypto.createHash("md5")
            .update(fileBuffer)
            .digest("hex");
        res.setHeader("X-MD5", md5Checksum);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent("firmware.bin")}"`
        );
        return res.send(fileBuffer);
    },
    getBuildInfoFromCode(req: any, res: any) {
        const device_type_id = String(req.otaAuth?.deviceTypeId || "");
        const data = DB.prepare(
            `SELECT firmware_version fv, firmware_build fb
             FROM device_types
             WHERE id = ?`
        ).get(device_type_id);
        respondToBuildReq(data, res);
    },

    UploadNewBuild(req: any, res: any) {
        const deviceTypeId = String(req.otaAuth?.deviceTypeId || "");
        const { version } = req.body as any;
        const file = req.file; // tipo Express.Multer.File | undefined

        if (!deviceTypeId || !version || !file) {
            return res.status(400).json({ error: "device type header, version or file missing" });
        }
        try {
            const stmt = DB.prepare(`
                UPDATE device_types
                SET
                    firmware_build   = @firmware_build,
                    firmware_version = @firmware_version
                WHERE id =  @device_id
            `);

            const file = req.file as Express.Multer.File;
            const result = stmt.run({
                firmware_build: file.buffer,
                firmware_version: version,
                device_id: deviceTypeId,
            });

            if (result.changes === 0) {
                throw new Error(`No match for device type [${deviceTypeId}]`);
            }
        } catch (e) {
            return res.status(400).json({ error: `Error updating file: ${e}` });
        }
        return res.json({ ok: `updated with version [${version}]` });
    },
};
