import { DB } from "../config/database";
import { ROLES } from "@shared/constants/auth";
import {
    DEVICE_WIDGET_KINDS,
    DEVICE_WIDGET_SCHEMA_VERSION,
    DeviceDashboardWidget,
    DeviceDashboardWidgetActionInput,
    DeviceDashboardWidgetsResponse,
    DeviceTypeMqttTopic,
    buildDashboardValuePayload,
    getDashboardWidgetStateTopicKey,
    getDashboardWidgetStateValuePath,
    isDashboardWidgetValue,
    isValidDashboardStateValuePath,
    parseDeviceDashboardWidgets,
    parseDeviceTypeMqttTopics,
} from "@shared/types/device_type_mqtt";
import { MqttPublishInput } from "@shared/types/mqtt_publish";
import {
    resolveDeviceTypeMqttTopicsForDevice,
    syncGeneratedMqttAclRulesForDevice,
} from "../utils/deviceTypeMqtt";
import { loadDeviceWidgets, replaceDeviceWidgets } from "../repositories/deviceWidgetRepository";
import { syncGeneratedMqttUserAclRulesForAllUsers } from "../utils/mqttUserAcl";

type AuthUser = { id?: number | string; role?: string };

type DeviceDashboardRow = {
    code: string;
    device_type_id: string;
    owner_id: number | null;
    mqttTopics?: string | null;
};

export class DeviceDashboardError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
    }
}

function loadDeviceDashboardRow(deviceCode: string): DeviceDashboardRow | undefined {
    return DB.prepare(`
        SELECT d.code, d.device_type_id, d.owner_id, dt.mqttTopics
        FROM devices d
        JOIN device_types dt ON dt.id = d.device_type_id
        WHERE d.code = ?
    `).get(deviceCode) as DeviceDashboardRow | undefined;
}

function canAccessDevice(deviceCode: string, user: AuthUser): boolean {
    const userId = Number(user.id);
    if (!userId) return false;
    if (user.role === ROLES.ADMIN) return true;
    return Boolean(DB.prepare(`
        SELECT 1
        FROM devices d
        LEFT JOIN device_shares ds
            ON ds.device_code = d.code AND ds.user_id = ?
        WHERE d.code = ? AND (d.owner_id = ? OR ds.user_id IS NOT NULL)
        LIMIT 1
    `).get(userId, deviceCode, userId));
}

function canConfigureDevice(deviceCode: string, user: AuthUser): boolean {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.DEV) return false;
    return canAccessDevice(deviceCode, user);
}

function validateWidgets(raw: unknown, topics: DeviceTypeMqttTopic[]): DeviceDashboardWidget[] {
    if (!Array.isArray(raw)) {
        throw new DeviceDashboardError(400, "widgets must be an array");
    }
    for (const item of raw) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new DeviceDashboardError(400, "Each widget must be an object");
        }
        const source = item as Record<string, unknown>;
        const stateValuePath = String(source.stateValuePath || "").trim();
        if (stateValuePath && !isValidDashboardStateValuePath(stateValuePath)) {
            throw new DeviceDashboardError(400, "Widget stateValuePath must be a JSON Pointer starting with /");
        }
        for (const key of ["publishValue", "onValue", "offValue"] as const) {
            if (Object.prototype.hasOwnProperty.call(source, key) && !isDashboardWidgetValue(source[key])) {
                throw new DeviceDashboardError(400, `Widget ${key} must be a scalar value`);
            }
        }
        if (Object.prototype.hasOwnProperty.call(source, "payload")) {
            if (!source.payload || typeof source.payload !== "object" || Array.isArray(source.payload)) {
                throw new DeviceDashboardError(400, "Widget payload must be an object");
            }
            if (!Object.values(source.payload).every(isDashboardWidgetValue)) {
                throw new DeviceDashboardError(400, "Widget payload values must be scalar values");
            }
        }
    }

    const widgets = parseDeviceDashboardWidgets(raw);
    if (widgets.length !== raw.length) {
        throw new DeviceDashboardError(400, "One or more widgets are incomplete or invalid");
    }

    const topicKeys = new Set(topics.map((topic) => topic.key));
    const widgetIds = new Set<string>();
    for (const widget of widgets) {
        if (widgetIds.has(widget.id)) {
            throw new DeviceDashboardError(400, `Duplicate widget id "${widget.id}"`);
        }
        widgetIds.add(widget.id);
        if (!topicKeys.has(widget.topicKey)) {
            throw new DeviceDashboardError(400, `Unknown MQTT topic "${widget.topicKey}"`);
        }
        if (widget.stateTopicKey && !topicKeys.has(widget.stateTopicKey)) {
            throw new DeviceDashboardError(400, `Unknown MQTT state topic "${widget.stateTopicKey}"`);
        }
    }
    return widgets;
}

