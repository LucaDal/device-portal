import { MqttAclAction } from "../constants/mqtt";

export const DEVICE_WIDGET_SCHEMA_VERSION = 1 as const;

export const DEVICE_WIDGET_KINDS = {
    TEXT: "text",
    VALUE: "value",
    SWITCH: "switch",
    INPUT: "input",
    BUTTON: "button",
} as const;

export type DeviceWidgetKind =
    (typeof DEVICE_WIDGET_KINDS)[keyof typeof DEVICE_WIDGET_KINDS];

export type DashboardWidgetValue = string | number | boolean;

export function isDashboardWidgetValue(value: unknown): value is DashboardWidgetValue {
    if (typeof value === "string") return value.length <= 4096;
    if (typeof value === "number") return Number.isFinite(value);
    return typeof value === "boolean";
}

export interface DeviceTypeMqttTopic {
    key: string;
    label?: string;
    topic?: string;
    action: MqttAclAction;
    linkedTopic?: {
        deviceTypeId: string;
        topicKey: string;
    };
}

export interface DeviceDashboardWidget {
    id: string;
    label: string;
    kind: DeviceWidgetKind;
    topicKey: string;
    stateTopicKey?: string;
    stateValuePath?: string;
    publishValue?: DashboardWidgetValue;
    onValue?: DashboardWidgetValue;
    offValue?: DashboardWidgetValue;
    payload?: Record<string, DashboardWidgetValue>;
}

export interface DeviceDashboardWidgetRuntime {
    id: string;
    label: string;
    kind: DeviceWidgetKind;
    configured: boolean;
    stateTopic?: string;
    stateValuePath?: string;
    onValue?: DashboardWidgetValue;
    offValue?: DashboardWidgetValue;
}

export interface DeviceDashboardWidgetConfiguration {
    topics: DeviceTypeMqttTopic[];
    widgets: DeviceDashboardWidget[];
}

export interface DeviceDashboardWidgetsResponse {
    schemaVersion: typeof DEVICE_WIDGET_SCHEMA_VERSION;
    deviceCode: string;
    deviceTypeId: string;
    canConfigure: boolean;
    widgets: DeviceDashboardWidgetRuntime[];
    configuration?: DeviceDashboardWidgetConfiguration;
}

export interface DeviceDashboardWidgetActionInput {
    state?: boolean;
    value?: DashboardWidgetValue;
}

export function getDashboardWidgetTopicKey(
    widget: DeviceDashboardWidget
): string {
    return widget.topicKey;
}

export function getDashboardWidgetStateValuePath(
    widget: DeviceDashboardWidget
): string {
    return widget.stateValuePath || "";
}

export function getDashboardWidgetStateTopicKey(
    widget: DeviceDashboardWidget
): string {
    if (widget.stateTopicKey) return widget.stateTopicKey;

    const topicKey = getDashboardWidgetTopicKey(widget);
    if (
        getDashboardWidgetStateValuePath(widget) ||
        widget.kind === DEVICE_WIDGET_KINDS.VALUE ||
        widget.kind === DEVICE_WIDGET_KINDS.TEXT
    ) {
        return topicKey;
    }
    return "";
}

export function isValidDashboardStateValuePath(value: unknown): value is string {
    if (typeof value !== "string") return false;
    const normalized = value.trim();
    return normalized.length > 0 && normalized.length <= 512 && normalized.startsWith("/");
}

