import crypto from "crypto";
import fs from "fs";
import { deleteDeviceCredentials, enqueueDynsecDevice, enqueueAllDynsecDevices,
    listDueDynsecJobs, completeDynsecJob, retryDynsecJob } from "../repositories/mqttDynsecRepository";
import { listDeviceAclRules } from "../repositories/mqttAclRepository";
export { enqueueAllDynsecDevices } from "../repositories/mqttDynsecRepository";
import { MqttDynsecClient } from "./mqttDynsecClient";
import { readMqttSecret } from "../utils/mqttSecrets";
import { dynsecEnabled, dynsecConnection } from "../utils/mqttConfiguration";
import { getMqttDevicePassword, mqttDeviceRole, mqttDeviceUsername } from "./mqttDeviceCredentials";
import { getDeviceMqttState } from "./deviceMqttPolicy";

export type DynsecAcl = { acltype: string; topic: string; allow: boolean; priority: number };
type Rule = { action: string; topic_pattern: string; permission: string; priority: number };

const DATA_ACL_TYPES = ["publishClientSend", "publishClientReceive", "subscribePattern"];

function systemTopicDenials(): DynsecAcl[] {
    return DATA_ACL_TYPES.flatMap((acltype) => ["$CONTROL/#", "$SYS/#"].map((topic) => ({
        acltype, topic, allow: false, priority: 100000,
    })));
}

