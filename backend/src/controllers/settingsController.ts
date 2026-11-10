import { brokerSettingsView } from "../utils/mqttBrokerSettings";

export const SettingsController = {
    getMqttBrokerSettings(_req: any, res: any) {
        try {
            return res.send(brokerSettingsView());
        } catch {
            return res.status(503).send({ error: "MQTT environment configuration is invalid; check the server .env" });
        }
    },
};
