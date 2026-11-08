import crypto from "crypto";
import { db } from "../config/database";
import { findDevice } from "../repositories/deviceRepository";
import { getDeviceCredentials, saveDeviceCredentials } from "../repositories/mqttDynsecRepository";
import { encryptMqttSecret, decryptMqttSecret } from "../utils/mqttSecrets";

const PURPOSE = "device-portal-mqtt-v1";

export function mqttDeviceUsername(code: string): string {
    return `dp-device:${code}`;
}

export function mqttDeviceRole(code: string): string {
    return `dp-device:${crypto.createHash("sha256").update(code).digest("hex")}`;
}

export function getMqttDevicePassword(code: string, rotate = false): string {
    return db.transaction(() => {
        const device = findDevice(code);
        if (!device) throw new Error("Device not found");
        const saved = getDeviceCredentials(code);
        if (saved && !rotate) {
            return decryptMqttSecret(saved.encrypted_password, PURPOSE, code);
        }
        const password = crypto.randomBytes(32).toString("base64url");
        const encrypted = encryptMqttSecret(password, PURPOSE, code);
        saveDeviceCredentials(code, encrypted);
        return password;
    });
}
