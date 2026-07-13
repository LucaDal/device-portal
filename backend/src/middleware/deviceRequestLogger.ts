import {
    DeviceRequestLogType,
    recordDeviceRequestLog,
} from "../services/deviceRequestLogService";

function getTopic(req: any): string | undefined {
    return String(req.body?.topic || req.body?.topic_name || "").trim() || undefined;
}

function getDeviceCode(req: any): string | undefined {
    return String(
        req.otaAuth?.deviceCode ||
        req.headers?.["x-device-code"] ||
        req.body?.deviceCode ||
        req.params?.deviceCode ||
        ""
    ).trim() || undefined;
}

function getDeviceTypeId(req: any): string | undefined {
    return String(req.otaAuth?.deviceTypeId || req.headers?.["x-device-type-id"] || "").trim() || undefined;
}

export function deviceRequestLogger(eventType: DeviceRequestLogType) {
    return (req: any, res: any, next: any) => {
        res.on("finish", () => {
            recordDeviceRequestLog({
                eventType,
                req,
                statusCode: res.statusCode,
                deviceCode: getDeviceCode(req),
                deviceTypeId: getDeviceTypeId(req),
                topic: getTopic(req),
            });
        });
        next();
    };
}
