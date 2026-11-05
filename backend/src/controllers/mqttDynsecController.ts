import { DB } from "../config/database";
import { buildDynsecAcls, enqueueAllDynsecDevices, inspectDeviceDynsecAcls } from "../services/mqttDynsecService";
import { dynsecEnabled } from "../utils/mqttConfiguration";
import { getMqttDevicePassword, mqttDeviceUsername } from "../services/mqttDeviceCredentials";
import { getDeviceMqttState } from "../services/deviceMqttPolicy";
import { deviceMqttTopics } from "@shared/constants/mqtt";

export const MqttDynsecController = {
    deviceCredentials(req: any, res: any) {
        res.setHeader("Cache-Control", "no-store");
        if (!dynsecEnabled()) return res.status(404).send({ error: "Dynamic Security is not enabled" });
        if (!req.secure) return res.status(403).send({ error: "HTTPS is required for MQTT provisioning" });
        const code = String(req.deviceAuth?.deviceCode || "");
        if (!getDeviceMqttState(code)?.mqtt_available) return res.status(403).send({ error: "MQTT device is disabled" });
        const host = String(process.env.MQTT_PUBLIC_HOST || "").trim();
        const port = Number(process.env.MQTT_PUBLIC_PORT || 8883);
        if (!host || /[\s/]/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
            return res.status(503).send({ error: "Public MQTT endpoint is not configured" });
        }
        try {
            const password = getMqttDevicePassword(code);
            const pending = DB.prepare("SELECT 1 FROM mqtt_dynsec_queue WHERE device_code = ?").get(code);
            const topics = deviceMqttTopics(code);
            return res.send({
                schemaVersion: 1, protocol: "mqtts", host, port,
                username: mqttDeviceUsername(code), password, clientId: code,
                syncStatus: pending ? "pending" : "synced", keepalive: 30,
                availabilityTopic: topics.availability,
                stateTopic: topics.state,
            });
        } catch {
            return res.status(503).send({ error: "MQTT provisioning unavailable" });
        }
    },

    status(_req: any, res: any) {
        return res.send({ enabled: dynsecEnabled(), jobs: DB.prepare(`SELECT device_code AS deviceCode,
            revision, attempts, next_attempt_at AS nextAttemptAt, last_error AS lastError
            FROM mqtt_dynsec_queue ORDER BY device_code`).all() });
    },

    async deviceAcls(req: any, res: any) {
        res.setHeader("Cache-Control", "no-store");
        const code = String(req.params.deviceCode || "");
        const device = getDeviceMqttState(code);
        if (!device) return res.status(404).send({ error: "Device not found" });
        const rules = DB.prepare(`SELECT action, topic_pattern, permission, priority, source, source_key
            FROM mqtt_acl_rules WHERE device_code = ? ORDER BY priority, id`).all(code) as
            Array<{ action: string; topic_pattern: string; permission: string; priority: number }>;
        const job = DB.prepare(`SELECT attempts, next_attempt_at AS nextAttemptAt, last_error AS lastError
            FROM mqtt_dynsec_queue WHERE device_code = ?`).get(code);
        try {
            const expected = device.mqtt_available ? buildDynsecAcls(code, rules) : [];
            if (!dynsecEnabled()) return res.send({ enabled: false, rules, expected, applied: null, clientEnabled: null, job: null });
            try {
                const applied = await inspectDeviceDynsecAcls(code);
                return res.send({ enabled: true, rules, expected, applied: applied.acls, clientEnabled: applied.clientEnabled, job: job || null });
            } catch {
                return res.send({ enabled: true, rules, expected, applied: null, clientEnabled: null, job: job || null,
                    brokerError: "Could not read broker ACLs; check broker availability and control credentials" });
            }
        } catch {
            return res.status(500).send({ error: "Invalid device ACL configuration" });
        }
    },

    reconcile(_req: any, res: any) {
        if (!dynsecEnabled()) return res.status(409).send({ error: "Dynamic Security is not enabled" });
        enqueueAllDynsecDevices();
        return res.status(202).send({ ok: true });
    },

    rotate(req: any, res: any) {
        if (!dynsecEnabled()) return res.status(409).send({ error: "Dynamic Security is not enabled" });
        const code = String(req.params.deviceCode || "");
        if (!DB.prepare("SELECT 1 FROM devices WHERE code = ?").get(code)) {
            return res.status(404).send({ error: "Device not found" });
        }
        if (!getDeviceMqttState(code)?.mqtt_available) return res.status(409).send({ error: "MQTT device is disabled" });
        try {
            getMqttDevicePassword(code, true);
            return res.status(202).send({ ok: true, deviceCode: code, syncStatus: "pending" });
        } catch {
            return res.status(503).send({ error: "Credential rotation unavailable" });
        }
    },
};
