import bcrypt from "bcrypt";
import crypto from "crypto";
import { DB } from "../config/database";
import { ROLES, Role } from "@shared/constants/auth";

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

function normalizeEmail(value: string): string {
    return String(value || "").trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function generateTemporaryPassword(): string {
    return crypto.randomBytes(9).toString("base64url");
}

export class UsersController {
    static createUser(
        email: string,
        password: string,
        role: Role = ROLES.USER,
        mustChangePassword = false
    ) {
        try {
            const hash = bcrypt.hashSync(password, 10);
            const stmt = DB.prepare(
                "INSERT INTO users (email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?)"
            );

            const info = stmt.run(email.trim().toLowerCase(), hash, role, mustChangePassword ? 1 : 0);
            return { id: info.lastInsertRowid };
        } catch (err) {
            if (String(err).includes("UNIQUE")) {
                throw new Error("EMAIL_EXISTS");
            }
            throw err;
        }
    }

    static list(req: any, res: any) {
        try {
            const rows = DB.prepare(`
                SELECT
                    u.id,
                    u.email,
                    u.role,
                    u.must_change_password,
                    u.created_at,
                    COALESCE(mpp.enabled, 0) AS mqtt_publish_enabled
                FROM users u
                LEFT JOIN mqtt_publish_permissions mpp ON mpp.user_id = u.id
                ORDER BY u.created_at DESC
            `).all();
            res.send(rows);
        } catch (err) {
            console.info(err);
            return res.status(400).send("Error listing users: " + err);
        }
    }

    static update(req: any, res: any) {
        try {
            const userId = Number(req.params.id);
            const { role, mqtt_publish_enabled } = req.body as {
                role?: Role;
                mqtt_publish_enabled?: boolean | number;
            };

            if (!userId) {
                return res.status(400).send({ error: "Invalid user id" });
            }

            if (typeof role !== "undefined") {
                if (!Object.values(ROLES).includes(role)) {
                    return res.status(400).send({ error: "Invalid role" });
                }
                DB.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, userId);
            }

            if (typeof mqtt_publish_enabled !== "undefined") {
                const enabled = mqtt_publish_enabled === true || Number(mqtt_publish_enabled) === 1 ? 1 : 0;
                const updatedBy = Number((req.user as any)?.id) || null;
                DB.prepare(`
                    INSERT INTO mqtt_publish_permissions (user_id, enabled, updated_by, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(user_id) DO UPDATE SET
                        enabled = excluded.enabled,
                        updated_by = excluded.updated_by,
                        updated_at = CURRENT_TIMESTAMP
                `).run(userId, enabled, updatedBy);
            }

            return res.send({ ok: true });
        } catch (err) {
            console.info(err);
            return res.status(400).send("Error updating user:" + err);
        }
    }

    static delete(req: any, res: any) {
        try {
            const userId = Number(req.params.id);
            const requesterId = Number((req.user as any)?.id);
            if (!userId) {
                return res.status(400).send({ error: "Invalid user id" });
            }
            if (userId === requesterId) {
                return res.status(400).send({ error: "You cannot delete your own account" });
            }

            const user = DB.prepare("SELECT id, email FROM users WHERE id = ?").get(userId) as
                | { id: number; email: string }
                | undefined;
            if (!user) {
                return res.status(404).send({ error: "User not found" });
            }

            const ownedDevices = DB.prepare(
                "SELECT COUNT(*) AS count FROM devices WHERE owner_id = ?"
            ).get(userId) as { count: number };

            if (ownedDevices.count > 0) {
                return res.status(409).send({
                    error:
                        "Cannot delete user: user owns devices. Reassign or delete those devices first.",
                    ownedDevices: ownedDevices.count,
                });
            }

            DB.transaction(() => {
                // Cleanup refs where FK is RESTRICT to avoid constraint failures.
                DB.prepare("DELETE FROM user_invitations WHERE invited_by = ? OR email = ?").run(
                    userId,
                    user.email
                );
                DB.prepare(
                    "DELETE FROM device_share_invitations WHERE invited_by = ? OR email = ?"
                ).run(userId, user.email);
                DB.prepare("DELETE FROM device_shares WHERE user_id = ? OR shared_by = ?").run(
                    userId,
                    userId
                );
                DB.prepare("DELETE FROM users WHERE id = ?").run(userId);
            })();

            return res.send({ ok: true });
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Error deleting user" });
        }
    }

    static invite(req: any, res: any) {
        try {
            const { email, role } = req.body as { email?: string; role?: Role };
            const normalizedEmail = normalizeEmail(email || "");
            if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
                return res.status(400).send({ error: "Invalid email" });
            }

            const selectedRole: Role =
                role && Object.values(ROLES).includes(role) ? role : ROLES.USER;
            const temporaryPassword = generateTemporaryPassword();
            const passwordHash = bcrypt.hashSync(temporaryPassword, 10);
            const invitedBy = Number((req.user as any).id);
            const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

            DB.transaction(() => {
                const existing = DB.prepare("SELECT id FROM users WHERE email = ?").get(
                    normalizedEmail
                ) as { id: number } | undefined;
                if (existing) {
                    DB.prepare(
                        "UPDATE users SET password_hash = ?, role = ?, must_change_password = 1 WHERE id = ?"
                    ).run(passwordHash, selectedRole, existing.id);
                } else {
                    DB.prepare(
                        "INSERT INTO users (email, password_hash, role, must_change_password) VALUES (?, ?, ?, 1)"
                    ).run(normalizedEmail, passwordHash, selectedRole);
                }

                DB.prepare(`
                    INSERT INTO user_invitations (email, role, otp_hash, invited_by, expires_at, accepted_at)
                    VALUES (?, ?, ?, ?, ?, NULL)
                    ON CONFLICT(email) DO UPDATE SET
                        role = excluded.role,
                        otp_hash = excluded.otp_hash,
                        invited_by = excluded.invited_by,
                        expires_at = excluded.expires_at,
                        accepted_at = NULL,
                        created_at = CURRENT_TIMESTAMP
                `).run(normalizedEmail, selectedRole, passwordHash, invitedBy, expiresAt);
            })();

            return res.status(201).send({
                ok: true,
                email: normalizedEmail,
                role: selectedRole,
                temporaryPassword,
                expiresAt,
            });
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to invite user" });
        }
    }

    static listInvitations(req: any, res: any) {
        try {
            const rows = DB.prepare(`
                SELECT
                    ui.id,
                    ui.email,
                    ui.role,
                    ui.expires_at,
                    ui.accepted_at,
                    ui.created_at,
                    u.email AS invited_by_email
                FROM user_invitations ui
                LEFT JOIN users u ON ui.invited_by = u.id
                WHERE ui.accepted_at IS NULL
                ORDER BY ui.created_at DESC
            `).all();
            return res.send(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to list invitations" });
        }
    }

    static revokeInvitation(req: any, res: any) {
        try {
            const invitationId = Number(req.params.id);
            if (!invitationId) {
                return res.status(400).send({ error: "Invalid invitation id" });
            }

            const invitation = DB.prepare(
                "SELECT id, accepted_at FROM user_invitations WHERE id = ?"
            ).get(invitationId) as { id: number; accepted_at: string | null } | undefined;

            if (!invitation) {
                return res.status(404).send({ error: "Invitation not found" });
            }
            if (invitation.accepted_at) {
                return res.status(409).send({ error: "Invitation already accepted" });
            }

            DB.prepare("DELETE FROM user_invitations WHERE id = ?").run(invitationId);
            return res.send({ ok: true });
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to revoke invitation" });
        }
    }

    static listMqttPublishAcl(req: any, res: any) {
        try {
            const userId = Number(req.params.id);
            if (!userId) {
                return res.status(400).send({ error: "Invalid user id" });
            }
            const rows = DB.prepare(`
                SELECT id, user_id, topic_pattern, permission, priority, created_at
                FROM mqtt_publish_acl_rules
                WHERE user_id = ?
                ORDER BY priority ASC, id ASC
            `).all(userId);
            return res.send(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to list MQTT publish ACL" });
        }
    }

    static upsertMqttPublishAcl(req: any, res: any) {
        try {
            const userId = Number(req.params.id);
            const { id, topicPattern, permission, priority } = req.body as {
                id?: number;
                topicPattern?: string;
                permission?: "allow" | "deny";
                priority?: number;
            };
            if (!userId) {
                return res.status(400).send({ error: "Invalid user id" });
            }
            const normalizedPattern = String(topicPattern || "").trim();
            if (!normalizedPattern) {
                return res.status(400).send({ error: "topicPattern is required" });
            }
            const normalizedPermission = permission === "deny" ? "deny" : "allow";
            const normalizedPriority = Number.isFinite(Number(priority)) ? Number(priority) : 100;

            if (id) {
                const result = DB.prepare(`
                    UPDATE mqtt_publish_acl_rules
                    SET topic_pattern = ?, permission = ?, priority = ?
                    WHERE id = ? AND user_id = ?
                `).run(normalizedPattern, normalizedPermission, normalizedPriority, id, userId);
                if (!result.changes) return res.status(404).send({ error: "ACL rule not found" });
                return res.send({ ok: true, id });
            }

            const result = DB.prepare(`
                INSERT INTO mqtt_publish_acl_rules (user_id, topic_pattern, permission, priority)
                VALUES (?, ?, ?, ?)
            `).run(userId, normalizedPattern, normalizedPermission, normalizedPriority);
            return res.status(201).send({ ok: true, id: Number(result.lastInsertRowid) });
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to save MQTT publish ACL" });
        }
    }

    static deleteMqttPublishAcl(req: any, res: any) {
        try {
            const userId = Number(req.params.id);
            const aclId = Number(req.params.aclId);
            if (!userId || !aclId) {
                return res.status(400).send({ error: "Invalid ids" });
            }
            const result = DB.prepare(
                "DELETE FROM mqtt_publish_acl_rules WHERE id = ? AND user_id = ?"
            ).run(aclId, userId);
            if (!result.changes) return res.status(404).send({ error: "ACL rule not found" });
            return res.send({ ok: true });
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to delete MQTT publish ACL" });
        }
    }
}
