import { db } from "../config/database";
import { listDeviceTypes, findDeviceType, insertDeviceType, updateDeviceType, deleteDeviceType, getFirmware } from "../repositories/deviceTypeRepository";
import { loadDeviceTypeWidgets, replaceDeviceTypeWidgets } from "../repositories/deviceTypeWidgetRepository";
import { DeviceDashboardWidget, parseDeviceDashboardWidgets } from "@shared/widgets";
import { getDeviceTypeMqttTopics, parseDeviceTypeMqttTopics, withDefaultDeviceTypeMqttTopics } from "@shared/types/device_type_mqtt";
import { countDevicesByType } from "../repositories/deviceRepository";
import { parseDevicePropertyMap, parseSavedPropertyMap } from "@shared/types/properties";
import {
    normalizeAllDeviceTypeMqttTopicLinks,
    syncGeneratedMqttAclRulesForAllDevices,
} from "../utils/deviceTypeMqtt";
import { syncGeneratedMqttUserAclRulesForAllUsers } from "../utils/mqttUserAcl";
import { normalizeMqttTopics } from "../services/deviceTypeMqttConfiguration";
import { parseMqttEnabled } from "../services/deviceMqttPolicy";

export const DeviceTypeController = {
    list(req: any, res: any) {
        const rows = listDeviceTypes();
        res.send(rows);
    },

    create(req: any, res: any) {
        if (req.file && req.file.size > 10 * 1024 * 1024) {
            return res.status(400).send({ error: "File too large (max 10MB)" });
        }

        const body = req.body || {};
        const id = typeof body.id === "string" ? body.id.trim() : "";
        if (!id) return res.status(400).send({ error: "Type ID is required" });
        if (findDeviceType(id)) return res.status(409).send({ error: "Device type already exists" });
        if (body.clone_from_type_id !== undefined && (typeof body.clone_from_type_id !== "string" || !body.clone_from_type_id.trim())) {
            return res.status(400).send({ error: "A valid source Device Type is required" });
        }
        const source = body.clone_from_type_id ? findDeviceType(body.clone_from_type_id.trim()) : undefined;
        if (body.clone_from_type_id && !source) return res.status(404).send({ error: "Source Device Type not found" });
        const firmware = source ? getFirmware(source.id) : undefined;
        const firmware_build = req.file?.buffer ?? firmware?.fb ?? Buffer.alloc(0);
        const firmware_version = req.file ? String(body.firmware_version || "").trim() : firmware?.fv ?? "0.0.0";
        if (!firmware_version) return res.status(400).send({ error: "Firmware version is required when uploading a file" });
        let mqttEnabled = Boolean(source?.mqtt_enabled);
        if (!source && body.mqtt_enabled !== undefined) {
            try { mqttEnabled = parseMqttEnabled(body.mqtt_enabled); }
            catch (error) { return res.status(400).send({ error: (error as Error).message }); }
        }
        let mqttTopics = mqttEnabled && !source ? JSON.stringify(withDefaultDeviceTypeMqttTopics([])) : "[]";
        let widgets: DeviceDashboardWidget[] = [];
        if (source) {
            try {
                const topics = parseDeviceTypeMqttTopics(source.mqttTopics).map((topic) => topic.linkedTopic?.deviceTypeId === source.id
                    ? { ...topic, linkedTopic: { ...topic.linkedTopic, deviceTypeId: id } } : topic);
                mqttTopics = normalizeMqttTopics(topics, id);
                widgets = parseDeviceDashboardWidgets(loadDeviceTypeWidgets(source.id), getDeviceTypeMqttTopics(mqttTopics));
            } catch (error) {
                return res.status(400).send({ error: error instanceof Error ? error.message : "Invalid source Device Type configuration" });
            }
        }
        try {
            const created = db.transaction(() => {
                insertDeviceType({ id, firmware_version, firmware_build, description: body.description ?? source?.description,
                    deviceProperties: source?.deviceProperties ?? "{}", genericProperties: source?.genericProperties ?? "{}",
                    mqttTopics, mqtt_enabled: mqttEnabled ? 1 : 0 });
                if (widgets.length) replaceDeviceTypeWidgets(id, widgets, 0);
                return findDeviceType(id)!;
            });
            return res.status(201).send(created);
        } catch (error) {
            console.error(error);
            return res.status(500).send({ error: "Failed to create Device Type" });
        }
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

        if (!firmware_version?.trim()) {
            return res
                .status(400)
                .json({ error: "Missing required fields" });
        }

        const existing = findDeviceType(id);

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
                const normalized = parseDevicePropertyMap(parsed);
                deviceProperties = JSON.stringify(normalized);
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
                const normalized = parseSavedPropertyMap(parsed);
                genericProperties = JSON.stringify(normalized);
            } catch {
                return res
                    .status(400)
                    .json({ error: "genericProperties is not a valid JSON" });
            }
        }

        let mqttTopics = existing.mqttTopics || "[]";
        if (typeof mqttTopicsInput !== "undefined") {
            try {
                mqttTopics = normalizeMqttTopics(mqttTopicsInput, id);
            } catch (error) {
                return res
                    .status(400)
                    .json({ error: error instanceof Error ? error.message : "Invalid MQTT topics" });
            }
        }

        updateDeviceType(id, { description, firmware_version, deviceProperties, genericProperties, mqttTopics,
            ...(firmware_build ? { firmware_build } : {}),
        });
        normalizeAllDeviceTypeMqttTopicLinks();
        syncGeneratedMqttAclRulesForAllDevices();
        syncGeneratedMqttUserAclRulesForAllUsers();

        const updated = findDeviceType(id);

        return res.json(updated);
    },

    updateMqtt(req: any, res: any) {
        const id = String(req.params.id || "");
        const existing = findDeviceType(id);
        if (!existing) return res.status(404).send({ error: "Device type not found" });
        let enabled: boolean;
        let topics: string;
        try {
            enabled = parseMqttEnabled(req.body?.mqtt_enabled);
            // Revocation must not be blocked by an incomplete, unsaved topic draft.
            topics = existing.mqttTopics || "[]";
            if (enabled) {
                const rawTopics = req.body?.mqttTopics ?? existing.mqttTopics;
                const draft = typeof rawTopics === "string" ? JSON.parse(rawTopics) : rawTopics;
                if (!Array.isArray(draft)) throw new Error("mqttTopics must be an array");
                topics = normalizeMqttTopics(!existing.mqtt_enabled ? withDefaultDeviceTypeMqttTopics(draft) : draft, id);
            }
        } catch (error) {
            return res.status(400).send({ error: error instanceof Error ? error.message : "Invalid MQTT configuration" });
        }
        db.transaction(() => {
            updateDeviceType(id, { mqtt_enabled: enabled ? 1 : 0, mqttTopics: topics });
            normalizeAllDeviceTypeMqttTopicLinks();
            syncGeneratedMqttAclRulesForAllDevices();
            syncGeneratedMqttUserAclRulesForAllUsers();
        });
        return res.send(findDeviceType(id));
    },

    // DELETE /device-types/:id
    delete(req: any, res: any) {
        const { id } = req.params;

        const linked = countDevicesByType(id);

        if (linked && linked > 0) {
            return res.status(400).json({
                error: "Cannot delete: there are devices linked to this device type",
                devices_using_type: linked,
            });
        }

        const info = deleteDeviceType(id);

        if (info.changes === 0) {
            return res.status(400).send({ error: "Device type not found" });
        }

        res.send({ success: true });
    },
};
