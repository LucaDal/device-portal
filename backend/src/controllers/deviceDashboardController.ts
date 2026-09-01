import {
    DeviceDashboardError,
    buildDeviceDashboardWidgetAction,
    getDeviceDashboardWidgets,
    saveDeviceDashboardWidgets,
} from "../services/deviceDashboardService";
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

    update(req: any, res: any) {
        try {
            const result = saveDeviceDashboardWidgets(
                String(req.params.code || "").trim(),
                req.body?.widgets,
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
                ...(typeof action.state === "boolean" ? { state: action.state } : {}),
            });
        } catch (error) {
            return sendDashboardError(res, error);
        }
    },
};
