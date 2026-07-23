import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();
// "/api/admin" isn't shared with any other router, so a blanket .use() here is safe
// (unlike sheets/dashboards/charts, which share "/api/workspaces" and apply auth per-route).
router.use(requireAuth, requireAdmin);

router.get("/users", (req, res) => {
  const rows = db.prepare("SELECT id, email, name, is_admin, is_disabled, created_at FROM users ORDER BY created_at").all();
  res.json({ users: rows.map((u) => ({ ...u, is_admin: !!u.is_admin, is_disabled: !!u.is_disabled })) });
});

// Toggle an account's is_disabled flag. Checked fresh on every request by
// requireAuth/optionalAuth, so this takes effect immediately, not just at next login.
router.patch("/users/:userId/disable", (req, res) => {
  if (req.params.userId === req.user.id) {
    return res.status(400).json({ error: "You cannot disable your own account" });
  }
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const disabled = !!req.body.disabled;
  db.prepare("UPDATE users SET is_disabled = ? WHERE id = ?").run(disabled ? 1 : 0, req.params.userId);
  res.json({ ok: true, is_disabled: disabled });
});

// Hard delete. Refuses (409) if the account owns any workspace or created any dashboard or
// sheet — those are real product data other workspace members may depend on, so deleting the
// account is never allowed to cascade-delete them as a side effect. invite_codes references
// are nulled out first since those are just bookkeeping (who generated/used a code), not
// data anyone owns — blocking on those would make almost every user undeletable, since
// everyone consumes an invite code to sign up.
router.delete("/users/:userId", (req, res) => {
  if (req.params.userId === req.user.id) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }
  const { userId } = req.params;
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const workspaces = db.prepare("SELECT COUNT(*) c FROM workspaces WHERE owner_id = ?").get(userId).c;
  const dashboards = db.prepare("SELECT COUNT(*) c FROM dashboards WHERE created_by = ?").get(userId).c;
  const sheets = db.prepare("SELECT COUNT(*) c FROM sheets WHERE created_by = ?").get(userId).c;
  if (workspaces > 0 || dashboards > 0 || sheets > 0) {
    return res.status(409).json({
      error: `Cannot delete: this account owns ${workspaces} workspace(s), created ${dashboards} dashboard(s), and created ${sheets} sheet(s). Reassign or remove those first.`,
      counts: { workspaces, dashboards, sheets },
    });
  }

  db.exec("BEGIN");
  try {
    db.prepare("UPDATE invite_codes SET created_by = NULL WHERE created_by = ?").run(userId);
    db.prepare("UPDATE invite_codes SET used_by = NULL WHERE used_by = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  res.json({ ok: true });
});

// Every workspace site-wide, regardless of the admin's own membership — the admin can delete
// any workspace via DELETE /api/workspaces/:workspaceId's admin bypass even with zero
// membership rows there, so this listing can't be scoped by membership either.
router.get("/workspaces", (req, res) => {
  const rows = db.prepare(`
    SELECT
      w.id, w.name, w.owner_id, u.email AS owner_email, u.name AS owner_name, w.created_at,
      (SELECT COUNT(*) FROM sheets WHERE workspace_id = w.id) AS sheet_count,
      (SELECT COUNT(*) FROM dashboards WHERE workspace_id = w.id) AS dashboard_count,
      (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id) AS member_count,
      (SELECT COUNT(*) FROM dashboards WHERE workspace_id = w.id AND created_by != w.owner_id) AS dashboards_by_others
    FROM workspaces w
    JOIN users u ON u.id = w.owner_id
    ORDER BY w.created_at DESC
  `).all();
  res.json({ workspaces: rows });
});

router.get("/invites", (req, res) => {
  const rows = db.prepare(`
    SELECT ic.code, ic.created_at, ic.used_at, u.email AS used_by_email, u.name AS used_by_name
    FROM invite_codes ic
    LEFT JOIN users u ON u.id = ic.used_by
    ORDER BY ic.created_at DESC
  `).all();
  res.json({
    invites: rows.map((r) => ({
      code: r.code,
      createdAt: r.created_at,
      usedAt: r.used_at,
      usedBy: r.used_by_email ? { email: r.used_by_email, name: r.used_by_name } : null,
    })),
  });
});

export default router;
