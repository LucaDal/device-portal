import { MqttAclAction } from "../constants/mqtt";

export const DEVICE_TYPE_WIDGET_KINDS = {
    TEXT: "text",
    VALUE: "value",
    SWITCH: "switch",
    INPUT: "input",
    BUTTON: "button",
} as const;

export type DeviceTypeWidgetKind =
    (typeof DEVICE_TYPE_WIDGET_KINDS)[keyof typeof DEVICE_TYPE_WIDGET_KINDS];

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

export interface DeviceTypeDashboardWidget {
    id: string;
    label: string;
    kind: DeviceTypeWidgetKind;
    topicKey: string;
    publishValue?: string | number | boolean;
    payload?: Record<string, string | number | boolean>;
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

export function parseDeviceTypeDashboardWidgets(raw: unknown): DeviceTypeDashboardWidget[] {
    if (!raw) return [];
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((row) => ({
                id: String(row?.id || "").trim(),
                label: String(row?.label || "").trim(),
                kind: row?.kind,
                topicKey: String(row?.topicKey || "").trim(),
                publishValue: row?.publishValue,
                payload: row?.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
                    ? row.payload
                    : undefined,
            }))
            .filter((row) =>
                row.id &&
                row.label &&
                row.topicKey &&
                Object.values(DEVICE_TYPE_WIDGET_KINDS).includes(row.kind as DeviceTypeWidgetKind)
            ) as DeviceTypeDashboardWidget[];
    } catch {
        return [];
    }
}
