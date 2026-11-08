import { and, desc, eq } from "drizzle-orm";
import { db } from "../config/database";
import { deviceRequestLogs } from "../db/schema";

export function insertDeviceRequestLog(values: typeof deviceRequestLogs.$inferInsert) {
    db.insert(deviceRequestLogs).values(values).run();
}

export function listDeviceRequestLogs(filters: { eventType?: string; deviceCode?: string; limit?: number }) {
    const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 500);
    return db.select().from(deviceRequestLogs).where(and(
        filters.eventType ? eq(deviceRequestLogs.event_type, filters.eventType) : undefined,
        filters.deviceCode ? eq(deviceRequestLogs.device_code, filters.deviceCode) : undefined,
    )).orderBy(desc(deviceRequestLogs.created_at), desc(deviceRequestLogs.id)).limit(limit).all();
}
