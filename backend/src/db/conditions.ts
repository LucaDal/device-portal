import { and, eq } from "drizzle-orm";
import { devices, deviceTypes } from "./schema";

export const activeMqttDevice = and(
    eq(devices.activated, 1), eq(devices.mqtt_enabled, 1), eq(deviceTypes.mqtt_enabled, 1),
)!;
