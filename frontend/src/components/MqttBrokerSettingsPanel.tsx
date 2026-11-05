import { FormEvent, useEffect, useState } from "react";
import { DEFAULT_MQTT_BROKER_SETTINGS, MqttBrokerSettings, MqttBrokerSettingsView } from "@shared/types/mqtt_publish";
import { apiFetchWithAuth } from "../api/apiClient";
import ErrorBanner from "./ErrorBanner";

type TextField = "host" | "username" | "clientIdPrefix" | "caFile" | "clientCertFile" | "clientKeyFile";

export default function MqttBrokerSettingsPanel() {
    const [view, setView] = useState<MqttBrokerSettingsView | null>(null);
    const [form, setForm] = useState<MqttBrokerSettings>({ ...DEFAULT_MQTT_BROKER_SETTINGS });
    const [clearPassword, setClearPassword] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    function applyView(next: MqttBrokerSettingsView) {
        setView(next);
        setForm({ ...DEFAULT_MQTT_BROKER_SETTINGS, ...next, password: "" });
        setClearPassword(false);
    }

    useEffect(() => {
        let cancelled = false;
        void apiFetchWithAuth<MqttBrokerSettingsView>("/manage/settings/mqtt", { method: "GET" })
            .then((data) => { if (!cancelled) applyView(data); })
            .catch((failure) => { if (!cancelled) setError(failure?.error || "Could not load broker settings"); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!view || view.managed) return;
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            const next = await apiFetchWithAuth<MqttBrokerSettingsView>("/manage/settings/mqtt", {
                method: "PUT",
                body: JSON.stringify({ ...form, password: clearPassword ? null : form.password || undefined }),
            });
            applyView(next);
            setSaved(true);
        } catch (failure: any) {
            setError(failure?.error || "Could not save broker settings");
        } finally { setSaving(false); }
    }

    function textField(key: TextField, label: string, help?: string) {
        return <div className="dt-form-group">
            <label htmlFor={"broker-" + key}>{label}</label>
            <input id={"broker-" + key} value={form[key]} required={key === "host"}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
            {help && <small className="dt-small">{help}</small>}
        </div>;
    }

    return (
        <section className="dt-card single-page-card settings-panel">
            <div className="dt-form-header"><div>
                <h2>MQTT broker settings</h2>
                <p className="dt-small settings-section-copy">Connection details, authentication, and TLS material used by the portal.</p>
            </div></div>
            <ErrorBanner message={error} variant="error" onDismiss={() => setError(null)} />
            <ErrorBanner message={view?.passwordError} variant="error" />
            {saved && <ErrorBanner message="Broker settings saved" variant="success" />}
            {loading ? <p>Loading broker settings…</p> : view && (
                <form className="dt-form settings-stack" onSubmit={submit}>
                    {view.managed && <div className="settings-highlight-row">
                        <strong>Dynamic Security</strong>
                        <p className="dt-small">{view.protocol}://{view.host}:{view.port} · {view.username}</p>
                        <p className="dt-small">The broker connection is managed by the deployment.</p>
                    </div>}
                    {!view.managed && <fieldset disabled={saving} className="mqtt-settings-fields settings-stack">
                        <section className="settings-group">
                            <div className="settings-group-header"><h3>Broker connection</h3>
                                <p className="dt-small">Network endpoint and transport protocol.</p></div>
                            <div className="settings-form-grid">
                                {textField("host", "Host")}
                                <div className="dt-form-group">
                                    <label htmlFor="broker-port">Port</label>
                                    <input id="broker-port" type="number" min={1} max={65535} required value={form.port}
                                        onChange={(event) => setForm({ ...form, port: Number(event.target.value) })} />
                                </div>
                                <div className="dt-form-group">
                                    <label htmlFor="broker-protocol">Protocol</label>
                                    <select id="broker-protocol" value={form.protocol}
                                        onChange={(event) => setForm({ ...form, protocol: event.target.value as "mqtt" | "mqtts" })}>
                                        <option value="mqtt">MQTT (private network)</option>
                                        <option value="mqtts">MQTT over TLS</option>
                                    </select>
                                </div>
                            </div>
                        </section>
                        <section className="settings-group">
                            <div className="settings-group-header"><h3>Authentication</h3>
                                <p className="dt-small">Credentials used by the portal server.</p></div>
                            <div className="settings-form-grid">
                                {textField("username", "Username")}
                                <div className="dt-form-group">
                                    <label htmlFor="broker-password">New broker password</label>
                                    <input id="broker-password" type="password" autoComplete="new-password" value={form.password}
                                        required={Boolean(view.passwordError) && !clearPassword}
                                        disabled={clearPassword} placeholder={view.passwordSet ? "Stored password — leave blank to keep" : "Optional"}
                                        onChange={(event) => setForm({ ...form, password: event.target.value })} />
                                    {view.passwordSet && <label className="dt-checkbox">
                                        <input type="checkbox" checked={clearPassword} onChange={(event) => setClearPassword(event.target.checked)} />
                                        Remove stored password
                                    </label>}
                                </div>
                            </div>
                        </section>
                        <section className="settings-group">
                            <div className="settings-group-header"><h3>TLS and certificates</h3>
                                <p className="dt-small">A custom CA is optional: trusted server certificates use the system trust store.</p></div>
                            <div className="settings-form-grid">
                                {textField("caFile", "CA file path", "Optional, for a private certificate authority.")}
                                {textField("clientCertFile", "Client certificate path", "Optional; provide together with the client key.")}
                                {textField("clientKeyFile", "Client key path")}
                            </div>
                            <label className="dt-checkbox">
                                <input type="checkbox" checked={form.allowInsecureTls}
                                    onChange={(event) => setForm({ ...form, allowInsecureTls: event.target.checked })} />
                                Allow insecure TLS (skip server certificate validation)
                            </label>
                        </section>
                        <section className="settings-group">
                            <div className="settings-group-header"><h3>Client identity</h3>
                                <p className="dt-small">Prefix used to build the MQTT client identifier.</p></div>
                            {textField("clientIdPrefix", "Client ID prefix")}
                        </section>
                    </fieldset>}
                    {!view.managed && <div className="settings-actions">
                        <button className="dt-btn dt-btn-primary" type="submit" disabled={saving}>
                            {saving ? "Saving…" : "Save MQTT settings"}
                        </button>
                    </div>}
                </form>
            )}
        </section>
    );
}