export function buildDynsecAcls(code: string, rules: Rule[]): DynsecAcl[] {
    if (!code || /[+#\u0000]/.test(code)) throw new Error("Invalid MQTT device code");
    const result = systemTopicDenials();
    const seen = new Set(result.map((acl) => `${acl.acltype}:${acl.topic}`));
    const add = (acltype: string, topic: string, allow: boolean, priority: number) => {
        const key = `${acltype}:${topic}`;
        // Mosquitto accepts one ACL for each (type, topic); the first DB rule wins.
        if (!seen.has(key)) { result.push({ acltype, topic, allow, priority }); seen.add(key); }
    };
    const ordered = [...rules].sort((a, b) => a.priority - b.priority);
    if (ordered.length > 40000) throw new Error("Too many MQTT ACL rules");
    ordered.forEach((rule, index) => {
        if (!["publish", "subscribe", "all"].includes(rule.action) ||
            !["allow", "deny"].includes(rule.permission) || !rule.topic_pattern ||
            rule.topic_pattern.includes("\u0000") || /(^|\/)%(c|u)(\/|$)/.test(rule.topic_pattern)) {
            throw new Error("Invalid MQTT ACL rule");
        }
        const allow = rule.permission === "allow";
        const priority = 50000 - index;
        if (rule.action !== "subscribe") add("publishClientSend", rule.topic_pattern, allow, priority);
        if (rule.action !== "publish") {
            add("subscribePattern", rule.topic_pattern, allow, priority);
            add("publishClientReceive", rule.topic_pattern, allow, priority);
        }
    });
    for (const type of DATA_ACL_TYPES) add(type, "#", false, 0);
    add("unsubscribePattern", "#", true, 0);
    return result;
}

function canonicalAcls(acls: DynsecAcl[]): string {
    return JSON.stringify(acls.map(({ acltype, topic, allow, priority }) =>
        [acltype, topic, allow, priority]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}

export class MqttDynsecService {
    private timer?: NodeJS.Timeout;
    private running = false;
    private stopped = false;
    private lastReconcile = 0;
    private lastErrorLog = 0;

    constructor(private readonly control: MqttDynsecClient) {}

    private async identity(username: string, rolename: string, password: string,
        acls: DynsecAcl[], enabled: boolean, clientid?: string) {
        const existing = (await this.control.request({ command: "getClient", username }, true)).data?.client;
        const role = (await this.control.request({ command: "getRole", rolename }, true)).data?.role;
        const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ password, acls, clientid })).digest("hex");
        const rolesMatch = existing?.roles?.length === 1 && existing.roles[0].rolename === rolename;
        if (existing?.textdescription === `device-portal:${fingerprint}` &&
            Boolean(existing.disabled) === !enabled && rolesMatch &&
            !(existing.groups?.length) && (existing.clientid || "") === (clientid || "") &&
            role && canonicalAcls(role.acls || []) === canonicalAcls(acls)) return;

        // Disconnect first. Partial failures leave the identity disabled, never half-authorized.
        if (existing) {
            await this.control.request({ command: "disableClient", username });
            for (const group of existing.groups || []) {
                await this.control.request({ command: "removeGroupClient", username, groupname: group.groupname });
            }
        } else {
            await this.control.request({ command: "createClient", username });
            await this.control.request({ command: "disableClient", username });
        }
        await this.control.request({ command: role ? "modifyRole" : "createRole", rolename, acls });
        await this.control.request({ command: "modifyClient", username, password, clientid: clientid || "",
            roles: [{ rolename, priority: 0 }], textdescription: `device-portal:${fingerprint}` });
        if (enabled) await this.control.request({ command: "enableClient", username });
    }

    async syncDevice(code: string) {
        const username = mqttDeviceUsername(code);
        const rolename = mqttDeviceRole(code);
        const device = getDeviceMqttState(code);
        if (!device || !device.mqtt_enabled || !device.type_mqtt_enabled) {
            // Tombstones also survive a broker outage followed by API restart.
            await this.control.request({ command: "deleteClient", username }, true);
            await this.control.request({ command: "deleteRole", rolename }, true);
            deleteDeviceCredentials(code);
            return;
        }
        if (!device.mqtt_available) {
            await this.control.request({ command: "disableClient", username }, true);
            return;
        }
        try {
            const password = getMqttDevicePassword(code);
            const rules = listDeviceAclRules(code);
            await this.identity(username, rolename, password, buildDynsecAcls(code, rules), true, code);
        } catch (error) {
            await this.control.request({ command: "disableClient", username }, true);
            throw error;
        }
    }

    async syncBackend() {
        const { backendUsername: username, controlUsername } = dynsecConnection();
        if (username.startsWith("dp-device:") || username === controlUsername) {
            throw new Error("Backend and control MQTT accounts must be distinct");
        }
        const acls = systemTopicDenials();
        for (const type of DATA_ACL_TYPES) {
            acls.push({ acltype: type, topic: "#", allow: true, priority: 1 });
        }
        acls.push({ acltype: "unsubscribePattern", topic: "#", allow: true, priority: 0 });
        await this.identity(username, "dp-backend", readMqttSecret("MQTT_DYNSEC_BACKEND_PASSWORD"), acls, true);
    }

    async reconcileBrokerState() {
        enqueueAllDynsecDevices();
        // A restored broker backup may contain clients already deleted from SQLite.
        const reply = await this.control.request({ command: "listClients", verbose: false });
        const clients = reply.data?.clients;
        if (!Array.isArray(clients)) throw new Error("Invalid Dynamic Security client list");
        for (const username of clients) {
            if (typeof username === "string" && username.startsWith("dp-device:")) {
                enqueueDynsecDevice(username.slice("dp-device:".length));
            }
        }
    }

    async drain() {
        if (this.running || this.stopped) return;
        this.running = true;
        try {
            if (Date.now() - this.lastReconcile > 60000) {
                await this.syncBackend();
                await this.reconcileBrokerState();
                this.lastReconcile = Date.now();
            }
            const jobs = listDueDynsecJobs(Date.now());
            for (const job of jobs) {
                if (this.stopped) break;
                try {
                    await this.syncDevice(job.device_code);
                    completeDynsecJob(job.device_code, job.revision);
                } catch {
                    const delay = Math.min(60000, 1000 * 2 ** Math.min(job.attempts, 6));
                    retryDynsecJob(job.device_code, job.revision, Date.now() + delay);
                }
            }
        } finally { this.running = false; }
    }

    start() {
        const tick = () => this.drain().catch(() => {
            if (Date.now() - this.lastErrorLog >= 60000) {
                console.error("Dynamic Security unavailable; synchronization will retry");
                this.lastErrorLog = Date.now();
            }
        });
        void tick();
        this.timer = setInterval(tick, 1000);
        this.timer.unref();
    }

    async stop() {
        this.stopped = true;
        clearInterval(this.timer);
        await this.control.close();
    }
}

function createControlClient(): MqttDynsecClient {
    const { url, caFile, controlUsername } = dynsecConnection();
    return new MqttDynsecClient(url, {
        username: controlUsername,
        password: readMqttSecret("MQTT_DYNSEC_PASSWORD"),
        ...(caFile ? { ca: fs.readFileSync(caFile) } : {}),
    });
}

export async function inspectDeviceDynsecAcls(code: string) {
    const client = createControlClient();
    try {
        const reply = await client.request({ command: "getRole", rolename: mqttDeviceRole(code) }, true);
        const identity = await client.request({ command: "getClient", username: mqttDeviceUsername(code) }, true);
        return { acls: (reply.data?.role?.acls || []) as DynsecAcl[],
            clientEnabled: identity.data?.client ? !identity.data.client.disabled : null };
    } finally { await client.close(); }
}

export function startMqttDynsecService(): MqttDynsecService | undefined {
    if (!dynsecEnabled()) return;
    const service = new MqttDynsecService(createControlClient());
    service.start();
    return service;
}
