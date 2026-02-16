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
