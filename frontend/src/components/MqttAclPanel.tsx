import { useEffect, useState } from "react";
import { MqttDeviceAclView, MqttDynsecStatus, MqttUserAclRule } from "@shared/types/mqtt";
import { apiFetchWithAuth } from "../api/apiClient";
import ErrorBanner from "./ErrorBanner";

type DeviceOption = { code: string };
type UserOption = { id: number; email: string };

export default function MqttAclPanel() {
    const [devices, setDevices] = useState<DeviceOption[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [subject, setSubject] = useState("");
    const [status, setStatus] = useState<MqttDynsecStatus | null>(null);
    const [deviceAcl, setDeviceAcl] = useState<MqttDeviceAclView | null>(null);
    const [userAcl, setUserAcl] = useState<MqttUserAclRule[]>([]);
    const [refresh, setRefresh] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        setDeviceAcl(null);
        setUserAcl([]);
        void Promise.all([
            apiFetchWithAuth<DeviceOption[]>("/devices"),
            apiFetchWithAuth<UserOption[]>("/manage/users"),
            apiFetchWithAuth<MqttDynsecStatus>("/mqtt/admin/dynsec"),
            subject.startsWith("device:")
                ? apiFetchWithAuth<MqttDeviceAclView>(`/mqtt/admin/dynsec/${encodeURIComponent(subject.slice(7))}/acl`)
                : subject.startsWith("user:")
                    ? apiFetchWithAuth<MqttUserAclRule[]>(`/manage/users/${subject.slice(5)}/mqtt-acl`)
                    : Promise.resolve(null),
        ]).then(([nextDevices, nextUsers, nextStatus, acl]) => {
            if (cancelled) return;
            setDevices(nextDevices);
            setUsers(nextUsers);
            setStatus(nextStatus);
            if (Array.isArray(acl)) setUserAcl(acl);
            else setDeviceAcl(acl);
        }).catch((failure) => {
            if (!cancelled) setError(failure?.error || "Could not load MQTT diagnostics");
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [subject, refresh]);

    return <section className="dt-card single-page-card settings-panel">
        <div className="dt-form-header"><div>
            <h2>MQTT ACL and synchronization</h2>
            <p className="dt-small settings-section-copy">Inspect device broker permissions and user portal permissions.</p>
        </div></div>
        <ErrorBanner message={error} variant="error" onDismiss={() => setError(null)} />
        <div className="settings-actions">
            <button type="button" className="dt-btn dt-btn-outline" disabled={loading} onClick={() => setRefresh(refresh + 1)}>
                {loading ? "Loading…" : "Refresh"}
            </button>
        </div>
        {status && <div className="settings-highlight-row">
            <strong>{status.enabled ? `Dynamic Security · ${status.jobs.length} pending jobs` : "External broker · portal ACL only"}</strong>
            {status.jobs.map((job) => <p className="dt-small" key={job.deviceCode}>
                {job.deviceCode}: {job.attempts} retries{job.lastError ? ` · ${job.lastError}` : " · queued"}
                {job.attempts > 0 && ` · next retry ${new Date(job.nextAttemptAt).toLocaleString()}`}
            </p>)}
        </div>}
        <div className="dt-form-group">
            <label htmlFor="mqtt-acl-subject">Device or user</label>
            <select id="mqtt-acl-subject" value={subject} onChange={(event) => setSubject(event.target.value)}>
                <option value="">Select…</option>
                <optgroup label="Devices">{devices.map((device) => <option key={device.code} value={`device:${device.code}`}>{device.code}</option>)}</optgroup>
                <optgroup label="Users">{users.map((user) => <option key={user.id} value={`user:${user.id}`}>{user.email}</option>)}</optgroup>
            </select>
        </div>
        {deviceAcl && <>
            <ErrorBanner message={deviceAcl.brokerError} variant="error" />
            {deviceAcl.enabled && !deviceAcl.brokerError && <p className="dt-small">
                Broker identity: {deviceAcl.clientEnabled === null ? "not provisioned" : deviceAcl.clientEnabled ? "enabled" : "disabled"}.
            </p>}
            {deviceAcl.job && <p className="dt-small">Synchronization pending. Applied broker ACLs may differ from the expected permissions.</p>}
            {[{ title: "Expected device ACL", rows: deviceAcl.expected },
                ...(deviceAcl.applied !== null ? [{ title: "Applied broker ACL", rows: deviceAcl.applied }] : [])].map(({ title, rows }) => (
                <div className="settings-group" key={title}>
                    <div className="settings-group-header"><h3>{title}</h3></div>
                    {rows.length === 0 ? <p className="dt-small">No permissions.</p> : <div className="settings-acl-table"><table>
                        <thead><tr><th>Topic</th><th>Action</th><th>Permission</th><th>Priority</th></tr></thead>
                        <tbody>{rows.map((acl) => <tr key={`${acl.acltype}:${acl.topic}`}>
                            <td><code>{acl.topic}</code></td><td>{acl.acltype}</td><td>{acl.allow ? "allow" : "deny"}</td><td>{acl.priority}</td>
                        </tr>)}</tbody>
                    </table></div>}
                </div>
            ))}
        </>}
        {subject.startsWith("user:") && !loading && <div className="settings-group">
            <div className="settings-group-header"><h3>User portal ACL</h3>
                <p className="dt-small">Permissions used by publish actions and the realtime stream.</p></div>
            {userAcl.length === 0 ? <p className="dt-small">No permissions.</p> : <div className="settings-acl-table"><table>
                <thead><tr><th>Topic</th><th>Action</th><th>Permission</th><th>Device / source</th></tr></thead>
                <tbody>{userAcl.map((acl) => <tr key={acl.id}>
                    <td><code>{acl.topic_pattern}</code></td><td>{acl.action}</td><td>{acl.permission}</td><td>{acl.source_device_code} / {acl.source_key || acl.source}</td>
                </tr>)}</tbody>
            </table></div>}
        </div>}
    </section>;
}
