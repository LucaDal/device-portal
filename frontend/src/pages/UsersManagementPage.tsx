import { useEffect, useMemo, useState } from "react";
import { apiFetchWithAuth } from "../api/apiClient";
import { User } from "@shared/types/user";
import { ROLES, ROLE_VALUES, Role } from "@shared/constants/auth";
import { MqttUserAclRule } from "@shared/types/mqtt";
import ErrorBanner from "../components/ErrorBanner";
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

const USERS_URL = "/manage/users";

export default function UsersManagementPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [invitations, setInvitations] = useState<UserInvitation[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<Role>(ROLES.USER);
    const [inviteResult, setInviteResult] = useState<InviteResponse | null>(null);

    const [aclRows, setAclRows] = useState<MqttUserAclRule[]>([]);
    const [aclLoading, setAclLoading] = useState(false);

    const selectedUser = useMemo(
        () => users.find((user) => user.id === selectedUserId) || null,
        [users, selectedUserId]
    );

    async function loadUsers() {
        try {
            setLoading(true);
            setError(null);
            const [usersData, invitesData] = await Promise.all([
                apiFetchWithAuth<User[]>(USERS_URL, { method: "GET" }),
                apiFetchWithAuth<UserInvitation[]>("/manage/users/invitations", { method: "GET" }),
            ]);
            setUsers(usersData);
            setInvitations(invitesData);

            const nextSelectedId =
                usersData.some((user) => user.id === selectedUserId)
                    ? selectedUserId
                    : usersData[0]?.id ?? null;
            setSelectedUserId(nextSelectedId);
        } catch (err: any) {
            setError(err?.error || "Error loading users data.");
        } finally {
            setLoading(false);
        }
    }

    async function updateUser(id: number, payload: { role?: Role }) {
        await apiFetchWithAuth(`${USERS_URL}/${id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
        });
        await loadUsers();
    }

    async function updateRole(id: number, role: Role) {
        try {
            setError(null);
            await updateUser(id, { role });
        } catch (err: any) {
            setError(err?.error || "Error updating role.");
        }
    }

    async function loadUserAcl(id: number) {
        try {
            setAclLoading(true);
            setError(null);
            const rows = await apiFetchWithAuth<MqttUserAclRule[]>(
                `/manage/users/${id}/mqtt-acl`,
                { method: "GET" }
            );
            setAclRows(rows);
        } catch (err: any) {
            setError(err?.error || "Error loading MQTT ACL.");
            setAclRows([]);
        } finally {
            setAclLoading(false);
        }
    }

    async function deleteUser(id: number) {
        if (!confirm("Are you sure you want to delete this user?")) return;
        try {
            setError(null);
            await apiFetchWithAuth(`${USERS_URL}/${id}`, { method: "DELETE" });
            await loadUsers();
            setAclRows([]);
        } catch (err: any) {
            setError(err?.error || "Error deleting user.");
        }
    }

    async function inviteUser() {
        if (!inviteEmail.trim()) return;
        try {
            setError(null);
            const data = await apiFetchWithAuth<InviteResponse>("/manage/users/invite", {
                method: "POST",
                body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
            });

            setInviteResult(data);
            setInviteEmail("");
            setInviteRole(ROLES.USER);
            await loadUsers();
        } catch (err: any) {
            setError(err?.error || "Error creating invitation.");
        }
    }

    async function copyTemporaryPassword() {
        if (!inviteResult) return;
        try {
            await navigator.clipboard.writeText(inviteResult.temporaryPassword);
            setSuccessMessage("Temporary password copied.");
        } catch {
            setError("Could not copy temporary password.");
        }
    }

    async function copyAclTopic(topic: string) {
        try {
            await navigator.clipboard.writeText(topic);
            setSuccessMessage("MQTT topic copied.");
        } catch {
            setError("Could not copy MQTT topic.");
        }
    }

    async function revokeInvitation(id: number) {
        if (!confirm("Revoke this invitation?")) return;
        try {
            setError(null);
            await apiFetchWithAuth(`/manage/users/invitations/${id}`, { method: "DELETE" });
            await loadUsers();
        } catch (err: any) {
            setError(err?.error || "Could not revoke invitation.");
        }
    }

    useEffect(() => {
        void loadUsers();
    }, []);

    useEffect(() => {
        if (!selectedUser) {
            setAclRows([]);
            return;
        }

        void loadUserAcl(selectedUser.id);
    }, [selectedUserId]);

    if (loading) return <p className="loading">Loading users...</p>;

    return (
        <div className="users-page">
            <header className="dt-header users-header">
                <h1 className="users-title">User Management</h1>
                <p className="users-subtitle">
                    Invite users, review account state, and inspect generated MQTT access.
                </p>
            </header>

            <ErrorBanner
                message={error}
                inlineClassName="users-alert users-alert-error"
                title="User management"
            />
            <ErrorBanner
                message={successMessage}
                variant="success"
                inlineClassName="users-alert users-alert-success"
                title="Done"
            />

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
                    <ErrorBanner
                        message={`Invitation created for ${inviteResult.email} (${inviteResult.role}). Temporary password: ${inviteResult.temporaryPassword}`}
                        variant="success"
                        inlineClassName="users-alert users-alert-success"
                        title={`Expires ${new Date(inviteResult.expiresAt).toLocaleString()}`}
                    />
                )}

                {inviteResult && (
                    <button className="users-btn users-btn-secondary users-inline-btn" onClick={copyTemporaryPassword}>
                        Copy temporary password
                    </button>
                )}
            </section>

            <div className="users-management-layout">
                <section className="users-card users-list-card">
                    <div className="users-card-head">
                        <h2>Users</h2>
                        <span className="users-count">{users.length}</span>
                    </div>

                    <div className="users-list">
                        {users.map((user) => {
                            const selected = selectedUser?.id === user.id;
                            return (
                                <button
                                    key={user.id}
                                    type="button"
                                    className={`users-list-row ${selected ? "is-selected" : ""}`}
                                    onClick={() => setSelectedUserId(user.id)}
                                >
                                    <div className="users-list-main">
                                        <span className="users-email">{user.email}</span>
                                        <span className="users-meta">User #{user.id}</span>
                                    </div>
                                    <div className="users-list-aside">
                                        <span className="users-badge users-badge-role">{user.role}</span>
                                        {user.must_change_password ? (
                                            <span className="users-badge users-badge-pending">Password reset</span>
                                        ) : null}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>

                <section className="users-card users-detail-card">
                    <div className="users-card-head">
                        <h2>{selectedUser ? "User details" : "Select a user"}</h2>
                    </div>

                    {!selectedUser ? (
                        <p className="users-empty">Choose a user from the list to manage roles and MQTT access.</p>
                    ) : (
                        <>
                            <div className="users-detail-hero">
                                <div>
                                    <div className="users-email">{selectedUser.email}</div>
                                    <div className="users-meta">
                                        User #{selectedUser.id}
                                    </div>
                                    <div className="users-meta">
                                        Created:{" "}
                                        {selectedUser.created_at
                                            ? new Date(selectedUser.created_at).toLocaleString()
                                            : "-"}
                                    </div>
                                </div>
                                <div className="users-detail-badges">
                                    <span className="users-badge users-badge-role">{selectedUser.role}</span>
                                </div>
                            </div>

                            <div className="users-detail-grid">
                                <div className="users-field">
                                    <label>Role</label>
                                    <select
                                        className="users-select"
                                        value={selectedUser.role}
                                        onChange={(e) => updateRole(selectedUser.id, e.target.value as Role)}
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
                                </div>
                            </div>

                            {selectedUser.must_change_password ? (
                                <div className="users-inline-note">
                                    This user must change the password on next login.
                                </div>
                            ) : null}

                            <section className="users-subsection">
                                <div className="users-subsection-head">
                                    <h3>Generated MQTT ACL</h3>
                                </div>

                                {aclLoading ? (
                                    <p className="users-empty">Loading ACL...</p>
                                ) : aclRows.length === 0 ? (
                                    <p className="users-empty">No generated ACL rules.</p>
                                ) : (
                                    <div className="users-acl-list">
                                        {aclRows.map((rule) => (
                                            <div key={rule.id} className="users-acl-row">
                                                <div className="users-acl-main">
                                                    <span className="users-acl-topic">{rule.topic_pattern}</span>
                                                    <span className="users-meta users-acl-meta">
                                                        Action: {rule.action} | Permission: {rule.permission} | Device:{" "}
                                                        {rule.source_device_code || "-"} | Source: {rule.source_key || rule.source}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="users-btn users-btn-secondary users-btn-copy"
                                                    onClick={() => copyAclTopic(rule.topic_pattern)}
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <div className="users-danger-zone">
                                <div>
                                    <strong>Delete user</strong>
                                    <div className="users-meta">
                                        Remove this account permanently after transferring owned devices.
                                    </div>
                                </div>
                                <button
                                    className="users-btn users-btn-danger"
                                    onClick={() => deleteUser(selectedUser.id)}
                                >
                                    Delete user
                                </button>
                            </div>
                        </>
                    )}
                </section>
            </div>

            <section className="users-card">
                <div className="users-card-head">
                    <h2>Invitations</h2>
                    <span className="users-count">{invitations.length}</span>
                </div>

                {invitations.length === 0 ? (
                    <p className="users-empty">No invitations found</p>
                ) : (
                    <div className="users-invitations-list">
                        {invitations.map((inv) => (
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
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
