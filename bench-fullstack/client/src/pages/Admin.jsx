import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, Copy, Check, Trash2, LayoutGrid, TriangleAlert, LogOut } from "lucide-react";
import { api, setToken } from "../api";

// Reachable only by direct URL (no link from Home.jsx or Workspaces.jsx) and gated by
// is_admin both client-side (App.jsx's RequireAdmin) and server-side (requireAdmin on
// every endpoint this page calls) — same belt-and-suspenders pattern as invite-gated signup.
export default function Admin({ user, onLogout }) {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [dashboardRows, setDashboardRows] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [newCode, setNewCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [userErrors, setUserErrors] = useState({});
  const [confirmingWorkspaceId, setConfirmingWorkspaceId] = useState(null);
  const [workspaceDeleteError, setWorkspaceDeleteError] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);

  const load = () => {
    api.adminUsers().then((d) => setUsers(d.users)).catch(() => {});
    api.adminInvites().then((d) => setInvites(d.invites)).catch(() => {});
    api.adminWorkspaces().then((d) => setWorkspaces(d.workspaces)).catch(() => {});
    api.listAllDashboards().then((d) => {
      const rows = d.workspaces.flatMap((ws) =>
        ws.dashboards.map((dash) => ({ ...dash, workspaceId: ws.workspaceId, workspaceName: ws.workspaceName }))
      );
      setDashboardRows(rows);
    }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  // Admin can delete any workspace here regardless of their own membership in it (the server's
  // DELETE /api/workspaces/:workspaceId allows this via requireAdmin as an independent bypass,
  // not by relying on an owner-role membership row that may not exist for the admin).
  const deleteWorkspace = async (wsId) => {
    setDeletingWorkspace(true);
    setWorkspaceDeleteError("");
    try {
      await api.deleteWorkspace(wsId);
      setConfirmingWorkspaceId(null);
      load();
    } catch (err) {
      setWorkspaceDeleteError(err.message);
    } finally {
      setDeletingWorkspace(false);
    }
  };

  const generate = async () => {
    setError("");
    try {
      const { invite } = await api.createInvite();
      setNewCode(invite.code);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const copyLink = () => {
    const url = `${window.location.origin}/signup?invite=${newCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const deleteDashboard = async (row) => {
    await api.deleteDashboard(row.workspaceId, row.id);
    load();
  };

  const toggleDisabled = async (u) => {
    setUserErrors((prev) => ({ ...prev, [u.id]: "" }));
    try {
      await api.adminSetUserDisabled(u.id, !u.is_disabled);
      load();
    } catch (err) {
      setUserErrors((prev) => ({ ...prev, [u.id]: err.message }));
    }
  };

  const deleteUser = async (u) => {
    setUserErrors((prev) => ({ ...prev, [u.id]: "" }));
    try {
      await api.adminDeleteUser(u.id);
      load();
    } catch (err) {
      setUserErrors((prev) => ({ ...prev, [u.id]: err.message }));
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
        <h1 style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={18} color="var(--teal)" /> Admin
        </h1>
        <button
          className="mono"
          onClick={logout}
          style={{ fontSize: 12, color: "var(--ink-faint)", display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <LogOut size={13} /> Log out
        </button>
      </div>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Generate invite code</h2>
        <button className="btn btn-primary" onClick={generate}>Generate invite code</button>
        {error && <div className="mono" style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>{error}</div>}
        {newCode && (
          <div className="card" style={{ padding: 10, marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="mono" style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>{newCode}</span>
            <button className="btn" onClick={copyLink}>
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy signup link"}
            </button>
          </div>
        )}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <LayoutGrid size={14} /> All dashboards
        </h2>
        <table className="mono" style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Workspace</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Dashboard</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Updated</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {dashboardRows.map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                <td style={{ padding: "6px 8px", color: "var(--ink-soft)" }}>{row.workspaceName}</td>
                <td style={{ padding: "6px 8px" }}>
                  <Link to={`/workspaces/${row.workspaceId}/dashboards/${row.id}`} style={{ color: "var(--ink)" }}>
                    {row.name}
                  </Link>
                </td>
                <td style={{ padding: "6px 8px", color: "var(--ink-faint)" }}>{row.updated_at}</td>
                <td style={{ padding: "6px 8px" }}>
                  <button className="btn-ghost" onClick={() => deleteDashboard(row)} title="Delete dashboard">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {dashboardRows.length === 0 && (
              <tr><td colSpan={4} style={{ padding: "6px 8px", color: "var(--ink-faint)" }}>No dashboards yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <LayoutGrid size={14} /> Workspaces
        </h2>
        <table className="mono" style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Workspace</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Owner</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Sheets</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Dashboards</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Members</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {workspaces.map((ws) => (
              <React.Fragment key={ws.id}>
                <tr style={{ borderBottom: confirmingWorkspaceId === ws.id ? "none" : "1px solid var(--border-soft)" }}>
                  <td style={{ padding: "6px 8px" }}>
                    <Link to={`/workspaces/${ws.id}`} style={{ color: "var(--ink)" }}>{ws.name}</Link>
                  </td>
                  <td style={{ padding: "6px 8px", color: "var(--ink-soft)" }}>{ws.owner_name} ({ws.owner_email})</td>
                  <td style={{ padding: "6px 8px" }}>{ws.sheet_count}</td>
                  <td style={{ padding: "6px 8px" }}>{ws.dashboard_count}</td>
                  <td style={{ padding: "6px 8px" }}>{ws.member_count}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <button
                      className="btn-ghost"
                      onClick={() => { setConfirmingWorkspaceId(ws.id); setWorkspaceDeleteError(""); }}
                      title="Delete workspace"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
                {confirmingWorkspaceId === ws.id && (
                  <tr style={{ borderBottom: "1px solid var(--border-soft)" }}>
                    <td colSpan={6} style={{ padding: "0 8px 10px" }}>
                      <div className="card" style={{ padding: 12, borderColor: "var(--red)" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <TriangleAlert size={15} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
                          <div style={{ lineHeight: 1.6 }}>
                            This permanently deletes {ws.sheet_count} sheet{ws.sheet_count === 1 ? "" : "s"}, {ws.dashboard_count} dashboard{ws.dashboard_count === 1 ? "" : "s"},
                            {" "}and removes all {ws.member_count} member{ws.member_count === 1 ? "" : "s"}. This cannot be undone.
                            {ws.dashboards_by_others > 0 && (
                              <div style={{ color: "var(--red)", marginTop: 4 }}>
                                {ws.dashboards_by_others} of those dashboard{ws.dashboards_by_others === 1 ? " was" : "s were"} created by members other than the owner.
                              </div>
                            )}
                          </div>
                        </div>
                        {workspaceDeleteError && <div style={{ color: "var(--red)", marginTop: 8 }}>{workspaceDeleteError}</div>}
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button className="btn" onClick={() => setConfirmingWorkspaceId(null)} disabled={deletingWorkspace}>Cancel</button>
                          <button
                            className="btn btn-primary"
                            style={{ background: "var(--red)", borderColor: "var(--red)" }}
                            onClick={() => deleteWorkspace(ws.id)}
                            disabled={deletingWorkspace}
                          >
                            {deletingWorkspace ? "Deleting…" : "Yes, delete this workspace"}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {workspaces.length === 0 && (
              <tr><td colSpan={6} style={{ padding: "6px 8px", color: "var(--ink-faint)" }}>No workspaces yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Registered users</h2>
        <table className="mono" style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Email</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Name</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Joined</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}></th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = user && user.id === u.id;
              return (
                <React.Fragment key={u.id}>
                  <tr style={{ borderBottom: userErrors[u.id] ? "none" : "1px solid var(--border-soft)" }}>
                    <td style={{ padding: "6px 8px" }}>{u.email}</td>
                    <td style={{ padding: "6px 8px" }}>{u.name}</td>
                    <td style={{ padding: "6px 8px" }}>{u.created_at}</td>
                    <td style={{ padding: "6px 8px" }}>
                      {u.is_admin && <span style={{ color: "var(--teal)", fontWeight: 700 }}>admin</span>}
                      {u.is_disabled && <span style={{ color: "var(--red)", fontWeight: 700, marginLeft: u.is_admin ? 8 : 0 }}>disabled</span>}
                    </td>
                    <td style={{ padding: "6px 8px", display: "flex", gap: 4 }}>
                      <button className="btn-ghost" disabled={isSelf} onClick={() => toggleDisabled(u)} title={isSelf ? "You cannot disable your own account" : undefined}>
                        {u.is_disabled ? "Enable" : "Disable"}
                      </button>
                      <button className="btn-ghost" disabled={isSelf} onClick={() => deleteUser(u)} title={isSelf ? "You cannot delete your own account" : "Delete user"}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                  {userErrors[u.id] && (
                    <tr style={{ borderBottom: "1px solid var(--border-soft)" }}>
                      <td colSpan={5} style={{ padding: "0 8px 6px", color: "var(--red)", fontSize: 11 }}>{userErrors[u.id]}</td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {users.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "6px 8px", color: "var(--ink-faint)" }}>No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Invite codes</h2>
        <table className="mono" style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Code</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Created</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Used by</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((i) => (
              <tr key={i.code} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                <td style={{ padding: "6px 8px" }}>{i.code}</td>
                <td style={{ padding: "6px 8px" }}>{i.createdAt}</td>
                <td style={{ padding: "6px 8px" }}>
                  {i.usedBy ? `${i.usedBy.name} (${i.usedBy.email})` : <span style={{ color: "var(--ink-faint)" }}>unused</span>}
                </td>
              </tr>
            ))}
            {invites.length === 0 && (
              <tr><td colSpan={3} style={{ padding: "6px 8px", color: "var(--ink-faint)" }}>No invite codes yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
