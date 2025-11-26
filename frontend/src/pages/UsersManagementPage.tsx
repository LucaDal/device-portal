import { useEffect, useState } from "react";
import { apiFetchWithAuth } from "../api/apiClient";
import { User } from "@shared/types/user";
import "../style/UserManagementPage.css"; // importa il CSS

export default function UsersManagementPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const url = "/manage/users";

    async function loadUsers() {
        setLoading(true);
        const data = await apiFetchWithAuth<User[]>(url, { method: "GET" });
        setUsers(data);
        setLoading(false);
    }

    async function updateRole(id: number, role: string) {
        await apiFetchWithAuth(`${url}/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ role }),
        });
        loadUsers();
    }

    async function deleteUser(id: number) {
        if (!confirm("Are you sure to eliminate this user?")) return;
        await apiFetchWithAuth(`${url}/${id}`, { method: "DELETE" });
        loadUsers();
    }

    useEffect(() => {
        loadUsers();
    }, []);

    if (loading) return <p className="loading">Loading users...</p>;

    return (
        <div className="container">
            <h1 className="title">Gestione Utenti</h1>

            <div className="user-list-container">
                {users.map((u) => (
                    <div key={u.id} className="user-row">
                        <div className="user-email">{u.email}</div>

                        <div className="user-actions">
                            <select
                                value={u.role}
                                onChange={(e) => updateRole(u.id, e.target.value)}>
                                <option value="user">User</option>
                                <option value="dev">Dev</option>
                                <option value="admin">Admin</option>
                            </select>

                            <button onClick={() => deleteUser(u.id)}>Delete</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>

    );
}

