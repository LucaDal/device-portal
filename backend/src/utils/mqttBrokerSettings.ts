import fs from "fs";
import crypto from "crypto";
import type { IClientOptions } from "mqtt";
import { getSetting, saveSetting } from "../repositories/settingsRepository";
import { DEFAULT_MQTT_BROKER_SETTINGS, MqttBrokerSettings, MqttBrokerSettingsView } from "@shared/types/mqtt_publish";
import { readMqttSecret, encryptMqttSecret, decryptMqttSecret } from "./mqttSecrets";
import { dynsecEnabled, dynsecConnection } from "./mqttConfiguration";
import { mqttAclEvents, MQTT_BROKER_SETTINGS_CHANGED_EVENT } from "../services/mqttAclEvents";

const SETTINGS_KEY = "mqtt_broker_settings";
const PASSWORD_PURPOSE = "device-portal-mqtt-broker-v1";

function readStoredBrokerSettings(): MqttBrokerSettings {
    const raw = getSetting(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_MQTT_BROKER_SETTINGS };
    const saved = JSON.parse(raw) as Partial<MqttBrokerSettings>;
    return {
        ...DEFAULT_MQTT_BROKER_SETTINGS,
        ...saved,
        protocol: saved.protocol === "mqtts" ? "mqtts" : "mqtt",
        password: String(saved.password || ""),
    };
}

export function loadSavedBrokerSettings(): MqttBrokerSettings {
    const settings = readStoredBrokerSettings();
    try {
        return { ...settings, password: settings.password
            ? decryptMqttSecret(settings.password, PASSWORD_PURPOSE, SETTINGS_KEY) : "" };
    } catch {
        throw new Error("Stored MQTT password cannot be read. Enter a new password or remove it in Settings.");
    }
}

export function loadBrokerSettings(): MqttBrokerSettings | null {
    if (dynsecEnabled()) {
        const connection = dynsecConnection();
        return {
            ...DEFAULT_MQTT_BROKER_SETTINGS,
            host: connection.host, port: connection.port, protocol: connection.protocol,
            username: connection.backendUsername,
            password: readMqttSecret("MQTT_DYNSEC_BACKEND_PASSWORD"), caFile: connection.caFile,
        };
    }
    const settings = loadSavedBrokerSettings();
    return settings.host ? settings : null;
}

export function brokerSettingsView(): MqttBrokerSettingsView {
    const connection = dynsecEnabled() ? dynsecConnection() : null;
    const settings = connection ? {
        ...DEFAULT_MQTT_BROKER_SETTINGS,
        host: connection.host, port: connection.port, protocol: connection.protocol,
        username: connection.backendUsername, caFile: connection.caFile,
    } : readStoredBrokerSettings();
    let passwordError: string | undefined;
    if (!connection && settings.password) {
        try { loadSavedBrokerSettings(); }
        catch { passwordError = "Stored MQTT password cannot be read. Enter a new password or remove it."; }
    }
    return {
        host: settings.host, port: settings.port, protocol: settings.protocol,
        username: settings.username, clientIdPrefix: settings.clientIdPrefix,
        allowInsecureTls: settings.allowInsecureTls, caFile: settings.caFile,
        clientCertFile: settings.clientCertFile, clientKeyFile: settings.clientKeyFile,
        passwordSet: connection ? Boolean(process.env.MQTT_DYNSEC_BACKEND_PASSWORD || process.env.MQTT_DYNSEC_BACKEND_PASSWORD_FILE)
            : Boolean(settings.password), managed: dynsecEnabled(),
        mode: dynsecEnabled() ? "dynamic-security" : "standalone",
        ...(passwordError ? { passwordError } : {}),
    };
}

export function saveBrokerSettings(body: Record<string, unknown>): MqttBrokerSettingsView {
    if (dynsecEnabled()) throw new Error("Broker settings are managed by the deployment");
    const settings = { ...DEFAULT_MQTT_BROKER_SETTINGS };
    for (const key of ["host", "username", "clientIdPrefix", "caFile", "clientCertFile", "clientKeyFile"] as const) {
        if (body[key] !== undefined && typeof body[key] !== "string") throw new Error(key + " must be a string");
        settings[key] = String(body[key] || settings[key]).trim();
    }
    if (!settings.host || /[\s/@?#\u0000]/.test(settings.host)) throw new Error("host must be a hostname or IP address");
    const port = Number(body.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("port is invalid");
    if (body.protocol !== "mqtt" && body.protocol !== "mqtts") throw new Error("protocol is invalid");
    settings.port = port;
    settings.protocol = body.protocol;
    if (body.allowInsecureTls !== undefined && typeof body.allowInsecureTls !== "boolean") {
        throw new Error("allowInsecureTls must be a boolean");
    }
    settings.allowInsecureTls = body.allowInsecureTls === true;
    if (Boolean(settings.clientCertFile) !== Boolean(settings.clientKeyFile)) {
        throw new Error("Client certificate and key must be provided together");
    }
    if (body.password !== undefined && body.password !== null && typeof body.password !== "string") {
        throw new Error("password must be a string or null");
    }
    // Omitted/blank means unchanged; null explicitly removes the password.
    settings.password = body.password === null ? "" : typeof body.password === "string" && body.password !== ""
        ? body.password : loadSavedBrokerSettings().password;
    validateBrokerTlsSettings(settings);
    const stored = {
        ...settings,
        password: settings.password ? encryptMqttSecret(settings.password, PASSWORD_PURPOSE, SETTINGS_KEY) : "",
    };
    saveSetting(SETTINGS_KEY, JSON.stringify(stored));
    mqttAclEvents.emit(MQTT_BROKER_SETTINGS_CHANGED_EVENT);
    return brokerSettingsView();
}

function ensureReadableFile(pathValue: string, label: string) {
    if (!pathValue) throw new Error(label + " is required");
    fs.accessSync(pathValue, fs.constants.R_OK);
}

export function validateBrokerTlsSettings(settings: MqttBrokerSettings) {
    if (settings.protocol !== "mqtts") return;
    if (settings.caFile) ensureReadableFile(settings.caFile, "CA file");
    if (settings.clientCertFile || settings.clientKeyFile) {
        ensureReadableFile(settings.clientCertFile, "Client certificate file");
        ensureReadableFile(settings.clientKeyFile, "Client key file");
    }
}

export function brokerClientOptions(settings: MqttBrokerSettings): IClientOptions {
    validateBrokerTlsSettings(settings);
    return {
        host: settings.host, port: settings.port, protocol: settings.protocol,
        username: settings.username || undefined, password: settings.password || undefined,
        clientId: `${settings.clientIdPrefix}-${crypto.randomUUID()}`,
        clean: true, connectTimeout: 5000, reconnectPeriod: 0,
        rejectUnauthorized: !settings.allowInsecureTls,
        ...(settings.protocol === "mqtts" ? {
            ...(settings.caFile ? { ca: fs.readFileSync(settings.caFile) } : {}),
            ...(settings.clientCertFile ? { cert: fs.readFileSync(settings.clientCertFile) } : {}),
            ...(settings.clientKeyFile ? { key: fs.readFileSync(settings.clientKeyFile) } : {}),
        } : {}),
    };
}
