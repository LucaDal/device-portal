export const DEVICE_WIDGET_SCHEMA_VERSION = 2 as const;
export type DashboardWidgetValue = string | number | boolean;

export interface WidgetIdentity {
    id: string;
    label: string;
}

export interface WidgetStateBinding {
    topicKey: string;
    topicSuffix?: string;
    path?: string;
}

export interface WidgetCommandBinding {
    topicKey: string;
    topicSuffix?: string;
    path?: string;
}

export interface ResolvedWidgetState {
    topic: string;
    path?: string;
}

export interface WidgetRuntimeBase extends WidgetIdentity {
    configured: boolean;
    configurationError?: string;
    state?: ResolvedWidgetState;
}

export function isDashboardWidgetValue(value: unknown): value is DashboardWidgetValue {
    return typeof value === "boolean" ||
        (typeof value === "string" && value.length <= 4096) ||
        (typeof value === "number" && Number.isFinite(value));
}
