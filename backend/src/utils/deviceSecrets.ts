import crypto from "crypto";

const DEVICE_SECRET_BYTES = 24;

export function generateDeviceSecret(): string {
    return crypto.randomBytes(DEVICE_SECRET_BYTES).toString("base64url");
}

export function hashDeviceSecret(secret: string): string {
    return crypto.createHash("sha256").update(secret, "utf8").digest("hex");
}

export function verifyDeviceSecret(secret: string, expectedHash: string): boolean {
    if (!secret || !expectedHash) return false;

    const providedHash = hashDeviceSecret(secret);
    const providedBuffer = Buffer.from(providedHash, "hex");
    const expectedBuffer = Buffer.from(expectedHash, "hex");

    if (providedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}
