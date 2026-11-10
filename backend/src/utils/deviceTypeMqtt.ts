import { MQTT_ACL_ACTIONS, MQTT_ACL_PERMISSION } from "@shared/constants/mqtt";
import {
    DeviceTypeMqttTopic,
    DeviceMqttTopics,
    getDeviceTypeMqttTopics,
    resolveMqttTopicTemplate,
    parseDeviceTypeMqttTopics,
} from "@shared/types/device_type_mqtt";
import { db } from "../config/database";
import { getDeviceWithType, listDeviceCodes } from "../repositories/deviceRepository";
import { listDeviceTypes, findDeviceType, updateDeviceType } from "../repositories/deviceTypeRepository";
import { NewDeviceAclRule, replaceGeneratedDeviceAclRules } from "../repositories/mqttAclRepository";
import { resolveWidgetTopic } from "@shared/widgets";
import { loadDeviceWidgets } from "../repositories/deviceTypeWidgetRepository";

type DeviceMqttContext = {
    deviceCode: string;
    deviceTypeId: string;
    ownerId: number | null;
};

export type ResolvedDeviceTypeMqttTopic = DeviceTypeMqttTopic & {
    resolvedTopic: string;
};

const GENERATED_ACL_SOURCE = "device_type_mqtt";

function loadDeviceTypeTopics(deviceTypeId: string): DeviceTypeMqttTopic[] {
    const row = findDeviceType(deviceTypeId);
    return row?.mqtt_enabled ? getDeviceTypeMqttTopics(row.mqttTopics) : [];
}

export function findLinkedTopicTarget(topic: DeviceTypeMqttTopic): DeviceTypeMqttTopic | undefined {
    if (!topic.linkedTopic) return undefined;

    const targetTopics = loadDeviceTypeTopics(topic.linkedTopic.deviceTypeId);
    return targetTopics.find((row) => row.key === topic.linkedTopic?.topicKey && !row.linkedTopic);
}

function buildLinkedTopicSnapshot(topic: DeviceTypeMqttTopic, target: DeviceTypeMqttTopic): DeviceTypeMqttTopic {
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
    const rows = listDeviceTypes();

    db.transaction(() => {
        for (const row of rows) {
            const parsed = parseDeviceTypeMqttTopics(row.mqttTopics);
            const normalized = normalizeDeviceTypeMqttTopics(parsed);
            const currentJson = JSON.stringify(parsed);
            const normalizedJson = JSON.stringify(normalized);
            if (normalizedJson !== currentJson) {
                updateDeviceType(row.id, { mqttTopics: normalizedJson });
            }
        }
    });
}

function resolveLinkedTopicSnapshot(topic: DeviceTypeMqttTopic, context: DeviceMqttContext): ResolvedDeviceTypeMqttTopic | undefined {
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
    const device = getDeviceWithType(deviceCode);
    if (!device?.mqtt_available) return [];
    const context: DeviceMqttContext = {
        deviceCode: device.code, deviceTypeId: device.device_type_id, ownerId: device.owner_id,
    };
    const topics = getDeviceTypeMqttTopics(device.mqttTopics);
    return topics.map((topic) => {
        if (topic.linkedTopic) {
            return resolveLinkedTopicSnapshot(topic, context);
        }

        const resolvedTopic = topic.topic ? resolveMqttTopicTemplate(topic.topic, context) : "";
        return {
            ...topic,
            resolvedTopic,
        };
    })
        .filter((topic): topic is ResolvedDeviceTypeMqttTopic => Boolean(topic?.resolvedTopic));
}

export function getDeviceMqttTopicsByAction(deviceCode: string): DeviceMqttTopics {
    const topics = resolveDeviceTypeMqttTopicsForDevice(deviceCode);
    const groups: DeviceMqttTopics = { publish: {}, subscribe: {}, all: {} };
    for (const action of Object.values(MQTT_ACL_ACTIONS)) {
        groups[action] = Object.fromEntries(topics
            .filter((topic) => topic.action === action)
            .map((topic) => [topic.key, topic.resolvedTopic]));
    }
    return groups;
}

export function syncGeneratedMqttAclRulesForDevice(deviceCode: string) {
    const topics = resolveDeviceTypeMqttTopicsForDevice(deviceCode);
    const widgets = loadDeviceWidgets(deviceCode);

    const rules: NewDeviceAclRule[] = [];
    for (const topic of topics) {
        rules.push({
            device_code: deviceCode, action: topic.action, topic_pattern: topic.resolvedTopic,
            permission: MQTT_ACL_PERMISSION.ALLOW, priority: 50, source: GENERATED_ACL_SOURCE, source_key: topic.key
        });
        if (topic.action === MQTT_ACL_ACTIONS.SUBSCRIBE) {
            const feedbackTopics = new Set(widgets.filter((widget) => widget.state?.topicKey === topic.key)
                .map((widget) => resolveWidgetTopic(widget.state!, topic.resolvedTopic)));
            for (const feedback of feedbackTopics) rules.push({
                device_code: deviceCode, action: MQTT_ACL_ACTIONS.PUBLISH, topic_pattern: feedback,
                permission: MQTT_ACL_PERMISSION.ALLOW, priority: 50, source: GENERATED_ACL_SOURCE, source_key: `widget_state:${topic.key}`,
            });
        }
    }
    replaceGeneratedDeviceAclRules(deviceCode, rules);
}

export function syncGeneratedMqttAclRulesForAllDevices() {
    const rows = listDeviceCodes();
    for (const row of rows) {
        syncGeneratedMqttAclRulesForDevice(row.code);
    }
}
