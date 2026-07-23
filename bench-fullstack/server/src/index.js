import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db from "./db.js";
import { bootstrapInviteCode, syncAdmin } from "./bootstrap.js";
import authRoutes from "./routes/auth.js";
import workspaceRoutes from "./routes/workspaces.js";
import sheetRoutes from "./routes/sheets.js";
import dashboardRoutes, { publicDashboardRouter } from "./routes/dashboards.js";
import chartRoutes from "./routes/charts.js";
import inviteRoutes from "./routes/invites.js";
import adminRoutes from "./routes/admin.js";
import adminAuthRoutes from "./routes/adminAuth.js";

dotenv.config();

// Migrations (triggered by importing db.js above) have already run by this point — Node's
// ESM loader fully evaluates db.js's top-level await before this import resolves.
bootstrapInviteCode(db);
syncAdmin(db);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";

const app = express();

// In production the built client is served from this same origin (see the static/catch-all
// block below), so there's no cross-origin request to allow in the first place — applying
// the cors() middleware there would just be dead weight (and a second place to keep in sync
// with the real origin). Dev keeps the CLIENT_ORIGIN check as-is, since Vite's dev server
// runs on its own port (5173) separate from this API's.
if (!isProduction) {
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
}
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/workspaces", sheetRoutes);       // /:workspaceId/sheets...
app.use("/api/workspaces", dashboardRoutes);   // /:workspaceId/dashboards...
app.use("/api/workspaces", chartRoutes);       // /:workspaceId/dashboards/:id/charts...
app.use("/api/dashboards", publicDashboardRouter); // / (site-wide) and /:dashboardId — both public
app.use("/api/invites", inviteRoutes);
// Mounted before /api/admin: adminRoutes applies a blanket requireAuth+requireAdmin to
// everything under that prefix, which would otherwise swallow this unauthenticated login
// route before it's ever reached.
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin", adminRoutes);

// One process, one origin: the built client (client/dist, produced by `npm run build`) is
// served directly by this same Express app in production, rather than needing a separate
// static host — sidesteps CORS entirely since every request is same-origin. Registered after
// every /api/* route above, so API paths are never shadowed by this. The catch-all excludes
// /api so an unmatched API route still falls through to Express's normal 404 instead of
// returning index.html; everything else (e.g. /workspaces/:id, a client-side route with no
// matching file) gets index.html so React Router can handle it after the page loads — this
// is what makes hitting refresh on a deep link work instead of 404ing.
if (isProduction) {
  const clientDist = path.join(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Bench API listening on http://localhost:${port}`));
