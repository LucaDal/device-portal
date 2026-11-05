import { connect, MqttClient } from "mqtt";
import type { Request, Response } from "express";
import {
    MQTT_ACL_ACTIONS,
    MQTT_ACL_PERMISSION,
} from "@shared/constants/mqtt";
import { DB } from "../config/database";
import { brokerClientOptions, loadBrokerSettings } from "../utils/mqttBrokerSettings";
import { canUserAccessMqttTopic } from "../utils/mqttUserAcl";
import { MQTT_USER_ACL_SYNCED_EVENT, MQTT_BROKER_SETTINGS_CHANGED_EVENT, mqttAclEvents } from "./mqttAclEvents";

type MqttStreamMessage = {
    topic: string;
    payload: string;
    content: unknown;
    receivedAt: string;
};

type SseClient = {
    id: string;
    userId: number;
    sessionVersion: number;
    res: Response;
    topics: Set<string>;
    heartbeat: ReturnType<typeof setInterval>;
    pending: Map<string, MqttStreamMessage>;
    flushTimer: ReturnType<typeof setTimeout> | null;
};

const HEARTBEAT_INTERVAL_MS = 25000;
const CLIENT_FLUSH_INTERVAL_MS = 250;
const SUBSCRIBER_RESTART_DEBOUNCE_MS = 500;
const SUBSCRIBER_RETRY_MS = 5000;
const MAX_CACHED_MESSAGES = 500;
const MAX_CACHED_BYTES = 8 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = 256 * 1024;
const MAX_CLIENT_BUFFER_BYTES = 1024 * 1024;
let cachedBytes = 0;

const clients = new Map<string, SseClient>();
const topicRefCounts = new Map<string, number>();
const cachedMessages = new Map<string, MqttStreamMessage>();

let subscriber: MqttClient | null = null;
let subscriberGeneration = 0;
let activeTopicKey = "";
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function getReadableTopicPatternsForUser(userId: number): string[] {
    const rows = DB.prepare(`
        SELECT DISTINCT topic_pattern
        FROM mqtt_user_acl_rules
        WHERE user_id = ?
          AND permission = ?
          AND action IN (?, ?)
        ORDER BY topic_pattern ASC
    `).all(
        userId,
        MQTT_ACL_PERMISSION.ALLOW,
        MQTT_ACL_ACTIONS.SUBSCRIBE,
        MQTT_ACL_ACTIONS.ALL
    ) as Array<{ topic_pattern: string }>;

    return rows
        .map((row) => String(row.topic_pattern || "").trim())
        .filter(Boolean);
}

function sendEvent(res: Response, event: string, data: unknown) {
    if (res.destroyed || res.writableEnded) return;
    if (res.writableLength > MAX_CLIENT_BUFFER_BYTES) {
        res.destroy();
        return;
    }
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastServiceError(message: string) {
    for (const client of clients.values()) {
        sendEvent(client.res, "mqtt-error", { error: message });
    }
}

function parsePayload(payload: string): unknown {
    try {
        const parsed = JSON.parse(payload);
        if (
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed) &&
            Object.prototype.hasOwnProperty.call(parsed, "content")
        ) {
            return (parsed as { content: unknown }).content;
        }
        return parsed;
    } catch {
        return payload;
    }
}

function cacheMessage(message: MqttStreamMessage) {
    const previous = cachedMessages.get(message.topic);
    if (previous) cachedBytes -= Buffer.byteLength(previous.payload);
    cachedMessages.delete(message.topic);
    cachedMessages.set(message.topic, message);
    cachedBytes += Buffer.byteLength(message.payload);
    while (cachedMessages.size > MAX_CACHED_MESSAGES || cachedBytes > MAX_CACHED_BYTES) {
        const oldest = cachedMessages.values().next().value!;
        cachedBytes -= Buffer.byteLength(oldest.payload);
        cachedMessages.delete(oldest.topic);
    }
}

