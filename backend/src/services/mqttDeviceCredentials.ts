import crypto from "crypto";
import { DB } from "../config/database";
import { encryptMqttSecret, decryptMqttSecret } from "../utils/mqttSecrets";

const PURPOSE = "device-portal-mqtt-v1";

export function mqttDeviceUsername(code: string): string {
    return `dp-device:${code}`;
}

export function mqttDeviceRole(code: string): string {
    return `dp-device:${crypto.createHash("sha256").update(code).digest("hex")}`;
}

export function getMqttDevicePassword(code: string, rotate = false): string {
    return DB.transaction(() => {
        const device = DB.prepare("SELECT code FROM devices WHERE code = ?").get(code);
        if (!device) throw new Error("Device not found");
        const saved = DB.prepare("SELECT encrypted_password FROM mqtt_device_credentials WHERE device_code = ?")
            .get(code) as { encrypted_password: string } | undefined;
        if (saved && !rotate) {
            return decryptMqttSecret(saved.encrypted_password, PURPOSE, code);
        }
        const password = crypto.randomBytes(32).toString("base64url");
        const encrypted = encryptMqttSecret(password, PURPOSE, code);
        DB.prepare(`INSERT INTO mqtt_device_credentials(device_code, encrypted_password) VALUES (?, ?)
            ON CONFLICT(device_code) DO UPDATE SET encrypted_password = excluded.encrypted_password`).run(code, encrypted);
        return password;
    })();
}
