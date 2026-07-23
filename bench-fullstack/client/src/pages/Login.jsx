import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { api, setToken } from "../api";

export default function Login({ onAuthed }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const { token, user } = await api.login({ email, password });
      setToken(token);
      onAuthed(user);
      navigate("/workspaces");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Log in</h1>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div className="mono" style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
        <button className="btn btn-primary" type="submit"><LogIn size={13} /> Log in</button>
      </form>
    </div>
  );
}
