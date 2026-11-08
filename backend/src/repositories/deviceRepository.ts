import { and, count, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "../config/database";
import { deviceProperties, devices, deviceShares, deviceShareInvitations, deviceTypes, users } from "../db/schema";
import { activeMqttDevice } from "../db/conditions";
import { ROLES, Role } from "@shared/constants/auth";

const deviceByCodeQuery = db.select().from(devices).where(eq(devices.code, sql.placeholder("code"))).prepare();

export function findDevice(code: string) {
    return deviceByCodeQuery.get({ code });
}

export function findDevicesByType(typeId: string) {
    return db.select().from(devices).where(eq(devices.device_type_id, typeId)).all();
}

export function listDeviceCodes() {
    return db.select({ code: devices.code }).from(devices).orderBy(devices.code).all();
}

const deviceWithTypeQuery = db.select({
    code: devices.code, name: devices.name, device_type_id: devices.device_type_id, owner_id: devices.owner_id,
    activated: devices.activated, mqtt_enabled: devices.mqtt_enabled,
    type_mqtt_enabled: deviceTypes.mqtt_enabled, mqtt_available: sql<number>`${activeMqttDevice}`,
    mqttTopics: deviceTypes.mqttTopics, device_properties_schema: deviceTypes.deviceProperties,
    generic_properties: deviceTypes.genericProperties,
}).from(devices).innerJoin(deviceTypes, eq(deviceTypes.id, devices.device_type_id))
    .where(eq(devices.code, sql.placeholder("code"))).prepare();

export function getDeviceWithType(code: string) {
    return deviceWithTypeQuery.get({ code });
}

export function isDeviceOwner(userId: number, code: string) {
    return Boolean(db.select({ code: devices.code }).from(devices)
        .where(and(eq(devices.code, code), eq(devices.owner_id, userId))).get());
}

export function canAccessDevice(userId: number, role: string, code: string) {
    if (!userId) return false;
    if (role === ROLES.ADMIN) return true;
    return Boolean(db.select({ code: devices.code }).from(devices)
        .leftJoin(deviceShares, and(eq(deviceShares.device_code, devices.code), eq(deviceShares.user_id, userId)))
        .where(and(eq(devices.code, code), or(eq(devices.owner_id, userId), isNotNull(deviceShares.user_id)))).get());
}

function accessibleDeviceCodes(userId: number) {
    return db.select({ code: devices.code }).from(devices).where(eq(devices.owner_id, userId))
        .union(db.select({ code: deviceShares.device_code }).from(deviceShares).where(eq(deviceShares.user_id, userId)));
}

export function listDevicesForUser(userId: number, role: string) {
    const admin = role === ROLES.ADMIN;
    return db.select({
        code: devices.code,
        name: devices.name,
        device_type_id: devices.device_type_id,
        owner_id: devices.owner_id,
        activated: devices.activated,
        mqtt_enabled: devices.mqtt_enabled,
        owner_email: users.email,
        type_mqtt_enabled: deviceTypes.mqtt_enabled,
        mqtt_available: sql<number>`${activeMqttDevice}`,
        is_shared: sql<number>`CASE WHEN ${deviceShares.user_id} IS NULL THEN 0 ELSE 1 END`,
        device_type_description: deviceTypes.description,
        firmware_version: deviceTypes.firmware_version,
        type_deviceProperties: deviceTypes.deviceProperties,
        type_genericProperties: deviceTypes.genericProperties,
        type_mqttTopics: deviceTypes.mqttTopics,
        device_properties: sql<string | null>`CASE WHEN ${admin ? 1 : 0} = 1 OR ${devices.owner_id} = ${userId}
            THEN COALESCE(${deviceProperties.properties}, '{}') ELSE NULL END`,
    }).from(devices).innerJoin(deviceTypes, eq(deviceTypes.id, devices.device_type_id))
        .leftJoin(users, eq(users.id, devices.owner_id))
        .leftJoin(deviceProperties, eq(deviceProperties.device_code, devices.code))
        .leftJoin(deviceShares, and(eq(deviceShares.device_code, devices.code), eq(deviceShares.user_id, userId)))
        .where(admin ? undefined : inArray(devices.code, accessibleDeviceCodes(userId)))
        .orderBy(devices.code).all();
}

export function updateDevice(code: string, values: Partial<typeof devices.$inferInsert>) {
    return db.update(devices).set(values).where(eq(devices.code, code)).run();
}

export function claimDevice(code: string, userId: number) {
    return db.update(devices).set({ owner_id: userId, activated: 1 })
        .where(and(eq(devices.code, code), isNull(devices.owner_id), eq(devices.activated, 0))).run();
}

export function createDevice(values: typeof devices.$inferInsert) {
    db.transaction(() => {
        db.insert(devices).values(values).run();
        db.insert(deviceProperties).values({ device_code: values.code }).run();
    });
}

export function getProvisionedDevice(code: string) {
    return db.select({
        code: devices.code,
        name: devices.name,
        device_type_id: devices.device_type_id,
        owner_id: devices.owner_id,
        owner_email: users.email,
        activated: devices.activated
    }).from(devices)
        .leftJoin(users, eq(users.id, devices.owner_id)).where(eq(devices.code, code)).get();
}

export function deleteDevice(code: string) {
    return db.delete(devices).where(eq(devices.code, code)).run();
}

export function revokeDeviceOwnership(code: string) {
    db.transaction(() => {
        updateDevice(code, { owner_id: null, activated: 0 });
        db.delete(deviceShares).where(eq(deviceShares.device_code, code)).run();
        db.delete(deviceShareInvitations).where(eq(deviceShareInvitations.device_code, code)).run();
    });
}

export function getDeviceProperties(code: string) {
    return db.select().from(deviceProperties).where(eq(deviceProperties.device_code, code)).get();
}

export function saveDeviceProperties(code: string, properties: string) {
    db.insert(deviceProperties).values({ device_code: code, properties })
        .onConflictDoUpdate({ target: deviceProperties.device_code, set: { properties } }).run();
}

export function countDevicesByType(typeId: string) {
    return db.select({ count: count() }).from(devices).where(eq(devices.device_type_id, typeId)).get()!.count;
}

export function listAccessibleMqttDevices(userId: number, role: Role) {
    return db.select({
        code: devices.code,
        name: devices.name,
        device_type_id: devices.device_type_id,
        owner_id: devices.owner_id,
        mqttTopics: deviceTypes.mqttTopics,
        access_source: sql<'owned' | 'shared' | 'admin'>`CASE WHEN ${role} = 'admin' THEN 'admin'
            WHEN ${devices.owner_id} = ${userId} THEN 'owned' ELSE 'shared' END`,
    }).from(devices).innerJoin(deviceTypes, eq(deviceTypes.id, devices.device_type_id))
        .leftJoin(deviceShares, and(eq(deviceShares.device_code, devices.code), eq(deviceShares.user_id, userId)))
        .where(and(activeMqttDevice, role === ROLES.ADMIN ? undefined : inArray(devices.code, accessibleDeviceCodes(userId))))
        .orderBy(devices.code).all();
}
