import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { api, setToken } from "../api";

// Reachable only at /<VITE_ADMIN_LOGIN_PATH> (see App.jsx) — never linked from anywhere else
// in the app. Separate from the regular /login page: its own rate-limited endpoint
// (api.adminLogin), and its own password-reset flow independent of the regular login's
// lockout (the reset token itself is never shown here — it only ever appears in the
// server's own console log).
export default function AdminLogin({ onAuthed }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login"); // login | requestReset | resetPassword
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const login = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const { token, user } = await api.adminLogin({ email, password });
      setToken(token);
      onAuthed(user);
      navigate("/admin");
    } catch (err) {
      setError(err.message);
    }
  };

  const requestReset = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      const { message: msg } = await api.adminRequestReset();
      setMessage(msg);
    } catch (err) {
      setError(err.message);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.adminResetPassword({ token: resetToken, newPassword });
      setMessage("Password updated — you can log in now.");
      setMode("login");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <ShieldCheck size={18} color="var(--teal)" /> Admin login
      </h1>

      {mode === "login" && (
        <form onSubmit={login} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <div className="mono" style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
          {message && <div className="mono" style={{ color: "var(--teal)", fontSize: 12 }}>{message}</div>}
          <button className="btn btn-primary" type="submit">Log in</button>
          <button type="button" className="btn-ghost mono" style={{ fontSize: 12 }} onClick={() => { setMode("requestReset"); setError(""); setMessage(""); }}>
            Forgot password?
          </button>
        </form>
      )}

      {mode === "requestReset" && (
        <form onSubmit={requestReset} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Requests a reset token — it's printed to the server's own console, never shown here.
          </div>
          {error && <div className="mono" style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
          {message && <div className="mono" style={{ color: "var(--teal)", fontSize: 12 }}>{message}</div>}
          <button className="btn btn-primary" type="submit">Request reset token</button>
          <button type="button" className="btn-ghost mono" style={{ fontSize: 12 }} onClick={() => { setMode("resetPassword"); setError(""); }}>
            I already have a token
          </button>
          <button type="button" className="btn-ghost mono" style={{ fontSize: 12 }} onClick={() => { setMode("login"); setError(""); setMessage(""); }}>
            Back to login
          </button>
        </form>
      )}

      {mode === "resetPassword" && (
        <form onSubmit={resetPassword} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="text" placeholder="Reset token" value={resetToken} onChange={(e) => setResetToken(e.target.value)} required />
          <input type="password" placeholder="New password (min 8 characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          {error && <div className="mono" style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
          <button className="btn btn-primary" type="submit">Set new password</button>
          <button type="button" className="btn-ghost mono" style={{ fontSize: 12 }} onClick={() => { setMode("login"); setError(""); }}>
            Back to login
          </button>
        </form>
      )}
    </div>
  );
}
