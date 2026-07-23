import { Router } from "express";
import { nanoid } from "nanoid";
import db from "../db.js";
import { requireAuth, requireWorkspaceAccess, optionalAuth, requireDashboardOwner } from "../middleware/auth.js";
import { withCalculatedFields } from "../utils/calculatedFields.js";

const router = Router();

// Dashboards are public: anyone (including logged-out visitors) can list and view them.
// Only the workspace-scoped create route, and owner-gated edit/delete below, require auth.
router.get("/:workspaceId/dashboards", optionalAuth, (req, res) => {
  const rows = db
    .prepare("SELECT id, name, updated_at, created_by FROM dashboards WHERE workspace_id = ? ORDER BY updated_at DESC")
    .all(req.params.workspaceId);
  res.json({ dashboards: rows });
});

// Sheets themselves stay auth-gated, but a public dashboard still needs its charts' data —
// so embed the rows for exactly the sheets its charts reference, same as the old share.js did.
function getDashboard(req, res) {
  const dash = db.prepare("SELECT * FROM dashboards WHERE id = ?").get(req.params.dashboardId);
  if (!dash) return res.status(404).json({ error: "Dashboard not found" });
  const charts = db.prepare("SELECT * FROM charts WHERE dashboard_id = ? ORDER BY sort_order").all(dash.id)
    .map((c) => ({
      ...c,
      drill_fields: c.drill_fields_json ? JSON.parse(c.drill_fields_json) : (c.x_field ? [c.x_field] : []),
    }));
  const sheetIds = [...new Set(charts.map((c) => c.sheet_id))];
  const sheets = sheetIds
    .map((id) => db.prepare("SELECT id, name, columns_json, rows_json, calculated_fields_json FROM sheets WHERE id = ?").get(id))
    .filter(Boolean)
    .map((s) => {
      const calculatedFields = JSON.parse(s.calculated_fields_json || "[]");
      const { columns, rows } = withCalculatedFields(JSON.parse(s.columns_json), JSON.parse(s.rows_json), calculatedFields);
      return { id: s.id, name: s.name, columns, rows };
    });
  res.json({ dashboard: { ...dash, filters: JSON.parse(dash.filters_json) }, charts, sheets });
}

router.get("/:workspaceId/dashboards/:dashboardId", optionalAuth, getDashboard);

router.post("/:workspaceId/dashboards", requireAuth, requireWorkspaceAccess("editor"), (req, res) => {
  const { name = "Untitled dashboard" } = req.body;
  const id = nanoid();
  db.prepare("INSERT INTO dashboards (id, workspace_id, name, created_by) VALUES (?, ?, ?, ?)").run(
    id, req.params.workspaceId, name, req.user.id
  );
  res.json({ dashboard: { id, name } });
});

router.patch("/:workspaceId/dashboards/:dashboardId", optionalAuth, requireDashboardOwner, (req, res) => {
  const { name, filters } = req.body;
  const dash = req.dashboard;
  db.prepare("UPDATE dashboards SET name = ?, filters_json = ?, updated_at = datetime('now') WHERE id = ?").run(
    name ?? dash.name,
    filters ? JSON.stringify(filters) : dash.filters_json,
    dash.id
  );
  res.json({ ok: true });
});

router.delete("/:workspaceId/dashboards/:dashboardId", optionalAuth, requireDashboardOwner, (req, res) => {
  db.prepare("DELETE FROM dashboards WHERE id = ?").run(req.params.dashboardId);
  res.json({ ok: true });
});

export default router;

// Dashboards are globally addressable by id (nanoid is unique across workspaces), so a
// visitor who doesn't know a dashboard's workspaceId can still fetch it via this route.
export const publicDashboardRouter = Router();

// Site-wide public homepage feed: every dashboard across every workspace, grouped by
// workspace. No auth, no membership check — same public-by-default reasoning as the
// per-workspace dashboard list/get routes above.
publicDashboardRouter.get("/", optionalAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT w.id AS workspace_id, w.name AS workspace_name, d.id, d.name, d.updated_at
    FROM dashboards d
    JOIN workspaces w ON w.id = d.workspace_id
    ORDER BY w.name COLLATE NOCASE, d.updated_at DESC
  `).all();

  const byWorkspace = new Map();
  for (const r of rows) {
    if (!byWorkspace.has(r.workspace_id)) {
      byWorkspace.set(r.workspace_id, { workspaceId: r.workspace_id, workspaceName: r.workspace_name, dashboards: [] });
    }
    byWorkspace.get(r.workspace_id).dashboards.push({ id: r.id, name: r.name, updated_at: r.updated_at });
  }
  res.json({ workspaces: [...byWorkspace.values()] });
});

publicDashboardRouter.get("/:dashboardId", optionalAuth, getDashboard);
