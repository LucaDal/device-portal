import { MqttAclPermission } from "../constants/mqtt";

export interface MqttBrokerSettings {
    host: string;
    port: number;
    protocol: "mqtt" | "mqtts";
    username: string;
    password: string;
    clientIdPrefix: string;
}

export interface MqttPublishInput {
    topic: string;
    email: string;
    password: string;
    content: Record<string, unknown> | unknown[];
}

export interface MqttPublishAclRule {
    id: number;
    user_id: number;
    topic_pattern: string;
    permission: MqttAclPermission;
    priority: number;
    created_at: string;
}
