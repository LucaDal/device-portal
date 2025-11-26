import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { signup as apiSignup, login as apiLogin} from "../auth/authService";
import "../style/auth.css"

export default function SignupPage() {
    const { login } = useAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [role, setUser] = useState("user");
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
            setError("Controlla i campi prima di procedere.");
            return;
        }
        setIsSubmitting(true);
        setError("");
        try {
            console.log(email, password);
            await apiSignup({ email, password, role});
            window.location.href = "/";
        } catch (err: any) {
            setError(err?.error || "Registrazione non riuscita");
            setIsSubmitting(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card" role="region" aria-labelledby="signup-title">
                <h2 id="signup-title" className="auth-title">Registrati</h2>

                {error && (
                    <div className="auth-error" role="alert" aria-live="assertive">{error}</div>
                )}

                <form onSubmit={handleSubmit} className="auth-form" noValidate>
                    <div className={`auth-field ${email ? (emailValid ? "valid" : "invalid") : ""}`}>
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            placeholder="Inserisci email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            aria-invalid={!emailValid && email.length > 0}
                            aria-describedby="email-note"
                        />
                        <div id="email-note" className="helper-text" aria-live="polite">
                            {email.length === 0 ? "" : emailValid ? "Email valida" : "Email non valida"}
                        </div>
                    </div>

                    <div className={`auth-field ${password ? (passwordValid ? "valid" : "invalid") : ""}`}>
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            placeholder="Inserisci password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            aria-invalid={!passwordValid && password.length > 0}
                            aria-describedby="password-requirements"
                        />
                        <div id="password-requirements" className="helper-text" aria-live="polite">
                            {password.length === 0 ? "" : (
                                passwordValid ? "Password soddisfa i requisiti" :
                                    "Min 8 caratteri, una maiuscola, un numero e un carattere speciale"
                            )}
                        </div>
                    </div>

                    <div className={`auth-field ${confirmPassword ? (passwordsMatch ? "valid" : "invalid") : ""}`}>
                        <label htmlFor="confirmPassword">Conferma Password</label>
                        <input
                            id="confirmPassword"
                            type="password"
                            placeholder="Ripeti password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            aria-invalid={!passwordsMatch && confirmPassword.length > 0}
                            aria-describedby="confirm-note"
                        />
                        <div id="confirm-note" className="helper-text" aria-live="polite">
                            {confirmPassword.length === 0 ? "" : (passwordsMatch ? "Le password coincidono" : "Le password non coincidono")}
                        </div>
                    </div>

                    <button
                        className="auth-btn"
                        type="submit"
                        disabled={!formValid}
                        aria-disabled={!formValid}
                    >
                        {isSubmitting ? <span className="spinner" aria-hidden="true"></span> : "Crea account"}
                    </button>
                </form>

                <p className="auth-switch">
                    Hai già un account? <a href="/login">Accedi</a>
                </p>
            </div>
        </div>
    );
}
