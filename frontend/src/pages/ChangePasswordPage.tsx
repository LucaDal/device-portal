import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { changePassword } from "../auth/authService";
import { useAuth } from "../auth/AuthContext";
import ErrorBanner from "../components/ErrorBanner";
import "../style/auth.css";

const ChangePasswordPage: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [ok, setOk] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setOk(null);

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
            setOk("Password updated successfully.");
            setTimeout(() => navigate("/"), 600);
        } catch (err: any) {
            setError(err?.error || "Could not update password");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2>Change Password</h2>
                <p className="auth-switch">
                    {user?.email}
                </p>

                <ErrorBanner
                    message={error}

                    inlineClassName="auth-error"
                />
                {ok && <div className="auth-success">{ok}</div>}

                <form onSubmit={handleSubmit}>
                    <label>Current password</label>
                    <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                    />

                    <label>New password</label>
                    <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                    />

                    <label>Confirm new password</label>
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                    />

                    <button className="auth-btn" type="submit" disabled={saving}>
                        {saving ? "Saving..." : "Update password"}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChangePasswordPage;
