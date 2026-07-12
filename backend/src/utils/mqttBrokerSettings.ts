import fs from "fs";
import { DB } from "../config/database";
import { MqttBrokerSettings } from "@shared/types/mqtt_publish";

const MQTT_SETTINGS_KEY = "mqtt_broker_settings";

export function loadBrokerSettings(): MqttBrokerSettings | null {
    const row = DB.prepare("SELECT value FROM app_settings WHERE key = ?").get(MQTT_SETTINGS_KEY) as
        | { value: string | null }
        | undefined;
    if (!row?.value) return null;
    try {
        const parsed = JSON.parse(row.value) as Partial<MqttBrokerSettings>;
        const host = String(parsed.host || "").trim();
        const port = Number(parsed.port);
        const protocol = parsed.protocol === "mqtts" ? "mqtts" : "mqtt";
        if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) return null;
        return {
            host,
            port,
            protocol,
            username: String(parsed.username || ""),
            password: String(parsed.password || ""),
            clientIdPrefix: String(parsed.clientIdPrefix || "device-portal-api"),
            allowInsecureTls: parsed.allowInsecureTls === true,
            caFile: String(parsed.caFile || ""),
            clientCertFile: String(parsed.clientCertFile || ""),
            clientKeyFile: String(parsed.clientKeyFile || ""),
        };
    } catch {
        return null;
    }
}

function ensureReadableFile(pathValue: string, label: string) {
    if (!pathValue) {
        throw new Error(`${label} is required`);
    }
    fs.accessSync(pathValue, fs.constants.R_OK);
}

export function validateBrokerTlsSettings(settings: MqttBrokerSettings) {
    if (settings.protocol !== "mqtts") {
        return;
    }

    if (!settings.allowInsecureTls) {
        ensureReadableFile(settings.caFile, "CA file");
    }

    if (settings.clientCertFile || settings.clientKeyFile) {
        ensureReadableFile(settings.clientCertFile, "Client certificate file");
        ensureReadableFile(settings.clientKeyFile, "Client key file");
    }
}

export function appendBrokerAuthArgs(args: string[], settings: MqttBrokerSettings) {
    if (settings.username) {
        args.push("-u", settings.username);
    }
    if (settings.password) {
        args.push("-P", settings.password);
    }
    if (settings.protocol === "mqtts") {
        if (settings.allowInsecureTls) {
            args.push("--insecure");
        } else {
            args.push("--cafile", settings.caFile);
        }
        if (settings.clientCertFile && settings.clientKeyFile) {
            args.push("--cert", settings.clientCertFile, "--key", settings.clientKeyFile);
        }
    }
}