function queueClientMessage(client: SseClient, message: MqttStreamMessage) {
    client.pending.set(message.topic, message);
    if (client.pending.size > MAX_CACHED_MESSAGES) {
        client.res.destroy();
        return;
    }
    if (client.flushTimer) return;

    client.flushTimer = setTimeout(() => {
        client.flushTimer = null;
        const messages = Array.from(client.pending.values());
        client.pending.clear();
        for (const pendingMessage of messages) {
            if (clientCanReceiveTopic(client, pendingMessage.topic)) {
                sendEvent(client.res, "mqtt-message", pendingMessage);
            }
        }
    }, CLIENT_FLUSH_INTERVAL_MS);
}

function clientCanReceiveTopic(client: SseClient, topic: string): boolean {
    const user = DB.prepare("SELECT must_change_password, session_version FROM users WHERE id = ?").get(client.userId) as
        { must_change_password: number; session_version: number } | undefined;
    if (!user || user.must_change_password || user.session_version !== client.sessionVersion) return false;
    return canUserAccessMqttTopic(client.userId, MQTT_ACL_ACTIONS.SUBSCRIBE, topic);
}

function deliverMessage(message: MqttStreamMessage) {
    cacheMessage(message);
    for (const client of clients.values()) {
        if (clientCanReceiveTopic(client, message.topic)) {
            queueClientMessage(client, message);
        }
    }
}

function createStreamMessage(topic: string, payload: string): MqttStreamMessage {
    return {
        topic,
        payload,
        content: parsePayload(payload),
        receivedAt: new Date().toISOString(),
    };
}

function stopSubscriber() {
    if (!subscriber) return;
    subscriber.end(true);
    subscriber = null;
}

function scheduleSubscriberRefresh(delayMs = SUBSCRIBER_RESTART_DEBOUNCE_MS) {
    if (restartTimer) {
        clearTimeout(restartTimer);
    }
    restartTimer = setTimeout(() => {
        restartTimer = null;
        refreshSubscriber();
    }, delayMs);
}

function scheduleSubscriberRetry(generation: number) {
    if (retryTimer) {
        clearTimeout(retryTimer);
    }
    retryTimer = setTimeout(() => {
        retryTimer = null;
        if (generation === subscriberGeneration && topicRefCounts.size > 0) {
            refreshSubscriber(true);
        }
    }, SUBSCRIBER_RETRY_MS);
}

function refreshSubscriber(force = false) {
    const topicPatterns = Array.from(topicRefCounts.keys()).sort();
    const nextTopicKey = topicPatterns.join("\n");

    if (!force && nextTopicKey === activeTopicKey && subscriber) {
        return;
    }

    subscriberGeneration += 1;
    const generation = subscriberGeneration;
    activeTopicKey = nextTopicKey;
    stopSubscriber();

    if (topicPatterns.length === 0) {
        return;
    }

    try {
        const settings = loadBrokerSettings();
        if (!settings) throw new Error("MQTT broker settings not configured");
        const current = connect(brokerClientOptions(settings));
        subscriber = current;
        current.on("connect", () => {
            void current.subscribeAsync(topicPatterns, { qos: 1 }).then((grants) => {
                if (grants.some((grant) => Number(grant.qos) > 2)) {
                    broadcastServiceError("MQTT subscription denied");
                }
            }).catch(() => broadcastServiceError("MQTT subscription failed"));
        });
        current.on("message", (topic, payload) => {
            if (generation === subscriberGeneration && payload.length <= MAX_PAYLOAD_BYTES) {
                deliverMessage(createStreamMessage(topic, payload.toString()));
            }
        });
        current.on("error", () => {
            if (generation === subscriberGeneration) broadcastServiceError("MQTT connection failed");
        });
        current.on("close", () => {
            if (generation !== subscriberGeneration) return;
            subscriber = null;
            if (topicRefCounts.size > 0) {
                broadcastServiceError("MQTT disconnected; reconnecting");
                scheduleSubscriberRetry(generation);
            }
        });
    } catch (err: any) {
        const message = err?.message || "MQTT subscriber could not start";
        console.error(message);
        broadcastServiceError(message);
        scheduleSubscriberRetry(generation);
    }
}

