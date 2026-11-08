import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db } from "../config/database";
import { mqttAclRules, mqttUserAclRules } from "../db/schema";

export type NewDeviceAclRule = Omit<typeof mqttAclRules.$inferSelect, "id" | "created_at">;
export type NewUserAclRule = Omit<typeof mqttUserAclRules.$inferSelect, "id" | "created_at">;

const insertDeviceRule = db.insert(mqttAclRules).values({
    device_code: sql.placeholder("device_code"), action: sql.placeholder("action"),
    topic_pattern: sql.placeholder("topic_pattern"), permission: sql.placeholder("permission"),
    priority: sql.placeholder("priority"), source: sql.placeholder("source"), source_key: sql.placeholder("source_key"),
}).prepare();

const insertUserRule = db.insert(mqttUserAclRules).values({
    user_id: sql.placeholder("user_id"), action: sql.placeholder("action"),
    topic_pattern: sql.placeholder("topic_pattern"), permission: sql.placeholder("permission"),
    source: sql.placeholder("source"), source_device_code: sql.placeholder("source_device_code"), source_key: sql.placeholder("source_key"),
}).prepare();

const deviceAclQuery = db.select().from(mqttAclRules).where(eq(mqttAclRules.device_code, sql.placeholder("code")))
    .orderBy(mqttAclRules.priority, mqttAclRules.id).prepare();
const userAclQuery = db.select().from(mqttUserAclRules).where(eq(mqttUserAclRules.user_id, sql.placeholder("userId")))
    .orderBy(mqttUserAclRules.id).prepare();

export function listDeviceAclRules(code: string) {
    return deviceAclQuery.all({ code });
}

export function replaceGeneratedDeviceAclRules(code: string, rules: NewDeviceAclRule[]) {
    db.transaction(() => {
        db.delete(mqttAclRules).where(and(eq(mqttAclRules.device_code, code), eq(mqttAclRules.source, "device_type_mqtt"))).run();
        for (const rule of rules) insertDeviceRule.run(rule);
    });
}

export function listUserAclRules(userId: number) {
    return userAclQuery.all({ userId });
}

export function listUserAclRulesForAdmin(userId: number) {
    return db.select().from(mqttUserAclRules).where(eq(mqttUserAclRules.user_id, userId))
        .orderBy(mqttUserAclRules.source_device_code, mqttUserAclRules.action, mqttUserAclRules.topic_pattern, mqttUserAclRules.id).all();
}

export function replaceGeneratedUserAclRules(userId: number, rules: NewUserAclRule[]) {
    db.transaction(() => {
        db.delete(mqttUserAclRules).where(and(eq(mqttUserAclRules.user_id, userId), like(mqttUserAclRules.source, "generated_%"))).run();
        for (const rule of rules) insertUserRule.run(rule);
    });
}

export function listReadableTopicPatterns(userId: number) {
    return db.selectDistinct({ topic_pattern: mqttUserAclRules.topic_pattern }).from(mqttUserAclRules)
        .where(and(eq(mqttUserAclRules.user_id, userId), eq(mqttUserAclRules.permission, "allow"),
            inArray(mqttUserAclRules.action, ["subscribe", "all"]))).orderBy(mqttUserAclRules.topic_pattern).all()
        .map((row) => row.topic_pattern.trim()).filter(Boolean);
}
