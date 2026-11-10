import fs from "fs";
import crypto from "crypto";
import type { IClientOptions } from "mqtt";
import type { MqttBrokerSettings, MqttBrokerSettingsView } from "@shared/types/mqtt_publish";
import { readMqttSecret } from "./mqttSecrets";
import { dynsecEnabled, mqttBrokerConnection, getPublicMqttEndpoint } from "./mqttConfiguration";

export function loadBrokerSettings(): MqttBrokerSettings | null {
    const connection = mqttBrokerConnection();
    if (!connection) return null;
    return { ...connection, password: readMqttSecret("MQTT_BROKER_PASSWORD", dynsecEnabled() ? 32 : 0) };
}

export function brokerSettingsView(): MqttBrokerSettingsView {
    const connection = mqttBrokerConnection();
    return {
        connection: connection ? {
            host: connection.host, port: connection.port, protocol: connection.protocol,
            username: connection.username, caFile: connection.caFile,
            clientCertFile: connection.clientCertFile, clientKeyFile: connection.clientKeyFile,
        } : null,
        passwordSet: Boolean(process.env.MQTT_BROKER_PASSWORD || process.env.MQTT_BROKER_PASSWORD_FILE),
        dynamicSecurity: dynsecEnabled(),
        publicEndpoint: getPublicMqttEndpoint(),
    };
}

export function brokerClientOptions(settings: MqttBrokerSettings): IClientOptions {
    return {
        host: settings.host, port: settings.port, protocol: settings.protocol,
        username: settings.username || undefined, password: settings.password || undefined,
        clientId: `device-portal-api-${crypto.randomUUID()}`,
        clean: true, connectTimeout: 5000, reconnectPeriod: 0,
        rejectUnauthorized: true,
        ...(settings.protocol === "mqtts" ? {
            ...(settings.caFile ? { ca: fs.readFileSync(settings.caFile) } : {}),
            ...(settings.clientCertFile ? { cert: fs.readFileSync(settings.clientCertFile) } : {}),
            ...(settings.clientKeyFile ? { key: fs.readFileSync(settings.clientKeyFile) } : {}),
        } : {}),
    };
}
