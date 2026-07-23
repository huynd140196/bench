import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LayoutGrid, User, LogIn, LogOut } from "lucide-react";
import { api, setToken } from "../api";

// Public homepage: every dashboard, site-wide, grouped by workspace. No login required to
// view or navigate any of it. The corner control shows "Log in" when logged out (linking to
// the regular /login page only — never the hidden admin login path) or "My workspaces" +
// "Log out" when a session exists. Signup stays unadvertised: this page never links to /signup.
export default function Home({ onLogout }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    api.listAllDashboards().then(setData).catch(() => setData({ workspaces: [] }));
    api.me().then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  const logout = () => {
    setToken(null);
    setUser(null);
    onLogout();
    navigate("/login");
  };

  return (
    <div style={{ maxWidth: 960, margin: "40px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LayoutGrid size={20} color="var(--teal)" />
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Bench</h1>
        </div>
        {user !== undefined && (user ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link
              to="/workspaces"
              className="mono"
              style={{ fontSize: 12, color: "var(--ink-faint)", display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}
            >
              <User size={13} /> My workspaces
            </Link>
            <button
              className="mono"
              onClick={logout}
              style={{ fontSize: 12, color: "var(--ink-faint)", display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              <LogOut size={13} /> Log out
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="mono"
            style={{ fontSize: 12, color: "var(--ink-faint)", display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}
          >
            <LogIn size={13} /> Log in
          </Link>
        ))}
      </div>

      {data && data.workspaces.map((ws) => (
        <section key={ws.workspaceId} style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: 0.3 }}>
            {ws.workspaceName}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {ws.dashboards.map((d) => (
              <Link
                key={d.id}
                to={`/workspaces/${ws.workspaceId}/dashboards/${d.id}`}
                className="card"
                style={{ padding: 14, textDecoration: "none", color: "var(--ink)", fontSize: 13, fontWeight: 500, display: "block" }}
              >
                {d.name}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
