import React, { useState } from "react";
import { login, register } from "./authService"; // Assicurati di avere questa funzione

export const RegisterPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const t = await register({ email, password, role: "admin" });
      const res = await login({ email, password});
      localStorage.setItem("token", res.token);
      window.location.href = "/devices"; // dopo login redirect
    } catch (err: any) {
      setError(err.error || "Login fallito");
    }
  };

  return (
    <div>
      <h2>Sign up</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div><input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div><input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} /></div>
        <button type="submit">Register</button>
      </form>
    </div>
  );
};
