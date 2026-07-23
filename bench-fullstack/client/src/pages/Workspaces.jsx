import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, LayoutGrid, LogOut } from "lucide-react";
import { api, setToken } from "../api";

// No link to /admin anywhere on this page (or Home.jsx) — reachable only by direct URL,
// same "no link, just gated by is_admin" pattern as the hidden admin login path itself.
export default function Workspaces({ onLogout }) {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const load = () => api.listWorkspaces().then((d) => setWorkspaces(d.workspaces)).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError("");
    try {
      await api.createWorkspace(name.trim());
      setName("");
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const logout = () => {
    setToken(null);
    onLogout();
    navigate("/login");
  };

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          <LayoutGrid size={20} color="var(--teal)" /> Workspaces
        </h1>
        <button
          className="mono"
          onClick={logout}
          style={{ fontSize: 12, color: "var(--ink-faint)", display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <LogOut size={13} /> Log out
        </button>
      </div>

      <form onSubmit={create} style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input type="text" placeholder="New workspace name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-primary" type="submit"><Plus size={13} /> Create</button>
      </form>
      {error && <div className="mono" style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 16 }}>
        {workspaces.map((w) => (
          <Link key={w.id} to={`/workspaces/${w.id}`} className="card" style={{ padding: 14, textDecoration: "none", color: "var(--ink)", fontSize: 13, fontWeight: 500, display: "block" }}>
            {w.name}
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-faint)", marginTop: 4 }}>{w.role}</div>
          </Link>
        ))}
        {workspaces.length === 0 && <div className="mono" style={{ fontSize: 12, color: "var(--ink-faint)" }}>No workspaces yet.</div>}
      </div>
    </div>
  );
}
