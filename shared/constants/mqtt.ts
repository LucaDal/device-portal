export const MQTT_AUTH_RESULT = {
    ALLOW: "allow",
    DENY: "deny",
} as const;

export type MqttAuthResult = (typeof MQTT_AUTH_RESULT)[keyof typeof MQTT_AUTH_RESULT];

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
