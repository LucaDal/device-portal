import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ROLES } from "@shared/constants/auth";

const Sidebar = () => {
    const { user } = useAuth();

    if (!user) return null;

    const items = [
        { to: "/", label: "Home", enabled: true },
        { to: "/devices", label: "Devices", enabled: true },
        { to: "/device-types", label: "Device Types", enabled: user.role === ROLES.ADMIN },
        { to: "/default-properties", label: "Default Properties", enabled: user.role === ROLES.ADMIN },
        { to: "/users", label: "Users", enabled: user.role === ROLES.ADMIN },
        { to: "/request-logs", label: "Request Logs", enabled: user.role === ROLES.ADMIN || user.role === ROLES.DEV },
        { to: "/settings", label: "Settings", enabled: true },
    ];

    return (
        <aside className="sidebar">
            <div className="sidebar-heading">Navigation</div>
            <ul className="sidebar-menu">
                {items
                    .filter((item) => item.enabled)
                    .map((item) => (
                        <li key={item.to}>
                            <NavLink
                                to={item.to}
                                className={({ isActive }) =>
                                    isActive ? "sidebar-link is-active" : "sidebar-link"
                                }
                                end={item.to === "/"}
                            >
                                <span>{item.label}</span>
                            </NavLink>
                        </li>
                    ))}
            </ul>
        </aside>
    );
};

export default Sidebar;
