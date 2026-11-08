import { getDeviceWithType, canAccessDevice as canUserAccessDevice } from "../repositories/deviceRepository";
import { DeviceTypeMqttTopic, getDeviceTypeMqttTopics } from "@shared/types/device_type_mqtt";
import {
    DEVICE_WIDGET_SCHEMA_VERSION, DeviceDashboardWidget, DeviceDashboardWidgetRuntime,
    DeviceDashboardWidgetActionInput, DeviceDashboardWidgetsResponse,
    buildDashboardValuePayload, validateWidgetInput, validateWidgetTopics, resolveWidgetTopic, WidgetValidationError,
} from "@shared/widgets";
import { MqttPublishInput } from "@shared/types/mqtt_publish";
import { resolveDeviceTypeMqttTopicsForDevice } from "../utils/deviceTypeMqtt";
import { loadDeviceWidgets } from "../repositories/deviceTypeWidgetRepository";

type AuthUser = { id?: number | string; role?: string };
type DeviceDashboardRow = NonNullable<ReturnType<typeof getDeviceWithType>>;

export class DeviceDashboardError extends Error {
    constructor(public readonly status: number, message: string) { super(message); }
}

function loadAccessibleDevice(deviceCode: string, user: AuthUser) {
    const device = getDeviceWithType(deviceCode);
    if (!device) throw new DeviceDashboardError(404, "Device not found");
    if (!canUserAccessDevice(Number(user.id), String(user.role || ""), deviceCode)) {
        throw new DeviceDashboardError(403, "You are not allowed to access this device");
    }
    return device;
}

function configurationError(widget: DeviceDashboardWidget, resolvedTopics: Map<string, string>, topics: DeviceTypeMqttTopic[]): string | undefined {
    try {
        validateWidgetTopics(widget, topics);
        if (widget.state) resolveWidgetTopic(widget.state, resolvedTopics.get(widget.state.topicKey) || "", "state");
        if ("command" in widget) {
            const topic = resolveWidgetTopic(widget.command, resolvedTopics.get(widget.command.topicKey) || "", "command");
            if (/[+#]/.test(topic)) return "Command topic must not contain wildcards";
        }
    } catch (error) { if (error instanceof WidgetValidationError) return error.message; throw error; }
    return undefined;
}

function runtimeWidget(widget: DeviceDashboardWidget, resolvedTopics: Map<string, string>, topics: DeviceTypeMqttTopic[]): DeviceDashboardWidgetRuntime {
    const error = configurationError(widget, resolvedTopics, topics);
    const stateTopic = !error && widget.state ? resolveWidgetTopic(widget.state, resolvedTopics.get(widget.state.topicKey)!) : undefined;
    const state = stateTopic && widget.state ? { topic: stateTopic, ...(widget.state.path ? { path: widget.state.path } : {}) } : undefined;
    const common = { id: widget.id, label: widget.label, configured: !error,
        ...(error ? { configurationError: error } : {}), ...(state ? { state } : {}) };
    switch (widget.kind) {
        case "text": return { ...common, kind: "text" };
        case "value": return { ...common, kind: "value" };
        case "button": return { ...common, kind: "button" };
        case "switch": return { ...common, kind: "switch", state: state && widget.state
            ? { ...state, onValue: widget.state.onValue, offValue: widget.state.offValue } : undefined };
        case "input": {
            const { topicKey, topicSuffix, path, ...input } = widget.command;
            return { ...common, kind: "input", input };
        }
    }
}

function buildWidgetResponse(device: DeviceDashboardRow): DeviceDashboardWidgetsResponse {
    const widgets = device.mqtt_available ? loadDeviceWidgets(device.code) : [];
    const topics = getDeviceTypeMqttTopics(device.mqttTopics);
    const resolvedTopics = new Map(resolveDeviceTypeMqttTopicsForDevice(device.code).map((topic) => [topic.key, topic.resolvedTopic]));
    return {
        schemaVersion: DEVICE_WIDGET_SCHEMA_VERSION,
        deviceCode: device.code,
        deviceTypeId: device.device_type_id,
        canConfigure: false,
        widgets: widgets.map((widget) => runtimeWidget(widget, resolvedTopics, topics)),
    };
}

export function getDeviceDashboardWidgets(deviceCode: string, user: AuthUser) {
    return buildWidgetResponse(loadAccessibleDevice(deviceCode, user));
}

export function buildDeviceDashboardWidgetAction(deviceCode: string, widgetId: string, input: DeviceDashboardWidgetActionInput, user: AuthUser): { publish: MqttPublishInput } {
    const device = loadAccessibleDevice(deviceCode, user);
    if (!device.mqtt_available) throw new DeviceDashboardError(409, "MQTT is disabled for this device");
    const widget = loadDeviceWidgets(deviceCode).find((candidate) => candidate.id === widgetId);
    if (!widget) throw new DeviceDashboardError(404, "Widget not found");
    if (!("command" in widget)) throw new DeviceDashboardError(400, `Widget "${widget.label}" is read-only`);
    const resolvedTopics = new Map(resolveDeviceTypeMqttTopicsForDevice(deviceCode).map((topic) => [topic.key, topic.resolvedTopic]));
    const error = configurationError(widget, resolvedTopics, getDeviceTypeMqttTopics(device.mqttTopics));
    if (error) throw new DeviceDashboardError(400, error);
    const topic = resolveWidgetTopic(widget.command, resolvedTopics.get(widget.command.topicKey)!);
    let content: Record<string, unknown>;
    switch (widget.kind) {
        case "button":
            content = widget.command.mode === "payload" ? widget.command.payload : buildDashboardValuePayload(widget.command.value, widget.command.path);
            break;
        case "switch":
            if (typeof input.state !== "boolean") throw new DeviceDashboardError(400, "Switch state must be true or false");
            content = buildDashboardValuePayload(input.state ? widget.command.onValue : widget.command.offValue, widget.command.path);
            break;
        case "input": {
            const error = validateWidgetInput(input.value, widget.command);
            if (error) throw new DeviceDashboardError(400, error);
            content = buildDashboardValuePayload(input.value!, widget.command.path);
            break;
        }
    }
    return { publish: { topic, content } };
}