function addTopicReference(topic: string) {
    topicRefCounts.set(topic, (topicRefCounts.get(topic) || 0) + 1);
}

function removeTopicReference(topic: string) {
    const nextCount = (topicRefCounts.get(topic) || 0) - 1;
    if (nextCount > 0) {
        topicRefCounts.set(topic, nextCount);
    } else {
        topicRefCounts.delete(topic);
    }
}

function cleanupClient(clientId: string) {
    const client = clients.get(clientId);
    if (!client) return;

    clients.delete(clientId);
    clearInterval(client.heartbeat);
    if (client.flushTimer) {
        clearTimeout(client.flushTimer);
    }
    for (const topic of client.topics) {
        removeTopicReference(topic);
    }
    scheduleSubscriberRefresh();
}

function sendCachedMessages(client: SseClient) {
    for (const message of cachedMessages.values()) {
        if (clientCanReceiveTopic(client, message.topic)) {
            queueClientMessage(client, message);
        }
    }
}

function updateClientTopics(client: SseClient, nextTopics: string[]) {
    const nextTopicSet = new Set(nextTopics);
    const currentTopicKey = Array.from(client.topics).sort().join("\n");
    const nextTopicKey = Array.from(nextTopicSet).sort().join("\n");

    if (currentTopicKey === nextTopicKey) {
        return;
    }

    for (const topic of client.topics) {
        removeTopicReference(topic);
    }
    client.pending.clear();
    client.topics = nextTopicSet;
    for (const topic of client.topics) {
        addTopicReference(topic);
    }

    sendEvent(client.res, "ready", {
        topics: client.topics.size,
        cachedMessages: cachedMessages.size,
    });
    sendCachedMessages(client);
    scheduleSubscriberRefresh();
}

function refreshUserClientTopics(userId: number) {
    const nextTopics = getReadableTopicPatternsForUser(userId);
    for (const client of clients.values()) {
        if (client.userId === userId) {
            updateClientTopics(client, nextTopics);
        }
    }
}

mqttAclEvents.on(MQTT_USER_ACL_SYNCED_EVENT, (userId: number) => {
    refreshUserClientTopics(Number(userId));
});

mqttAclEvents.on(MQTT_BROKER_SETTINGS_CHANGED_EVENT, () => {
    cachedMessages.clear();
    cachedBytes = 0;
    for (const client of clients.values()) client.pending.clear();
    subscriberGeneration += 1;
    stopSubscriber();
    activeTopicKey = "";
    scheduleSubscriberRefresh();
});

export function registerMqttSseClient(userId: number, req: Request, res: Response) {
    const topics = getReadableTopicPatternsForUser(userId);

    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    const clientId = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const client: SseClient = {
        id: clientId,
        userId,
        sessionVersion: res.locals.sessionVersion,
        res,
        topics: new Set(topics),
        heartbeat: setInterval(() => {
            if (res.locals.authExpiresAt && Date.now() >= res.locals.authExpiresAt) {
                cleanupClient(clientId);
                res.end();
                return;
            }
            res.write(": ping\n\n");
        }, HEARTBEAT_INTERVAL_MS),
        pending: new Map(),
        flushTimer: null,
    };

    clients.set(clientId, client);
    for (const topic of client.topics) {
        addTopicReference(topic);
    }

    sendEvent(res, "ready", {
        topics: client.topics.size,
        cachedMessages: cachedMessages.size,
    });
    sendCachedMessages(client);
    scheduleSubscriberRefresh();

    res.on("close", () => cleanupClient(clientId));
}

export function closeMqttStreams() {
    for (const client of clients.values()) {
        cleanupClient(client.id);
        client.res.end();
    }
    if (restartTimer) clearTimeout(restartTimer);
    if (retryTimer) clearTimeout(retryTimer);
    subscriberGeneration += 1;
    stopSubscriber();
    cachedMessages.clear();
    cachedBytes = 0;
}
