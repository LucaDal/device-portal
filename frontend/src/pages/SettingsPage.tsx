import { FormEvent, useState } from "react";
import { ROLES } from "@shared/constants/auth";
import { useAuth } from "../auth/AuthContext";
import { changePassword } from "../auth/authService";
import ErrorBanner from "../components/ErrorBanner";
import MqttBrokerSettingsPanel from "../components/MqttBrokerSettingsPanel";
import MqttAclPanel from "../components/MqttAclPanel";
import "../style/SinglePanelPage.css";

type BannerState = {
    message: string;
    variant: "error" | "success" | "info";
} | null;

export default function SettingsPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === ROLES.ADMIN;
    const [activeTab, setActiveTab] = useState<"password" | "mqtt">("password");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [savingPassword, setSavingPassword] = useState(false);
    const [passwordBanner, setPasswordBanner] = useState<BannerState>(null);

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
                    {isAdmin && <span className="dt-chip">Admin-only MQTT diagnostics</span>}
                </div>
            </header>
            <div className="dt-tabs single-page-tabs" aria-label="Settings sections">
                <button type="button" className={`dt-btn settings-tab ${activeTab === "password" || !isAdmin ? "dt-btn-primary" : "dt-btn-outline"}`}
                    aria-pressed={activeTab === "password" || !isAdmin} onClick={() => setActiveTab("password")}>
                    <span className="settings-tab-title">Password</span>
                    <span className="settings-tab-copy">Update your account credentials.</span>
                </button>
                {isAdmin && <button type="button" className={`dt-btn settings-tab ${activeTab === "mqtt" ? "dt-btn-primary" : "dt-btn-outline"}`}
                    aria-pressed={activeTab === "mqtt"} onClick={() => setActiveTab("mqtt")}>
                    <span className="settings-tab-title">MQTT settings</span>
                    <span className="settings-tab-copy">View broker configuration and connection details.</span>
                </button>}
            </div>
            {(activeTab === "password" || !isAdmin) && (
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
                    onDismiss={() => setPasswordBanner(null)}
                />
                <form className="dt-form" onSubmit={handlePasswordSubmit}>
                    <div className="settings-form-grid">
                        <div className="dt-form-group settings-span-full">
                            <label htmlFor="settings-current-password">Current password</label>
                            <input
                                id="settings-current-password"
                                autoComplete="current-password"
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
                                autoComplete="new-password"
                                minLength={10}
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
                                autoComplete="new-password"
                                minLength={10}
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
            {isAdmin && activeTab === "mqtt" && <>
                <MqttBrokerSettingsPanel />
                <MqttAclPanel />
            </>}
        </div>
    );
}
