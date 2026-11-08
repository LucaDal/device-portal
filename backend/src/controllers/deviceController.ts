import { db } from "../config/database";
import { findDevice, isDeviceOwner, canAccessDevice, listDevicesForUser, updateDevice, createDevice, claimDevice,
    deleteDevice, revokeDeviceOwnership, getProvisionedDevice, getDeviceWithType,
    getDeviceProperties, saveDeviceProperties } from "../repositories/deviceRepository";
import { findDeviceType } from "../repositories/deviceTypeRepository";
import { findUserByEmail, findUserInvitation } from "../repositories/userRepository";
import { listDeviceShares, listDeviceShareInvitations, shareDeviceWithUser, saveDeviceShareInvitation,
    deleteDeviceShare, deleteDeviceShareInvitation } from "../repositories/deviceShareRepository";
import { normalizeEmail, isValidEmail } from "../utils/email";
import crypto from "crypto";
import { ROLES } from "@shared/constants/auth";
import { DEVICE_NAME_MAX_LENGTH } from "@shared/types/device";
import {
    DevicePropertyMap,
    SavedProperties,
    castPropertyValue,
    parseSavedPropertyMap,
} from "@shared/types/properties";
import {
    decryptSensitiveDeviceProperties,
    encryptSensitiveDeviceProperties,
    parseTypePropertyDefinitions,
} from "../utils/devicePropertiesSecurity";
import { generateDeviceSecret, hashDeviceSecret } from "../utils/deviceSecrets";
import { syncGeneratedMqttAclRulesForDevice } from "../utils/deviceTypeMqtt";
import { getDeviceMqttState, parseMqttEnabled } from "../services/deviceMqttPolicy";
import {
    syncGeneratedMqttUserAclRulesForAllUsers,
    syncGeneratedMqttUserAclRulesForUser,
} from "../utils/mqttUserAcl";

const SHARE_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getCurrentUser(req: any) {
    const userId = Number((req.user as any).id);
    const role = String((req.user as any).role || "");
    return { userId, role };
}

function canManageSharesOrDelete(userId: number, role: string, deviceCode: string): boolean {
    if (role === ROLES.ADMIN) return true;
    return isDeviceOwner(userId, deviceCode);
}

function filterPropertiesByDefinitions(
    properties: SavedProperties,
    definitions: DevicePropertyMap
): SavedProperties {
    const filtered: SavedProperties = {};
    for (const key of Object.keys(definitions)) {
        if (properties[key]) {
            filtered[key] = properties[key];
        }
    }
    return filtered;
}

function mergePropertiesForSchema(
    currentProperties: SavedProperties,
    nextProperties: SavedProperties,
    schema: DevicePropertyMap,
    clearedKeys: Set<string>
): SavedProperties {
    const merged: SavedProperties = {};
    for (const key of Object.keys(schema)) {
        if (clearedKeys.has(key)) continue;
        if (nextProperties[key]) {
            merged[key] = nextProperties[key];
            continue;
        }
        if (currentProperties[key]) {
            merged[key] = currentProperties[key];
        }
    }
    return merged;
}

function normalizePropertiesForSchema(
    properties: SavedProperties,
    schema: DevicePropertyMap
): { ok: true; properties: SavedProperties; clearedKeys: Set<string> } | { ok: false; error: string } {
    const out: SavedProperties = {};
    const clearedKeys = new Set<string>();
    for (const [key, definition] of Object.entries(schema)) {
        const entry = properties[key];
        if (!entry || typeof entry !== "object") continue;
        const isBlank = typeof entry.value === "string" && entry.value.trim() === "";
        if (isBlank) {
            if (definition.notNull !== false) {
                return { ok: false, error: `Property "${key}" cannot be empty.` };
            }
            clearedKeys.add(key);
            continue;
        }
        const cast = castPropertyValue(definition.type, entry.value, key);
        if (!cast.ok) return cast;
        out[key] = {
            type: definition.type,
            value: cast.value,
        };
    }
    return { ok: true, properties: out, clearedKeys };
}

