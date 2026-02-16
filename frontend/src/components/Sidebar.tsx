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
        { to: "/add-device", label: "Add Device", enabled: true },
        { to: "/settings", label: "Settings", enabled: true },
        { to: "/users", label: "Users", enabled: user.role === ROLES.ADMIN },
        { to: "/device-types", label: "Device Types", enabled: [ROLES.ADMIN, ROLES.DEV].includes(user.role) },
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
