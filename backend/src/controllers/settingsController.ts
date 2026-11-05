import { brokerSettingsView, saveBrokerSettings } from "../utils/mqttBrokerSettings";
import { dynsecEnabled } from "../utils/mqttConfiguration";

export const SettingsController = {
    getMqttBrokerSettings(_req: any, res: any) {
        try {
            return res.send(brokerSettingsView());
        } catch {
            return res.status(503).send({ error: "MQTT broker settings unavailable" });
        }
    },

    upsertMqttBrokerSettings(req: any, res: any) {
        if (dynsecEnabled()) return res.status(409).send({ error: "Broker settings are managed by the deployment" });
        try {
            return res.send(saveBrokerSettings(req.body || {}));
        } catch (error) {
            return res.status(400).send({ error: error instanceof Error ? error.message : "Invalid MQTT settings" });
        }
    },
};
