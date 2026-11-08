import { inArray, sql } from "drizzle-orm";
import { blob, check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { WIDGET_TYPES, DeviceDashboardWidget } from "../../../../shared/widgets";
import { DEVICE_NAME_MAX_LENGTH } from "../../../../shared/types/device";
import { users } from "./auth";

export const deviceTypes = sqliteTable("device_types", {
    id: text().primaryKey().notNull(),
    description: text(),
    firmware_version: text().notNull(),
    firmware_build: blob({ mode: "buffer" }).notNull(),
    deviceProperties: text().notNull().default("{}"),
    genericProperties: text().notNull().default("{}"),
    mqttTopics: text().notNull().default("[]"),
    mqtt_enabled: integer().notNull().default(0),
    widgets_revision: integer().notNull().default(0),
    created_at: text().notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
    check("device_types_widgets_revision", sql`${t.widgets_revision} >= 0`),
    check("device_types_mqtt_enabled", sql`${t.mqtt_enabled} IN (0, 1)`),
    check("device_types_properties_json", sql`json_valid(${t.deviceProperties}) AND json_type(${t.deviceProperties}) = 'object'`),
    check("device_types_generic_properties_json", sql`json_valid(${t.genericProperties}) AND json_type(${t.genericProperties}) = 'object'`),
    check("device_types_topics_json", sql`json_valid(${t.mqttTopics}) AND json_type(${t.mqttTopics}) = 'array'`),
]);

export const devices = sqliteTable("devices", {
    code: text().primaryKey().notNull(),
    name: text().notNull(),
    device_type_id: text().notNull().references(() => deviceTypes.id, { onDelete: "restrict" }),
    owner_id: integer().references(() => users.id, { onDelete: "restrict" }),
    activated: integer().notNull().default(0),
    device_secret_hash: text().notNull(),
    mqtt_enabled: integer().notNull().default(1),
}, (t) => [
    check("devices_name", sql`length(${t.name}) BETWEEN 1 AND ${DEVICE_NAME_MAX_LENGTH} AND length(trim(${t.name})) > 0`.inlineParams()),
    check("devices_activated", sql`${t.activated} IN (0, 1)`),
    check("devices_mqtt_enabled", sql`${t.mqtt_enabled} IN (0, 1)`),
    index("idx_devices_owner").on(t.owner_id),
    index("idx_devices_type").on(t.device_type_id),
]);

export const deviceProperties = sqliteTable("device_properties", {
    device_code: text().primaryKey().notNull().references(() => devices.code, { onDelete: "cascade" }),
    properties: text().notNull().default("{}"),
}, (t) => [check("device_properties_json", sql`json_valid(${t.properties}) AND json_type(${t.properties}) = 'object'`)]);

export const deviceTypeWidgets = sqliteTable("device_type_widgets", {
    device_type_id: text().notNull().references(() => deviceTypes.id, { onDelete: "cascade" }),
    widget_id: text().notNull(),
    position: integer().notNull().default(0),
    definition: text({ mode: "json" }).$type<DeviceDashboardWidget>().notNull(),
    created_at: text().notNull().default(sql`CURRENT_TIMESTAMP`),
    updated_at: text().notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
    primaryKey({ columns: [t.device_type_id, t.widget_id] }),
    check("device_type_widgets_json", sql`json_valid(${t.definition}) AND json_type(${t.definition}) = 'object'`),
    check("device_type_widgets_identity", sql`COALESCE(json_extract(${t.definition}, '$.id') = ${t.widget_id}, 0)`),
    check("device_type_widgets_kind", inArray(sql`COALESCE(json_extract(${t.definition}, '$.kind'), '')`, Object.keys(WIDGET_TYPES)).inlineParams()),
    check("device_type_widgets_position", sql`${t.position} >= 0`),
    index("idx_device_type_widgets_position").on(t.device_type_id, t.position, t.widget_id),
]);

export const deviceShares = sqliteTable("device_shares", {
    device_code: text().notNull().references(() => devices.code, { onDelete: "cascade" }),
    user_id: integer().notNull().references(() => users.id, { onDelete: "cascade" }),
    shared_by: integer().notNull().references(() => users.id, { onDelete: "restrict" }),
    created_at: text().notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
    primaryKey({ columns: [t.device_code, t.user_id] }),
    index("idx_device_shares_user").on(t.user_id),
    index("idx_device_shares_sharer").on(t.shared_by),
]);

export const deviceShareInvitations = sqliteTable("device_share_invitations", {
    id: integer().primaryKey({ autoIncrement: true }),
    device_code: text().notNull().references(() => devices.code, { onDelete: "cascade" }),
    email: text().notNull(),
    invitation_token: text().notNull().unique(),
    invited_by: integer().notNull().references(() => users.id, { onDelete: "restrict" }),
    expires_at: text().notNull(),
    accepted_at: text(),
    created_at: text().notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
    index("idx_device_share_invitations_lookup").on(t.email, t.accepted_at, t.expires_at),
    index("idx_device_share_invitations_device").on(t.device_code),
    index("idx_device_share_invitations_inviter").on(t.invited_by),
]);
