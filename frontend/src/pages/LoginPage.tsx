import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { login as apiLogin } from "../auth/authService";
import "../style/auth.css"
import { useNavigate } from "react-router-dom";


export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        try {
            const ret = await apiLogin({ email, password });
            login(ret.user, ret.token);
            navigate("/");
        } catch (err: any) {
            setError(err.error || "Server Unreachable");
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2>Accedi</h2>

                {error && <div className="auth-error">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <label>Email</label>
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />

                    <label>Password</label>
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />

                    <button className="auth-btn" type="submit">Login</button>
                </form>

                <p className="auth-switch">
                    Non hai un account? <a href="/signup">Registrati</a>
                </p>
            </div>
        </div>
    );
}
