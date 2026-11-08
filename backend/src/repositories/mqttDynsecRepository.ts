import { and, eq, exists, lte, or, sql } from "drizzle-orm";
import { db } from "../config/database";
import { devices, deviceTypes, mqttDeviceCredentials, mqttDynsecQueue } from "../db/schema";
import { activeMqttDevice } from "../db/conditions";

export function getDeviceCredentials(code: string) {
    return db.select().from(mqttDeviceCredentials).where(eq(mqttDeviceCredentials.device_code, code)).get();
}

export function saveDeviceCredentials(code: string, encryptedPassword: string) {
    db.insert(mqttDeviceCredentials).values({ device_code: code, encrypted_password: encryptedPassword })
        .onConflictDoUpdate({ target: mqttDeviceCredentials.device_code, set: { encrypted_password: encryptedPassword } }).run();
}

export function deleteDeviceCredentials(code: string) {
    db.delete(mqttDeviceCredentials).where(eq(mqttDeviceCredentials.device_code, code)).run();
}

export function getDynsecJob(code: string) {
    return db.select({ attempts: mqttDynsecQueue.attempts, nextAttemptAt: mqttDynsecQueue.next_attempt_at,
        lastError: mqttDynsecQueue.last_error }).from(mqttDynsecQueue).where(eq(mqttDynsecQueue.device_code, code)).get();
}

export function listDynsecJobs() {
    return db.select({ deviceCode: mqttDynsecQueue.device_code, revision: mqttDynsecQueue.revision,
        attempts: mqttDynsecQueue.attempts, nextAttemptAt: mqttDynsecQueue.next_attempt_at,
        lastError: mqttDynsecQueue.last_error }).from(mqttDynsecQueue).orderBy(mqttDynsecQueue.device_code).all();
}

export function enqueueDynsecDevice(code: string) {
    db.insert(mqttDynsecQueue).values({ device_code: code }).onConflictDoNothing().run();
}

export function enqueueAllDynsecDevices() {
    const targets = db.select({
        device_code: devices.code, revision: sql<number>`1`.as("revision"), attempts: sql<number>`0`.as("attempts"),
        next_attempt_at: sql<number>`0`.as("next_attempt_at"), last_error: sql<string | null>`NULL`.as("last_error"),
    }).from(devices).innerJoin(deviceTypes, eq(deviceTypes.id, devices.device_type_id))
        .where(or(activeMqttDevice, exists(db.select({ code: mqttDeviceCredentials.device_code }).from(mqttDeviceCredentials)
            .where(eq(mqttDeviceCredentials.device_code, devices.code)))));
    db.insert(mqttDynsecQueue).select(targets).onConflictDoNothing().run();
}

export function listDueDynsecJobs(now: number) {
    return db.select({ device_code: mqttDynsecQueue.device_code, revision: mqttDynsecQueue.revision, attempts: mqttDynsecQueue.attempts })
        .from(mqttDynsecQueue).where(lte(mqttDynsecQueue.next_attempt_at, now))
        .orderBy(mqttDynsecQueue.next_attempt_at, mqttDynsecQueue.device_code).limit(25).all();
}

export function completeDynsecJob(code: string, revision: number) {
    db.delete(mqttDynsecQueue).where(and(eq(mqttDynsecQueue.device_code, code), eq(mqttDynsecQueue.revision, revision))).run();
}

export function retryDynsecJob(code: string, revision: number, nextAttemptAt: number) {
    db.update(mqttDynsecQueue).set({ attempts: sql`${mqttDynsecQueue.attempts} + 1`, next_attempt_at: nextAttemptAt,
        last_error: "Broker synchronization failed; check configuration and broker availability" })
        .where(and(eq(mqttDynsecQueue.device_code, code), eq(mqttDynsecQueue.revision, revision))).run();
}