function parseDashboardJsonPointer(path: string): string[] {
    return path
        .slice(1)
        .split("/")
        .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

export function buildDashboardValuePayload(
    value: DashboardWidgetValue,
    path?: string
): Record<string, unknown> {
    if (!path || !isValidDashboardStateValuePath(path)) {
        return { value };
    }

    let document: unknown = value;
    const segments = parseDashboardJsonPointer(path);
    for (let index = segments.length - 1; index >= 0; index -= 1) {
        document = { [segments[index]]: document };
    }
    return document as Record<string, unknown>;
}

export function readDashboardStateValue(payload: unknown, path?: string): unknown {
    if (!path) {
        if (
            payload &&
            typeof payload === "object" &&
            !Array.isArray(payload) &&
            Object.prototype.hasOwnProperty.call(payload, "value")
        ) {
            return (payload as { value: unknown }).value;
        }
        return payload;
    }
    if (!isValidDashboardStateValuePath(path)) return undefined;

    let document = payload;
    if (typeof document === "string") {
        try {
            document = JSON.parse(document);
        } catch {
            return undefined;
        }
    }

    return parseDashboardJsonPointer(path)
        .reduce<unknown>((current, segment) => {
            if (Array.isArray(current)) {
                const index = Number(segment);
                return Number.isInteger(index) && index >= 0 ? current[index] : undefined;
            }
            if (current && typeof current === "object") {
                return (current as Record<string, unknown>)[segment];
            }
            return undefined;
        }, document);
}

export interface UserDashboardLayoutItem {
    widgetId: string;
    order: number;
    size?: "small" | "wide";
}

export interface UserDashboardLayout {
    items: UserDashboardLayoutItem[];
}

export function normalizeMqttTopicPath(value: string): string {
    return String(value || "")
        .trim()
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
}

export function parseDeviceTypeMqttTopics(raw: unknown): DeviceTypeMqttTopic[] {
    if (!raw) return [];
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((row) => {
                const linkedTopic = row?.linkedTopic && typeof row.linkedTopic === "object"
                    ? {
                        deviceTypeId: String(row.linkedTopic.deviceTypeId || "").trim(),
                        topicKey: String(row.linkedTopic.topicKey || "").trim(),
                    }
                    : undefined;
                return {
                    key: String(row?.key || linkedTopic?.topicKey || "").trim(),
                    label: String(row?.label || "").trim(),
                    topic: normalizeMqttTopicPath(String(row?.topic || "")),
                    action: row?.action,
                    linkedTopic,
                };
            })
            .filter((row) =>
                row.key &&
                (row.topic || (row.linkedTopic?.deviceTypeId && row.linkedTopic?.topicKey)) &&
                (row.action === "publish" || row.action === "subscribe" || row.action === "all")
            );
    } catch {
        return [];
    }
}

export function parseDeviceDashboardWidgets(raw: unknown): DeviceDashboardWidget[] {
    if (!raw) return [];
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((row) => {
                const payload = row?.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
                    ? Object.fromEntries(
                        Object.entries(row.payload).filter(([, value]) => isDashboardWidgetValue(value))
                    ) as Record<string, DashboardWidgetValue>
                    : undefined;
                const kind = row?.kind as DeviceWidgetKind;
                const stateTopicKey = String(row?.stateTopicKey || "").trim();
                const stateValuePath = isValidDashboardStateValuePath(row?.stateValuePath)
                    ? row.stateValuePath.trim()
                    : "";
                const widget: DeviceDashboardWidget = {
                    id: String(row?.id || "").trim(),
                    label: String(row?.label || "").trim(),
                    kind,
                    topicKey: String(row?.topicKey || "").trim(),
                    ...(stateTopicKey ? { stateTopicKey } : {}),
                    ...(stateValuePath ? { stateValuePath } : {}),
                };
                if (kind === DEVICE_WIDGET_KINDS.BUTTON) {
                    if (isDashboardWidgetValue(row?.publishValue)) {
                        widget.publishValue = row.publishValue;
                    }
                    if (payload) widget.payload = payload;
                }
                if (kind === DEVICE_WIDGET_KINDS.SWITCH) {
                    if (isDashboardWidgetValue(row?.onValue)) {
                        widget.onValue = row.onValue;
                    }
                    if (isDashboardWidgetValue(row?.offValue)) {
                        widget.offValue = row.offValue;
                    }
                }
                return widget;
            })
            .filter((row) =>
                row.id &&
                row.label &&
                row.topicKey &&
                Object.values(DEVICE_WIDGET_KINDS).includes(row.kind as DeviceWidgetKind)
            ) as DeviceDashboardWidget[];
    } catch {
        return [];
    }
}
