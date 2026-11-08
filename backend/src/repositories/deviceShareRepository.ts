import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "../config/database";
import { deviceShareInvitations, deviceShares, users } from "../db/schema";

export function listDeviceShares(code: string) {
    const sharer = alias(users, "sharer");
    return db.select({
        device_code: deviceShares.device_code,
        user_id: deviceShares.user_id,
        shared_by: deviceShares.shared_by,
        created_at: deviceShares.created_at,
        user_email: users.email,
        shared_by_email: sharer.email,
    }).from(deviceShares)
        .innerJoin(users, eq(users.id, deviceShares.user_id))
        .leftJoin(sharer, eq(sharer.id, deviceShares.shared_by))
        .where(eq(deviceShares.device_code, code))
        .orderBy(desc(deviceShares.created_at)).all();
}

export function listDeviceShareInvitations(code: string) {
    return db.select({
        id: deviceShareInvitations.id,
        device_code: deviceShareInvitations.device_code,
        email: deviceShareInvitations.email,
        invited_by: deviceShareInvitations.invited_by,
        expires_at: deviceShareInvitations.expires_at,
        accepted_at: deviceShareInvitations.accepted_at,
        created_at: deviceShareInvitations.created_at,
        invited_by_email: users.email,
    }).from(deviceShareInvitations)
        .leftJoin(users, eq(users.id, deviceShareInvitations.invited_by))
        .where(and(eq(deviceShareInvitations.device_code, code), isNull(deviceShareInvitations.accepted_at),
            sql`datetime(${deviceShareInvitations.expires_at}) > datetime('now')`))
        .orderBy(desc(deviceShareInvitations.created_at)).all();
}

export function saveDeviceShare(code: string, userId: number, sharedBy: number) {
    db.insert(deviceShares).values({
        device_code: code,
        user_id: userId,
        shared_by: sharedBy
    }).onConflictDoUpdate({
        target: [deviceShares.device_code, deviceShares.user_id],
        set: { shared_by: sharedBy, created_at: sql`CURRENT_TIMESTAMP` }
    }).run();
}

export function shareDeviceWithUser(code: string, userId: number, email: string, sharedBy: number) {
    db.transaction(() => {
        saveDeviceShare(code, userId, sharedBy);
        db.update(deviceShareInvitations).set({ accepted_at: sql`CURRENT_TIMESTAMP` })
            .where(and(eq(deviceShareInvitations.device_code, code), eq(deviceShareInvitations.email, email),
                isNull(deviceShareInvitations.accepted_at))).run();
    });
}

export function acceptDeviceShareInvitations(email: string, userId: number) {
    db.transaction(() => {
        const pending = and(eq(deviceShareInvitations.email, email), isNull(deviceShareInvitations.accepted_at),
            sql`datetime(${deviceShareInvitations.expires_at}) > datetime('now')`);
        const invitations = db.select().from(deviceShareInvitations).where(pending).all();
        for (const invite of invitations) saveDeviceShare(invite.device_code, userId, invite.invited_by);
        db.update(deviceShareInvitations).set({ accepted_at: sql`CURRENT_TIMESTAMP` }).where(pending).run();
    });
}

export function saveDeviceShareInvitation(code: string, email: string, token: string, invitedBy: number, expiresAt: string) {
    const existing = db.select({ id: deviceShareInvitations.id })
        .from(deviceShareInvitations)
        .where(and(eq(deviceShareInvitations.device_code, code), eq(deviceShareInvitations.email, email),
            isNull(deviceShareInvitations.accepted_at))).orderBy(desc(deviceShareInvitations.id)).get();
    const values = { invitation_token: token, invited_by: invitedBy, expires_at: expiresAt };
    if (existing) {
        db.update(deviceShareInvitations).set({ ...values, created_at: sql`CURRENT_TIMESTAMP` })
            .where(eq(deviceShareInvitations.id, existing.id)).run();
    } else {
        db.insert(deviceShareInvitations).values({ device_code: code, email, ...values }).run();
    }
}

export function deleteDeviceShare(code: string, userId: number) {
    return db.delete(deviceShares).where(and(eq(deviceShares.device_code, code), eq(deviceShares.user_id, userId))).run();
}

export function deleteDeviceShareInvitation(id: number, code: string) {
    return db.delete(deviceShareInvitations).where(and(eq(deviceShareInvitations.id, id),
        eq(deviceShareInvitations.device_code, code), isNull(deviceShareInvitations.accepted_at))).run();
}
