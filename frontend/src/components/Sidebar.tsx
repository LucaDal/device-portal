import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const Sidebar = () => {
    const { user } = useAuth();

    if (!user) return null;

    return (
        <aside className="sidebar">
            <ul>
                <li><Link to="/">Home</Link></li>
                <li><Link to="/devices">Devices</Link></li>
                {user.role === "admin" &&
                    <li><Link to="/users">Users</Link></li>
                }
                {["admin", "dev"].includes(user.role) &&
                    <li><Link to="/dev-tools">Dev Tools</Link></li>
                }
            </ul>
        </aside>
    );
};

export default Sidebar;
