import { DB } from "../config/database";
import crypto from "crypto";
import { SavedProperties } from "@shared/types/properties";

type OtaProperties = Record<string, string | number | boolean>;

function parseSavedProperties(raw: unknown): SavedProperties {
    if (!raw) return {};
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as SavedProperties;
        }
    } catch (e) {
        console.error("Errore nel parse delle properties OTA", e);
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

export const OtaController = {

    getProperties(req: any, res: any) {
        const { dev_code } = req.params
        const data = DB.prepare(
            "SELECT properties FROM device_properties WHERE device_code = ?"
        ).get(dev_code);
        if (!data) {
            return res.status(400).json({ error: "Device not found" });
        }

        const savedProps = parseSavedProperties((data as any).properties);
        const otaProps = mapToOtaProperties(savedProps);
        res.json(otaProps);
    },

    getBuildFromCode(req: any, res: any) {
        const { dev_code } = req.params
        const row = DB.prepare(
            `SELECT firmware_build fb, firmware_version fv FROM devices d
                JOIN device_types dt ON d.device_type_id = dt.id
                WHERE d.code = ?`
        ).get(dev_code);
        if (!row) {
            res.status(400).json({ error: "Device not found" });
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
        console.info(`client [${device}] - device [${dev_code}] - [${version} -> ${(row as any).fv}]`);

        const fileBuffer: Buffer = (row as any).fb;
        const md5Checksum = crypto.createHash("md5")
            .update(fileBuffer)
            .digest("hex");
        res.setHeader("x-MD5", md5Checksum);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent("firmware.bin")}"`
        );
        return res.send(fileBuffer);
    },

    getBuildInfoFromCode(req: any, res: any) {
        const { dev_code } = req.params
        const data = DB.prepare(
            `SELECT firmware_version fv, firmware_build fb FROM devices d
                JOIN device_types dt ON d.device_type_id = dt.id
                WHERE code = ?`
        ).get(dev_code);
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
    },

    UploadNewBuild(req: any, res: any) {
        const { token, version } = req.body as any;
        const file = req.file; // tipo Express.Multer.File | undefined

        if (!token || !version || !file) {
            return res.status(400).json({ error: "token, version or file missing" });
        }
        try {
            const stmt = DB.prepare(`
                UPDATE device_types
                SET
                    firmware_build   = @firmware_build,
                    firmware_version = @firmware_version
                WHERE id = (
                    SELECT device_type_id
                    FROM devices
                    WHERE code = @device_id)
            `);

            const file = req.file as Express.Multer.File;
            const result = stmt.run({
                firmware_build: file.buffer,
                firmware_version: version,
                device_id: token,   // qui "token" è il code del device
            });

            if (result.changes === 0) {
                throw new Error(`No match for device code [${token}]`);
            }
        } catch (e) {
            return res.status(400).json({ error: `Error updating file: ${e}` });
        }
        return res.json({ ok: `updated with version [${version}]` });
    },
};
