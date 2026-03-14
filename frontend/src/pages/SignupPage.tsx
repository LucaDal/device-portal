import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { signup as apiSignup, login as apiLogin} from "../auth/authService";
import ErrorBanner from "../components/ErrorBanner";
import "../style/auth.css"
import { ROLES, Role } from "@shared/constants/auth";
import { navigateTo } from "../utils/navigation";

export default function SignupPage() {
    const { login } = useAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [role, setUser] = useState<Role>(ROLES.USER);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Validazioni in tempo reale
    //const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    //const passwordValid = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(password);
    //const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
    const passwordValid = true;
    const emailValid =  true;
    const passwordsMatch =  true;
    // Form valido per l'invio
    const formValid = emailValid && passwordValid && passwordsMatch && !isSubmitting;

    useEffect(() => {
        // reset error quando l'utente modifica i campi
        if (error) setError("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [email, password, confirmPassword]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formValid) {
            setError("Check the fields before continuing.");
            return;
        }
        setIsSubmitting(true);
        setError("");
        try {
            console.log(email, password);
            await apiSignup({ email, password, role});
            navigateTo("/");
        } catch (err: any) {
            setError(err?.error || "Sign upon failed");
            setIsSubmitting(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card" role="region" aria-labelledby="signup-title">
                <h2 id="signup-title" className="auth-title">Sign up</h2>

                <ErrorBanner
                    message={error}

                    inlineClassName="auth-error"
                />

                <form onSubmit={handleSubmit} className="auth-form" noValidate>
                    <div className={`auth-field ${email ? (emailValid ? "valid" : "invalid") : ""}`}>
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            placeholder="Enter email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            aria-invalid={!emailValid && email.length > 0}
                            aria-describedby="email-note"
                        />
                        <div id="email-note" className="helper-text" aria-live="polite">
                            {email.length === 0 ? "" : emailValid ? "Valid email" : "Invalid email"}
                        </div>
                    </div>

                    <div className={`auth-field ${password ? (passwordValid ? "valid" : "invalid") : ""}`}>
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            placeholder="Enter password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            aria-invalid={!passwordValid && password.length > 0}
                            aria-describedby="password-requirements"
                        />
                        <div id="password-requirements" className="helper-text" aria-live="polite">
                            {password.length === 0 ? "" : (
                                passwordValid ? "Password meets requirements" :
                                    "Min 8 chars, one uppercase, one number, and one special char"
                            )}
                        </div>
                    </div>

                    <div className={`auth-field ${confirmPassword ? (passwordsMatch ? "valid" : "invalid") : ""}`}>
                        <label htmlFor="confirmPassword">Confirm Password</label>
                        <input
                            id="confirmPassword"
                            type="password"
                            placeholder="Repeat password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            aria-invalid={!passwordsMatch && confirmPassword.length > 0}
                            aria-describedby="confirm-note"
                        />
                        <div id="confirm-note" className="helper-text" aria-live="polite">
                            {confirmPassword.length === 0 ? "" : (passwordsMatch ? "Passwords match" : "Passwords do not match")}
                        </div>
                    </div>

                    <button
                        className="auth-btn"
                        type="submit"
                        disabled={!formValid}
                        aria-disabled={!formValid}
                    >
                        {isSubmitting ? <span className="spinner" aria-hidden="true"></span> : "Create account"}
                    </button>
                </form>

                <p className="auth-switch">
                    Already have an account? <a href="/login">Sign in</a>
                </p>
            </div>
        </div>
    );
}
