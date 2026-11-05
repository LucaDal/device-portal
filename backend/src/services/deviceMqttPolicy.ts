import { DB } from "../config/database";

// Queries using this predicate must join devices AS d and device_types AS dt.
export const ACTIVE_MQTT_DEVICE_SQL = `d.activated = 1
    AND COALESCE(d.mqtt_enabled, 1) = 1 AND dt.mqtt_enabled = 1`;

export type DeviceMqttState = {
    code: string;
    activated: number;
    mqtt_enabled: number;
    type_mqtt_enabled: number;
    mqtt_available: number;
};

export function getDeviceMqttState(code: string): DeviceMqttState | undefined {
    return DB.prepare(`SELECT d.code, d.activated, COALESCE(d.mqtt_enabled, 1) AS mqtt_enabled,
        dt.mqtt_enabled AS type_mqtt_enabled, (${ACTIVE_MQTT_DEVICE_SQL}) AS mqtt_available
        FROM devices d JOIN device_types dt ON dt.id = d.device_type_id WHERE d.code = ?`)
        .get(code) as DeviceMqttState | undefined;
}

export function parseMqttEnabled(value: unknown): boolean {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    throw new Error("mqtt_enabled must be true or false");
}
