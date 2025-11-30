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
                <li><Link to="/add-device">Add Device</Link></li>
                {user.role === "admin" &&
                    <li><Link to="/users">Users</Link></li>
                }
                {["admin", "dev"].includes(user.role) &&
                    <li><Link to="/device-types">Device Types</Link></li>
                }
            </ul>
        </aside>
    );
};

export default Sidebar;
