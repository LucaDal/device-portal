import crypto from "crypto";
import { spawn } from "child_process";
import { DB } from "../config/database";
import {
    MQTT_ACL_ACTIONS,
    MQTT_ACL_PERMISSION,
    MQTT_AUTH_RESULT,
    MqttAclAction,
} from "@shared/constants/mqtt";
import { ROLES } from "@shared/constants/auth";
import { MqttBrokerSettings, MqttPublishInput } from "@shared/types/mqtt_publish";

type AclRule = {
    action: MqttAclAction;
    topic_pattern: string;
    permission: "allow" | "deny";
    priority: number;
};

const MQTT_SETTINGS_KEY = "mqtt_broker_settings";

function compareSharedSecret(req: any): boolean {
    const configured = process.env.MQTT_HTTP_AUTH_SECRET;
    if (!configured) return true;

    const fromHeader =
        req.headers["x-emqx-auth-secret"] ||
        req.headers["x-mqtt-auth-secret"] ||
        "";
    const bearer = String(req.headers.authorization || "");
    const fromBearer = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
    const provided = String(fromHeader || fromBearer || "");
    if (!provided || provided.length !== configured.length) {
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(configured));
}

function getClientId(payload: any): string {
    return String(payload.clientid || payload.client_id || payload.clientId || "").trim();
}

function getAction(payload: any): MqttAclAction {
    const raw = String(payload.action || payload.access || "").toLowerCase();
    if (raw === "1" || raw === "subscribe") return MQTT_ACL_ACTIONS.SUBSCRIBE;
    if (raw === "2" || raw === "publish") return MQTT_ACL_ACTIONS.PUBLISH;
    return MQTT_ACL_ACTIONS.ALL;
}

function getTopic(payload: any): string {
    return String(payload.topic || payload.topic_name || "").trim();
}

function mqttTopicMatches(pattern: string, topic: string): boolean {
    const patternParts = pattern.split("/");
    const topicParts = topic.split("/");

    for (let i = 0, j = 0; i < patternParts.length; i += 1, j += 1) {
        const p = patternParts[i];
        const t = topicParts[j];

        if (p === "#") {
            return i === patternParts.length - 1;
        }
        if (p === "+") {
            if (typeof t === "undefined") return false;
            continue;
        }
        if (typeof t === "undefined" || p !== t) {
            return false;
        }
    }
    return patternParts.length === topicParts.length;
}

function allow(res: any) {
    return res.status(200).send({ result: MQTT_AUTH_RESULT.ALLOW, is_superuser: false });
}

function deny(res: any, reason?: string) {
    return res.status(200).send({ result: MQTT_AUTH_RESULT.DENY, reason });
}

function loadAclRules(deviceCode: string): AclRule[] {
    return DB.prepare(`
        SELECT action, topic_pattern, permission, priority
        FROM mqtt_acl_rules
        WHERE device_code = ?
        ORDER BY priority ASC, id ASC
    `).all(deviceCode) as AclRule[];
}

function checkBuiltInAcl(deviceCode: string, action: MqttAclAction, topic: string): boolean {
    const telemetryTopic = `devices/${deviceCode}/telemetry/#`;
    const commandsTopic = `devices/${deviceCode}/commands/#`;

    if (action === MQTT_ACL_ACTIONS.PUBLISH) {
        return mqttTopicMatches(telemetryTopic, topic);
    }
    if (action === MQTT_ACL_ACTIONS.SUBSCRIBE) {
        return mqttTopicMatches(commandsTopic, topic);
    }
    return false;
}

function canManageDeviceAcl(req: any, deviceCode: string): boolean {
    const role = String((req.user as any)?.role || "");
    if (!deviceCode) return false;
    return role === ROLES.ADMIN;
}

function loadBrokerSettings(): MqttBrokerSettings | null {
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
        };
    } catch {
        return null;
    }
}

