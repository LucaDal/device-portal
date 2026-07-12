import {
    MQTT_ACL_ACTIONS,
    MQTT_ACL_PERMISSION,
    MqttAclAction,
} from "@shared/constants/mqtt";
import {
    DeviceTypeMqttTopic,
    parseDeviceTypeMqttTopics,
} from "@shared/types/device_type_mqtt";
import { ROLES } from "@shared/constants/auth";
import { DB } from "../config/database";
import { resolveMqttTopicTemplate } from "./mqttTopicTemplate";
import { MQTT_USER_ACL_SYNCED_EVENT, mqttAclEvents } from "../services/mqttAclEvents";

type UserAclDevice = {
    code: string;
    device_type_id: string;
    owner_id: number | null;
    access_source: "owned" | "shared" | "admin";
    mqttTopics?: string | null;
};

type UserAclRule = {
    userId: number;
    action: MqttAclAction;
    topicPattern: string;
    source: string;
    sourceDeviceCode: string;
    sourceKey: string;
};

export function mqttTopicMatches(pattern: string, topic: string): boolean {
    const patternParts = pattern.split("/");
    const topicParts = topic.split("/");

    for (let i = 0, j = 0; i < patternParts.length; i += 1, j += 1) {
        const patternPart = patternParts[i];
        const topicPart = topicParts[j];

        if (patternPart === "#") return i === patternParts.length - 1;
        if (patternPart === "+") {
            if (typeof topicPart === "undefined") return false;
            continue;
        }
        if (typeof topicPart === "undefined" || patternPart !== topicPart) return false;
    }

    return patternParts.length === topicParts.length;
}

function getUserRole(userId: number): string {
    const row = DB.prepare("SELECT role FROM users WHERE id = ?").get(userId) as
        | { role?: string }
        | undefined;
    return String(row?.role || "");
}

function getAccessibleDevicesForUser(userId: number): UserAclDevice[] {
    const role = getUserRole(userId);
    if (role === ROLES.ADMIN) {
        return DB.prepare(`
            SELECT
                d.code,
                d.device_type_id,
                d.owner_id,
                'admin' AS access_source,
                dt.mqttTopics AS mqttTopics
            FROM devices d
            JOIN device_types dt ON dt.id = d.device_type_id
            WHERE d.activated = 1
            ORDER BY d.code ASC
        `).all() as UserAclDevice[];
    }

    return DB.prepare(`
        SELECT
            d.code,
            d.device_type_id,
            d.owner_id,
            'owned' AS access_source,
            dt.mqttTopics AS mqttTopics
        FROM devices d
        JOIN device_types dt ON dt.id = d.device_type_id
        WHERE d.owner_id = ?
          AND d.activated = 1

        UNION ALL

        SELECT
            d.code,
            d.device_type_id,
            d.owner_id,
            'shared' AS access_source,
            dt.mqttTopics AS mqttTopics
        FROM device_shares ds
        JOIN devices d ON d.code = ds.device_code
        JOIN device_types dt ON dt.id = d.device_type_id
        WHERE ds.user_id = ?
          AND d.activated = 1
        ORDER BY code ASC
    `).all(userId, userId) as UserAclDevice[];
}

function findLinkedTargetTopic(topic: DeviceTypeMqttTopic): DeviceTypeMqttTopic | undefined {
    if (!topic.linkedTopic) return undefined;
    const row = DB.prepare("SELECT mqttTopics FROM device_types WHERE id = ?").get(
        topic.linkedTopic.deviceTypeId
    ) as { mqttTopics?: string | null } | undefined;
    return parseDeviceTypeMqttTopics(row?.mqttTopics).find((target) => target.key === topic.linkedTopic?.topicKey);
}

function getTargetDevicesForTopic(
    currentDevice: UserAclDevice,
    topic: DeviceTypeMqttTopic,
    accessibleDevices: UserAclDevice[]
): UserAclDevice[] {
    if (!topic.linkedTopic) return [currentDevice];

    return accessibleDevices.filter((device) => device.device_type_id === topic.linkedTopic?.deviceTypeId);
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
        const topics = parseDeviceTypeMqttTopics(device.mqttTopics);
        for (const topic of topics) {
            const linkedTargetTopic = findLinkedTargetTopic(topic);
            const topicTemplate = topic.linkedTopic
                ? linkedTargetTopic?.topic
                : topic.topic;
            if (!topicTemplate) continue;

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
            }
        }
    }

    return rules;
}

export function syncGeneratedMqttUserAclRulesForUser(userId: number) {
    const rules = buildGeneratedUserAclRules(userId);

    DB.transaction(() => {
        DB.prepare("DELETE FROM mqtt_user_acl_rules WHERE user_id = ? AND source LIKE 'generated_%'").run(userId);

        const insert = DB.prepare(`
            INSERT INTO mqtt_user_acl_rules (
                user_id,
                action,
                topic_pattern,
                permission,
                source,
                source_device_code,
                source_key
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const rule of rules) {
            insert.run(
                rule.userId,
                rule.action,
                rule.topicPattern,
                MQTT_ACL_PERMISSION.ALLOW,
                rule.source,
                rule.sourceDeviceCode,
                rule.sourceKey
            );
        }
    })();

    mqttAclEvents.emit(MQTT_USER_ACL_SYNCED_EVENT, userId);
}

export function syncGeneratedMqttUserAclRulesForAllUsers() {
    const users = DB.prepare("SELECT id FROM users ORDER BY id ASC").all() as Array<{ id: number }>;
    for (const user of users) {
        syncGeneratedMqttUserAclRulesForUser(user.id);
    }
}

export function canUserAccessMqttTopic(userId: number, action: MqttAclAction, topic: string): boolean {
    if (!userId || !topic) return false;

    const rules = DB.prepare(`
        SELECT action, topic_pattern, permission
        FROM mqtt_user_acl_rules
        WHERE user_id = ?
        ORDER BY id ASC
    `).all(userId) as Array<{
        action: MqttAclAction;
        topic_pattern: string;
        permission: "allow" | "deny";
    }>;

    for (const rule of rules) {
        if (rule.action !== MQTT_ACL_ACTIONS.ALL && rule.action !== action) continue;
        if (!mqttTopicMatches(rule.topic_pattern, topic)) continue;
        return rule.permission === MQTT_ACL_PERMISSION.ALLOW;
    }

    return false;
}
