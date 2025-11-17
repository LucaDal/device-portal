import { useState } from "react";
import { signup,login } from "../auth/authService";

export default function SignupPage() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role] = useState("user"); // default

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      await signup({email, password, role});
      await login({email, password});
      window.location.href = "/";
    } catch (err: any) {
      setError(err.error || "Errore nella registrazione");
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Registrati</h2>

        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input
            type="email"
            placeholder="Inserisci email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label>Password</label>
          <input
            type="password"
            placeholder="Crea password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button className="auth-btn" type="submit">Registrati</button>
        </form>

        <p className="auth-switch">
          Hai già un account? <a href="/login">Accedi</a>
        </p>
      </div>
    </div>
  );
}
