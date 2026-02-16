import { useEffect, useState } from "react";
import { apiFetchWithAuth } from "../api/apiClient";
import { User } from "@shared/types/user";
import { ROLES, ROLE_VALUES, Role } from "@shared/constants/auth";
import "../style/UserManagementPage.css";

interface UserInvitation {
    id: number;
    email: string;
    role: Role;
    expires_at: string;
    invited_by_email: string | null;
}

interface InviteResponse {
    email: string;
    role: Role;
    temporaryPassword: string;
    expiresAt: string;
}

export default function UsersManagementPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [invitations, setInvitations] = useState<UserInvitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<Role>(ROLES.USER);
    const [inviteResult, setInviteResult] = useState<InviteResponse | null>(null);
    const url = "/manage/users";

    async function loadUsers() {
        try {
            setLoading(true);
            setError(null);
            const [usersData, invitesData] = await Promise.all([
                apiFetchWithAuth<User[]>(url, { method: "GET" }),
                apiFetchWithAuth<UserInvitation[]>("/manage/users/invitations", { method: "GET" }),
            ]);
            setUsers(usersData);
            setInvitations(invitesData);
        } catch (err: any) {
            setError(err?.error || "Error loading users data.");
        } finally {
            setLoading(false);
        }
    }

    async function updateRole(id: number, role: Role) {
        await apiFetchWithAuth(`${url}/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ role }),
        });
        loadUsers();
    }

    async function deleteUser(id: number) {
        if (!confirm("Are you sure to eliminate this user?")) return;
        try {
            await apiFetchWithAuth(`${url}/${id}`, { method: "DELETE" });
            await loadUsers();
        } catch (err: any) {
            setError(err?.error || "Error deleting user.");
        }
    }

    async function inviteUser() {
        if (!inviteEmail.trim()) return;
        setError(null);

        const data = await apiFetchWithAuth<InviteResponse>("/manage/users/invite", {
            method: "POST",
            body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
        });

        setInviteResult(data);
        setInviteEmail("");
        setInviteRole(ROLES.USER);
        await loadUsers();
    }

    async function copyTemporaryPassword() {
        if (!inviteResult) return;
        try {
            await navigator.clipboard.writeText(inviteResult.temporaryPassword);
        } catch {
            setError("Could not copy temporary password.");
        }
    }

    async function revokeInvitation(id: number) {
        if (!confirm("Revoke this invitation?")) return;
        try {
            await apiFetchWithAuth(`/manage/users/invitations/${id}`, { method: "DELETE" });
            await loadUsers();
        } catch (err: any) {
            setError(err?.error || "Could not revoke invitation.");
        }
    }

    useEffect(() => {
        loadUsers();
    }, []);

    if (loading) return <p className="loading">Loading users...</p>;

    return (
        <div className="users-page">
            <header className="users-header">
                <h1 className="users-title">User Management</h1>
                <p className="users-subtitle">
                    Invite users, check invitation status, and manage roles.
                </p>
            </header>

            {error && <div className="users-alert users-alert-error">{error}</div>}

            <section className="users-card">
                <div className="users-card-head">
                    <h2>Invite user</h2>
                </div>
                <div className="users-invite-grid">
                    <input
                        className="users-input"
                        type="email"
                        placeholder="email@domain.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                    />
                    <select
                        className="users-select"
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as Role)}
                    >
                        {ROLE_VALUES.map((role) => (
                            <option key={role} value={role}>
                                {role}
                            </option>
                        ))}
                    </select>
                    <button className="users-btn users-btn-primary" onClick={inviteUser}>
                        Send invitation
                    </button>
                </div>

                {inviteResult && (
                    <div className="users-alert users-alert-success">
                        <p>
                            Invitation created for <strong>{inviteResult.email}</strong> ({inviteResult.role}). Expires on{" "}
                            {new Date(inviteResult.expiresAt).toLocaleString()}.
                        </p>
                        <p>
                            Temporary password:{" "}
                            <code className="users-code">{inviteResult.temporaryPassword}</code>
                        </p>
                        <button className="users-btn users-btn-secondary" onClick={copyTemporaryPassword}>
                            Copy temporary password
                        </button>
                    </div>
                )}
            </section>

            <section className="users-card">
                <div className="users-card-head">
                    <h2>Invitations</h2>
                    <span className="users-count">{invitations.length}</span>
                </div>

                {invitations.length === 0 ? (
                    <p className="users-empty">No invitations found</p>
                ) : (
                    invitations.map((inv) => (
                        <div key={inv.id} className="users-row">
                            <div className="users-main">
                                <div className="users-email">{inv.email}</div>
                                <div className="users-meta">
                                    role: {inv.role} • invited by {inv.invited_by_email || "admin"} • expires:{" "}
                                    {new Date(inv.expires_at).toLocaleString()}
                                </div>
                            </div>
                            <div className="users-actions">
                                <span className="users-badge users-badge-pending">Pending</span>
                                <button
                                    className="users-btn users-btn-danger"
                                    onClick={() => revokeInvitation(inv.id)}
                                >
                                    Revoke
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </section>

            <section className="users-card">
                <div className="users-card-head">
                    <h2>Users</h2>
                    <span className="users-count">{users.length}</span>
                </div>

                {users.map((u) => (
                    <div key={u.id} className="users-row">
                        <div className="users-main">
                            <div className="users-email">{u.email}</div>
                            <div className="users-meta">
                                created: {u.created_at ? new Date(u.created_at).toLocaleString() : "-"}
                                {u.must_change_password ? " • password change required" : ""}
                            </div>
                        </div>

                        <div className="users-actions">
                            <select
                                className="users-select"
                                value={u.role}
                                onChange={(e) => updateRole(u.id, e.target.value as Role)}
                            >
                                {ROLE_VALUES.map((role) => (
                                    <option key={role} value={role}>
                                        {role === ROLES.ADMIN
                                            ? "Admin"
                                            : role === ROLES.DEV
                                              ? "Dev"
                                              : "User"}
                                    </option>
                                ))}
                            </select>

                            <button
                                className="users-btn users-btn-danger"
                                onClick={() => deleteUser(u.id)}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                ))}
            </section>
        </div>
    );
}
