const INSECURE_JWT_SECRETS = new Set([
  "cambiami_subito",
  "please-change-me",
  "changeme",
  "change-me",
  "default",
]);

function readSecret(name: string): string {
  return String(process.env[name] || "").trim();
}

function ensureStrongSecret(name: string, value: string, minLength = 32): string {
  if (!value) {
    throw new Error(`${name} is required and cannot be empty`);
  }

  if (value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters long`);
  }

  return value;
}

export function getJwtSecret(): string {
  const secret = ensureStrongSecret("JWT_SECRET", readSecret("JWT_SECRET"));

  if (INSECURE_JWT_SECRETS.has(secret.toLowerCase())) {
    throw new Error("JWT_SECRET is insecure; set a strong unique value");
  }

  return secret;
}

export function getMqttHttpAuthSecret(): string {
  return ensureStrongSecret("MQTT_HTTP_AUTH_SECRET", readSecret("MQTT_HTTP_AUTH_SECRET"));
}
