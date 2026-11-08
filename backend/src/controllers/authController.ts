import { findUserByEmail, findUserById, getUserSession, hasValidUserInvitation, changeUserPassword } from "../repositories/userRepository";
import { acceptDeviceShareInvitations } from "../repositories/deviceShareRepository";
import { normalizeEmail } from "../utils/email";
import bcrypt from "bcrypt";
import { generateToken } from "../utils/jwt";
import { UserWithPassword } from "@shared/types/user";
import { clearAuthCookie, setAuthCookie } from "../utils/authCookie";
import { syncGeneratedMqttUserAclRulesForUser } from "../utils/mqttUserAcl";

function toPublicUser(row: Pick<UserWithPassword, "id" | "email" | "role" | "must_change_password" | "created_at">) {
    return {
        id: row.id,
        email: row.email,
        role: row.role,
        must_change_password: row.must_change_password ?? 0,
        created_at: row.created_at,
    };
}

export const AuthController = {

    login: async (req: any, res: any) => {
        const { email, password } = req.body || {};
        if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
            return res.status(400).send({ error: "Email and password are required" });
        }
        const normalizedEmail = normalizeEmail(email);
        const row = findUserByEmail(normalizedEmail);

        if (!row?.password_hash) return res.status(401).send({ error: "Invalid" });

        const ok = await bcrypt.compare(password, row.password_hash);
        if (!ok) return res.status(401).send({ error: "invalid" });

        if (row.must_change_password) {
            const pendingInvitation = hasValidUserInvitation(normalizedEmail);

            if (!pendingInvitation) {
                return res.status(403).send({
                    error: "Invitation is no longer valid. Ask an admin to invite you again.",
                });
            }
        }

        acceptDeviceShareInvitations(normalizedEmail, row.id);
        syncGeneratedMqttUserAclRulesForUser(row.id);

        setAuthCookie(req, res, generateToken(row));
        res.send({ user: toPublicUser(row) });
    },

    changePassword: async (req: any, res: any) => {
        try {
            const userId = Number((req.user as any)?.id);
            const { currentPassword, newPassword } = req.body as {
                currentPassword?: string;
                newPassword?: string;
            };

            if (!userId || typeof currentPassword !== "string" || typeof newPassword !== "string" || !currentPassword || !newPassword) {
                return res.status(400).send({ error: "Missing password fields" });
            }

            if (newPassword.length < 10) {
                return res.status(400).send({
                    error: "New password must be at least 10 characters long",
                });
            }

            const row = findUserById(userId);
            if (!row) {
                return res.status(404).send({ error: "User not found" });
            }

            const ok = await bcrypt.compare(currentPassword, row.password_hash);
            if (!ok) {
                return res.status(401).send({ error: "Current password invalid" });
            }

            const nextHash = await bcrypt.hash(newPassword, 12);
            changeUserPassword(userId, row.email, nextHash);

            setAuthCookie(req, res, generateToken({ ...row, session_version: (row.session_version ?? 0) + 1 }));
            return res.send({ ok: true });
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to change password" });
        }
    },

    me: async (req: any, res: any) => {
        const userId = Number((req.user as any)?.id);
        if (!userId) {
            return res.status(401).send({ error: "Missing token" });
        }

        const row = getUserSession(userId);

        if (!row) {
            return res.status(401).send({ error: "Invalid token user" });
        }

        return res.send({ user: toPublicUser(row) });
    },

    logout: async (req: any, res: any) => {
        clearAuthCookie(req, res);
        return res.send({ ok: true });
    },
};
