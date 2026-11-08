import { inArray, sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ROLE_VALUES, Role } from "../../../../shared/constants/auth";

export const users = sqliteTable("users", {
    id: integer().primaryKey({ autoIncrement: true }),
    email: text().notNull().unique(),
    password_hash: text().notNull(),
    role: text().$type<Role>().notNull().default("user"),
    must_change_password: integer().notNull().default(0),
    session_version: integer().notNull().default(0),
    created_at: text().notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
    check("users_role", inArray(t.role, ROLE_VALUES).inlineParams()),
    check("users_password_change", sql`${t.must_change_password} IN (0, 1)`),
    check("users_session_version", sql`${t.session_version} >= 0`),
]);

export const userInvitations = sqliteTable("user_invitations", {
    id: integer().primaryKey({ autoIncrement: true }),
    email: text().notNull().unique(),
    role: text().$type<Role>().notNull().default("user"),
    otp_hash: text().notNull(),
    invited_by: integer().notNull().references(() => users.id, { onDelete: "restrict" }),
    expires_at: text().notNull(),
    accepted_at: text(),
    created_at: text().notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
    check("user_invitations_role", inArray(t.role, ROLE_VALUES).inlineParams()),
    index("idx_user_invitations_inviter").on(t.invited_by),
]);
