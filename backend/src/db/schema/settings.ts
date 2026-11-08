import { inArray, sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { PropertyType } from "../../../../shared/types/properties";

export const appSettings = sqliteTable("app_settings", {
    key: text().primaryKey().notNull(),
    value: text(),
    updated_at: text().notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const defaultDeviceProperties = sqliteTable("default_device_properties", {
    key: text().primaryKey().notNull(),
    label: text(),
    type: text().$type<PropertyType>().notNull(),
    value: text().notNull(),
    is_global: integer().notNull().default(0),
    updated_at: text().notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
    check("default_properties_type", inArray(t.type, Object.values(PropertyType)).inlineParams()),
    check("default_properties_global", sql`${t.is_global} IN (0, 1)`),
]);
