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

export function deviceMqttTopics(deviceCode: string) {
    const root = `devices/${deviceCode}`;
    return {
        telemetry: `${root}/telemetry/#`,
        commands: `${root}/commands/#`,
        availability: `${root}/telemetry/availability`,
        state: `${root}/telemetry/state`,
    };
}
