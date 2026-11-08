import { inArray, sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { MQTT_ACL_ACTIONS, MQTT_ACL_PERMISSION, MqttAclAction, MqttAclPermission } from "../../../../shared/constants/mqtt";
import { users } from "./auth";
import { devices } from "./devices";

export const mqttAclRules = sqliteTable("mqtt_acl_rules", {
    id: integer().primaryKey({ autoIncrement: true }),
    device_code: text().notNull().references(() => devices.code, { onDelete: "cascade" }),
    action: text().$type<MqttAclAction>().notNull(),
    topic_pattern: text().notNull(),
    permission: text().$type<MqttAclPermission>().notNull().default("allow"),
    priority: integer().notNull().default(100),
    source: text().notNull().default("device_type_mqtt"),
    source_key: text(),
    created_at: text().notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
    check("mqtt_acl_action", inArray(t.action, Object.values(MQTT_ACL_ACTIONS)).inlineParams()),
    check("mqtt_acl_permission", inArray(t.permission, Object.values(MQTT_ACL_PERMISSION)).inlineParams()),
    index("idx_mqtt_acl_rules_device_priority").on(t.device_code, t.priority, t.id),
]);

export const mqttUserAclRules = sqliteTable("mqtt_user_acl_rules", {
    id: integer().primaryKey({ autoIncrement: true }),
    user_id: integer().notNull().references(() => users.id, { onDelete: "cascade" }),
    action: text().$type<MqttAclAction>().notNull(),
    topic_pattern: text().notNull(),
    permission: text().$type<MqttAclPermission>().notNull().default("allow"),
    source: text().notNull().default("generated"),
    source_device_code: text().references(() => devices.code, { onDelete: "cascade" }),
    source_key: text(),
    created_at: text().notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
    check("mqtt_user_acl_action", inArray(t.action, Object.values(MQTT_ACL_ACTIONS)).inlineParams()),
    check("mqtt_user_acl_permission", inArray(t.permission, Object.values(MQTT_ACL_PERMISSION)).inlineParams()),
    index("idx_mqtt_user_acl_rules_user").on(t.user_id, t.id),
    index("idx_mqtt_user_acl_rules_device").on(t.source_device_code),
]);

export const mqttDeviceCredentials = sqliteTable("mqtt_device_credentials", {
    device_code: text().primaryKey().notNull().references(() => devices.code, { onDelete: "cascade" }),
    encrypted_password: text().notNull(),
});

// No device FK: deleted devices must remain queued until their broker identity is removed.
export const mqttDynsecQueue = sqliteTable("mqtt_dynsec_queue", {
    device_code: text().primaryKey().notNull(),
    revision: integer().notNull().default(1),
    attempts: integer().notNull().default(0),
    next_attempt_at: integer().notNull().default(0),
    last_error: text(),
}, (t) => [
    check("mqtt_dynsec_revision", sql`${t.revision} > 0`),
    check("mqtt_dynsec_attempts", sql`${t.attempts} >= 0`),
    index("idx_mqtt_dynsec_due").on(t.next_attempt_at, t.device_code),
]);
