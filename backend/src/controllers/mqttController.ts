import crypto from "crypto";
import { X509Certificate } from "crypto";
import { DB } from "../config/database";
import {
    MQTT_ACL_ACTIONS,
    MQTT_ACL_PERMISSION,
    MQTT_AUTH_RESULT,
    MqttAclAction,
} from "@shared/constants/mqtt";
import { ROLES } from "@shared/constants/auth";

type DeviceCertificate = {
    client_id: string;
    device_code: string;
    cert_fingerprint_sha256: string;
    enabled: number;
};

type AclRule = {
    action: MqttAclAction;
    topic_pattern: string;
    permission: "allow" | "deny";
    priority: number;
};

function normalizeFingerprint(value: string): string {
    return value.replace(/:/g, "").trim().toLowerCase();
}

function decodeMaybePem(value: string): string {
    const trimmed = value.trim();
    if (trimmed.includes("-----BEGIN CERTIFICATE-----")) {
        return trimmed;
    }
    try {
        return decodeURIComponent(trimmed);
    } catch {
        return trimmed;
    }
}

function getFingerprintFromPem(pem: string): string {
    try {
        const cert = new X509Certificate(pem);
        return normalizeFingerprint(cert.fingerprint256);
    } catch {
        // Fallback hash if parser fails; still stable for exact same PEM content.
        return normalizeFingerprint(crypto.createHash("sha256").update(pem).digest("hex"));
    }
}

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

