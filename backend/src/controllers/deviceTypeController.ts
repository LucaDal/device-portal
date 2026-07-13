import { DB } from "../config/database";
import { parseDevicePropertyMap, parseSavedPropertyMap } from "@shared/types/properties";
import {
    parseDeviceTypeDashboardWidgets,
    parseDeviceTypeMqttTopics,
} from "@shared/types/device_type_mqtt";
import {
    normalizeAllDeviceTypeMqttTopicLinks,
    normalizeDeviceTypeMqttTopics,
    syncGeneratedMqttAclRulesForAllDevices,
} from "../utils/deviceTypeMqtt";
import { syncGeneratedMqttUserAclRulesForAllUsers } from "../utils/mqttUserAcl";
import { validateMqttTopicTemplate } from "../utils/mqttTopicTemplate";

export const DeviceTypeController = {
    list(req: any, res: any) {
        const rows = DB.prepare(
            `SELECT id,
                description,
                firmware_version,
                created_at,
                deviceProperties,
                genericProperties,
                mqttTopics,
                dashboardWidgets
             FROM device_types`
        ).all();
        res.send(rows);
    },

    create(req: any, res: any) {
        if (req.file && req.file.size > 10 * 1024 * 1024) {
            return res.status(400).send({ error: "File too large (max 10MB)" });
        }

        const { id, description, firmware_version } = req.body;
        const firmware_build = req.file?.buffer ?? Buffer.alloc(0);
        const normalizedFirmwareVersion = req.file
            ? String(firmware_version || "").trim()
            : "0.0.0";

        if (!id) {
            return res.status(400).send({ error: "Missing fields" });
        }

        if (req.file && !normalizedFirmwareVersion) {
            return res.status(400).send({ error: "Firmware version is required when uploading a file" });
        }

        const stmt = DB.prepare(`
            INSERT INTO device_types (
                id,
                firmware_version,
                firmware_build,
                description,
                deviceProperties,
                genericProperties,
                mqttTopics,
                dashboardWidgets
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(id, normalizedFirmwareVersion, firmware_build, description, "{}", "{}", "[]", "[]");

        const created = DB.prepare(
            `SELECT id,
                description,
                firmware_version,
                created_at,
                deviceProperties,
                genericProperties,
                mqttTopics,
                dashboardWidgets
             FROM device_types
             WHERE id = ?`
        ).get(id);

        res.send(created);
    },

    // PUT /device-types/:id
    update(req: any, res: any) {
        const { id } = req.params;

        const MAX_SIZE = 10 * 1024 * 1024;
        if (req.file && req.file.size > MAX_SIZE) {
            return res
                .status(400)
                .json({ error: "File too large (max 10MB)" });
        }

        const { description, firmware_version } = req.body;
        const firmware_build = req.file?.buffer ?? null;
        const devicePropertiesInput = req.body.deviceProperties;
        const genericPropertiesInput = req.body.genericProperties;
        const mqttTopicsInput = req.body.mqttTopics;
        const dashboardWidgetsInput = req.body.dashboardWidgets;

        if (!firmware_version?.trim()) {
            return res
                .status(400)
                .json({ error: "Missing required fields" });
        }

        const existing = DB.prepare(
            "SELECT id, deviceProperties, genericProperties, mqttTopics, dashboardWidgets FROM device_types WHERE id = ?"
        ).get(id) as
            | {
                id: string;
                deviceProperties?: string | null;
                genericProperties?: string | null;
                mqttTopics?: string | null;
                dashboardWidgets?: string | null;
            }
            | undefined;

        if (!existing) {
            return res
                .status(400)
                .json({ error: "Device type not found" });
        }

        let deviceProperties = existing.deviceProperties || "{}";
        if (typeof devicePropertiesInput !== "undefined") {
            try {
                const parsed = typeof devicePropertiesInput === "string"
                    ? JSON.parse(devicePropertiesInput)
                    : devicePropertiesInput;
                deviceProperties = JSON.stringify(parseDevicePropertyMap(parsed));
            } catch {
                return res
                    .status(400)
                    .json({ error: "deviceProperties is not a valid JSON" });
            }
        }

        let genericProperties = existing.genericProperties || "{}";
        if (typeof genericPropertiesInput !== "undefined") {
            try {
                const parsed = typeof genericPropertiesInput === "string"
                    ? JSON.parse(genericPropertiesInput)
                    : genericPropertiesInput;
                genericProperties = JSON.stringify(parseSavedPropertyMap(parsed));
            } catch {
                return res
                    .status(400)
                    .json({ error: "genericProperties is not a valid JSON" });
            }
        }

        let mqttTopics = existing.mqttTopics || "[]";
        if (typeof mqttTopicsInput !== "undefined") {
            try {
                const parsed = typeof mqttTopicsInput === "string"
                    ? JSON.parse(mqttTopicsInput)
                    : mqttTopicsInput;
                const normalizedTopics = normalizeDeviceTypeMqttTopics(parseDeviceTypeMqttTopics(parsed));
                for (const topic of normalizedTopics) {
                    if (topic.linkedTopic) continue;
                    const validationError = validateMqttTopicTemplate(topic.topic || "");
                    if (validationError) {
                        return res.status(400).json({
                            error: `${validationError} Topic "${topic.key}" is not scoped.`,
                        });
                    }
                }
                mqttTopics = JSON.stringify(normalizedTopics);
            } catch {
                return res
                    .status(400)
                    .json({ error: "mqttTopics is not a valid JSON" });
            }
        }

        let dashboardWidgets = existing.dashboardWidgets || "[]";
        if (typeof dashboardWidgetsInput !== "undefined") {
            try {
                const parsed = typeof dashboardWidgetsInput === "string"
                    ? JSON.parse(dashboardWidgetsInput)
                    : dashboardWidgetsInput;
                dashboardWidgets = JSON.stringify(parseDeviceTypeDashboardWidgets(parsed));
            } catch {
                return res
                    .status(400)
                    .json({ error: "dashboardWidgets is not a valid JSON" });
            }
        }

        const setClauses: string[] = [
            "description = ?",
            "firmware_version = ?",
            "deviceProperties = ?",
            "genericProperties = ?",
            "mqttTopics = ?",
            "dashboardWidgets = ?",
        ];
        const params: any[] = [
            description,
            firmware_version,
            deviceProperties,
            genericProperties,
            mqttTopics,
            dashboardWidgets,
        ];

        if (firmware_build) {
            setClauses.push("firmware_build = ?");
            params.push(firmware_build);
        }

        params.push(id);

        const stmt = DB.prepare(
            `UPDATE device_types
                SET ${setClauses.join(", ")}
                WHERE id = ?`
        );

        stmt.run(...params);
        normalizeAllDeviceTypeMqttTopicLinks();
        syncGeneratedMqttAclRulesForAllDevices();
        syncGeneratedMqttUserAclRulesForAllUsers();

        const updated = DB.prepare(
            `SELECT id,
                description,
                firmware_version,
                deviceProperties,
                genericProperties,
                mqttTopics,
                dashboardWidgets,
                created_at
                FROM device_types
                WHERE id = ?`
        ).get(id);

        return res.json(updated);
    },

    // DELETE /device-types/:id
    delete(req: any, res: any) {
        const { id } = req.params;

        const linked = DB.prepare(
            "SELECT COUNT(*) AS count FROM devices WHERE device_type_id = ?"
        ).get(id) as { count: number };

        if (linked && linked.count > 0) {
            return res.status(400).json({
                error: "Cannot delete: there are devices linked to this device type",
                devices_using_type: linked.count,
            });
        }

        const stmt = DB.prepare("DELETE FROM device_types WHERE id = ?");
        const info = stmt.run(id);

        if (info.changes === 0) {
            return res.status(400).send({ error: "Device type not found" });
        }

        res.send({ success: true });
    },
};
