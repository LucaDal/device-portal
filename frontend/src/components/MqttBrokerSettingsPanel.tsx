import { useEffect, useState } from "react";
import { MqttBrokerSettingsView } from "@shared/types/mqtt_publish";
import { apiFetchWithAuth } from "../api/apiClient";
import ErrorBanner from "./ErrorBanner";

export default function MqttBrokerSettingsPanel() {
    const [view, setView] = useState<MqttBrokerSettingsView | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void apiFetchWithAuth<MqttBrokerSettingsView>("/manage/settings/mqtt", { method: "GET" })
            .then((data) => { if (!cancelled) setView(data); })
            .catch((failure) => { if (!cancelled) setError(failure?.error || "Could not load MQTT configuration"); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    return <section className="dt-card single-page-card settings-panel">
        <div className="dt-form-header"><div>
            <h2>MQTT configuration</h2>
            <p className="dt-small">Configured exclusively through the server environment.</p>
        </div></div>
        <ErrorBanner message={error} variant="error" onDismiss={() => setError(null)} />
        {loading ? <p>Loading MQTT configuration…</p> : view && <div className="settings-highlight-row">
            <div className="settings-form-grid">
                <div>
                    <h3>Portal connection</h3>
                    {view.connection ? <>
                        <p className="dt-small">{view.connection.protocol}://{view.connection.host}:{view.connection.port}</p>
                        <p className="dt-small">Username: {view.connection.username || "Not configured"}</p>
                        <p className="dt-small">{view.passwordSet ? "Password supplied by the environment." : "No broker password configured."}</p>
                        {view.connection.protocol === "mqtts" && <p className="dt-small">TLS certificate verification is enabled.</p>}
                    </> : <p className="dt-small" role="alert">Set MQTT_BROKER_URL in the server .env.</p>}
                </div>
                <div>
                    <h3>Device connection</h3>
                    {view.publicEndpoint
                        ? <p className="dt-small">{view.publicEndpoint.protocol}://{view.publicEndpoint.host}:{view.publicEndpoint.port}</p>
                        : <p className="dt-small">Public endpoint not configured. Check MQTT_PUBLIC_HOST and any custom public port.</p>}
                    <p className="dt-small">Dynamic Security: {view.dynamicSecurity ? "enabled" : "disabled"}</p>
                </div>
            </div>
            <p className="dt-small">Update .env and recreate the API container to change these values.</p>
        </div>}
    </section>;
}
