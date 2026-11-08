import { connectAsync } from "mqtt";
import { listDeviceAclRules } from "../repositories/mqttAclRepository";
import { MQTT_ACL_ACTIONS } from "@shared/constants/mqtt";
import { MqttBrokerSettings, MqttPublishInput } from "@shared/types/mqtt_publish";
import { canUserAccessMqttTopic } from "../utils/mqttUserAcl";
import { brokerClientOptions, loadBrokerSettings } from "../utils/mqttBrokerSettings";
import { registerMqttSseClient } from "../services/mqttSseService";

function normalizePublishInput(req: any): MqttPublishInput | null {
    const source = req.body;
    const topic = String(source?.topic || "").trim();
    const rawContent = source?.content;

    if (!topic || /[+#\u0000]/.test(topic) || Buffer.byteLength(topic) > 65535 || typeof rawContent === "undefined") {
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
        content,
    };
}

async function publishMqttMessage(settings: MqttBrokerSettings, topic: string, payload: string): Promise<void> {
    const client = await connectAsync(brokerClientOptions(settings));
    client.on("error", () => {});
    const timer = setTimeout(() => { void client.endAsync(true); }, 10000);
    try {
        await client.publishAsync(topic, payload, { qos: 1, retain: false });
    } finally {
        clearTimeout(timer);
        await client.endAsync(true);
    }
}

export async function publishForAuthenticatedUser(input: MqttPublishInput, authUser: any) {
    if (!input.topic || /[+#\u0000]/.test(input.topic) || Buffer.byteLength(input.topic) > 65535) {
        return { ok: false as const, status: 400, body: { error: "A concrete MQTT publish topic is required" } };
    }
    const userId = Number(authUser?.id);
    if (!canUserAccessMqttTopic(userId, MQTT_ACL_ACTIONS.PUBLISH, input.topic)) {
        return {
            ok: false as const,
            status: 403,
            body: { error: "Not authorized to publish on this topic" },
        };
    }

    const settings = loadBrokerSettings();
    if (!settings) {
        return {
            ok: false as const,
            status: 400,
            body: { error: "MQTT broker settings not configured. An administrator can configure them in Settings." },
        };
    }

    const message = JSON.stringify({
        email: authUser?.email,
        content: input.content,
    });

    await publishMqttMessage(settings, input.topic, message);

    return {
        ok: true as const,
        body: {
            ok: true,
            topic: input.topic,
            broker: `${settings.protocol}://${settings.host}:${settings.port}`,
        },
    };
}

export const MqttController = {
    streamMessages(req: any, res: any) {
        try {
            const userId = Number(req.user?.id);
            if (!userId) {
                return res.status(401).send({ error: "Missing user" });
            }
            return registerMqttSseClient(userId, req, res);
        } catch (err) {
            console.error("MQTT stream error", err);
            if (!res.headersSent) {
                return res.status(500).send({ error: "Failed to open MQTT stream" });
            }
            return res.end();
        }
    },

    listAclRules(req: any, res: any) {
        try {
            const deviceCode = String(req.params.deviceCode || "").trim();
            if (!deviceCode) return res.status(400).send({ error: "deviceCode is required" });

            const rows = listDeviceAclRules(deviceCode);
            return res.send(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to list ACL rules" });
        }
    },

    async publishMessage(req: any, res: any) {
        try {
            const input = normalizePublishInput(req);
            if (!input) {
                return res.status(400).send({
                    error: "topic and JSON content are required",
                });
            }

            const result = await publishForAuthenticatedUser(input, req.user);
            if (!result.ok) {
                return res.status(result.status).send(result.body);
            }

            return res.send(result.body);
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to publish MQTT message" });
        }
    },

};
