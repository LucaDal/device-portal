import { DB } from "../config/database";
import crypto from "crypto";

function respondWithFirmwareVersion(data: any, res: any) {
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

    downloadFirmware(req: any, res: any) {
        const deviceTypeId = String(req.deviceAuth?.deviceTypeId || "");
        const deviceCode = String(req.deviceAuth?.deviceCode || "");
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
    getFirmwareVersion(req: any, res: any) {
        const device_type_id = String(req.deviceAuth?.deviceTypeId || "");
        const data = DB.prepare(
            `SELECT firmware_version fv, firmware_build fb
             FROM device_types
             WHERE id = ?`
        ).get(device_type_id);
        respondWithFirmwareVersion(data, res);
    },

    uploadFirmware(req: any, res: any) {
        const deviceTypeId = String(req.deviceAuth?.deviceTypeId || "");
        const version = req.body?.version;
        const file = req.file as Express.Multer.File | undefined;

        if (!deviceTypeId || typeof version !== "string" || !version.trim() || !file) {
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
