import { getDeviceWithType } from "../repositories/deviceRepository";

export type DeviceMqttState = {
    code: string;
    activated: number;
    mqtt_enabled: number;
    type_mqtt_enabled: number;
    mqtt_available: number;
};

export function getDeviceMqttState(code: string): DeviceMqttState | undefined {
    const device = getDeviceWithType(code);
    if (!device) return undefined;
    const { activated, mqtt_enabled, type_mqtt_enabled, mqtt_available } = device;
    return { code, activated, mqtt_enabled, type_mqtt_enabled, mqtt_available };
}

export function parseMqttEnabled(value: unknown): boolean {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    throw new Error("mqtt_enabled must be true or false");
}
