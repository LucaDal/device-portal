import { MQTT_ACL_ACTIONS, MQTT_ACL_PERMISSION } from "@shared/constants/mqtt";
import {
    DeviceTypeMqttTopic,
    getDashboardWidgetStateTopicKey,
    parseDeviceTypeMqttTopics,
} from "@shared/types/device_type_mqtt";
import { DB } from "../config/database";
import { resolveMqttTopicTemplate } from "./mqttTopicTemplate";
import { loadDeviceWidgets } from "../repositories/deviceWidgetRepository";
import { getDeviceMqttState } from "../services/deviceMqttPolicy";

type DeviceMqttContext = {
    deviceCode: string;
    deviceTypeId: string;
    ownerId: number | null;
};

type DeviceMqttRow = DeviceMqttContext & {
    mqttTopics?: string | null;
};

export type ResolvedDeviceTypeMqttTopic = DeviceTypeMqttTopic & {
    resolvedTopic: string;
};

type DeviceTypeMqttDbRow = {
    id: string;
    mqttTopics?: string | null;
};

const GENERATED_ACL_SOURCE = "device_type_mqtt";

function loadDeviceMqttRow(deviceCode: string): DeviceMqttRow | undefined {
    return DB.prepare(`
        SELECT
            d.code AS deviceCode,
            d.device_type_id AS deviceTypeId,
            d.owner_id AS ownerId,
            dt.mqttTopics AS mqttTopics
        FROM devices d
        JOIN device_types dt ON dt.id = d.device_type_id
        WHERE d.code = ?
    `).get(deviceCode) as DeviceMqttRow | undefined;
}

function loadDeviceTypeTopics(deviceTypeId: string): DeviceTypeMqttTopic[] {
    const row = DB.prepare("SELECT mqttTopics FROM device_types WHERE id = ? AND mqtt_enabled = 1").get(deviceTypeId) as
        | { mqttTopics?: string | null }
        | undefined;
    return parseDeviceTypeMqttTopics(row?.mqttTopics);
}

function findLinkedTopicTarget(
    topic: DeviceTypeMqttTopic
): DeviceTypeMqttTopic | undefined {
    if (!topic.linkedTopic) return undefined;

    const targetTopics = loadDeviceTypeTopics(topic.linkedTopic.deviceTypeId);
    return targetTopics.find((row) => row.key === topic.linkedTopic?.topicKey && !row.linkedTopic);
}

function buildLinkedTopicSnapshot(
    topic: DeviceTypeMqttTopic,
    target: DeviceTypeMqttTopic
): DeviceTypeMqttTopic {
    return {
        ...topic,
        label: target.label || "",
        topic: target.topic || "",
        linkedTopic: topic.linkedTopic
            ? {
                deviceTypeId: topic.linkedTopic.deviceTypeId,
                topicKey: target.key,
            }
            : undefined,
    };
}

function normalizeLinkedTopicSnapshot(topic: DeviceTypeMqttTopic): DeviceTypeMqttTopic {
    const target = findLinkedTopicTarget(topic);
    return target ? buildLinkedTopicSnapshot(topic, target) : topic;
}

export function normalizeDeviceTypeMqttTopics(topics: DeviceTypeMqttTopic[]): DeviceTypeMqttTopic[] {
    return topics.map(normalizeLinkedTopicSnapshot);
}

export function normalizeAllDeviceTypeMqttTopicLinks() {
    const rows = DB.prepare("SELECT id, mqttTopics FROM device_types ORDER BY id ASC").all() as DeviceTypeMqttDbRow[];
    const update = DB.prepare("UPDATE device_types SET mqttTopics = ? WHERE id = ?");

    DB.transaction(() => {
        for (const row of rows) {
            const parsed = parseDeviceTypeMqttTopics(row.mqttTopics);
            const normalized = normalizeDeviceTypeMqttTopics(parsed);
            const currentJson = JSON.stringify(parsed);
            const normalizedJson = JSON.stringify(normalized);
            if (normalizedJson !== currentJson) {
                update.run(normalizedJson, row.id);
            }
        }
    })();
}

