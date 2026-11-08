import {
    DeviceDashboardError,
    buildDeviceDashboardWidgetAction,
    getDeviceDashboardWidgets,
} from "../services/deviceDashboardService";
import { getDeviceTypeWidgets, saveDeviceTypeWidgets } from "../services/deviceTypeWidgetsService";
import { publishForAuthenticatedUser } from "./mqttController";

function sendDashboardError(res: any, error: unknown) {
    if (error instanceof DeviceDashboardError) {
        return res.status(error.status).send({ error: error.message });
    }
    console.error(error);
    return res.status(500).send({ error: "Device dashboard operation failed" });
}

export const DeviceDashboardController = {
    list(req: any, res: any) {
        try {
            return res.send(getDeviceDashboardWidgets(String(req.params.code || "").trim(), req.user));
        } catch (error) {
            return sendDashboardError(res, error);
        }
    },

    typeConfiguration(req: any, res: any) {
        try { return res.send(getDeviceTypeWidgets(String(req.params.id || "").trim(), req.user)); }
        catch (error) { return sendDashboardError(res, error); }
    },

    updateTypeConfiguration(req: any, res: any) {
        try {
            const result = saveDeviceTypeWidgets(
                String(req.params.id || "").trim(),
                req.body?.widgets,
                req.body?.revision,
                req.user
            );
            return res.send(result);
        } catch (error) {
            return sendDashboardError(res, error);
        }
    },

    async runAction(req: any, res: any) {
        try {
            const action = buildDeviceDashboardWidgetAction(
                String(req.params.code || "").trim(),
                String(req.params.widgetId || "").trim(),
                req.body || {},
                req.user
            );
            const result = await publishForAuthenticatedUser(action.publish, req.user);
            if (!result.ok) {
                return res.status(result.status).send(result.body);
            }
            return res.send({
                ...result.body,
                widgetId: req.params.widgetId,
                status: "published",
            });
        } catch (error) {
            return sendDashboardError(res, error);
        }
    },
};
