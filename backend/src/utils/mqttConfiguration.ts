import type { MqttEndpoint } from "@shared/types/mqtt_publish";

export function dynsecEnabled(): boolean {
    return process.env.MQTT_DYNSEC_ENABLED === "true";
}

export function getPublicMqttEndpoint(): MqttEndpoint | null {
    const host = String(process.env.MQTT_PUBLIC_HOST || "").trim();
    const port = Number(process.env.MQTT_PUBLIC_PORT || 8883);
    if (!host || /[\s/]/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { host, port, protocol: "mqtts" };
}

export function mqttBrokerConnection() {
    const value = String(process.env.MQTT_BROKER_URL || "").trim();
    if (!value) return null;
    let url: URL;
    try { url = new URL(value); }
    catch { throw new Error("MQTT_BROKER_URL must be a valid mqtt:// or mqtts:// endpoint"); }
    if (!["mqtt:", "mqtts:"].includes(url.protocol) || !url.hostname || url.username || url.password
        || /[\s\u0000]/.test(value) || (url.pathname && url.pathname !== "/") || url.search || url.hash) {
        throw new Error("MQTT_BROKER_URL must use mqtt:// or mqtts:// without credentials, path, query or fragment");
    }
    const clientCertFile = String(process.env.MQTT_BROKER_CLIENT_CERT_FILE || "").trim();
    const clientKeyFile = String(process.env.MQTT_BROKER_CLIENT_KEY_FILE || "").trim();
    if (Boolean(clientCertFile) !== Boolean(clientKeyFile)) throw new Error("MQTT client certificate and key must be provided together");
    return {
        url: url.toString(), host: url.hostname.replace(/^\[|\]$/g, ""),
        port: Number(url.port || (url.protocol === "mqtts:" ? 8883 : 1883)),
        protocol: url.protocol === "mqtts:" ? "mqtts" as const : "mqtt" as const,
        username: String(process.env.MQTT_BROKER_USERNAME || "").trim(),
        caFile: String(process.env.MQTT_BROKER_CA_FILE || "").trim(),
        clientCertFile, clientKeyFile,
    };
}
