import React, { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Upload, Plus, ArrowLeft, Users, Trash2, Link2, RefreshCw, TriangleAlert } from "lucide-react";
import { api } from "../api";
import CalculatedFieldsPanel from "../components/CalculatedFieldsPanel";

// SQLite's datetime('now') yields "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker.
function timeAgo(sqliteUtcString) {
  if (!sqliteUtcString) return "";
  const ms = Date.now() - new Date(sqliteUtcString.replace(" ", "T") + "Z").getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Workspace({ user }) {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const [sheets, setSheets] = useState([]);
  const [dashboards, setDashboards] = useState([]);
  const [members, setMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [dashName, setDashName] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [refreshingId, setRefreshingId] = useState(null);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = () => {
    api.listSheets(workspaceId).then((d) => setSheets(d.sheets)).catch(() => {});
    api.listDashboards(workspaceId).then((d) => setDashboards(d.dashboards));
    api.listMembers(workspaceId).then((d) => setMembers(d.members)).catch(() => {});
  };
  useEffect(() => { load(); }, [workspaceId]);

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError("");
    try {
      await api.uploadSheet(workspaceId, file);
      load();
    } catch (err) {
      setError(err.message);
    }
    e.target.value = "";
  };

  const addFromUrl = async (e) => {
    e.preventDefault();
    if (!sheetUrl.trim()) return;
    setError("");
    try {
      await api.addSheetFromUrl(workspaceId, sheetUrl.trim());
      setSheetUrl("");
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const refreshSheet = async (sheetId) => {
    setError("");
    setRefreshingId(sheetId);
    try {
      await api.refreshSheet(workspaceId, sheetId);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshingId(null);
    }
  };

  const createDashboard = async (e) => {
    e.preventDefault();
    if (!dashName.trim()) return;
    await api.createDashboard(workspaceId, dashName.trim());
    setDashName("");
    load();
  };

  const deleteDashboard = async (d) => {
    if (!window.confirm(`Delete "${d.name}"? This can't be undone.`)) return;
    await api.deleteDashboard(workspaceId, d.id);
    load();
  };

  // Two conditions, kept explicitly separate (not merged): the site admin can delete this
  // workspace regardless of membership; a regular user only if their OWN membership row for
  // THIS workspace is role='owner'. Mirrors the server's DELETE /:workspaceId check exactly —
  // this is display-only, the server is the real enforcement either way.
  const myMembership = members.find((m) => user && m.id === user.id);
  const isOwnerOfThisWorkspace = myMembership?.role === "owner";
  const canDeleteWorkspace = !!(user && (user.is_admin || isOwnerOfThisWorkspace));
  const dashboardsByOthers = dashboards.filter((d) => user && d.created_by !== user.id).length;

  const doDeleteWorkspace = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await api.deleteWorkspace(workspaceId);
      navigate("/workspaces");
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  };

  const invite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    try {
      await api.addMember(workspaceId, inviteEmail.trim(), "editor");
      setInviteEmail("");
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px" }}>
      <Link to="/workspaces" className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", display: "inline-flex", alignItems: "center", gap: 4 }}>
        <ArrowLeft size={12} /> All workspaces
      </Link>

      {error && <div className="mono" style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>{error}</div>}

      <section style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Sheets</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label className="btn btn-primary" style={{ cursor: "pointer" }}>
            <Upload size={13} /> Upload CSV / Excel
            <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" onChange={upload} style={{ display: "none" }} />
          </label>
          <form onSubmit={addFromUrl} style={{ display: "flex", gap: 8 }}>
            <input
              type="url"
              placeholder="Public Google Sheets link"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              style={{ width: 260 }}
            />
            <button className="btn" type="submit"><Link2 size={13} /> Add</button>
          </form>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {sheets.map((s) => (
            <div key={s.id} className="card" style={{ padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="mono" style={{ fontSize: 12 }}>{s.name}</span>
                  {s.sourceType === "google_sheets" && (
                    <span className="mono" style={{ fontSize: 10, color: "var(--ink-faint)" }}>updated {timeAgo(s.updatedAt)}</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                  {s.sourceType === "google_sheets" && (
                    <button
                      className="btn-ghost"
                      disabled={refreshingId === s.id}
                      onClick={() => refreshSheet(s.id)}
                      title="Refresh from Google Sheets"
                    >
                      <RefreshCw size={13} className={refreshingId === s.id ? "spin" : undefined} />
                    </button>
                  )}
                  <button className="btn-ghost" onClick={async () => { await api.deleteSheet(workspaceId, s.id); load(); }}><Trash2 size={13} /></button>
                </div>
              </div>
              <CalculatedFieldsPanel workspaceId={workspaceId} sheet={s} onChange={load} />
            </div>
          ))}
          {sheets.length === 0 && <div className="mono" style={{ fontSize: 12, color: "var(--ink-faint)" }}>No sheets uploaded yet.</div>}
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Dashboards</h2>
        <form onSubmit={createDashboard} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input type="text" placeholder="New dashboard name" value={dashName} onChange={(e) => setDashName(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-primary" type="submit"><Plus size={13} /> Create</button>
        </form>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {dashboards.map((d) => {
            const canDelete = !!(user && (user.id === d.created_by || user.is_admin));
            return (
              <div key={d.id} className="card" style={{ padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Link to={`/workspaces/${workspaceId}/dashboards/${d.id}`} style={{ textDecoration: "none", color: "var(--ink)", fontSize: 13, fontWeight: 500, flex: 1 }}>
                  {d.name}
                </Link>
                {canDelete && (
                  <button className="btn-ghost" onClick={() => deleteDashboard(d)} title="Delete dashboard">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
          {dashboards.length === 0 && <div className="mono" style={{ fontSize: 12, color: "var(--ink-faint)" }}>No dashboards yet.</div>}
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><Users size={14} /> Members</h2>
        <form onSubmit={invite} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input type="email" placeholder="Invite by email (must already have an account)" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} style={{ flex: 1 }} />
          <button className="btn" type="submit">Add as editor</button>
        </form>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {members.map((m) => (
            <div key={m.id} className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>{m.name} · {m.email} · {m.role}</div>
          ))}
        </div>
      </section>

      {canDeleteWorkspace && (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: "var(--red)" }}>Danger zone</h2>
          {!confirmingDelete ? (
            <button className="btn" style={{ color: "var(--red)" }} onClick={() => setConfirmingDelete(true)}>
              <Trash2 size={13} /> Delete workspace
            </button>
          ) : (
            <div className="card" style={{ padding: 14, borderColor: "var(--red)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <TriangleAlert size={16} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
                <div className="mono" style={{ fontSize: 12, lineHeight: 1.6 }}>
                  This permanently deletes {sheets.length} sheet{sheets.length === 1 ? "" : "s"}, {dashboards.length} dashboard{dashboards.length === 1 ? "" : "s"},
                  {" "}and removes all {members.length} member{members.length === 1 ? "" : "s"}. This cannot be undone.
                  {dashboardsByOthers > 0 && (
                    <div style={{ color: "var(--red)", marginTop: 4 }}>
                      {dashboardsByOthers} of those dashboard{dashboardsByOthers === 1 ? " was" : "s were"} created by other member{dashboardsByOthers === 1 ? "" : "s"} — they will lose it too.
                    </div>
                  )}
                </div>
              </div>
              {deleteError && <div className="mono" style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>{deleteError}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn" onClick={() => { setConfirmingDelete(false); setDeleteError(""); }} disabled={deleting}>Cancel</button>
                <button className="btn btn-primary" style={{ background: "var(--red)", borderColor: "var(--red)" }} onClick={doDeleteWorkspace} disabled={deleting}>
                  {deleting ? "Deleting…" : "Yes, delete this workspace"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
