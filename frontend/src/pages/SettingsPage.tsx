import { FormEvent, useEffect, useState } from "react";
import { changePassword } from "../auth/authService";
import { useAuth } from "../auth/AuthContext";
import { apiFetchWithAuth } from "../api/apiClient";
import { ROLES } from "@shared/constants/auth";
import { MqttBrokerSettings } from "@shared/types/mqtt_publish";
import "../style/SinglePanelPage.css";

const SettingsPage: React.FC = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === ROLES.ADMIN;
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [mqttSettings, setMqttSettings] = useState<MqttBrokerSettings>({
        host: "",
        port: 1883,
        protocol: "mqtt",
        username: "",
        password: "",
        clientIdPrefix: "device-portal-api",
    });
    const [mqttLoading, setMqttLoading] = useState(false);
    const [mqttSaving, setMqttSaving] = useState(false);

    useEffect(() => {
        if (!isAdmin) return;
        const load = async () => {
            try {
                setMqttLoading(true);
                const data = await apiFetchWithAuth<MqttBrokerSettings>("/manage/settings/mqtt", {
                    method: "GET",
                });
                setMqttSettings(data);
            } catch (err: any) {
                setError(err?.error || "Could not load MQTT settings");
            } finally {
                setMqttLoading(false);
            }
        };
        load();
    }, [isAdmin]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        if (newPassword.length < 10) {
            setError("The new password must be at least 10 characters long.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        try {
            setSaving(true);
            await changePassword({ currentPassword, newPassword });
            setSuccess("Password updated successfully.");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (err: any) {
            setError(err?.error || "Could not update password");
        } finally {
            setSaving(false);
        }
    };

    const handleMqttSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!isAdmin) return;
        setError(null);
        setSuccess(null);
        try {
            setMqttSaving(true);
            const saved = await apiFetchWithAuth<MqttBrokerSettings>("/manage/settings/mqtt", {
                method: "PUT",
                body: JSON.stringify(mqttSettings),
            });
            setMqttSettings(saved);
            setSuccess("MQTT settings updated successfully.");
        } catch (err: any) {
            setError(err?.error || "Could not update MQTT settings");
        } finally {
            setMqttSaving(false);
        }
    };

    return (
        <div className="single-page">
            <header className="single-page-header">
                <h1>Settings</h1>
                <p>Manage your account settings.</p>
            </header>

            <section className="dt-card single-page-card">
                <h2>Change password</h2>
                {error && <div className="dt-alert dt-alert-error">{error}</div>}
                {success && <div className="dt-alert dt-alert-success">{success}</div>}

                <form className="dt-form" onSubmit={handleSubmit}>
                    <div className="dt-form-group">
                        <label htmlFor="settings-current-password">Current password</label>
                        <input
                            id="settings-current-password"
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                        />
                    </div>

                    <div className="dt-form-group">
                        <label htmlFor="settings-new-password">New password</label>
                        <input
                            id="settings-new-password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                        />
                    </div>

                    <div className="dt-form-group">
                        <label htmlFor="settings-confirm-password">Confirm new password</label>
                        <input
                            id="settings-confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button type="submit" className="dt-btn dt-btn-primary" disabled={saving}>
                        {saving ? "Saving..." : "Update password"}
                    </button>
                </form>
            </section>

            {isAdmin && (
                <section className="dt-card single-page-card">
                    <h2>MQTT Broker Settings</h2>
                    {mqttLoading ? (
                        <p className="dt-small">Loading settings...</p>
                    ) : (
                        <form className="dt-form" onSubmit={handleMqttSubmit}>
                            <div className="dt-form-group">
                                <label htmlFor="mqtt-host">Host</label>
                                <input
                                    id="mqtt-host"
                                    type="text"
                                    value={mqttSettings.host}
                                    onChange={(e) => setMqttSettings((prev) => ({ ...prev, host: e.target.value }))}
                                    required
                                />
                            </div>
                            <div className="dt-form-group">
                                <label htmlFor="mqtt-port">Port</label>
                                <input
                                    id="mqtt-port"
                                    type="number"
                                    min={1}
                                    max={65535}
                                    value={mqttSettings.port}
                                    onChange={(e) =>
                                        setMqttSettings((prev) => ({
                                            ...prev,
                                            port: Number(e.target.value) || 1883,
                                        }))
                                    }
                                    required
                                />
                            </div>
                            <div className="dt-form-group">
                                <label htmlFor="mqtt-protocol">Protocol</label>
                                <select
                                    id="mqtt-protocol"
                                    value={mqttSettings.protocol}
                                    onChange={(e) =>
                                        setMqttSettings((prev) => ({
                                            ...prev,
                                            protocol: e.target.value as "mqtt" | "mqtts",
                                        }))
                                    }
                                >
                                    <option value="mqtt">mqtt</option>
                                    <option value="mqtts">mqtts</option>
                                </select>
                            </div>
                            <div className="dt-form-group">
                                <label htmlFor="mqtt-username">Username</label>
                                <input
                                    id="mqtt-username"
                                    type="text"
                                    value={mqttSettings.username}
                                    onChange={(e) =>
                                        setMqttSettings((prev) => ({ ...prev, username: e.target.value }))
                                    }
                                />
                            </div>
                            <div className="dt-form-group">
                                <label htmlFor="mqtt-password">Password</label>
                                <input
                                    id="mqtt-password"
                                    type="password"
                                    value={mqttSettings.password}
                                    onChange={(e) =>
                                        setMqttSettings((prev) => ({ ...prev, password: e.target.value }))
                                    }
                                />
                            </div>
                            <div className="dt-form-group">
                                <label htmlFor="mqtt-client-prefix">Client ID prefix</label>
                                <input
                                    id="mqtt-client-prefix"
                                    type="text"
                                    value={mqttSettings.clientIdPrefix}
                                    onChange={(e) =>
                                        setMqttSettings((prev) => ({ ...prev, clientIdPrefix: e.target.value }))
                                    }
                                />
                            </div>

                            <button type="submit" className="dt-btn dt-btn-primary" disabled={mqttSaving}>
                                {mqttSaving ? "Saving..." : "Save MQTT settings"}
                            </button>
                        </form>
                    )}
                </section>
            )}
        </div>
    );
};

export default SettingsPage;
