import { DB } from "../config/database";
import { MqttBrokerSettings } from "@shared/types/mqtt_publish";

const DEFAULT_SETTINGS: MqttBrokerSettings = {
    host: "",
    port: 1883,
    protocol: "mqtt",
    username: "",
    password: "",
    clientIdPrefix: "device-portal-api",
};

const KEY = "mqtt_broker_settings";

function parseSettings(raw: string | null | undefined): MqttBrokerSettings {
    if (!raw) return { ...DEFAULT_SETTINGS };
    try {
        const parsed = JSON.parse(raw) as Partial<MqttBrokerSettings>;
        const protocol = parsed.protocol === "mqtts" ? "mqtts" : "mqtt";
        const portNum = Number(parsed.port);
        return {
            host: String(parsed.host || ""),
            port: Number.isFinite(portNum) && portNum > 0 ? portNum : DEFAULT_SETTINGS.port,
            protocol,
            username: String(parsed.username || ""),
            password: String(parsed.password || ""),
            clientIdPrefix: String(parsed.clientIdPrefix || DEFAULT_SETTINGS.clientIdPrefix),
        };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export const SettingsController = {
    getMqttBrokerSettings(_req: any, res: any) {
        try {
            const row = DB.prepare("SELECT value FROM app_settings WHERE key = ?").get(KEY) as
                | { value: string | null }
                | undefined;
            return res.send(parseSettings(row?.value));
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to load MQTT broker settings" });
        }
    },

    upsertMqttBrokerSettings(req: any, res: any) {
        try {
            const body = req.body || {};
            const protocol = body.protocol === "mqtts" ? "mqtts" : "mqtt";
            const host = String(body.host || "").trim();
            const username = String(body.username || "").trim();
            const password = String(body.password || "").trim();
            const clientIdPrefix = String(body.clientIdPrefix || DEFAULT_SETTINGS.clientIdPrefix).trim();
            const port = Number(body.port);

            if (!host) return res.status(400).send({ error: "host is required" });
            if (!Number.isFinite(port) || port <= 0 || port > 65535) {
                return res.status(400).send({ error: "port is invalid" });
            }

            const payload: MqttBrokerSettings = {
                host,
                port,
                protocol,
                username,
                password,
                clientIdPrefix: clientIdPrefix || DEFAULT_SETTINGS.clientIdPrefix,
            };

            DB.prepare(`
                INSERT INTO app_settings (key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = CURRENT_TIMESTAMP
            `).run(KEY, JSON.stringify(payload));

            return res.send(payload);
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to save MQTT broker settings" });
        }
    },
};
