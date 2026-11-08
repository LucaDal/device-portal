import {
    MQTT_ACL_ACTIONS,
    MQTT_ACL_PERMISSION,
    MqttAclAction,
} from "@shared/constants/mqtt";
import { mqttTopicMatches } from "@shared/types/mqtt";
import {
    DeviceTypeMqttTopic,
    getDeviceTypeMqttTopics,
    resolveMqttTopicTemplate,
} from "@shared/types/device_type_mqtt";
import { listAccessibleMqttDevices } from "../repositories/deviceRepository";
import { findUserById, listUserIds } from "../repositories/userRepository";
import { findLinkedTopicTarget } from "./deviceTypeMqtt";
import { listUserAclRules, replaceGeneratedUserAclRules } from "../repositories/mqttAclRepository";
import { MQTT_USER_ACL_SYNCED_EVENT, mqttAclEvents } from "../services/mqttAclEvents";
import { resolveWidgetTopic } from "@shared/widgets";
import { loadDeviceWidgets } from "../repositories/deviceTypeWidgetRepository";

type UserAclDevice = ReturnType<typeof listAccessibleMqttDevices>[number];

type UserAclRule = {
    userId: number;
    action: MqttAclAction;
    topicPattern: string;
    source: string;
    sourceDeviceCode: string;
    sourceKey: string;
};

function getAccessibleDevicesForUser(userId: number): UserAclDevice[] {
    const user = findUserById(userId);
    return user ? listAccessibleMqttDevices(userId, user.role) : [];
}

function getTargetDevicesForTopic(
    currentDevice: UserAclDevice,
    topic: DeviceTypeMqttTopic,
    accessibleDevices: UserAclDevice[]
): UserAclDevice[] {
    if (!topic.linkedTopic) return [currentDevice];

    return accessibleDevices.filter((device) => device.device_type_id === topic.linkedTopic?.deviceTypeId &&
        device.owner_id === currentDevice.owner_id && currentDevice.owner_id !== null);
}

function addRule(
    rules: UserAclRule[],
    seen: Set<string>,
    rule: UserAclRule
) {
    const dedupeKey = [
        rule.userId,
        rule.action,
        rule.topicPattern,
        rule.source,
        rule.sourceDeviceCode,
        rule.sourceKey,
    ].join("\u0000");
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    rules.push(rule);
}

function addUserRulesForTopic(
    userId: number,
    currentDevice: UserAclDevice,
    targetDevice: UserAclDevice,
    topic: DeviceTypeMqttTopic,
    topicTemplate: string,
    rules: UserAclRule[],
    seen: Set<string>
) {
    const topicPattern = resolveMqttTopicTemplate(topicTemplate, {
        deviceCode: targetDevice.code,
        deviceTypeId: targetDevice.device_type_id,
        ownerId: targetDevice.owner_id,
    });
    if (!topicPattern) return;

    const source = currentDevice.access_source === "shared"
        ? "generated_shared_device"
        : "generated_owned_device";
    const sourceKey = topic.linkedTopic
        ? `${currentDevice.code}:${topic.key}`
        : topic.key;

    if (topic.action === MQTT_ACL_ACTIONS.ALL) {
        addRule(rules, seen, {
            userId,
            action: MQTT_ACL_ACTIONS.ALL,
            topicPattern,
            source,
            sourceDeviceCode: targetDevice.code,
            sourceKey,
        });
        return;
    }

    if (topic.action === MQTT_ACL_ACTIONS.PUBLISH) {
        addRule(rules, seen, {
            userId,
            action: MQTT_ACL_ACTIONS.SUBSCRIBE,
            topicPattern,
            source,
            sourceDeviceCode: targetDevice.code,
            sourceKey,
        });
    }

    if (topic.action === MQTT_ACL_ACTIONS.SUBSCRIBE) {
        addRule(rules, seen, {
            userId,
            action: MQTT_ACL_ACTIONS.PUBLISH,
            topicPattern,
            source,
            sourceDeviceCode: targetDevice.code,
            sourceKey,
        });
    }
}

function buildGeneratedUserAclRules(userId: number): UserAclRule[] {
    const devices = getAccessibleDevicesForUser(userId);
    const rules: UserAclRule[] = [];
    const seen = new Set<string>();

    for (const device of devices) {
        const topics = getDeviceTypeMqttTopics(device.mqttTopics);
        const widgets = loadDeviceWidgets(device.code);
        for (const topic of topics) {
            const linkedTargetTopic = findLinkedTopicTarget(topic);
            const topicTemplate = topic.linkedTopic
                ? linkedTargetTopic?.topic
                : topic.topic;
            if (!topicTemplate || (topic.linkedTopic && (linkedTargetTopic?.linkedTopic ||
                !topicTemplate.split("/").includes("{ownerId}") ||
                (topic.action !== MQTT_ACL_ACTIONS.SUBSCRIBE && topicTemplate.includes("{deviceCode}"))))) continue;

            const targetDevices = getTargetDevicesForTopic(device, topic, devices);
            for (const targetDevice of targetDevices) {
                addUserRulesForTopic(
                    userId,
                    device,
                    targetDevice,
                    topic,
                    topicTemplate,
                    rules,
                    seen
                );

                if (topic.action === MQTT_ACL_ACTIONS.SUBSCRIBE) {
                    for (const widget of widgets) {
                        if (widget.state?.topicKey !== topic.key) continue;
                        addUserRulesForTopic(userId, device, targetDevice,
                            { ...topic, key: `widget_state:${topic.key}`, action: MQTT_ACL_ACTIONS.PUBLISH },
                            resolveWidgetTopic(widget.state, topicTemplate), rules, seen);
                    }
                }
            }
        }
    }

    return rules;
}

export function syncGeneratedMqttUserAclRulesForUser(userId: number) {
    const rules = buildGeneratedUserAclRules(userId);

    replaceGeneratedUserAclRules(userId, rules.map((rule) => ({
        user_id: rule.userId, action: rule.action, topic_pattern: rule.topicPattern,
        permission: MQTT_ACL_PERMISSION.ALLOW, source: rule.source,
        source_device_code: rule.sourceDeviceCode, source_key: rule.sourceKey,
    })));

    mqttAclEvents.emit(MQTT_USER_ACL_SYNCED_EVENT, userId);
}

export function syncGeneratedMqttUserAclRulesForAllUsers() {
    const users = listUserIds();
    for (const user of users) {
        syncGeneratedMqttUserAclRulesForUser(user.id);
    }
}

export function canUserAccessMqttTopic(userId: number, action: MqttAclAction, topic: string): boolean {
    if (!userId || !topic) return false;

    const rules = listUserAclRules(userId);

    for (const rule of rules) {
        if (rule.action !== MQTT_ACL_ACTIONS.ALL && rule.action !== action) continue;
        if (!mqttTopicMatches(rule.topic_pattern, topic)) continue;
        return rule.permission === MQTT_ACL_PERMISSION.ALLOW;
    }

    return false;
}
