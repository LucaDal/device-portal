import { eq, getTableColumns } from "drizzle-orm";
import { db } from "../config/database";
import { deviceTypes } from "../db/schema";

const { firmware_build, ...typeColumns } = getTableColumns(deviceTypes);

export function listDeviceTypes() {
    return db.select(typeColumns).from(deviceTypes).orderBy(deviceTypes.id).all();
}

export function findDeviceType(id: string) {
    return db.select(typeColumns).from(deviceTypes).where(eq(deviceTypes.id, id)).get();
}

export function insertDeviceType(values: typeof deviceTypes.$inferInsert) {
    return db.insert(deviceTypes).values(values).run();
}

export function updateDeviceType(id: string, values: Partial<typeof deviceTypes.$inferInsert>) {
    return db.update(deviceTypes).set(values).where(eq(deviceTypes.id, id)).run();
}

export function deleteDeviceType(id: string) {
    return db.delete(deviceTypes).where(eq(deviceTypes.id, id)).run();
}

export function getFirmware(id: string) {
    return db.select({ fb: deviceTypes.firmware_build, fv: deviceTypes.firmware_version })
        .from(deviceTypes).where(eq(deviceTypes.id, id)).get();
}
