import { FormEvent, useState } from "react";
import { changePassword } from "../auth/authService";
import "../style/SinglePanelPage.css";

const SettingsPage: React.FC = () => {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

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
        </div>
    );
};

export default SettingsPage;
