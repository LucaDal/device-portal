import { FormEvent, useEffect, useMemo, useState } from "react";
import { changePassword } from "../auth/authService";
import { useAuth } from "../auth/AuthContext";
import { apiFetchWithAuth } from "../api/apiClient";
import { ROLES } from "@shared/constants/auth";
import { MqttBrokerSettings } from "@shared/types/mqtt_publish";
import ErrorBanner from "../components/ErrorBanner";
import "../style/SinglePanelPage.css";

type SettingsTab = "password" | "mqtt";
type BannerState = {
    message: string;
    variant: "error" | "success" | "info";
} | null;

const DEFAULT_MQTT_SETTINGS: MqttBrokerSettings = {
    host: "",
    port: 1883,
    protocol: "mqtt",
    username: "",
    password: "",
    clientIdPrefix: "device-portal-api",
    allowInsecureTls: false,
    caFile: "",
    clientCertFile: "",
    clientKeyFile: "",
};

const SettingsPage: React.FC = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === ROLES.ADMIN;
    const [activeTab, setActiveTab] = useState<SettingsTab>("password");

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [savingPassword, setSavingPassword] = useState(false);
    const [passwordBanner, setPasswordBanner] = useState<BannerState>(null);

    const [mqttSettings, setMqttSettings] = useState<MqttBrokerSettings>(DEFAULT_MQTT_SETTINGS);
    const [mqttLoading, setMqttLoading] = useState(false);
    const [mqttSaving, setMqttSaving] = useState(false);
    const [mqttBanner, setMqttBanner] = useState<BannerState>(null);

    const visibleTabs = useMemo(
        () => [
            {
                id: "password" as const,
                title: "Password",
                description: "Update your account credentials.",
            },
            ...(isAdmin
                ? [
                      {
                          id: "mqtt" as const,
                          title: "MQTT settings",
                          description: "Configure broker, TLS, and client identity.",
                      },
                  ]
                : []),
        ],
        [isAdmin]
    );

    useEffect(() => {
        if (!isAdmin) return;

        const load = async () => {
            try {
                setMqttLoading(true);
                setMqttBanner(null);
                const data = await apiFetchWithAuth<MqttBrokerSettings>("/manage/settings/mqtt", {
                    method: "GET",
                });
                setMqttSettings(data);
            } catch (err: any) {
                setMqttBanner({
                    message: err?.error || "Could not load MQTT settings.",
                    variant: "error",
                });
            } finally {
                setMqttLoading(false);
            }
        };

        void load();
    }, [isAdmin]);

    useEffect(() => {
        if (!isAdmin && activeTab === "mqtt") {
            setActiveTab("password");
        }
    }, [activeTab, isAdmin]);

    const handlePasswordSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setPasswordBanner(null);

        if (newPassword.length < 10) {
            setPasswordBanner({
                message: "The new password must be at least 10 characters long.",
                variant: "error",
            });
            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordBanner({
                message: "Passwords do not match.",
                variant: "error",
            });
            return;
        }

        try {
            setSavingPassword(true);
            await changePassword({ currentPassword, newPassword });
            setPasswordBanner({
                message: "Password updated successfully.",
                variant: "success",
            });
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (err: any) {
            setPasswordBanner({
                message: err?.error || "Could not update password.",
                variant: "error",
            });
        } finally {
            setSavingPassword(false);
        }
    };

    const handleMqttSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!isAdmin) return;

        setMqttBanner(null);

        if (
            mqttSettings.protocol === "mqtts" &&
            !mqttSettings.allowInsecureTls &&
            !mqttSettings.caFile.trim()
        ) {
            setMqttBanner({
                message: "CA file is required when protocol is mqtts.",
                variant: "error",
            });
            return;
        }

        if (
            (mqttSettings.clientCertFile.trim() && !mqttSettings.clientKeyFile.trim()) ||
            (!mqttSettings.clientCertFile.trim() && mqttSettings.clientKeyFile.trim())
        ) {
            setMqttBanner({
                message: "Client certificate and client key must be provided together.",
                variant: "error",
            });
            return;
        }

        try {
            setMqttSaving(true);
            const saved = await apiFetchWithAuth<MqttBrokerSettings>("/manage/settings/mqtt", {
                method: "PUT",
                body: JSON.stringify(mqttSettings),
            });
            setMqttSettings(saved);
            setMqttBanner({
                message: "MQTT settings updated successfully.",
                variant: "success",
            });
        } catch (err: any) {
            setMqttBanner({
                message: err?.error || "Could not update MQTT settings.",
                variant: "error",
            });
        } finally {
            setMqttSaving(false);
        }
    };

    return (
        <div className="single-page settings-page">
            <header className="dt-header single-page-header settings-hero">
                <span className="settings-eyebrow">Account and platform controls</span>
                <h1>Settings</h1>
                <p>
                    Personal access is always visible to the signed-in user. MQTT broker configuration is
                    shown only to administrators.
                </p>
                <div className="settings-role-chips">
                    <span className="dt-chip">Visible to all signed-in users</span>
                    {isAdmin && <span className="dt-chip">Admin-only broker controls</span>}
                </div>
            </header>

            <div className="dt-tabs single-page-tabs">
                {visibleTabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        className={`dt-btn settings-tab ${activeTab === tab.id ? "dt-btn-primary" : "dt-btn-outline"}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <span className="settings-tab-title">{tab.title}</span>
                        <span className="settings-tab-copy">{tab.description}</span>
                    </button>
                ))}
            </div>

            {activeTab === "password" && (
                <section className="dt-card single-page-card settings-panel">
                    <div className="dt-form-header">
                        <div>
                            <h2>Change password</h2>
                            <p className="dt-small settings-section-copy">
                                Keep your account password current and confirm the change before saving.
                            </p>
                        </div>
                    </div>
                    <ErrorBanner
                        message={passwordBanner?.message}
                        variant={passwordBanner?.variant}
                        title={passwordBanner?.variant === "success" ? "Password saved" : "Password update"}
                    />
                    <form className="dt-form" onSubmit={handlePasswordSubmit}>
                        <div className="settings-form-grid">
                            <div className="dt-form-group settings-span-full">
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
                                <small className="dt-small">Use at least 10 characters.</small>
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
                                <small className="dt-small">Must match the new password exactly.</small>
                            </div>
                        </div>

                        <div className="settings-actions">
                            <button type="submit" className="dt-btn dt-btn-primary" disabled={savingPassword}>
                                {savingPassword ? "Saving..." : "Update password"}
                            </button>
                        </div>
                    </form>
                </section>
            )}

            {isAdmin && activeTab === "mqtt" && (
                <section className="dt-card single-page-card settings-panel">
                    <div className="dt-form-header">
                        <div>
                            <h2>MQTT broker settings</h2>
                            <p className="dt-small settings-section-copy">
                                Connection details, authentication, and TLS material used by the publish bridge.
                            </p>
                        </div>
                    </div>

                    <ErrorBanner
                        message={mqttBanner?.message}
                        variant={mqttBanner?.variant}
                        title={mqttBanner?.variant === "success" ? "MQTT settings saved" : "MQTT settings"}
                    />

                    {mqttLoading ? (
                        <ErrorBanner
                            message="Broker settings are being loaded."
                            variant="info"
                            title="Loading"
                        />
                    ) : (
                        <form className="dt-form settings-stack" onSubmit={handleMqttSubmit}>
                            <section className="settings-group">
                                <div className="settings-group-header">
                                    <h3>Connection</h3>
                                    <p className="dt-small">Endpoint details used to reach the broker.</p>
                                </div>
                                <div className="settings-form-grid">
                                    <div className="dt-form-group">
                                        <label htmlFor="mqtt-host">Host</label>
                                        <input
                                            id="mqtt-host"
                                            type="text"
                                            value={mqttSettings.host}
                                            onChange={(e) =>
                                                setMqttSettings((prev) => ({ ...prev, host: e.target.value }))
                                            }
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
                                    <div className="dt-form-group settings-span-full">
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
                                </div>
                            </section>

                            <section className="settings-group">
                                <div className="settings-group-header">
                                    <h3>Authentication</h3>
                                    <p className="dt-small">Optional broker credentials for username/password auth.</p>
                                </div>
                                <div className="settings-form-grid">
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
                                        <small className="dt-small">Optional.</small>
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
                                        <small className="dt-small">Optional.</small>
                                    </div>
                                </div>
                            </section>

                            <section className="settings-group">
                                <div className="settings-group-header">
                                    <h3>TLS</h3>
                                    <p className="dt-small">Certificate trust and optional mutual TLS credentials.</p>
                                </div>

                                <div className="settings-highlight-row">
                                    <label className="dt-checkbox" htmlFor="mqtt-allow-insecure-tls">
                                        <input
                                            id="mqtt-allow-insecure-tls"
                                            type="checkbox"
                                            checked={mqttSettings.allowInsecureTls}
                                            onChange={(e) =>
                                                setMqttSettings((prev) => ({
                                                    ...prev,
                                                    allowInsecureTls: e.target.checked,
                                                }))
                                            }
                                        />
                                        <span>Allow insecure TLS</span>
                                    </label>
                                    <p className="dt-small">
                                        Skip certificate verification for controlled local environments.
                                    </p>
                                </div>

                                <div className="settings-form-grid">
                                    <div className="dt-form-group settings-span-full">
                                        <label htmlFor="mqtt-ca-file">CA file path</label>
                                        <input
                                            id="mqtt-ca-file"
                                            type="text"
                                            value={mqttSettings.caFile}
                                            onChange={(e) =>
                                                setMqttSettings((prev) => ({ ...prev, caFile: e.target.value }))
                                            }
                                            placeholder="/etc/ssl/certs/broker-ca.crt"
                                        />
                                        <small className="dt-small">
                                            Required for `mqtts` unless insecure TLS is enabled.
                                        </small>
                                    </div>
                                    <div className="dt-form-group">
                                        <label htmlFor="mqtt-client-cert-file">Client certificate path</label>
                                        <input
                                            id="mqtt-client-cert-file"
                                            type="text"
                                            value={mqttSettings.clientCertFile}
                                            onChange={(e) =>
                                                setMqttSettings((prev) => ({
                                                    ...prev,
                                                    clientCertFile: e.target.value,
                                                }))
                                            }
                                            placeholder="/etc/device-portal/mqtt/client.crt"
                                        />
                                        <small className="dt-small">Optional, but required with client key.</small>
                                    </div>
                                    <div className="dt-form-group">
                                        <label htmlFor="mqtt-client-key-file">Client key path</label>
                                        <input
                                            id="mqtt-client-key-file"
                                            type="text"
                                            value={mqttSettings.clientKeyFile}
                                            onChange={(e) =>
                                                setMqttSettings((prev) => ({
                                                    ...prev,
                                                    clientKeyFile: e.target.value,
                                                }))
                                            }
                                            placeholder="/etc/device-portal/mqtt/client.key"
                                        />
                                        <small className="dt-small">Optional, but required with client cert.</small>
                                    </div>
                                </div>
                            </section>

                            <section className="settings-group">
                                <div className="settings-group-header">
                                    <h3>Client identity</h3>
                                    <p className="dt-small">Prefix used to build the MQTT client identifier.</p>
                                </div>
                                <div className="settings-form-grid">
                                    <div className="dt-form-group settings-span-full">
                                        <label htmlFor="mqtt-client-prefix">Client ID prefix</label>
                                        <input
                                            id="mqtt-client-prefix"
                                            type="text"
                                            value={mqttSettings.clientIdPrefix}
                                            onChange={(e) =>
                                                setMqttSettings((prev) => ({
                                                    ...prev,
                                                    clientIdPrefix: e.target.value,
                                                }))
                                            }
                                        />
                                    </div>
                                </div>
                            </section>

                            <div className="settings-actions">
                                <button type="submit" className="dt-btn dt-btn-primary" disabled={mqttSaving}>
                                    {mqttSaving ? "Saving..." : "Save MQTT settings"}
                                </button>
                            </div>
                        </form>
                    )}
                </section>
            )}
        </div>
    );
};

export default SettingsPage;
