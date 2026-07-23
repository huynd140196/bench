import { Router } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import db from "../db.js";
import { requireAuth, requireWorkspaceAccess } from "../middleware/auth.js";
import { parseUpload } from "../utils/parse.js";
import { fetchGoogleSheet } from "../utils/googleSheets.js";
import { validateCalculatedFields, withCalculatedFields } from "../utils/calculatedFields.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const router = Router();
// requireAuth is applied per-route (not via router.use) — this router shares its
// "/api/workspaces" mount prefix with the dashboards router, and a blanket .use() here
// would intercept every request under that prefix, including the public dashboard routes.

router.get("/:workspaceId/sheets", requireAuth, requireWorkspaceAccess("viewer"), (req, res) => {
  const rows = db
    .prepare("SELECT id, name, columns_json, created_at, updated_at, source_type, calculated_fields_json FROM sheets WHERE workspace_id = ? ORDER BY created_at")
    .all(req.params.workspaceId);
  res.json({
    sheets: rows.map((r) => ({
      id: r.id,
      name: r.name,
      columns: JSON.parse(r.columns_json),
      calculatedFields: JSON.parse(r.calculated_fields_json || "[]"),
      sourceType: r.source_type,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

router.get("/:workspaceId/sheets/:sheetId", requireAuth, requireWorkspaceAccess("viewer"), (req, res) => {
  const row = db.prepare("SELECT * FROM sheets WHERE id = ? AND workspace_id = ?").get(req.params.sheetId, req.params.workspaceId);
  if (!row) return res.status(404).json({ error: "Sheet not found" });
  const calculatedFields = JSON.parse(row.calculated_fields_json || "[]");
  const { columns, rows } = withCalculatedFields(JSON.parse(row.columns_json), JSON.parse(row.rows_json), calculatedFields);
  res.json({ sheet: { id: row.id, name: row.name, columns, rows, calculatedFields } });
});

// multipart upload: field name "file". Splits multi-sheet workbooks into multiple sheet rows.
router.post("/:workspaceId/sheets/upload", requireAuth, requireWorkspaceAccess("editor"), upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  let sheets;
  try {
    sheets = parseUpload(req.file.buffer, req.file.originalname);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const insert = db.prepare(
    "INSERT INTO sheets (id, workspace_id, name, columns_json, rows_json, created_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  );
  const created = sheets.map((s) => {
    const id = nanoid();
    insert.run(id, req.params.workspaceId, s.name, JSON.stringify(s.columns), JSON.stringify(s.rows), req.user.id);
    return { id, name: s.name, columns: s.columns };
  });
  res.json({ sheets: created });
});

router.post("/:workspaceId/sheets/from-url", requireAuth, requireWorkspaceAccess("editor"), async (req, res) => {
  const { url, name } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });
  let parsedSheet;
  try {
    parsedSheet = await fetchGoogleSheet(url, name);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const id = nanoid();
  db.prepare(
    "INSERT INTO sheets (id, workspace_id, name, columns_json, rows_json, source_type, source_url, created_by, updated_at) VALUES (?, ?, ?, ?, ?, 'google_sheets', ?, ?, datetime('now'))"
  ).run(id, req.params.workspaceId, parsedSheet.name, JSON.stringify(parsedSheet.columns), JSON.stringify(parsedSheet.rows), url, req.user.id);
  res.json({ sheet: { id, name: parsedSheet.name, columns: parsedSheet.columns } });
});

router.post("/:workspaceId/sheets/:sheetId/refresh", requireAuth, requireWorkspaceAccess("editor"), async (req, res) => {
  const sheet = db.prepare("SELECT * FROM sheets WHERE id = ? AND workspace_id = ?").get(req.params.sheetId, req.params.workspaceId);
  if (!sheet) return res.status(404).json({ error: "Sheet not found" });
  if (sheet.source_type !== "google_sheets") return res.status(400).json({ error: "Only Google Sheets imports can be refreshed" });

  let parsedSheet;
  try {
    parsedSheet = await fetchGoogleSheet(sheet.source_url, sheet.name);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  db.prepare(
    "UPDATE sheets SET columns_json = ?, rows_json = ?, updated_at = datetime('now') WHERE id = ?").run(
    JSON.stringify(parsedSheet.columns), JSON.stringify(parsedSheet.rows), sheet.id
  );
  res.json({ ok: true });
});

router.patch("/:workspaceId/sheets/:sheetId/calculated-fields", requireAuth, requireWorkspaceAccess("editor"), (req, res) => {
  const sheet = db.prepare("SELECT * FROM sheets WHERE id = ? AND workspace_id = ?").get(req.params.sheetId, req.params.workspaceId);
  if (!sheet) return res.status(404).json({ error: "Sheet not found" });

  const fields = Array.isArray(req.body.fields) ? req.body.fields : [];
  try {
    validateCalculatedFields(fields, JSON.parse(sheet.columns_json));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  db.prepare("UPDATE sheets SET calculated_fields_json = ? WHERE id = ?").run(JSON.stringify(fields), sheet.id);
  res.json({ ok: true });
});

router.delete("/:workspaceId/sheets/:sheetId", requireAuth, requireWorkspaceAccess("editor"), (req, res) => {
  db.prepare("DELETE FROM sheets WHERE id = ? AND workspace_id = ?").run(req.params.sheetId, req.params.workspaceId);
  res.json({ ok: true });
});

export default router;
