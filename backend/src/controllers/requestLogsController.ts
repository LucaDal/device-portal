import { listDeviceRequestLogs } from "../services/deviceRequestLogService";

export const RequestLogsController = {
    list(req: any, res: any) {
        const eventType = String(req.query?.eventType || "").trim();
        const deviceCode = String(req.query?.deviceCode || "").trim();
        const limit = Number(req.query?.limit || 100);

        return res.send(listDeviceRequestLogs({
            eventType: eventType || undefined,
            deviceCode: deviceCode || undefined,
            limit,
        }));
    },
};
