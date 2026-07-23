import React, { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { api, setToken } from "../api";

// Invite-only: the invite code can be pre-filled via ?invite=CODE (the link Admin.jsx's
// "Copy signup link" button generates), but the field is always editable in case someone
// was just handed the raw code instead of the link.
export default function Signup({ onAuthed }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(searchParams.get("invite") || "");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const { token, user } = await api.signup({ name, email, password, inviteCode });
      setToken(token);
      onAuthed(user);
      navigate("/workspaces");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Sign up</h1>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password (min 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <input type="text" placeholder="Invite code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
        {error && <div className="mono" style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
        <button className="btn btn-primary" type="submit"><UserPlus size={13} /> Create account</button>
      </form>
      <Link to="/login" className="mono" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 16, display: "inline-block" }}>
        Already have an account? Log in
      </Link>
    </div>
  );
}