function buildWidgetResponse(row: DeviceDashboardRow, user: AuthUser): DeviceDashboardWidgetsResponse {
    const topics = parseDeviceTypeMqttTopics(row.mqttTopics);
    const widgets = loadDeviceWidgets(row.code);
    const resolvedTopicByKey = new Map(
        resolveDeviceTypeMqttTopicsForDevice(row.code).map((topic) => [topic.key, topic.resolvedTopic])
    );
    const canConfigure = canConfigureDevice(row.code, user);

    return {
        schemaVersion: DEVICE_WIDGET_SCHEMA_VERSION,
        deviceCode: row.code,
        deviceTypeId: row.device_type_id,
        canConfigure,
        widgets: widgets.map((widget) => {
            const stateTopicKey = getDashboardWidgetStateTopicKey(widget);
            const stateValuePath = getDashboardWidgetStateValuePath(widget);
            const hasCommandTopic = resolvedTopicByKey.has(widget.topicKey);
            const configured = widget.kind === DEVICE_WIDGET_KINDS.BUTTON
                ? hasCommandTopic && (typeof widget.publishValue !== "undefined" || Boolean(widget.payload))
                : widget.kind === DEVICE_WIDGET_KINDS.SWITCH
                    ? hasCommandTopic && typeof widget.onValue !== "undefined" && typeof widget.offValue !== "undefined"
                    : widget.kind === DEVICE_WIDGET_KINDS.INPUT
                        ? hasCommandTopic
                        : resolvedTopicByKey.has(stateTopicKey);

            return {
                id: widget.id,
                label: widget.label,
                kind: widget.kind,
                configured,
                ...(widget.kind === DEVICE_WIDGET_KINDS.SWITCH ? {
                    onValue: widget.onValue,
                    offValue: widget.offValue,
                } : {}),
                ...(resolvedTopicByKey.get(stateTopicKey)
                    ? { stateTopic: resolvedTopicByKey.get(stateTopicKey) }
                    : {}),
                ...(stateValuePath ? { stateValuePath } : {}),
            };
        }),
        ...(canConfigure ? { configuration: { topics, widgets } } : {}),
    };
}

export function getDeviceDashboardWidgets(deviceCode: string, user: AuthUser) {
    const row = loadDeviceDashboardRow(deviceCode);
    if (!row) throw new DeviceDashboardError(404, "Device not found");
    if (!canAccessDevice(deviceCode, user)) {
        throw new DeviceDashboardError(403, "You are not allowed to access this device");
    }
    return buildWidgetResponse(row, user);
}

export function saveDeviceDashboardWidgets(deviceCode: string, rawWidgets: unknown, user: AuthUser) {
    const row = loadDeviceDashboardRow(deviceCode);
    if (!row) throw new DeviceDashboardError(404, "Device not found");
    if (!canConfigureDevice(deviceCode, user)) {
        throw new DeviceDashboardError(403, "Only admin or developer can configure device widgets");
    }
    const topics = parseDeviceTypeMqttTopics(row.mqttTopics);
    replaceDeviceWidgets(deviceCode, validateWidgets(rawWidgets, topics));
    syncGeneratedMqttAclRulesForDevice(deviceCode);
    syncGeneratedMqttUserAclRulesForAllUsers();
    return buildWidgetResponse(row, user);
}

export function buildDeviceDashboardWidgetAction(
    deviceCode: string,
    widgetId: string,
    input: DeviceDashboardWidgetActionInput,
    user: AuthUser
): { publish: MqttPublishInput; state?: boolean } {
    const row = loadDeviceDashboardRow(deviceCode);
    if (!row) throw new DeviceDashboardError(404, "Device not found");
    if (!canAccessDevice(deviceCode, user)) {
        throw new DeviceDashboardError(403, "You are not allowed to access this device");
    }

    const widget = loadDeviceWidgets(deviceCode).find((candidate) => candidate.id === widgetId);
    if (!widget) throw new DeviceDashboardError(404, "Widget not found");
    const topic = resolveDeviceTypeMqttTopicsForDevice(deviceCode)
        .find((candidate) => candidate.key === widget.topicKey);
    if (!topic) throw new DeviceDashboardError(400, "Widget MQTT topic is not configured");

    if (widget.kind === DEVICE_WIDGET_KINDS.BUTTON) {
        if (typeof widget.publishValue === "undefined" && !widget.payload) {
            throw new DeviceDashboardError(400, "Button publish value is not configured");
        }
        return {
            publish: {
                topic: topic.resolvedTopic,
                content: widget.payload || buildDashboardValuePayload(
                    widget.publishValue!,
                    getDashboardWidgetStateValuePath(widget)
                ),
            },
        };
    }

    if (widget.kind === DEVICE_WIDGET_KINDS.SWITCH) {
        if (typeof input.state !== "boolean") {
            throw new DeviceDashboardError(400, "Switch state must be true or false");
        }
        const value = input.state ? widget.onValue : widget.offValue;
        if (typeof value === "undefined") {
            throw new DeviceDashboardError(400, `Switch ${input.state ? "ON" : "OFF"} value is not configured`);
        }
        return {
            publish: {
                topic: topic.resolvedTopic,
                content: buildDashboardValuePayload(value, getDashboardWidgetStateValuePath(widget)),
            },
            state: input.state,
        };
    }

    if (widget.kind === DEVICE_WIDGET_KINDS.INPUT) {
        if (!isDashboardWidgetValue(input.value)) {
            throw new DeviceDashboardError(400, "Input value must be a string, number, or boolean");
        }
        return {
            publish: {
                topic: topic.resolvedTopic,
                content: buildDashboardValuePayload(input.value, getDashboardWidgetStateValuePath(widget)),
            },
        };
    }

    throw new DeviceDashboardError(400, `Widget "${widget.label}" is read-only`);
}
