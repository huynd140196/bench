import { Router } from "express";
import { nanoid } from "nanoid";
import db from "../db.js";
import { requireAuth, requireWorkspaceAccess } from "../middleware/auth.js";

const router = Router();

// requireAuth is applied per-route (not via router.use) because this router shares its
// "/api/workspaces" mount prefix with sheets/dashboards/charts routers — a blanket .use()
// here would intercept every request under that prefix before it reaches those routers,
// including the dashboard routes that are intentionally public.

// List workspaces the current user belongs to
router.get("/", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT w.id, w.name, w.owner_id, wm.role
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.user_id = ?
       ORDER BY w.created_at DESC`
    )
    .all(req.user.id);
  res.json({ workspaces: rows });
});

router.post("/", requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const id = nanoid();
  db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)").run(id, name, req.user.id);
  db.prepare("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')").run(id, req.user.id);
  res.json({ workspace: { id, name, owner_id: req.user.id, role: "owner" } });
});

// Cascade-deletes everything inside the workspace (workspace_members, sheets, dashboards,
// charts) via the ON DELETE CASCADE foreign keys already declared in the schema — confirmed
// these actually fire under node:sqlite with PRAGMA foreign_keys = ON (db.js), not just
// declared and silently ignored. A plain DELETE FROM workspaces is therefore sufficient; no
// manual per-table cleanup needed.
//
// Deliberate, documented exception to "only a dashboard's creator can ever delete it": a
// workspace owner deleting their own workspace cascades away every dashboard in it, including
// ones created by other members who never authorized that and have no other way to delete
// their own dashboard. Accepted tradeoff, not an oversight.
//
// Authorization is intentionally written as two separate conditions, not one merged check:
// requireAdmin passing means "any workspace, unconditionally" (the admin may have zero
// membership rows here); the owner check is scoped to THIS SPECIFIC workspaceId only, so a
// regular user can never reach another user's workspace through this route no matter their
// role elsewhere.
router.delete("/:workspaceId", requireAuth, (req, res) => {
  const workspace = db.prepare("SELECT id FROM workspaces WHERE id = ?").get(req.params.workspaceId);
  if (!workspace) return res.status(404).json({ error: "Workspace not found" });

  const isAdmin = req.user.is_admin;
  const member = db
    .prepare("SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
    .get(req.params.workspaceId, req.user.id);
  const isOwnerOfThisWorkspace = !!member && member.role === "owner";

  if (!isAdmin && !isOwnerOfThisWorkspace) {
    return res.status(403).json({ error: "Only this workspace's owner or the site admin can delete it" });
  }

  db.prepare("DELETE FROM workspaces WHERE id = ?").run(req.params.workspaceId);
  res.json({ ok: true });
});

router.get("/:workspaceId/members", requireAuth, requireWorkspaceAccess("viewer"), (req, res) => {
  const members = db
    .prepare(
      `SELECT u.id, u.email, u.name, wm.role
       FROM workspace_members wm JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = ?`
    )
    .all(req.params.workspaceId);
  res.json({ members });
});

// Add an existing user (by email) to the workspace
router.post("/:workspaceId/members", requireAuth, requireWorkspaceAccess("owner"), (req, res) => {
  const { email, role = "editor" } = req.body;
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get((email || "").toLowerCase());
  if (!user) return res.status(404).json({ error: "No user with that email has signed up yet" });
  db.prepare("INSERT OR REPLACE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)").run(
    req.params.workspaceId, user.id, role
  );
  res.json({ ok: true });
});

export default router;