function findCertificateByClientId(clientId: string): DeviceCertificate | undefined {
    return DB.prepare(`
        SELECT client_id, device_code, cert_fingerprint_sha256, enabled
        FROM device_certificates
        WHERE client_id = ?
    `).get(clientId) as DeviceCertificate | undefined;
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

function validateCertificateMatch(payload: any, certificate: DeviceCertificate): boolean {
    const providedFingerprint = String(
        payload.cert_fingerprint_sha256 ||
        payload.cert_fingerprint ||
        payload.peer_cert_fingerprint ||
        ""
    ).trim();
    const providedPemRaw = String(payload.cert_pem || payload.peer_cert || "").trim();

    let presentedFingerprint = "";
    if (providedFingerprint) {
        presentedFingerprint = normalizeFingerprint(providedFingerprint);
    } else if (providedPemRaw) {
        const decodedPem = decodeMaybePem(providedPemRaw);
        presentedFingerprint = getFingerprintFromPem(decodedPem);
    }

    if (!presentedFingerprint) return false;
    return normalizeFingerprint(certificate.cert_fingerprint_sha256) === presentedFingerprint;
}

function canManageDeviceAcl(req: any, deviceCode: string): boolean {
    const role = String((req.user as any)?.role || "");
    if (!deviceCode) return false;
    return role === ROLES.ADMIN;
}

export const MqttController = {
    async auth(req: any, res: any) {
        try {
            if (!compareSharedSecret(req)) {
                return deny(res, "invalid shared secret");
            }

            const payload = req.body || {};
            const clientId = getClientId(payload);
            if (!clientId) {
                return deny(res, "missing client id");
            }

            const cert = findCertificateByClientId(clientId);
            if (!cert || !cert.enabled) {
                return deny(res, "certificate not found or disabled");
            }

            if (!validateCertificateMatch(payload, cert)) {
                return deny(res, "certificate mismatch");
            }

            return allow(res);
        } catch (err) {
            console.error("MQTT auth error", err);
            return deny(res, "server error");
        }
    },

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

            const cert = findCertificateByClientId(clientId);
            if (!cert || !cert.enabled) {
                return deny(res, "unknown client");
            }

            const rules = loadAclRules(cert.device_code);
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

            if (checkBuiltInAcl(cert.device_code, action, topic)) {
                return allow(res);
            }
            return deny(res, "default deny");
        } catch (err) {
            console.error("MQTT ACL error", err);
            return deny(res, "server error");
        }
    },

    listCertificates(_req: any, res: any) {
        try {
            const rows = DB.prepare(`
                SELECT
                    client_id,
                    device_code,
                    cert_fingerprint_sha256,
                    enabled,
                    created_at,
                    updated_at,
                    CASE WHEN secret_hash IS NULL OR secret_hash = '' THEN 0 ELSE 1 END AS has_secret
                FROM device_certificates
                ORDER BY updated_at DESC
            `).all();
            return res.send(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to list certificates" });
        }
    },

    upsertCertificate(req: any, res: any) {
        try {
            const { clientId, deviceCode, certPem, enabled } = req.body as {
                clientId?: string;
                deviceCode?: string;
                certPem?: string;
                enabled?: boolean;
            };
            const normalizedClientId = String(clientId || "").trim();
            const normalizedDeviceCode = String(deviceCode || "").trim();
            const normalizedCertPem = String(certPem || "").trim();

            if (!normalizedClientId || !normalizedDeviceCode || !normalizedCertPem) {
                return res.status(400).send({ error: "clientId, deviceCode and certPem are required" });
            }

            const device = DB.prepare("SELECT code FROM devices WHERE code = ?").get(normalizedDeviceCode);
            if (!device) {
                return res.status(400).send({ error: "Unknown deviceCode" });
            }

            const fingerprint = getFingerprintFromPem(decodeMaybePem(normalizedCertPem));
            const enabledValue = enabled === false ? 0 : 1;

            DB.prepare(`
                INSERT INTO device_certificates (
                    client_id, device_code, cert_pem, cert_fingerprint_sha256, enabled, updated_at
                )
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(client_id) DO UPDATE SET
                    device_code = excluded.device_code,
                    cert_pem = excluded.cert_pem,
                    cert_fingerprint_sha256 = excluded.cert_fingerprint_sha256,
                    enabled = excluded.enabled,
                    updated_at = CURRENT_TIMESTAMP
            `).run(
                normalizedClientId,
                normalizedDeviceCode,
                normalizedCertPem,
                fingerprint,
                enabledValue
            );

            return res.status(201).send({
                ok: true,
                clientId: normalizedClientId,
                deviceCode: normalizedDeviceCode,
                certFingerprintSha256: fingerprint,
                enabled: enabledValue,
            });
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to upsert certificate" });
        }
    },

    setCertificateEnabled(req: any, res: any) {
        try {
            const clientId = String(req.params.clientId || "").trim();
            const enabled = req.body?.enabled === false ? 0 : 1;
            if (!clientId) return res.status(400).send({ error: "clientId is required" });

            const result = DB.prepare(
                "UPDATE device_certificates SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE client_id = ?"
            ).run(enabled, clientId);
            if (!result.changes) {
                return res.status(404).send({ error: "Certificate not found" });
            }
            return res.send({ ok: true, clientId, enabled });
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to update certificate status" });
        }
    },

    deleteCertificate(req: any, res: any) {
        try {
            const clientId = String(req.params.clientId || "").trim();
            if (!clientId) return res.status(400).send({ error: "clientId is required" });

            const result = DB.prepare("DELETE FROM device_certificates WHERE client_id = ?").run(clientId);
            if (!result.changes) {
                return res.status(404).send({ error: "Certificate not found" });
            }
            return res.send({ ok: true });
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to delete certificate" });
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

    listAclRulesForDevice(req: any, res: any) {
        try {
            const deviceCode = String(req.params.code || "").trim();
            if (!deviceCode) return res.status(400).send({ error: "device code is required" });
            if (!canManageDeviceAcl(req, deviceCode)) {
                return res.status(403).send({ error: "Access denied" });
            }
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

    upsertAclRuleForDevice(req: any, res: any) {
        try {
            req.params.deviceCode = req.params.code;
            const deviceCode = String(req.params.code || "").trim();
            if (!canManageDeviceAcl(req, deviceCode)) {
                return res.status(403).send({ error: "Access denied" });
            }
            return MqttController.upsertAclRule(req, res);
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

    deleteAclRuleForDevice(req: any, res: any) {
        try {
            const deviceCode = String(req.params.code || "").trim();
            if (!deviceCode) return res.status(400).send({ error: "device code is required" });
            if (!canManageDeviceAcl(req, deviceCode)) {
                return res.status(403).send({ error: "Access denied" });
            }

            const id = Number(req.params.id);
            if (!id) return res.status(400).send({ error: "id is required" });

            const result = DB.prepare(
                "DELETE FROM mqtt_acl_rules WHERE id = ? AND device_code = ?"
            ).run(id, deviceCode);
            if (!result.changes) {
                return res.status(404).send({ error: "ACL rule not found" });
            }
            return res.send({ ok: true });
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to delete ACL rule" });
        }
    },
};
