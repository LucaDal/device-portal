import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Historical context survives deletion of devices and users, so these columns have no FKs.
export const deviceRequestLogs = sqliteTable("device_request_logs", {
    id: integer().primaryKey({ autoIncrement: true }),
    created_at: text().notNull().default(sql`CURRENT_TIMESTAMP`),
    event_type: text().notNull(),
    method: text().notNull(),
    path: text().notNull(),
    status_code: integer(),
    device_code: text(),
    device_type_id: text(),
    user_id: integer(),
    user_email: text(),
    topic: text(),
    ip: text(),
    user_agent: text(),
    request_summary: text(),
    response_summary: text(),
    error: text(),
}, (t) => [
    index("idx_device_request_logs_created").on(t.created_at, t.id),
    index("idx_device_request_logs_type_created").on(t.event_type, t.created_at, t.id),
    index("idx_device_request_logs_device_created").on(t.device_code, t.created_at, t.id),
]);
