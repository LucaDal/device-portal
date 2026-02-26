import crypto from "crypto";
import {
    DevicePropertyMap,
    PropertyType,
    SavedProperties,
    parseDevicePropertyMap,
} from "@shared/types/properties";

const ENC_PREFIX = "enc:v1";
const ENC_ALGO = "aes-256-gcm";
const IV_LEN = 12;

function readEncryptionKey(): Buffer | null {
    const raw = String(process.env.DEVICE_PROPERTIES_ENCRYPTION_KEY || "").trim();
    if (!raw) return null;

    if (/^[a-fA-F0-9]{64}$/.test(raw)) {
        return Buffer.from(raw, "hex");
    }

    try {
        const decoded = Buffer.from(raw, "base64");
        if (decoded.length === 32) return decoded;
    } catch {
        return null;
    }
    return null;
}

function requireEncryptionKey(): Buffer {
    const key = readEncryptionKey();
    if (!key) {
        throw new Error("DEVICE_PROPERTIES_ENCRYPTION_KEY is missing or invalid");
    }
    return key;
}

function encryptString(plaintext: string): string {
    const key = requireEncryptionKey();
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ENC_ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENC_PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptString(payload: string): string {
    if (!payload.startsWith(`${ENC_PREFIX}:`)) {
        throw new Error("Invalid encrypted payload format");
    }
    const parts = payload.split(":");
    if (parts.length !== 5) {
        throw new Error("Invalid encrypted payload parts");
    }
    const iv = Buffer.from(parts[2], "base64");
    const tag = Buffer.from(parts[3], "base64");
    const ciphertext = Buffer.from(parts[4], "base64");
    const key = requireEncryptionKey();
    const decipher = crypto.createDecipheriv(ENC_ALGO, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
}

export function parseTypePropertyDefinitions(raw: unknown): DevicePropertyMap {
    return parseDevicePropertyMap(raw);
}

export function encryptSensitiveDeviceProperties(
    properties: SavedProperties,
    typeDefinitions: DevicePropertyMap
): SavedProperties {
    const out: SavedProperties = {};
    for (const [key, entry] of Object.entries(properties || {})) {
        if (!entry || typeof entry !== "object") continue;
        const definition = typeDefinitions[key];
        const isSensitiveString =
            definition?.type === PropertyType.STRING && Boolean(definition.sensitive);

        if (isSensitiveString) {
            const plain = String(entry.value ?? "");
            out[key] = {
                type: PropertyType.STRING,
                value: encryptString(plain),
                encrypted: true,
            };
            continue;
        }

        out[key] = {
            type: entry.type,
            value: entry.value,
            encrypted: false,
        };
    }
    return out;
}

export function decryptSensitiveDeviceProperties(properties: SavedProperties): SavedProperties {
    const out: SavedProperties = {};
    for (const [key, entry] of Object.entries(properties || {})) {
        if (!entry || typeof entry !== "object") continue;
        if (entry.type === PropertyType.STRING && entry.encrypted && typeof entry.value === "string") {
            out[key] = {
                ...entry,
                value: decryptString(entry.value),
                encrypted: false,
            };
            continue;
        }
        out[key] = entry;
    }
    return out;
}

