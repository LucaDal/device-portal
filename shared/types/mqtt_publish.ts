export interface MqttEndpoint {
    host: string;
    port: number;
    protocol: "mqtt" | "mqtts";
}

export interface MqttBrokerSettings extends MqttEndpoint {
    username: string;
    password: string;
    caFile: string;
    clientCertFile: string;
    clientKeyFile: string;
}

export interface MqttPublishInput {
    topic: string;
    content: Record<string, unknown> | unknown[];
}

export interface MqttBrokerSettingsView {
    connection: Omit<MqttBrokerSettings, "password"> | null;
    passwordSet: boolean;
    dynamicSecurity: boolean;
    publicEndpoint: MqttEndpoint | null;
}
