import jwt from "jsonwebtoken";
import db from "../db.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing auth token" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // is_admin and is_disabled are looked up fresh from the DB rather than trusted from the
    // token, since both can change (via ADMIN_EMAIL + restart, or an admin's disable action)
    // without the token being reissued — a disabled account loses access immediately, even
    // with an already-issued, unexpired JWT.
    const row = db.prepare("SELECT is_admin, is_disabled FROM users WHERE id = ?").get(payload.sub);
    if (!row) return res.status(401).json({ error: "Invalid or expired token" });
    if (row.is_disabled) return res.status(401).json({ error: "This account has been disabled" });
    req.user = { id: payload.sub, email: payload.email, name: payload.name, is_admin: !!row.is_admin };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Attaches req.member = { role } if the user belongs to the workspace in req.params.workspaceId
export function requireWorkspaceAccess(minRole = "viewer") {
  const rank = { viewer: 0, editor: 1, owner: 2 };
  return (req, res, next) => {
    const workspaceId = req.params.workspaceId || req.body.workspaceId;
    const member = db
      .prepare("SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
      .get(workspaceId, req.user.id);
    if (!member) return res.status(403).json({ error: "Not a member of this workspace" });
    if (rank[member.role] < rank[minRole]) return res.status(403).json({ error: "Insufficient permissions" });
    req.member = member;
    next();
  };
}

// Attaches req.user if a valid Bearer token is present, but never rejects the request.
// Looks up is_admin/is_disabled fresh from the DB (same as requireAuth) so that routes
// gated by this + requireDashboardOwner can honor the admin-edit-any-dashboard override,
// and so a disabled account's token stops carrying any authority immediately, not just on
// requireAuth-gated routes — a disabled user hitting one of these routes is simply treated
// as unauthenticated rather than rejected outright, consistent with "never rejects".
export function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const row = db.prepare("SELECT is_admin, is_disabled FROM users WHERE id = ?").get(payload.sub);
      if (row && !row.is_disabled) {
        req.user = { id: payload.sub, email: payload.email, name: payload.name, is_admin: !!row.is_admin };
      }
    } catch {
      // invalid/expired token — proceed unauthenticated rather than rejecting
    }
  }
  next();
}

// There is exactly one admin for the whole site (see bootstrap.js's syncAdmin) — this
// just gates a route on req.user.is_admin, already looked up fresh by requireAuth above.
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Missing auth token" });
  if (!req.user.is_admin) return res.status(403).json({ error: "Admin access required" });
  next();
}

// Loads the dashboard at req.params.dashboardId onto req.dashboard. 404 if missing,
// 401 if unauthenticated, 403 unless req.user.id matches dashboards.created_by OR
// req.user.is_admin is true (the site admin can edit/delete any dashboard as an override,
// not a replacement, of the creator-owns-it rule).
export function requireDashboardOwner(req, res, next) {
  const dashboard = db.prepare("SELECT * FROM dashboards WHERE id = ?").get(req.params.dashboardId);
  if (!dashboard) return res.status(404).json({ error: "Dashboard not found" });
  if (!req.user) return res.status(401).json({ error: "Missing auth token" });
  if (req.user.id !== dashboard.created_by && !req.user.is_admin) {
    return res.status(403).json({ error: "Only the dashboard's creator can edit it" });
  }
  req.dashboard = dashboard;
  next();
}
