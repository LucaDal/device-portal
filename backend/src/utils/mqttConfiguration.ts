export function dynsecEnabled(): boolean {
    return process.env.MQTT_DYNSEC_ENABLED === "true";
}

export function dynsecConnection() {
    const url = new URL(process.env.MQTT_DYNSEC_URL || "mqtt://mosquitto:1883");
    if (!["mqtt:", "mqtts:"].includes(url.protocol) || url.username || url.password) {
        throw new Error("Use a mqtt:// or mqtts:// broker URL without embedded credentials");
    }
    return {
        url: url.toString(), host: url.hostname,
        port: Number(url.port || (url.protocol === "mqtts:" ? 8883 : 1883)),
        protocol: url.protocol === "mqtts:" ? "mqtts" as const : "mqtt" as const,
        controlUsername: process.env.MQTT_DYNSEC_USERNAME || "dp-sync",
        backendUsername: process.env.MQTT_DYNSEC_BACKEND_USERNAME || "dp-backend",
        caFile: process.env.MQTT_DYNSEC_CA_FILE || "",
    };
}
