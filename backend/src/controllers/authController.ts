import { DB } from "../config/database";
import bcrypt from "bcrypt";
import { generateToken } from "../utils/jwt";
import { UserWithPassword } from "@shared/types/user";
import { UsersController } from "./usersController";
import { ROLES, Role } from "@shared/constants/auth";

export const AuthController = {

    signup: async (req: any, res: any) => {
        const { email, password, role } = req.body;
        try {
            const selectedRole: Role = Object.values(ROLES).includes(role) ? role : ROLES.USER;
            const row_id = UsersController.createUser(email, password, selectedRole);
            res.send({ id: row_id });
        } catch (err: any) {
            if (err.message === "EMAIL_EXISTS") {
                return res.status(400).send({ error: "Email already exists" });
            }
            res.status(500).send({ error: "Server error" });
        }
    },

    login: async (req: any, res: any) => {
        const { email, password } = req.body;
        const normalizedEmail = String(email).trim().toLowerCase();
        const row = DB.prepare("SELECT * FROM users WHERE email = ?").get(
            normalizedEmail
        ) as UserWithPassword | undefined;

        if (!row) return res.status(401).send({ error: "Invalid" });

        const ok = await bcrypt.compare(password, row.password_hash);
        if (!ok) return res.status(401).send({ error: "invalid" });

        if (row.must_change_password) {
            const pendingInvitation = DB.prepare(`
                SELECT id FROM user_invitations
                WHERE email = ?
                  AND accepted_at IS NULL
                  AND datetime(expires_at) > datetime('now')
                LIMIT 1
            `).get(normalizedEmail);

            if (!pendingInvitation) {
                return res.status(403).send({
                    error: "Invitation is no longer valid. Ask an admin to invite you again.",
                });
            }
        }

        DB.transaction(() => {
            const pendingDeviceInvitations = DB.prepare(`
                SELECT id, device_code, can_write
                FROM device_share_invitations
                WHERE email = ?
                  AND accepted_at IS NULL
                  AND datetime(expires_at) > datetime('now')
            `).all(normalizedEmail) as Array<{
                id: number;
                device_code: string;
                can_write: number;
            }>;

            for (const invite of pendingDeviceInvitations) {
                DB.prepare(`
                    INSERT INTO device_shares (device_code, user_id, can_write, shared_by)
                    SELECT ?, ?, ?, invited_by
                    FROM device_share_invitations
                    WHERE id = ?
                    ON CONFLICT(device_code, user_id) DO UPDATE SET
                        can_write = excluded.can_write,
                        shared_by = excluded.shared_by,
                        created_at = CURRENT_TIMESTAMP
                `).run(invite.device_code, row.id, invite.can_write ? 1 : 0, invite.id);
            }

            DB.prepare(`
                UPDATE device_share_invitations
                SET accepted_at = CURRENT_TIMESTAMP
                WHERE email = ?
                  AND accepted_at IS NULL
                  AND datetime(expires_at) > datetime('now')
            `).run(normalizedEmail);
        })();

        const publicUser = {
            id: row.id,
            email: row.email,
            role: row.role,
            must_change_password: row.must_change_password ?? 0,
            created_at: row.created_at,
        };

        res.send({ token: generateToken(row), user: publicUser });
    },

    changePassword: async (req: any, res: any) => {
        try {
            const userId = Number((req.user as any)?.id);
            const { currentPassword, newPassword } = req.body as {
                currentPassword?: string;
                newPassword?: string;
            };

            if (!userId || !currentPassword || !newPassword) {
                return res.status(400).send({ error: "Missing password fields" });
            }

            if (newPassword.length < 10) {
                return res.status(400).send({
                    error: "New password must be at least 10 characters long",
                });
            }

            const row = DB.prepare(
                "SELECT id, email, password_hash FROM users WHERE id = ?"
            ).get(userId) as UserWithPassword | undefined;
            if (!row) {
                return res.status(404).send({ error: "User not found" });
            }

            const ok = await bcrypt.compare(currentPassword, row.password_hash);
            if (!ok) {
                return res.status(401).send({ error: "Current password invalid" });
            }

            const nextHash = await bcrypt.hash(newPassword, 12);
            DB.prepare(
                "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?"
            ).run(nextHash, userId);
            DB.prepare(
                "UPDATE user_invitations SET accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP) WHERE email = ?"
            ).run(row.email);

            return res.send({ ok: true });
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to change password" });
        }
    },
};
