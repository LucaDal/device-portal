import { EventEmitter } from "events";

export const MQTT_USER_ACL_SYNCED_EVENT = "mqtt-user-acl-synced";

export const mqttAclEvents = new EventEmitter();