function normalizePublishInput(req: any): MqttPublishInput | null {
    const source = req.method === "GET" ? req.query : req.body;
    const topic = String(source?.topic || "").trim();
    const email = String(source?.email || "").trim();
    const password = String(source?.password || "").trim();
    const rawContent = source?.content;

    if (!topic || !email || !password || typeof rawContent === "undefined") {
        return null;
    }

    let content: any = rawContent;
    if (typeof rawContent === "string") {
        try {
            content = JSON.parse(rawContent);
        } catch {
            return null;
        }
    }

    if (!content || typeof content !== "object") {
        return null;
    }

    return {
        topic,
        email,
        password,
        content,
    };
}

function canUserPublishTopic(userId: number, role: string, topic: string): boolean {
    if (!userId || !topic) return false;
    if (role === ROLES.ADMIN) return true;

    const permission = DB.prepare(
        "SELECT enabled FROM mqtt_publish_permissions WHERE user_id = ?"
    ).get(userId) as { enabled: number } | undefined;

    if (!permission || Number(permission.enabled) !== 1) {
        return false;
    }

    const rules = DB.prepare(`
        SELECT topic_pattern, permission
        FROM mqtt_publish_acl_rules
        WHERE user_id = ?
        ORDER BY priority ASC, id ASC
    `).all(userId) as Array<{ topic_pattern: string; permission: "allow" | "deny" }>;

    for (const rule of rules) {
        if (!mqttTopicMatches(rule.topic_pattern, topic)) continue;
        return rule.permission === "allow";
    }
    return false;
}

async function publishMqttMessage(
    settings: MqttBrokerSettings,
    topic: string,
    payload: string
): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const args: string[] = [
            "-h",
            settings.host,
            "-p",
            String(settings.port),
            "-t",
            topic,
            "-m",
            payload,
            "-i",
            `${settings.clientIdPrefix}-${Date.now()}`,
        ];

        if (settings.username) {
            args.push("-u", settings.username);
        }
        if (settings.password) {
            args.push("-P", settings.password);
        }
        if (settings.protocol === "mqtts") {
            args.push("--insecure");
        }

        const proc = spawn("mosquitto_pub", args);
        let stderr = "";

        const timer = setTimeout(() => {
            proc.kill("SIGKILL");
            reject(new Error("MQTT publish timeout"));
        }, 12000);

        proc.stderr.on("data", (chunk) => {
            stderr += String(chunk);
        });

        proc.on("error", (err: any) => {
            clearTimeout(timer);
            if (err?.code === "ENOENT") {
                return reject(new Error("mosquitto_pub command not found on server"));
            }
            return reject(err);
        });

        proc.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0) return resolve();
            return reject(new Error(stderr.trim() || `mosquitto_pub exited with code ${code}`));
        });
    });
}

