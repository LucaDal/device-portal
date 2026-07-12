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
