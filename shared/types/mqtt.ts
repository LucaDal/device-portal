import { MqttAclAction, MqttAclPermission } from "../constants/mqtt";

export function mqttTopicMatches(pattern: string, topic: string): boolean {
    if (!pattern || !topic || pattern.includes("\u0000") || topic.includes("\u0000")) return false;
    if (topic.startsWith("$") && !pattern.startsWith("$")) return false;
    const patternParts = pattern.split("/");
    if (patternParts.some((part, index) =>
        (part.includes("#") && (part !== "#" || index !== patternParts.length - 1)) ||
        (part.includes("+") && part !== "+"))) return false;
    const topicParts = topic.split("/");

    for (let index = 0; index < patternParts.length; index += 1) {
        const patternPart = patternParts[index];
        const topicPart = topicParts[index];

        if (patternPart === "#") {
            return index === patternParts.length - 1;
        }
        if (patternPart === "+") {
            if (typeof topicPart === "undefined") return false;
            continue;
        }
        if (typeof topicPart === "undefined" || patternPart !== topicPart) {
            return false;
        }
    }

    return patternParts.length === topicParts.length;
}

export interface MqttAclRule {
    id: number;
    device_code: string;
    action: MqttAclAction;
    topic_pattern: string;
    permission: MqttAclPermission;
    priority: number;
    created_at: string;
}

export interface MqttUserAclRule {
    id: number;
    user_id: number;
    action: MqttAclAction;
    topic_pattern: string;
    permission: MqttAclPermission;
    source: string;
    source_device_code?: string | null;
    source_key?: string | null;
    created_at: string;
}

export interface MqttDynsecAcl {
    acltype: string;
    topic: string;
    allow: boolean;
    priority: number;
}

export interface MqttDynsecJob {
    deviceCode: string;
    revision: number;
    attempts: number;
    nextAttemptAt: number;
    lastError: string | null;
}

export interface MqttDynsecStatus {
    enabled: boolean;
    jobs: MqttDynsecJob[];
}

export interface MqttDeviceAclView {
    enabled: boolean;
    rules: Pick<MqttAclRule, "action" | "topic_pattern" | "permission" | "priority">[];
    expected: MqttDynsecAcl[];
    applied: MqttDynsecAcl[] | null;
    clientEnabled: boolean | null;
    job: Pick<MqttDynsecJob, "attempts" | "nextAttemptAt" | "lastError"> | null;
    brokerError?: string;
}
