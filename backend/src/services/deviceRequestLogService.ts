import { insertDeviceRequestLog } from "../repositories/deviceRequestLogRepository";
export { listDeviceRequestLogs } from "../repositories/deviceRequestLogRepository";

export const DEVICE_REQUEST_LOG_TYPES = {
    DEVICE_CONFIGURATION: "device_configuration",
    OTA_BUILD: "ota_build",
    OTA_VERSION: "ota_version",
    MQTT_API_PUBLISH: "mqtt_api_publish",
} as const;

export type DeviceRequestLogType = (typeof DEVICE_REQUEST_LOG_TYPES)[keyof typeof DEVICE_REQUEST_LOG_TYPES];

type RecordLogInput = {
    eventType: DeviceRequestLogType;
    req: any;
    statusCode?: number;
    deviceCode?: string;
    deviceTypeId?: string;
    topic?: string;
    requestSummary?: unknown;
    responseSummary?: unknown;
    error?: string;
};

function toJson(value: unknown): string | null {
    if (typeof value === "undefined" || value === null) return null;
    try {
        return JSON.stringify(value);
    } catch {
        return JSON.stringify({ value: String(value) });
    }
}

export function recordDeviceRequestLog(input: RecordLogInput) {
    try {
        insertDeviceRequestLog({
            event_type: input.eventType,
            method: String(input.req?.method || ""),
            path: String(input.req?.originalUrl || input.req?.url || ""),
            status_code: input.statusCode ?? null,
            device_code: input.deviceCode || input.req?.deviceAuth?.deviceCode || null,
            device_type_id: input.deviceTypeId || input.req?.deviceAuth?.deviceTypeId || null,
            user_id: input.req?.user?.id || null,
            user_email: input.req?.user?.email || null,
            topic: input.topic || null,
            ip: input.req?.ip || null,
            user_agent: String(input.req?.headers?.["user-agent"] || ""),
            request_summary: toJson(input.requestSummary),
            response_summary: toJson(input.responseSummary),
            error: input.error || null,
        });
    } catch (err) {
        console.error("Failed to record device request log", err);
    }
}
