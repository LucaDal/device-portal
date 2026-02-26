import { useEffect, useState } from "react";
import { apiFetchWithAuth } from "../api/apiClient";
import { User } from "@shared/types/user";
import { ROLES, ROLE_VALUES, Role } from "@shared/constants/auth";
import { MqttPublishAclRule } from "@shared/types/mqtt_publish";
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

export default function UsersManagementPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [invitations, setInvitations] = useState<UserInvitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<Role>(ROLES.USER);
    const [inviteResult, setInviteResult] = useState<InviteResponse | null>(null);
    const [aclUserId, setAclUserId] = useState<number | null>(null);
    const [aclRows, setAclRows] = useState<MqttPublishAclRule[]>([]);
    const [aclLoading, setAclLoading] = useState(false);
    const [aclTopicPattern, setAclTopicPattern] = useState("");
    const [aclPermission, setAclPermission] = useState<"allow" | "deny">("allow");
    const [aclPriority, setAclPriority] = useState("100");
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

    async function updateUser(id: number, payload: { role?: Role; mqtt_publish_enabled?: boolean }) {
        await apiFetchWithAuth(`${url}/${id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
        });
        await loadUsers();
    }

    async function updateRole(id: number, role: Role) {
        await updateUser(id, { role });
    }

    async function updateMqttPublishEnabled(id: number, enabled: boolean) {
        await updateUser(id, { mqtt_publish_enabled: enabled });
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

    async function openAclManager(id: number) {
        if (aclUserId === id) {
            setAclUserId(null);
            setAclRows([]);
            return;
        }
        setAclUserId(id);
        setAclTopicPattern("");
        setAclPermission("allow");
        setAclPriority("100");
        await loadUserAcl(id);
    }

    async function addAclRule() {
        if (!aclUserId) return;
        if (!aclTopicPattern.trim()) {
            setError("Insert an ACL topic pattern.");
            return;
        }
        try {
            await apiFetchWithAuth(`/manage/users/${aclUserId}/mqtt-publish-acl`, {
                method: "POST",
                body: JSON.stringify({
                    topicPattern: aclTopicPattern.trim(),
                    permission: aclPermission,
                    priority: Number(aclPriority) || 100,
                }),
            });
            setAclTopicPattern("");
            setAclPriority("100");
            await loadUserAcl(aclUserId);
        } catch (err: any) {
            setError(err?.error || "Error saving ACL rule.");
        }
    }

    async function deleteAclRule(ruleId: number) {
        if (!aclUserId) return;
        try {
            await apiFetchWithAuth(`/manage/users/${aclUserId}/mqtt-publish-acl/${ruleId}`, {
                method: "DELETE",
            });
            await loadUserAcl(aclUserId);
        } catch (err: any) {
            setError(err?.error || "Error deleting ACL rule.");
        }
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

            <ErrorBanner
                message={error}

                inlineClassName="users-alert users-alert-error"
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
                            <label className="users-checkbox">
                                <input
                                    type="checkbox"
                                    checked={Boolean(u.mqtt_publish_enabled)}
                                    onChange={(e) => updateMqttPublishEnabled(u.id, e.target.checked)}
                                />{" "}
                                MQTT publish enabled
                            </label>
                            <button
                                className="users-btn users-btn-secondary"
                                onClick={() => openAclManager(u.id)}
                            >
                                MQTT ACL
                            </button>

                            <button
                                className="users-btn users-btn-danger"
                                onClick={() => deleteUser(u.id)}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                ))}

                {aclUserId && (
                    <div className="users-alert">
                        <p>
                            <strong>MQTT publish ACL for user #{aclUserId}</strong>
                        </p>
                        <div className="users-invite-grid">
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
                                Add ACL
                            </button>
                        </div>

                        {aclLoading ? (
                            <p className="users-empty">Loading ACL...</p>
                        ) : aclRows.length === 0 ? (
                            <p className="users-empty">No ACL rules configured.</p>
                        ) : (
                            aclRows.map((rule) => (
                                <div key={rule.id} className="users-row">
                                    <div className="users-main">
                                        <div className="users-email">{rule.topic_pattern}</div>
                                        <div className="users-meta">
                                            {rule.permission} • priority {rule.priority}
                                        </div>
                                    </div>
                                    <div className="users-actions">
                                        <button
                                            className="users-btn users-btn-danger"
                                            onClick={() => deleteAclRule(rule.id)}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}
