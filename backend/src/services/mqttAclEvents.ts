import { EventEmitter } from "events";

export const MQTT_USER_ACL_SYNCED_EVENT = "mqtt-user-acl-synced";
export const MQTT_BROKER_SETTINGS_CHANGED_EVENT = "mqtt-broker-settings-changed";

export const mqttAclEvents = new EventEmitter();
