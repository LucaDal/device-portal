export interface MqttBrokerSettings {
    host: string;
    port: number;
    protocol: "mqtt" | "mqtts";
    username: string;
    password: string;
    clientIdPrefix: string;
    allowInsecureTls: boolean;
    caFile: string;
    clientCertFile: string;
    clientKeyFile: string;
}

export interface MqttPublishInput {
    topic: string;
    content: Record<string, unknown> | unknown[];
}

export const DEFAULT_MQTT_BROKER_SETTINGS: MqttBrokerSettings = {
    host: "", port: 1883, protocol: "mqtt", username: "", password: "",
    clientIdPrefix: "device-portal-api", allowInsecureTls: false,
    caFile: "", clientCertFile: "", clientKeyFile: "",
};

export interface MqttBrokerSettingsView extends Omit<MqttBrokerSettings, "password"> {
    passwordSet: boolean;
    passwordError?: string;
    managed: boolean;
    mode: "dynamic-security" | "standalone";
}
