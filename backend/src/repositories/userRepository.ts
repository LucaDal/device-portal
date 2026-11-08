import { and, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../config/database";
import { devices, deviceShareInvitations, deviceShares, userInvitations, users } from "../db/schema";
import type { Role } from "@shared/constants/auth";

const publicUserColumns = {
    id: users.id, email: users.email, role: users.role,
    must_change_password: users.must_change_password, created_at: users.created_at,
};

const userByEmailQuery = db.select().from(users).where(eq(users.email, sql.placeholder("email"))).prepare();
const userByIdQuery = db.select().from(users).where(eq(users.id, sql.placeholder("id"))).prepare();
const userSessionQuery = db.select({ ...publicUserColumns, session_version: users.session_version })
    .from(users).where(eq(users.id, sql.placeholder("id"))).prepare();

export function findUserByEmail(email: string) {
    return userByEmailQuery.get({ email });
}

export function findUserById(id: number) {
    return userByIdQuery.get({ id });
}

export function getUserSession(id: number) {
    return userSessionQuery.get({ id });
}

export function listUsers() {
    return db.select(publicUserColumns).from(users).orderBy(desc(users.created_at)).all();
}

export function listUserIds() {
    return db.select({ id: users.id }).from(users).orderBy(users.id).all();
}

export function insertUser(values: typeof users.$inferInsert) {
    return db.insert(users).values(values).returning({ id: users.id }).get()!;
}

export function updateUserRole(id: number, role: Role) {
    return db.update(users).set({ role, session_version: sql`${users.session_version} + 1` })
        .where(eq(users.id, id)).run();
}

export function changeUserPassword(id: number, email: string, passwordHash: string) {
    db.transaction(() => {
        db.update(users).set({ password_hash: passwordHash, must_change_password: 0,
            session_version: sql`${users.session_version} + 1` }).where(eq(users.id, id)).run();
        db.update(userInvitations).set({ accepted_at: sql`COALESCE(${userInvitations.accepted_at}, CURRENT_TIMESTAMP)` })
            .where(eq(userInvitations.email, email)).run();
    });
}

export function countOwnedDevices(userId: number) {
    return db.select({ count: count() }).from(devices).where(eq(devices.owner_id, userId)).get()!.count;
}

export function deleteUser(id: number, email: string) {
    db.transaction(() => {
        db.delete(userInvitations).where(or(eq(userInvitations.invited_by, id), eq(userInvitations.email, email))).run();
        db.delete(deviceShareInvitations).where(or(eq(deviceShareInvitations.invited_by, id), eq(deviceShareInvitations.email, email))).run();
        db.delete(deviceShares).where(or(eq(deviceShares.user_id, id), eq(deviceShares.shared_by, id))).run();
        db.delete(users).where(eq(users.id, id)).run();
    });
}

export function inviteUser(email: string, role: Role, passwordHash: string, invitedBy: number, expiresAt: string) {
    const user = db.insert(users).values({ email, role, password_hash: passwordHash, must_change_password: 1 })
        .onConflictDoUpdate({ target: users.email, set: {
            role, password_hash: passwordHash, must_change_password: 1,
            session_version: sql`${users.session_version} + 1`,
        } }).returning({ id: users.id }).get()!;
    const values = { email, role, otp_hash: passwordHash, invited_by: invitedBy, expires_at: expiresAt, accepted_at: null };
    db.insert(userInvitations).values(values).onConflictDoUpdate({ target: userInvitations.email,
        set: { ...values, created_at: sql`CURRENT_TIMESTAMP` } }).run();
    return user;
}

export function findUserInvitation(email: string) {
    return db.select().from(userInvitations).where(eq(userInvitations.email, email)).get();
}

export function hasValidUserInvitation(email: string) {
    return Boolean(db.select({ id: userInvitations.id }).from(userInvitations).where(and(
        eq(userInvitations.email, email), isNull(userInvitations.accepted_at),
        sql`datetime(${userInvitations.expires_at}) > datetime('now')`,
    )).get());
}

export function listUserInvitations() {
    return db.select({
        id: userInvitations.id, email: userInvitations.email, role: userInvitations.role,
        expires_at: userInvitations.expires_at, accepted_at: userInvitations.accepted_at,
        created_at: userInvitations.created_at, invited_by_email: users.email,
    }).from(userInvitations).leftJoin(users, eq(userInvitations.invited_by, users.id))
        .where(isNull(userInvitations.accepted_at)).orderBy(desc(userInvitations.created_at)).all();
}

export function getUserInvitation(id: number) {
    return db.select().from(userInvitations).where(eq(userInvitations.id, id)).get();
}

export function deleteUserInvitation(id: number) {
    return db.delete(userInvitations).where(eq(userInvitations.id, id)).run();
}
