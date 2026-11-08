export const MQTT_ACL_ACTIONS = {
    PUBLISH: "publish",
    SUBSCRIBE: "subscribe",
    ALL: "all",
} as const;

export type MqttAclAction = (typeof MQTT_ACL_ACTIONS)[keyof typeof MQTT_ACL_ACTIONS];

export const MQTT_ACL_PERMISSION = {
    ALLOW: "allow",
    DENY: "deny",
} as const;

export type MqttAclPermission = (typeof MQTT_ACL_PERMISSION)[keyof typeof MQTT_ACL_PERMISSION];

export const MQTT_AVAILABILITY_TOPIC = {
    key: "availability", label: "Availability (online/offline)",
    topic: "devices/{deviceCode}/telemetry/availability", action: MQTT_ACL_ACTIONS.PUBLISH,
} as const;

export const DEFAULT_DEVICE_TYPE_MQTT_TOPICS = [
    { key: "telemetry", label: "Telemetry", topic: "devices/{deviceCode}/telemetry/#", action: MQTT_ACL_ACTIONS.PUBLISH },
    { key: "commands", label: "Commands", topic: "devices/{deviceCode}/commands/#", action: MQTT_ACL_ACTIONS.SUBSCRIBE },
] as const;

export function deviceAvailabilityTopic(deviceCode: string): string {
    return MQTT_AVAILABILITY_TOPIC.topic.replace("{deviceCode}", deviceCode);
}
