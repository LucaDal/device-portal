import fs from "fs";
import crypto from "crypto";

export function readMqttSecret(name: string, minimumLength = 32): string {
    const file = process.env[`${name}_FILE`];
    const value = file ? fs.readFileSync(file, "utf8").trim() : String(process.env[name] || "");
    if (value.length < minimumLength) throw new Error(`${name} must contain at least ${minimumLength} characters`);
    return value;
}

function encryptionKey(purpose: string): Buffer {
    const raw = String(process.env.DEVICE_PROPERTIES_ENCRYPTION_KEY || "").trim();
    const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("Invalid device encryption key");
    return Buffer.from(crypto.hkdfSync("sha256", key, Buffer.alloc(0), purpose, 32));
}

export function encryptMqttSecret(value: string, purpose: string, identity: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(purpose), iv);
    cipher.setAAD(Buffer.from(identity));
    const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
    return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptMqttSecret(value: string, purpose: string, identity: string): string {
    const [version, iv, tag, ciphertext] = value.split(":");
    if (version !== "v1" || !iv || !tag || ciphertext === undefined) throw new Error("Invalid MQTT credential");
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(purpose), Buffer.from(iv, "base64"));
    decipher.setAAD(Buffer.from(identity));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString();
}