export const DeviceController = {

    // GET /devices
    list(req: any, res: any) {
        const { userId, role } = getCurrentUser(req);
        const rows = listDevicesForUser(userId, role).map((row) => ({
            ...row,
            mqtt_available: Boolean(row.mqtt_available),
            type_mqttTopics: row.mqtt_available ? row.type_mqttTopics : "[]",
        }));

        const sanitizedRows = rows.map((row) => {
            const definitions = parseTypePropertyDefinitions(row?.type_deviceProperties);
            const type_deviceProperties = JSON.stringify(definitions);
            if (!row?.device_properties) {
                return {
                    ...row,
                    type_deviceProperties,
                    type_genericProperties: "{}",
                };
            }
            try {
                const parsedProps = parseSavedPropertyMap(row.device_properties);
                const deviceProps = filterPropertiesByDefinitions(parsedProps, definitions);
                const decrypted = decryptSensitiveDeviceProperties(deviceProps);
                return {
                    ...row,
                    type_deviceProperties,
                    type_genericProperties: "{}",
                    device_properties: JSON.stringify(decrypted),
                };
            } catch (err) {
                console.error("Failed to decode device properties for list()", err);
                return {
                    ...row,
                    type_deviceProperties,
                    type_genericProperties: "{}",
                    device_properties: JSON.stringify({}),
                };
            }
        });

        res.json(sanitizedRows);
    },
    // PUT /devices/:code/mqtt — guarded by adminOnly in deviceRoutes.
    updateMqtt(req: any, res: any) {
        const code = String(req.params.code || "");
        const device = getDeviceMqttState(code);
        if (!device) return res.status(404).send({ error: "Device not found" });
        let enabled: boolean;
        try { enabled = parseMqttEnabled(req.body?.mqtt_enabled); }
        catch { return res.status(400).send({ error: "mqtt_enabled must be true or false" }); }
        if (enabled && !device.type_mqtt_enabled) {
            return res.status(409).send({ error: "Enable MQTT on the Device Type first" });
        }
        db.transaction(() => {
            updateDevice(code, { mqtt_enabled: enabled ? 1 : 0 });
            syncGeneratedMqttAclRulesForDevice(code);
            syncGeneratedMqttUserAclRulesForAllUsers();
        });
        const updated = getDeviceMqttState(code)!;
        return res.send({ ok: true, ...updated, mqtt_available: Boolean(updated.mqtt_available) });
    },

    // POST /devices/register
    register(req: any, res: any) {
        const userId = Number((req.user as any).id);
        const { code } = req.body || {};
        if (typeof code !== "string" || !code.trim()) {
            return res.status(400).json({ error: "Device code is required" });
        }
        const existing = findDevice(code.trim());
        if (!existing) return res.status(404).json({ error: "Device not found" });
        const claimed = db.transaction(() => {
            if (!claimDevice(existing.code, userId).changes) return false;
            syncGeneratedMqttAclRulesForDevice(existing.code);
            syncGeneratedMqttUserAclRulesForAllUsers();
            return true;
        });
        if (!claimed) return res.status(409).json({ error: "Device is already assigned" });
        res.json({ ok: true });
    },

    delete(req: any, res: any) {
        const { code } = req.params;
        const { userId, role } = getCurrentUser(req);
        if (!canManageSharesOrDelete(userId, role, code)) {
            return res.status(403).send({ error: "You are not allowed to delete this device" });
        }

        const info = deleteDevice(code);

        if (info.changes === 0) {
            return res.status(400).send({ message: "No device to delete found" });
        }
        syncGeneratedMqttUserAclRulesForAllUsers();
        res.send({ ok: true });
    },

    // POST /manage/devices/revoke-ownership
    revokeOwnership(req: any, res: any) {
        const deviceCode = String(req.body?.deviceCode || "").trim();
        const ownerEmail = normalizeEmail(String(req.body?.ownerEmail || ""));

        if (!deviceCode || !ownerEmail) {
            return res.status(400).send({ error: "deviceCode and ownerEmail are required" });
        }

        const owner = findUserByEmail(ownerEmail);
        if (!owner) {
            return res.status(404).send({ error: "Owner user not found" });
        }

        const device = findDevice(deviceCode);
        if (!device) {
            return res.status(404).send({ error: "Device not found" });
        }
        if (!device.owner_id) {
            return res.status(409).send({ error: "Device is already unassigned" });
        }
        if (Number(device.owner_id) !== Number(owner.id)) {
            return res.status(409).send({ error: "Device owner does not match ownerEmail" });
        }

        revokeDeviceOwnership(deviceCode);
        syncGeneratedMqttAclRulesForDevice(deviceCode);
        syncGeneratedMqttUserAclRulesForAllUsers();

        return res.send({ ok: true, deviceCode, ownerEmail });
    },


    // POST /devices
    create(req: any, res: any) {
        const body = req.body || {};
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name || name.length > DEVICE_NAME_MAX_LENGTH) {
            return res.status(400).json({ error: `Device name must contain 1–${DEVICE_NAME_MAX_LENGTH} characters` });
        }
        if (typeof body.device_type_id !== "string" || !body.device_type_id.trim()) {
            return res.status(400).json({ error: "Device type is required" });
        }
        if (body.owner_email !== undefined && typeof body.owner_email !== "string") {
            return res.status(400).json({ error: "Owner email must be a string" });
        }
        const ownerEmail = normalizeEmail(body.owner_email);
        if (ownerEmail && !isValidEmail(ownerEmail)) return res.status(400).json({ error: "Invalid owner email" });
        const owner = ownerEmail ? findUserByEmail(ownerEmail) : undefined;
        if (ownerEmail && !owner) return res.status(400).json({ error: "Owner email not found" });
        if (body.clone_from_code !== undefined) {
            return res.status(400).json({ error: "Clone a Device Type instead of a device" });
        }
        const deviceTypeId = body.device_type_id.trim();
        const deviceType = findDeviceType(deviceTypeId);
        if (!deviceType) return res.status(400).json({ error: "Device type not found" });
        const code = crypto.randomUUID();
        const secret = generateDeviceSecret();
        res.setHeader("Cache-Control", "no-store");
        try {
            const created = db.transaction(() => {
                createDevice({ code, name, device_type_id: deviceTypeId, owner_id: owner?.id ?? null,
                    activated: owner ? 1 : 0, device_secret_hash: hashDeviceSecret(secret) });
                syncGeneratedMqttAclRulesForDevice(code);
                syncGeneratedMqttUserAclRulesForAllUsers();
                return getProvisionedDevice(code)!;
            });
            return res.status(201).json({ ...created, secret_code: secret });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Failed to create device" });
        }
    },
    // PUT /devices/:code/properties
    updateProperties(req: any, res: any) {
        const { code } = req.params;
        const { userId } = getCurrentUser(req);
        const { properties } = req.body; // può essere stringa o oggetto

        if (!properties) {
            return res.status(400).json({ error: "properties is required" });
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

        const device = findDevice(code);

        if (!device) {
            return res.status(400).json({ error: "Device not found" });
        }
        if (!isDeviceOwner(userId, code)) {
            return res.status(403).json({ error: "Only the device owner can update device properties" });
        }

        const deviceTypeRow = getDeviceWithType(code);
        if (!deviceTypeRow) {
            return res.status(400).json({ error: "Device type not found" });
        }
        const schema = parseTypePropertyDefinitions(deviceTypeRow.device_properties_schema);

        const existingProps = getDeviceProperties(code);

        let propertiesJson = "{}";
        try {
            const currentProps = parseSavedPropertyMap(existingProps?.properties);
            const normalizedProps = normalizePropertiesForSchema(parsedProperties, schema);
            if (!normalizedProps.ok) {
                return res.status(400).json({ error: normalizedProps.error });
            }
            const encryptedProps = encryptSensitiveDeviceProperties(normalizedProps.properties, schema);
            const mergedProps = mergePropertiesForSchema(
                currentProps,
                encryptedProps,
                schema,
                normalizedProps.clearedKeys
            );
            propertiesJson = JSON.stringify(mergedProps);
        } catch (err: any) {
            return res.status(500).json({
                error: err?.message || "Failed to encrypt sensitive device properties",
            });
        }

        saveDeviceProperties(code, propertiesJson);

        res.json({ ok: true });
    },

    // GET /devices/:code/shares
    listShares(req: any, res: any) {
        const { code } = req.params;
        const { userId, role } = getCurrentUser(req);

        const canView = canAccessDevice(userId, role, code);
        if (!canView) {
            return res.status(403).send({ error: "You are not allowed to view shares for this device" });
        }

        const shares = listDeviceShares(code);
        const invitations = listDeviceShareInvitations(code);

        return res.send({ shares, invitations });
    },

    // POST /devices/:code/shares
    createShare(req: any, res: any) {
        try {
            const { code } = req.params;
            const { userId, role } = getCurrentUser(req);
            if (!canManageSharesOrDelete(userId, role, code)) {
                return res.status(403).send({ error: "Only device owner or admin can share this device" });
            }

            const { email } = req.body as { email?: string };
            const normalizedEmail = normalizeEmail(email || "");
            if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
                return res.status(400).send({ error: "Invalid email" });
            }

            const device = findDevice(code);
            if (!device) {
                return res.status(404).send({ error: "Device not found" });
            }

            const targetUser = findUserByEmail(normalizedEmail);
            if (targetUser && targetUser.id === device.owner_id) {
                return res.status(409).send({ error: "Cannot share with the owner of the device" });
            }

            if (!targetUser) {
                const adminInvitation = findUserInvitation(normalizedEmail);

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

            if (targetUser) {
                shareDeviceWithUser(code, targetUser.id, normalizedEmail, userId);
                syncGeneratedMqttUserAclRulesForUser(targetUser.id);

                return res.status(201).send({
                    ok: true,
                    mode: "shared",
                    deviceCode: code,
                    userId: targetUser.id,
                    email: targetUser.email,
                });
            }

            const token = crypto.randomBytes(24).toString("hex");
            const expiresAt = new Date(Date.now() + SHARE_INVITE_TTL_MS).toISOString();
            saveDeviceShareInvitation(code, normalizedEmail, token, userId, expiresAt);

            return res.status(201).send({
                ok: true,
                mode: "invited",
                deviceCode: code,
                email: normalizedEmail,
                expiresAt,
            });
        } catch (err) {
            console.error("Device share error", err);
            return res.status(500).send({ error: "Failed to share device" });
        }
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

        const info = deleteDeviceShare(code, targetUserId);
        if (info.changes === 0) {
            return res.status(404).send({ error: "Share not found" });
        }
        syncGeneratedMqttUserAclRulesForUser(targetUserId);
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

        const info = deleteDeviceShareInvitation(invitationId, code);
        if (info.changes === 0) {
            return res.status(404).send({ error: "Pending invitation not found" });
        }
        return res.send({ ok: true });
    },
};
