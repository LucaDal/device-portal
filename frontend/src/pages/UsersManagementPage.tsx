import { useEffect, useMemo, useState } from "react";
import { apiFetchWithAuth } from "../api/apiClient";
import { User } from "@shared/types/user";
import { ROLES, ROLE_VALUES, Role } from "@shared/constants/auth";
import { MqttPublishAclRule } from "@shared/types/mqtt_publish";
import ErrorBanner from "../components/ErrorBanner";
import "../style/UserManagementPage.css";

interface ManagedUser extends User {
    mqtt_publish_enabled?: boolean;
}

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
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [invitations, setInvitations] = useState<UserInvitation[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<Role>(ROLES.USER);
    const [inviteResult, setInviteResult] = useState<InviteResponse | null>(null);

    const [aclRows, setAclRows] = useState<MqttPublishAclRule[]>([]);
    const [aclLoading, setAclLoading] = useState(false);
    const [aclTopicPattern, setAclTopicPattern] = useState("");
    const [aclPermission, setAclPermission] = useState<"allow" | "deny">("allow");
    const [aclPriority, setAclPriority] = useState("100");

    const selectedUser = useMemo(
        () => users.find((user) => user.id === selectedUserId) || null,
        [users, selectedUserId]
    );

    async function loadUsers() {
        try {
            setLoading(true);
            setError(null);
            const [usersData, invitesData] = await Promise.all([
                apiFetchWithAuth<ManagedUser[]>(USERS_URL, { method: "GET" }),
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

    async function updateUser(id: number, payload: { role?: Role; mqtt_publish_enabled?: boolean }) {
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

    async function updateMqttPublishEnabled(id: number, enabled: boolean) {
        try {
            setError(null);
            await updateUser(id, { mqtt_publish_enabled: enabled });
        } catch (err: any) {
            setError(err?.error || "Error updating MQTT publish access.");
        }
    }

    async function loadUserAcl(id: number) {
        try {
            setAclLoading(true);
            setError(null);
            const rows = await apiFetchWithAuth<MqttPublishAclRule[]>(
                `/manage/users/${id}/mqtt-publish-acl`,
                { method: "GET" }
            );
            setAclRows(rows);
        } catch (err: any) {
            setError(err?.error || "Error loading MQTT publish ACL.");
            setAclRows([]);
        } finally {
            setAclLoading(false);
        }
    }

    async function addAclRule() {
        if (!selectedUser) return;
        if (!aclTopicPattern.trim()) {
            setError("Insert an ACL topic pattern.");
            return;
        }
        try {
            setError(null);
            await apiFetchWithAuth(`/manage/users/${selectedUser.id}/mqtt-publish-acl`, {
                method: "POST",
                body: JSON.stringify({
                    topicPattern: aclTopicPattern.trim(),
                    permission: aclPermission,
                    priority: Number(aclPriority) || 100,
                }),
            });
            setAclTopicPattern("");
            setAclPriority("100");
            await loadUserAcl(selectedUser.id);
        } catch (err: any) {
            setError(err?.error || "Error saving ACL rule.");
        }
    }

    async function deleteAclRule(ruleId: number) {
        if (!selectedUser) return;
        try {
            setError(null);
            await apiFetchWithAuth(`/manage/users/${selectedUser.id}/mqtt-publish-acl/${ruleId}`, {
                method: "DELETE",
            });
            await loadUserAcl(selectedUser.id);
        } catch (err: any) {
            setError(err?.error || "Error deleting ACL rule.");
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
        } catch {
            setError("Could not copy temporary password.");
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

        setAclTopicPattern("");
        setAclPermission("allow");
        setAclPriority("100");
        void loadUserAcl(selectedUser.id);
    }, [selectedUserId]);

    if (loading) return <p className="loading">Loading users...</p>;

    return (
        <div className="users-page">
            <header className="dt-header users-header">
                <h1 className="users-title">User Management</h1>
                <p className="users-subtitle">
                    Invite users, review the current access state, and manage MQTT publishing from one place.
                </p>
            </header>

            <ErrorBanner
                message={error}
                inlineClassName="users-alert users-alert-error"
                title="User management"
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
                                    </div>
                                    <div className="users-list-aside">
                                        <span className="users-badge users-badge-role">{user.role}</span>
                                        <span
                                            className={`users-badge ${
                                                user.mqtt_publish_enabled
                                                    ? "users-badge-ok"
                                                    : "users-badge-neutral"
                                            }`}
                                        >
                                            MQTT {user.mqtt_publish_enabled ? "on" : "off"}
                                        </span>
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
                                        Created:{" "}
                                        {selectedUser.created_at
                                            ? new Date(selectedUser.created_at).toLocaleString()
                                            : "-"}
                                    </div>
                                </div>
                                <div className="users-detail-badges">
                                    <span className="users-badge users-badge-role">{selectedUser.role}</span>
                                    <span
                                        className={`users-badge ${
                                            selectedUser.mqtt_publish_enabled
                                                ? "users-badge-ok"
                                                : "users-badge-neutral"
                                        }`}
                                    >
                                        MQTT publish {selectedUser.mqtt_publish_enabled ? "enabled" : "disabled"}
                                    </span>
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

                                <div className="users-field users-toggle-field">
                                    <label className="dt-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(selectedUser.mqtt_publish_enabled)}
                                            onChange={(e) =>
                                                updateMqttPublishEnabled(selectedUser.id, e.target.checked)
                                            }
                                        />
                                        <span>Enable MQTT publish</span>
                                    </label>
                                    <small className="users-meta">
                                        Controls whether this user can publish through the MQTT bridge.
                                    </small>
                                </div>
                            </div>

                            {selectedUser.must_change_password ? (
                                <div className="users-inline-note">
                                    This user must change the password on next login.
                                </div>
                            ) : null}

                            <section className="users-subsection">
                                <div className="users-subsection-head">
                                    <h3>MQTT publish ACL</h3>
                                </div>

                                <div className="users-acl-form">
                                    <input
                                        className="users-input"
                                        type="text"
                                        placeholder="topic pattern (e.g. devices/+/commands/#)"
                                        value={aclTopicPattern}
                                        onChange={(e) => setAclTopicPattern(e.target.value)}
                                    />
                                    <select
                                        className="users-select"
                                        value={aclPermission}
                                        onChange={(e) => setAclPermission(e.target.value as "allow" | "deny")}
                                    >
                                        <option value="allow">allow</option>
                                        <option value="deny">deny</option>
                                    </select>
                                    <input
                                        className="users-input"
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={aclPriority}
                                        onChange={(e) => setAclPriority(e.target.value)}
                                        placeholder="priority"
                                    />
                                    <button className="users-btn users-btn-primary" onClick={addAclRule}>
                                        Add rule
                                    </button>
                                </div>

                                {aclLoading ? (
                                    <p className="users-empty">Loading ACL...</p>
                                ) : aclRows.length === 0 ? (
                                    <p className="users-empty">No ACL rules configured.</p>
                                ) : (
                                    <div className="users-acl-list">
                                        {aclRows.map((rule) => (
                                            <div key={rule.id} className="users-acl-row">
                                                <div className="users-acl-main">
                                                    <span className="users-email">{rule.topic_pattern}</span>
                                                    <span className="users-meta users-acl-meta">
                                                        {rule.permission} • priority {rule.priority}
                                                    </span>
                                                </div>
                                                <button
                                                    className="users-btn users-btn-danger"
                                                    onClick={() => deleteAclRule(rule.id)}
                                                >
                                                    Delete
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
