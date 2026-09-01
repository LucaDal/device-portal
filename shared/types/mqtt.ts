import { MqttAclAction, MqttAclPermission } from "../constants/mqtt";

export function mqttTopicMatches(pattern: string, topic: string): boolean {
    const patternParts = pattern.split("/");
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

export interface DeviceCertificateSummary {
    client_id: string;
    device_code: string;
    cert_fingerprint_sha256: string;
    enabled: number;
    created_at: string;
    updated_at: string;
}
