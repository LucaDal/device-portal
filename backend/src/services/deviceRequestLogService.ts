import { DB } from "../config/database";

export const DEVICE_REQUEST_LOG_TYPES = {
    OTA_PROPERTIES: "ota_properties",
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
        DB.prepare(`
            INSERT INTO device_request_logs (
                event_type,
                method,
                path,
                status_code,
                device_code,
                device_type_id,
                user_id,
                user_email,
                topic,
                ip,
                user_agent,
                request_summary,
                response_summary,
                error
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            input.eventType,
            String(input.req?.method || ""),
            String(input.req?.originalUrl || input.req?.url || ""),
            input.statusCode ?? null,
            input.deviceCode || input.req?.otaAuth?.deviceCode || null,
            input.deviceTypeId || input.req?.otaAuth?.deviceTypeId || null,
            input.req?.user?.id || null,
            input.req?.user?.email || null,
            input.topic || null,
            input.req?.ip || null,
            String(input.req?.headers?.["user-agent"] || ""),
            toJson(input.requestSummary),
            toJson(input.responseSummary),
            input.error || null
        );
    } catch (err) {
        console.error("Failed to record device request log", err);
    }
}

export function listDeviceRequestLogs(filters: {
    eventType?: string;
    deviceCode?: string;
    limit?: number;
}) {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filters.eventType) {
        where.push("event_type = ?");
        params.push(filters.eventType);
    }
    if (filters.deviceCode) {
        where.push("device_code = ?");
        params.push(filters.deviceCode);
    }

    const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 500);
    params.push(limit);

    return DB.prepare(`
        SELECT
            id,
            created_at,
            event_type,
            method,
            path,
            status_code,
            device_code,
            device_type_id,
            user_id,
            user_email,
            topic,
            ip,
            user_agent,
            request_summary,
            response_summary,
            error
        FROM device_request_logs
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
    `).all(...params);
}
