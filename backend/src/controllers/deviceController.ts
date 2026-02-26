import { DB } from "../config/database";
import crypto from "crypto";
import { ROLES } from "@shared/constants/auth";
import { SavedProperties } from "@shared/types/properties";
import {
    decryptSensitiveDeviceProperties,
    encryptSensitiveDeviceProperties,
    parseTypePropertyDefinitions,
} from "../utils/devicePropertiesSecurity";

const SHARE_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeEmail(value: string): string {
    return String(value || "").trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getCurrentUser(req: any) {
    const userId = Number((req.user as any).id);
    const role = String((req.user as any).role || "");
    return { userId, role };
}

function canManageSharesOrDelete(userId: number, role: string, deviceCode: string): boolean {
    if (role === ROLES.ADMIN) return true;
    const owned = DB.prepare("SELECT 1 FROM devices WHERE code = ? AND owner_id = ? LIMIT 1").get(
        deviceCode,
        userId
    );
    return Boolean(owned);
}

function isDeviceOwner(userId: number, deviceCode: string): boolean {
    const owned = DB.prepare("SELECT 1 FROM devices WHERE code = ? AND owner_id = ? LIMIT 1").get(
        deviceCode,
        userId
    );
    return Boolean(owned);
}

export const DeviceController = {

    // GET /devices
    list(req: any, res: any) {
        const { userId, role } = getCurrentUser(req);
        let sql = `
            SELECT
                d.code,
                d.device_type_id,
                d.owner_id,
                ou.email AS owner_email,
                d.activated,
                CASE WHEN ds.user_id IS NULL THEN 0 ELSE 1 END AS is_shared,
                CASE
                    WHEN d.owner_id = ? OR ? = '${ROLES.ADMIN}' THEN 1
                    ELSE COALESCE(ds.can_write, 0)
                END AS can_write,
                dt.description AS device_type_description,
                dt.firmware_version,
                dt.deviceProperties AS type_deviceProperties,
                dt.genericProperties AS type_genericProperties,
                CASE
                    WHEN d.owner_id = ? THEN dp.properties
                    ELSE NULL
                END AS device_properties
            FROM devices d
            JOIN device_types dt ON dt.id = d.device_type_id
            LEFT JOIN users ou ON ou.id = d.owner_id
            LEFT JOIN device_properties dp ON dp.device_code = d.code
            LEFT JOIN device_shares ds
                ON ds.device_code = d.code
               AND ds.user_id = ?
        `;

        const params: any[] = [userId, role, userId, userId];

        if (role !== ROLES.ADMIN) {
            sql += ` WHERE d.owner_id = ? OR ds.user_id IS NOT NULL`;
            params.push(userId);
        }

        sql += ` ORDER BY d.code ASC`;

        const stmt = DB.prepare(sql);
        const rows = stmt.all(...params) as Array<any>;

        const sanitizedRows = rows.map((row) => {
            if (!row?.device_properties) return row;
            try {
                const parsedProps = typeof row.device_properties === "string"
                    ? JSON.parse(row.device_properties)
                    : row.device_properties;
                const decrypted = decryptSensitiveDeviceProperties(parsedProps as SavedProperties);
                return {
                    ...row,
                    device_properties: JSON.stringify(decrypted),
                };
            } catch (err) {
                console.error("Failed to decode device properties for list()", err);
                return {
                    ...row,
                    device_properties: JSON.stringify({}),
                };
            }
        });

        res.json(sanitizedRows);
    },
    // POST /devices/register
    register(req: any, res: any) {
        const userId = Number((req.user as any).id);
        const { code } = req.body;

        const existing = DB.prepare(
            "SELECT * FROM devices WHERE code = ?"
        ).get(code);

        if (!existing) {
            return res.status(400).json({ message: "Device not found" });
        }

        const owned = DB.prepare("SELECT * FROM devices WHERE code = ? AND activated = 1").get(code);
        if (owned) {
            return res.status(400).json({ message: "Device already activated" });
        }
        DB.prepare(`UPDATE devices SET owner_id = ?, activated = 1 WHERE code = ?`).run(userId, code);
        res.json({ ok: true });
    },

    delete(req: any, res: any) {
        const { code } = req.params;
        const { userId, role } = getCurrentUser(req);
        if (!canManageSharesOrDelete(userId, role, code)) {
            return res.status(403).send({ error: "You are not allowed to delete this device" });
        }

        const stmt = DB.prepare("DELETE FROM devices WHERE code = ?");
        const info = stmt.run(code);

        if (info.changes === 0) {
            return res.status(400).send({ message: "No device to delete found" });
        }
        res.send({ ok: true });
    },

    // POST /manage/devices/revoke-ownership
    revokeOwnership(req: any, res: any) {
        const deviceCode = String(req.body?.deviceCode || "").trim();
        const ownerEmail = normalizeEmail(String(req.body?.ownerEmail || ""));

        if (!deviceCode || !ownerEmail) {
            return res.status(400).send({ error: "deviceCode and ownerEmail are required" });
        }

        const owner = DB.prepare("SELECT id FROM users WHERE email = ?").get(ownerEmail) as
            | { id: number }
            | undefined;
        if (!owner) {
            return res.status(404).send({ error: "Owner user not found" });
        }

        const device = DB.prepare("SELECT code, owner_id FROM devices WHERE code = ?").get(deviceCode) as
            | { code: string; owner_id: number | null }
            | undefined;
        if (!device) {
            return res.status(404).send({ error: "Device not found" });
        }
        if (!device.owner_id) {
            return res.status(409).send({ error: "Device is already unassigned" });
        }
        if (Number(device.owner_id) !== Number(owner.id)) {
            return res.status(409).send({ error: "Device owner does not match ownerEmail" });
        }

        DB.transaction(() => {
            DB.prepare("UPDATE devices SET owner_id = NULL, activated = 0 WHERE code = ?").run(deviceCode);
            DB.prepare("DELETE FROM device_shares WHERE device_code = ?").run(deviceCode);
            DB.prepare("DELETE FROM device_share_invitations WHERE device_code = ?").run(deviceCode);
        })();

        return res.send({ ok: true, deviceCode, ownerEmail });
    },


    // POST /devices
    create(req: any, res: any) {
        const { code, device_type_id, owner_id, owner_email, activated } = req.body;

        if (!code || !device_type_id) {
            return res
                .status(400)
                .json({ error: "code and device_type_id are required" });
        }

        const stmt = DB.prepare(`
INSERT INTO devices (code, device_type_id, owner_id, activated)
VALUES (?, ?, ?, ?)
`);

        try {
            let resolvedOwnerId: number | null = owner_id ? Number(owner_id) : null;
            const normalizedOwnerEmail = normalizeEmail(owner_email || "");
            if (normalizedOwnerEmail) {
                const ownerUser = DB.prepare("SELECT id FROM users WHERE email = ?").get(
                    normalizedOwnerEmail
                ) as { id: number } | undefined;
                if (!ownerUser) {
                    return res.status(400).json({ error: "Owner email not found" });
                }
                resolvedOwnerId = ownerUser.id;
            }

            stmt.run(
                code,
                device_type_id,
                resolvedOwnerId,
                activated ? 1 : 0
            );

            // riga iniziale per le properties del device
            DB.prepare(`
INSERT INTO device_properties (device_code, properties)
VALUES (?, ?)
`).run(code, "{}");

            const created = DB.prepare(`
SELECT d.code, d.device_type_id, d.owner_id, u.email AS owner_email, d.activated
FROM devices d
LEFT JOIN users u ON u.id = d.owner_id
WHERE d.code = ?
`).get(code);

            res.status(201).json(created);
        } catch (e: any) {
            if (e.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || e.code === "SQLITE_CONSTRAINT_UNIQUE") {
                return res.status(400).json({ error: "code already exists" });
            }
            console.error(e);
            res.status(500).json({ error: "Internal error" });
        }
    },
    // PUT /devices/:code/properties
    updateProperties(req: any, res: any) {
        const { code } = req.params;
        const { userId } = getCurrentUser(req);
        const { properties } = req.body; // può essere stringa o oggetto

        if (!properties) {
            return res.status(400).json({ error: "properties mancante" });
        }

        let parsedProperties: SavedProperties = {};
        try {
            const obj = typeof properties === "string" ? JSON.parse(properties) : properties;
            if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
                return res.status(400).json({ error: "properties is not a valid object" });
            }
            parsedProperties = obj as SavedProperties;
        } catch {
            return res
                .status(400)
                .json({ error: "properties is not valid JSON" });
        }

        const device = DB.prepare(
            "SELECT code FROM devices WHERE code = ?"
        ).get(code);

        if (!device) {
            return res.status(400).json({ error: "Device not found" });
        }
        if (!isDeviceOwner(userId, code)) {
            return res.status(403).json({ error: "Only the device owner can update device properties" });
        }

        const deviceTypeRow = DB.prepare(
            `SELECT dt.deviceProperties AS device_properties_schema
             FROM devices d
             JOIN device_types dt ON dt.id = d.device_type_id
             WHERE d.code = ?`
        ).get(code) as { device_properties_schema?: string | null } | undefined;
        if (!deviceTypeRow) {
            return res.status(400).json({ error: "Device type not found" });
        }
        const schema = parseTypePropertyDefinitions(deviceTypeRow.device_properties_schema);

        let propertiesJson = "{}";
        try {
            const encryptedProps = encryptSensitiveDeviceProperties(parsedProperties, schema);
            propertiesJson = JSON.stringify(encryptedProps);
        } catch (err: any) {
            return res.status(500).json({
                error: err?.message || "Failed to encrypt sensitive device properties",
            });
        }

        const existingProps = DB.prepare(
            "SELECT id FROM device_properties WHERE device_code = ?"
        ).get(code);

        if (existingProps) {
            DB.prepare(`UPDATE device_properties
                            SET properties = ?
                            WHERE device_code = ?
            `).run(propertiesJson, code);
        } else {
            DB.prepare(`
                INSERT INTO device_properties (device_code, properties)
                VALUES (?, ?)
            `).run(code, propertiesJson);
        }

        res.json({ ok: true });
    },

    // GET /devices/:code/shares
    listShares(req: any, res: any) {
        const { code } = req.params;
        const { userId, role } = getCurrentUser(req);

        const canView = role === ROLES.ADMIN || Boolean(
            DB.prepare(
                `SELECT 1 FROM devices d
                 LEFT JOIN device_shares ds ON ds.device_code = d.code AND ds.user_id = ?
                 WHERE d.code = ? AND (d.owner_id = ? OR ds.user_id IS NOT NULL)
                 LIMIT 1`
            ).get(userId, code, userId)
        );
        if (!canView) {
            return res.status(403).send({ error: "You are not allowed to view shares for this device" });
        }

        const shares = DB.prepare(`
            SELECT
                ds.device_code,
                ds.user_id,
                ds.can_write,
                ds.shared_by,
                ds.created_at,
                u.email AS user_email,
                sb.email AS shared_by_email
            FROM device_shares ds
            JOIN users u ON u.id = ds.user_id
            LEFT JOIN users sb ON sb.id = ds.shared_by
            WHERE ds.device_code = ?
            ORDER BY ds.created_at DESC
        `).all(code);

        const invitations = DB.prepare(`
            SELECT
                dsi.id,
                dsi.device_code,
                dsi.email,
                dsi.can_write,
                dsi.invited_by,
                dsi.expires_at,
                dsi.accepted_at,
                dsi.created_at,
                u.email AS invited_by_email
            FROM device_share_invitations dsi
            LEFT JOIN users u ON u.id = dsi.invited_by
            WHERE dsi.device_code = ?
              AND dsi.accepted_at IS NULL
              AND datetime(dsi.expires_at) > datetime('now')
            ORDER BY dsi.created_at DESC
        `).all(code);

        return res.send({ shares, invitations });
    },

    // POST /devices/:code/shares
    createShare(req: any, res: any) {
        const { code } = req.params;
        const { userId, role } = getCurrentUser(req);
        if (!canManageSharesOrDelete(userId, role, code)) {
            return res.status(403).send({ error: "Only device owner or admin can share this device" });
        }

        const { email, canWrite } = req.body as { email?: string; canWrite?: boolean };
        const normalizedEmail = normalizeEmail(email || "");
        if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
            return res.status(400).send({ error: "Invalid email" });
        }

        const device = DB.prepare("SELECT code, owner_id FROM devices WHERE code = ?").get(code) as
            | { code: string; owner_id: number | null }
            | undefined;
        if (!device) {
            return res.status(404).send({ error: "Device not found" });
        }

        const targetUser = DB.prepare("SELECT id, email FROM users WHERE email = ?").get(normalizedEmail) as
            | { id: number; email: string }
            | undefined;
        if (targetUser && targetUser.id === device.owner_id) {
            return res.status(409).send({ error: "Cannot share with the owner of the device" });
        }

        if (!targetUser) {
            const adminInvitation = DB.prepare(`
                SELECT id, accepted_at, expires_at
                FROM user_invitations
                WHERE email = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 1
            `).get(normalizedEmail) as
                | { id: number; accepted_at: string | null; expires_at: string }
                | undefined;

            if (!adminInvitation) {
                return res.status(403).send({
                    error: "User must be invited by admin before receiving device shares",
                });
            }

            if (!adminInvitation.accepted_at) {
                const expiresAt = new Date(adminInvitation.expires_at).getTime();
                if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
                    return res.status(403).send({
                        error: "Admin invitation expired. Ask admin to invite the user again.",
                    });
                }
            }
        }

        const canWriteInt = canWrite ? 1 : 0;
        if (targetUser) {
            DB.prepare(`
                INSERT INTO device_shares (device_code, user_id, can_write, shared_by)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(device_code, user_id) DO UPDATE SET
                    can_write = excluded.can_write,
                    shared_by = excluded.shared_by,
                    created_at = CURRENT_TIMESTAMP
            `).run(code, targetUser.id, canWriteInt, userId);
            DB.prepare(`
                UPDATE device_share_invitations
                SET accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP)
                WHERE device_code = ? AND email = ? AND accepted_at IS NULL
            `).run(code, normalizedEmail);

            return res.status(201).send({
                ok: true,
                mode: "shared",
                deviceCode: code,
                userId: targetUser.id,
                email: targetUser.email,
                canWrite: canWriteInt,
            });
        }

        const token = crypto.randomBytes(24).toString("hex");
        const expiresAt = new Date(Date.now() + SHARE_INVITE_TTL_MS).toISOString();
        const existingInvite = DB.prepare(`
            SELECT id
            FROM device_share_invitations
            WHERE device_code = ?
              AND email = ?
              AND accepted_at IS NULL
            ORDER BY id DESC
            LIMIT 1
        `).get(code, normalizedEmail) as { id: number } | undefined;

        if (existingInvite) {
            DB.prepare(`
                UPDATE device_share_invitations
                SET can_write = ?,
                    invitation_token = ?,
                    invited_by = ?,
                    expires_at = ?,
                    created_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(canWriteInt, token, userId, expiresAt, existingInvite.id);
        } else {
            DB.prepare(`
                INSERT INTO device_share_invitations (
                    device_code, email, can_write, invitation_token, invited_by, expires_at, accepted_at
                )
                VALUES (?, ?, ?, ?, ?, ?, NULL)
            `).run(code, normalizedEmail, canWriteInt, token, userId, expiresAt);
        }

        return res.status(201).send({
            ok: true,
            mode: "invited",
            deviceCode: code,
            email: normalizedEmail,
            canWrite: canWriteInt,
            expiresAt,
        });
    },

    // DELETE /devices/:code/shares/user/:userId
    removeShare(req: any, res: any) {
        const { code, userId: targetUserIdRaw } = req.params;
        const targetUserId = Number(targetUserIdRaw);
        const { userId, role } = getCurrentUser(req);
        if (!targetUserId) {
            return res.status(400).send({ error: "Invalid user id" });
        }
        if (!canManageSharesOrDelete(userId, role, code)) {
            return res.status(403).send({ error: "Only device owner or admin can revoke sharing" });
        }

        const info = DB.prepare(
            "DELETE FROM device_shares WHERE device_code = ? AND user_id = ?"
        ).run(code, targetUserId);
        if (info.changes === 0) {
            return res.status(404).send({ error: "Share not found" });
        }
        return res.send({ ok: true });
    },

    // DELETE /devices/:code/shares/invitations/:id
    revokeShareInvitation(req: any, res: any) {
        const { code, id } = req.params;
        const invitationId = Number(id);
        const { userId, role } = getCurrentUser(req);
        if (!invitationId) {
            return res.status(400).send({ error: "Invalid invitation id" });
        }
        if (!canManageSharesOrDelete(userId, role, code)) {
            return res.status(403).send({ error: "Only device owner or admin can revoke invitation" });
        }

        const info = DB.prepare(
            "DELETE FROM device_share_invitations WHERE id = ? AND device_code = ? AND accepted_at IS NULL"
        ).run(invitationId, code);
        if (info.changes === 0) {
            return res.status(404).send({ error: "Pending invitation not found" });
        }
        return res.send({ ok: true });
    },
};
