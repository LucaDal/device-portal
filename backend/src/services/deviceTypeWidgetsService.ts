import { db } from "../config/database";
import { ROLES } from "@shared/constants/auth";
import { getDeviceTypeMqttTopics } from "@shared/types/device_type_mqtt";
import {
    DEVICE_WIDGET_SCHEMA_VERSION, DeviceDashboardWidget, DeviceTypeWidgetsResponse,
    parseDeviceDashboardWidgets, resolveWidgetTopic, WidgetValidationError,
} from "@shared/widgets";
import { findDeviceType } from "../repositories/deviceTypeRepository";
import { loadDeviceTypeWidgets, replaceDeviceTypeWidgets, WidgetConfigurationConflictError } from "../repositories/deviceTypeWidgetRepository";
import { DeviceDashboardError } from "./deviceDashboardService";
import { syncGeneratedMqttAclRulesForAllDevices } from "../utils/deviceTypeMqtt";
import { syncGeneratedMqttUserAclRulesForAllUsers } from "../utils/mqttUserAcl";
import { validateMqttTopicTemplate } from "../utils/mqttTopicTemplate";

type AuthUser = { role?: string };
type DeviceTypeRow = NonNullable<ReturnType<typeof findDeviceType>>;

function loadEditableType(id: string, user: AuthUser): DeviceTypeRow {
    if (user.role !== ROLES.ADMIN) throw new DeviceDashboardError(403, "Only administrators can configure device types");
    const type = findDeviceType(id);
    if (!type) throw new DeviceDashboardError(404, "Device type not found");
    return type;
}

function widgetTopics(type: DeviceTypeRow) {
    return getDeviceTypeMqttTopics(type.mqttTopics).map((topic) => {
        const link = topic.linkedTopic;
        if (!link) return topic;
        const target = getDeviceTypeMqttTopics(findDeviceType(link.deviceTypeId)?.mqttTopics)
            .find((candidate) => candidate.key === link.topicKey && !candidate.linkedTopic);
        return { ...topic, topic: target?.topic || "" };
    });
}

function response(type: DeviceTypeRow): DeviceTypeWidgetsResponse {
    return {
        schemaVersion: DEVICE_WIDGET_SCHEMA_VERSION,
        deviceTypeId: type.id,
        configuration: {
            revision: type.widgets_revision,
            topics: widgetTopics(type),
            widgets: loadDeviceTypeWidgets(type.id),
        },
    };
}

export function getDeviceTypeWidgets(id: string, user: AuthUser) {
    return response(loadEditableType(id, user));
}

function validateCommands(widgets: DeviceDashboardWidget[], type: DeviceTypeRow) {
    const topics = getDeviceTypeMqttTopics(type.mqttTopics);
    for (const widget of widgets) {
        if (!("command" in widget)) continue;
        const commandTopic = topics.find((topic) => topic.key === widget.command.topicKey)!;
        const link = commandTopic.linkedTopic;
        const target = link ? getDeviceTypeMqttTopics(findDeviceType(link.deviceTypeId)?.mqttTopics)
            .find((topic) => topic.key === link.topicKey && !topic.linkedTopic) : commandTopic;
        const field = `Widget "${widget.label}".command.topicKey`;
        if (!target?.topic) throw new WidgetValidationError(field, "Command topic is unavailable");
        const error = validateMqttTopicTemplate(resolveWidgetTopic(widget.command, target.topic, field));
        if (error) throw new WidgetValidationError(field, error);
        if (link && (!target.topic.split("/").includes("{ownerId}") || target.topic.includes("{deviceCode}"))) {
            throw new WidgetValidationError(field, "Linked commands require an owner-scoped topic without device wildcards");
        }
    }
}

export function saveDeviceTypeWidgets(id: string, rawWidgets: unknown, revision: unknown, user: AuthUser) {
    try {
        return db.transaction(() => {
            const type = loadEditableType(id, user);
            if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
                throw new DeviceDashboardError(400, "A valid widget configuration revision is required");
            }
            const widgets = parseDeviceDashboardWidgets(rawWidgets, widgetTopics(type));
            validateCommands(widgets, type);
            replaceDeviceTypeWidgets(id, widgets, revision);
            syncGeneratedMqttAclRulesForAllDevices();
            syncGeneratedMqttUserAclRulesForAllUsers();
            return response(findDeviceType(id)!);
        });
    } catch (error) {
        if (error instanceof WidgetConfigurationConflictError) throw new DeviceDashboardError(409, error.message);
        if (error instanceof WidgetValidationError) throw new DeviceDashboardError(400, error.message);
        throw error;
    }
}
