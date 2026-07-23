import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, User, LogIn } from "lucide-react";
import { api } from "../api";

// Public homepage: every dashboard, site-wide, grouped by workspace. No login required to
// view or navigate any of it. The corner control shows "Log in" when logged out (linking to
// the regular /login page only — never the hidden admin login path) or "My workspaces" when
// a session exists. Signup stays unadvertised: this page never links to /signup.
export default function Home() {
  const [data, setData] = useState(null);
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    api.listAllDashboards().then(setData).catch(() => setData({ workspaces: [] }));
    api.me().then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  return (
    <div style={{ maxWidth: 960, margin: "40px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LayoutGrid size={20} color="var(--teal)" />
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Bench</h1>
        </div>
        {user !== undefined && (user ? (
          <Link
            to="/workspaces"
            className="mono"
            style={{ fontSize: 12, color: "var(--ink-faint)", display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}
          >
            <User size={13} /> My workspaces
          </Link>
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
