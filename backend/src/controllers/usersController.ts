import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "../config/database";
import { findUserById, listUsers, updateUserRole, countOwnedDevices, deleteUser, inviteUser,
    listUserInvitations, getUserInvitation, deleteUserInvitation } from "../repositories/userRepository";
import { listUserAclRulesForAdmin } from "../repositories/mqttAclRepository";
import { normalizeEmail, isValidEmail } from "../utils/email";
import { ROLES, Role } from "@shared/constants/auth";
import { syncGeneratedMqttUserAclRulesForAllUsers, syncGeneratedMqttUserAclRulesForUser } from "../utils/mqttUserAcl";

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

function generateTemporaryPassword(): string {
    return crypto.randomBytes(9).toString("base64url");
}

export class UsersController {
    static list(req: any, res: any) {
        try {
            const rows = listUsers();
            res.send(rows);
        } catch (err) {
            console.info(err);
            return res.status(400).send("Error listing users: " + err);
        }
    }

    static update(req: any, res: any) {
        try {
            const userId = Number(req.params.id);
            const { role } = req.body as {
                role?: Role;
            };

            if (!userId) {
                return res.status(400).send({ error: "Invalid user id" });
            }

            if (typeof role !== "undefined") {
                if (!Object.values(ROLES).includes(role)) {
                    return res.status(400).send({ error: "Invalid role" });
                }
                updateUserRole(userId, role);
            }

            syncGeneratedMqttUserAclRulesForUser(userId);

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

            const user = findUserById(userId);
            if (!user) {
                return res.status(404).send({ error: "User not found" });
            }

            const ownedDevices = countOwnedDevices(userId);

            if (ownedDevices > 0) {
                return res.status(409).send({
                    error:
                        "Cannot delete user: user owns devices. Reassign or delete those devices first.",
                    ownedDevices: ownedDevices,
                });
            }

            db.transaction(() => {
                deleteUser(userId, user.email);
                syncGeneratedMqttUserAclRulesForAllUsers();
            });

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

            db.transaction(() => {
                const invited = inviteUser(normalizedEmail, selectedRole, passwordHash, invitedBy, expiresAt);
                syncGeneratedMqttUserAclRulesForUser(invited.id);
            });

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
            const rows = listUserInvitations();
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

            const invitation = getUserInvitation(invitationId);

            if (!invitation) {
                return res.status(404).send({ error: "Invitation not found" });
            }
            if (invitation.accepted_at) {
                return res.status(409).send({ error: "Invitation already accepted" });
            }

            deleteUserInvitation(invitationId);
            return res.send({ ok: true });
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to revoke invitation" });
        }
    }

    static listMqttUserAcl(req: any, res: any) {
        try {
            const userId = Number(req.params.id);
            if (!userId) {
                return res.status(400).send({ error: "Invalid user id" });
            }
            const rows = listUserAclRulesForAdmin(userId);
            return res.send(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).send({ error: "Failed to list MQTT user ACL" });
        }
    }
}
