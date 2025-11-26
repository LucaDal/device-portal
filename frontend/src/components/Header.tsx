import { useAuth } from "../auth/AuthContext";
import { Link } from "react-router-dom";

const Header = () => {
    const { user, logout } = useAuth();

    return (
        <header className="header">
            <h1>Device Portal</h1>
            <nav>
                {user ? (
                    <>
                        <span>{user.email} ({user.role})</span>
                        {user.role === "admin" &&
                            <Link to="/admin">Admin</Link>
                        }
                        {["admin", "dev"].includes(user.role) &&
                            <Link to="/dev-tools">Dev</Link>
                        }
                        <button onClick={logout}>Logout</button>
                    </>
                ) : (
                        <Link to="/login">Login</Link>

                    )}
            </nav>
        </header>
    );
};

export default Header;
