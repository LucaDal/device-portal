import { MqttAclAction, MqttAclPermission } from "../constants/mqtt";

export interface MqttAclRule {
    id: number;
    device_code: string;
    action: MqttAclAction;
    topic_pattern: string;
    permission: MqttAclPermission;
    priority: number;
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