function resolveLinkedTopicSnapshot(
    topic: DeviceTypeMqttTopic,
    context: DeviceMqttContext
): ResolvedDeviceTypeMqttTopic | undefined {
    if (!topic.linkedTopic) return undefined;

    const target = findLinkedTopicTarget(topic);
    if (!target?.topic || !context.ownerId || !target.topic.split("/").includes("{ownerId}")) return undefined;
    if (topic.action !== MQTT_ACL_ACTIONS.SUBSCRIBE && target.topic.includes("{deviceCode}")) return undefined;

    const normalized = buildLinkedTopicSnapshot(topic, target);
    const resolvedTopic = resolveMqttTopicTemplate(target.topic, {
        deviceCode: "+",
        deviceTypeId: topic.linkedTopic.deviceTypeId,
        ownerId: context.ownerId,
    });

    return {
        ...normalized,
        resolvedTopic,
    };
}

export function resolveDeviceTypeMqttTopicsForDevice(deviceCode: string): ResolvedDeviceTypeMqttTopic[] {
    if (!getDeviceMqttState(deviceCode)?.mqtt_available) return [];
    const device = loadDeviceMqttRow(deviceCode);
    if (!device) return [];

    const topics = parseDeviceTypeMqttTopics(device.mqttTopics);
    return topics
        .map((topic) => {
            if (topic.linkedTopic) {
                return resolveLinkedTopicSnapshot(topic, device);
            }

            const resolvedTopic = topic.topic ? resolveMqttTopicTemplate(topic.topic, device) : "";
            return {
                ...topic,
                resolvedTopic,
            };
        })
        .filter((topic): topic is ResolvedDeviceTypeMqttTopic => Boolean(topic?.resolvedTopic));
}

export function mapDeviceTypeMqttTopicsToProperties(deviceCode: string): Record<string, string> {
    return resolveDeviceTypeMqttTopicsForDevice(deviceCode).reduce<Record<string, string>>(
        (acc, topic) => {
            acc[topic.key] = topic.resolvedTopic;
            return acc;
        },
        {}
    );
}

export function syncGeneratedMqttAclRulesForDevice(deviceCode: string) {
    const topics = resolveDeviceTypeMqttTopicsForDevice(deviceCode);
    const device = loadDeviceMqttRow(deviceCode);
    const stateTopicKeys = new Set(
        loadDeviceWidgets(deviceCode)
            .map((widget) => getDashboardWidgetStateTopicKey(widget))
            .filter((key): key is string => Boolean(key))
    );

    DB.transaction(() => {
        DB.prepare(
            "DELETE FROM mqtt_acl_rules WHERE device_code = ? AND source = ?"
        ).run(deviceCode, GENERATED_ACL_SOURCE);

        const insert = DB.prepare(`
            INSERT INTO mqtt_acl_rules (
                device_code,
                action,
                topic_pattern,
                permission,
                priority,
                source,
                source_key
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const topic of topics) {
            insert.run(
                deviceCode,
                topic.action,
                topic.resolvedTopic,
                MQTT_ACL_PERMISSION.ALLOW,
                50,
                GENERATED_ACL_SOURCE,
                topic.key
            );

            if (
                stateTopicKeys.has(topic.key) &&
                topic.action !== MQTT_ACL_ACTIONS.PUBLISH &&
                topic.action !== MQTT_ACL_ACTIONS.ALL
            ) {
                insert.run(
                    deviceCode,
                    MQTT_ACL_ACTIONS.PUBLISH,
                    topic.resolvedTopic,
                    MQTT_ACL_PERMISSION.ALLOW,
                    50,
                    GENERATED_ACL_SOURCE,
                    `widget_state:${topic.key}`
                );
            }
        }
    })();
}

export function syncGeneratedMqttAclRulesForAllDevices() {
    const rows = DB.prepare("SELECT code FROM devices ORDER BY code ASC").all() as Array<{ code: string }>;
    for (const row of rows) {
        syncGeneratedMqttAclRulesForDevice(row.code);
    }
}
