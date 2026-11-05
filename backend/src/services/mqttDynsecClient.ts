import crypto from "crypto";
import { connectAsync, MqttClient, IClientOptions } from "mqtt";

export const DYNSEC_TOPIC = "$CONTROL/dynamic-security/v1";
export type DynsecCommand = { command: string; [key: string]: unknown };
export type DynsecReply = { command: string; error?: string; data?: any; correlationData?: string };

export class MqttDynsecClient {
    private client?: MqttClient;
    private connecting?: Promise<MqttClient>;
    private closed = false;
    private pending = new Map<string, { resolve: (value: DynsecReply) => void; reject: (error: Error) => void }>();

    constructor(private readonly url: string, private readonly options: IClientOptions) {
        const protocol = new URL(url).protocol;
        if (protocol !== "mqtt:" && protocol !== "mqtts:") throw new Error("Invalid Dynamic Security MQTT URL");
    }

    private async connection(): Promise<MqttClient> {
        if (this.closed) throw new Error("Dynamic Security client is closed");
        if (this.client?.connected) return this.client;
        if (this.connecting) return this.connecting;
        this.connecting = (async () => {
            const client = await connectAsync(this.url, {
                ...this.options, clean: true, reconnectPeriod: 0, connectTimeout: 5000,
                clientId: `dp-dynsec-${crypto.randomUUID()}`, rejectUnauthorized: true,
            });
            client.on("error", () => {});
            client.on("close", () => {
                if (this.client === client) this.client = undefined;
                for (const request of this.pending.values()) request.reject(new Error("Dynamic Security disconnected"));
                this.pending.clear();
            });
            client.on("message", (topic, payload) => {
                if (topic !== `${DYNSEC_TOPIC}/response`) return;
                try {
                    const responses = JSON.parse(payload.toString()).responses;
                    if (!Array.isArray(responses)) return;
                    for (const response of responses) {
                        const pending = this.pending.get(response.correlationData);
                        if (pending) pending.resolve(response);
                    }
                } catch { /* Ignore unrelated/malformed control messages. */ }
            });
            try {
                const grants = await client.subscribeAsync(`${DYNSEC_TOPIC}/response`, { qos: 1 });
                if (grants.some((grant) => Number(grant.qos) > 2)) throw new Error("Control subscription denied");
                this.client = client;
                return client;
            } catch (error) {
                await client.endAsync(true);
                throw error;
            }
        })();
        try { return await this.connecting; } finally { this.connecting = undefined; }
    }

    async request(command: DynsecCommand, allowMissing = false): Promise<DynsecReply> {
        const client = await this.connection();
        const correlationData = crypto.randomUUID();
        let timer: NodeJS.Timeout;
        const response = new Promise<DynsecReply>((resolve, reject) => {
            this.pending.set(correlationData, { resolve, reject });
            timer = setTimeout(() => reject(new Error("Dynamic Security response timeout")), 5000);
        });
        try {
            const [, reply] = await Promise.all([
                client.publishAsync(DYNSEC_TOPIC, JSON.stringify({ commands: [{ ...command, correlationData }] }), { qos: 1, retain: false }),
                response,
            ]);
            if (reply.command !== command.command) throw new Error("Invalid Dynamic Security response");
            if (reply.error && !(allowMissing && /^(Client|Role) not found$/i.test(reply.error))) {
                // Never log the request: setClientPassword contains a credential.
                throw new Error(`Dynamic Security ${command.command} failed: ${reply.error}`);
            }
            return reply;
        } finally {
            clearTimeout(timer!);
            this.pending.delete(correlationData);
        }
    }

    async close() {
        this.closed = true;
        if (this.connecting) await this.connecting.catch(() => undefined);
        await this.client?.endAsync(true);
        this.client = undefined;
    }
}
