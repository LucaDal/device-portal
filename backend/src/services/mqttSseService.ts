import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import type { Request, Response } from "express";
import {
    MQTT_ACL_ACTIONS,
    MQTT_ACL_PERMISSION,
} from "@shared/constants/mqtt";
import { DB } from "../config/database";
import { appendBrokerAuthArgs, loadBrokerSettings, validateBrokerTlsSettings } from "../utils/mqttBrokerSettings";
import { mqttTopicMatches } from "../utils/mqttUserAcl";
import { MQTT_USER_ACL_SYNCED_EVENT, mqttAclEvents } from "./mqttAclEvents";

type MqttStreamMessage = {
    topic: string;
    payload: string;
    content: unknown;
    receivedAt: string;
};

type SseClient = {
    id: string;
    userId: number;
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

const clients = new Map<string, SseClient>();
const topicRefCounts = new Map<string, number>();
const cachedMessages = new Map<string, MqttStreamMessage>();

let subscriber: ChildProcessWithoutNullStreams | null = null;
let subscriberGeneration = 0;
let activeTopicKey = "";
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let stdoutBuffer = "";

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
    cachedMessages.set(message.topic, message);
    if (cachedMessages.size <= MAX_CACHED_MESSAGES) return;

    const oldestKey = cachedMessages.keys().next().value;
    if (oldestKey) {
        cachedMessages.delete(oldestKey);
    }
}

function queueClientMessage(client: SseClient, message: MqttStreamMessage) {
    client.pending.set(message.topic, message);
    if (client.flushTimer) return;

    client.flushTimer = setTimeout(() => {
        client.flushTimer = null;
        const messages = Array.from(client.pending.values());
        client.pending.clear();
        for (const pendingMessage of messages) {
            sendEvent(client.res, "mqtt-message", pendingMessage);
        }
    }, CLIENT_FLUSH_INTERVAL_MS);
}

function clientCanReceiveTopic(client: SseClient, topic: string): boolean {
    for (const pattern of client.topics) {
        if (mqttTopicMatches(pattern, topic)) return true;
    }
    return false;
}

function deliverMessage(message: MqttStreamMessage) {
    cacheMessage(message);
    for (const client of clients.values()) {
        if (clientCanReceiveTopic(client, message.topic)) {
            queueClientMessage(client, message);
        }
    }
}

function parseMosquittoSubLine(line: string): MqttStreamMessage | null {
    const separatorIndex = line.indexOf(" ");
    const topic = separatorIndex === -1 ? line.trim() : line.slice(0, separatorIndex).trim();
    const payload = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1);
    if (!topic) return null;

    return {
        topic,
        payload,
        content: parsePayload(payload),
        receivedAt: new Date().toISOString(),
    };
}

function handleSubscriberStdout(chunk: Buffer) {
    stdoutBuffer += chunk.toString("utf8");
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || "";

    for (const line of lines) {
        const message = parseMosquittoSubLine(line);
        if (message) {
            deliverMessage(message);
        }
    }
}

function buildSubscriberArgs(topicPatterns: string[]) {
    const settings = loadBrokerSettings();
    if (!settings) {
        throw new Error("MQTT broker settings not configured. Configure them in Settings.");
    }
    validateBrokerTlsSettings(settings);

    const args = [
        "-h",
        settings.host,
        "-p",
        String(settings.port),
        "-i",
        `${settings.clientIdPrefix}-sse-${process.pid}-${Date.now()}`,
        "-v",
    ];

    for (const pattern of topicPatterns) {
        args.push("-t", pattern);
    }

    appendBrokerAuthArgs(args, settings);
    return args;
}

function stopSubscriber() {
    if (!subscriber) return;
    subscriber.kill("SIGTERM");
    subscriber = null;
    stdoutBuffer = "";
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
        const args = buildSubscriberArgs(topicPatterns);
        subscriber = spawn("mosquitto_sub", args);

        subscriber.stdout.on("data", handleSubscriberStdout);
        subscriber.stderr.on("data", (chunk) => {
            console.error("MQTT subscriber stderr:", String(chunk).trim());
        });
        subscriber.on("error", (err: any) => {
            if (generation !== subscriberGeneration) return;
            const message = err?.code === "ENOENT"
                ? "mosquitto_sub command not found on server"
                : "MQTT subscriber failed";
            console.error(message, err);
            broadcastServiceError(message);
            subscriber = null;
            scheduleSubscriberRetry(generation);
        });
        subscriber.on("close", (code) => {
            if (generation !== subscriberGeneration) return;
            subscriber = null;
            if (topicRefCounts.size > 0) {
                console.error(`MQTT subscriber exited with code ${code}`);
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
        res,
        topics: new Set(topics),
        heartbeat: setInterval(() => {
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

    req.on("close", () => cleanupClient(clientId));
}