export const MqttController = {
    acl(req: any, res: any) {
        try {
            if (!compareSharedSecret(req)) {
                return deny(res, "invalid shared secret");
            }

            const payload = req.body || {};
            const clientId = getClientId(payload);
            const action = getAction(payload);
            const topic = getTopic(payload);

            if (!clientId || !topic) {
                return deny(res, "missing acl fields");
            }

            const device = DB.prepare(
                "SELECT code, activated, COALESCE(mqtt_enabled, 1) AS mqtt_enabled FROM devices WHERE code = ?"
            ).get(clientId) as { code: string; activated: number; mqtt_enabled: number } | undefined;

            if (!device || !Number(device.activated) || !Number(device.mqtt_enabled)) {
                return deny(res, "unknown or disabled device");
            }

            const rules = loadAclRules(device.code);
            for (const rule of rules) {
                if (rule.action !== MQTT_ACL_ACTIONS.ALL && rule.action !== action) {
                    continue;
                }
                if (!mqttTopicMatches(rule.topic_pattern, topic)) {
                    continue;
                }
                return rule.permission === MQTT_ACL_PERMISSION.ALLOW
                    ? allow(res)
                    : deny(res, "rule denied");
            }

            if (checkBuiltInAcl(device.code, action, topic)) {
                return allow(res);
            }
            return deny(res, "default deny");
        } catch (err) {
            console.error("MQTT ACL error", err);
            return deny(res, "server error");
        }
    },

    listAclRules(req: any, res: any) {
        try {
            const deviceCode = String(req.params.deviceCode || "").trim();
            if (!deviceCode) return res.status(400).send({ error: "deviceCode is required" });

            const rows = DB.prepare(`
                SELECT id, device_code, action, topic_pattern, permission, priority, created_at
                FROM mqtt_acl_rules
                WHERE device_code = ?
                ORDER BY priority ASC, id ASC
            `).all(deviceCode);
            return res.send(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to list ACL rules" });
        }
    },

    upsertAclRule(req: any, res: any) {
        try {
            const deviceCode = String(req.params.deviceCode || "").trim();
            const { id, action, topicPattern, permission, priority } = req.body as {
                id?: number;
                action?: MqttAclAction;
                topicPattern?: string;
                permission?: "allow" | "deny";
                priority?: number;
            };

            if (!deviceCode) return res.status(400).send({ error: "deviceCode is required" });
            if (!action || !Object.values(MQTT_ACL_ACTIONS).includes(action)) {
                return res.status(400).send({ error: "Invalid action" });
            }
            if (!permission || !Object.values(MQTT_ACL_PERMISSION).includes(permission)) {
                return res.status(400).send({ error: "Invalid permission" });
            }
            const normalizedPattern = String(topicPattern || "").trim();
            if (!normalizedPattern) {
                return res.status(400).send({ error: "topicPattern is required" });
            }
            const normalizedPriority = Number.isFinite(Number(priority)) ? Number(priority) : 100;

            if (id) {
                const result = DB.prepare(`
                    UPDATE mqtt_acl_rules
                    SET action = ?, topic_pattern = ?, permission = ?, priority = ?
                    WHERE id = ? AND device_code = ?
                `).run(action, normalizedPattern, permission, normalizedPriority, id, deviceCode);
                if (!result.changes) {
                    return res.status(404).send({ error: "ACL rule not found" });
                }
                return res.send({ ok: true, id });
            }

            const result = DB.prepare(`
                INSERT INTO mqtt_acl_rules (device_code, action, topic_pattern, permission, priority)
                VALUES (?, ?, ?, ?, ?)
            `).run(deviceCode, action, normalizedPattern, permission, normalizedPriority);

            return res.status(201).send({ ok: true, id: Number(result.lastInsertRowid) });
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to upsert ACL rule" });
        }
    },

    deleteAclRule(req: any, res: any) {
        try {
            const id = Number(req.params.id);
            if (!id) return res.status(400).send({ error: "id is required" });

            const result = DB.prepare("DELETE FROM mqtt_acl_rules WHERE id = ?").run(id);
            if (!result.changes) {
                return res.status(404).send({ error: "ACL rule not found" });
            }
            return res.send({ ok: true });
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to delete ACL rule" });
        }
    },

    async publishMessage(req: any, res: any) {
        try {
            const input = normalizePublishInput(req);
            if (!input) {
                return res.status(400).send({
                    error: "topic, email, password and JSON content are required",
                });
            }
            const userId = Number((req.user as any)?.id);
            const role = String((req.user as any)?.role || "");
            if (!canUserPublishTopic(userId, role, input.topic)) {
                return res.status(403).send({
                    error: "Not authorized to publish on this topic",
                });
            }

            const settings = loadBrokerSettings();
            if (!settings) {
                return res.status(400).send({
                    error: "MQTT broker settings not configured. Configure them in Settings.",
                });
            }

            const message = JSON.stringify({
                email: input.email,
                password: input.password,
                content: input.content,
            });

            await publishMqttMessage(settings, input.topic, message);

            return res.send({
                ok: true,
                topic: input.topic,
                broker: `${settings.protocol}://${settings.host}:${settings.port}`,
            });
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to publish MQTT message" });
        }
    },
};
