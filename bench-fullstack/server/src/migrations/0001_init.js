// Baseline schema. This is a .js migration (not .sql like the rest) because it has to be
// safe on two very different starting points:
//   - a brand new, empty database — the CREATE TABLE IF NOT EXISTS block below builds
//     everything at once, already including columns that were added ad-hoc in later app
//     versions (sheets.source_type/source_url/updated_at/calculated_fields_json,
//     charts.drill_fields_json);
//   - a pre-existing database that was created by this project's old
//     `CREATE TABLE IF NOT EXISTS` block in db.js, before this migration system existed,
//     and may be missing some of those ad-hoc columns depending on which app version it
//     was last run against. SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so
//     the `addColumnIfNotExists` helper (passed in by the migration runner) checks
//     `PRAGMA table_info` before adding each one — that's the part plain declarative SQL
//     can't express, hence the .js instead of .sql here.
export default function migrate(db, { addColumnIfNotExists }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'editor', -- owner | editor | viewer
      PRIMARY KEY (workspace_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS sheets (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      columns_json TEXT NOT NULL,   -- [{name, type}]
      rows_json TEXT NOT NULL,      -- [{...row}]
      source_type TEXT NOT NULL DEFAULT 'upload', -- upload | google_sheets
      source_url TEXT,              -- original pasted URL, only for google_sheets
      calculated_fields_json TEXT NOT NULL DEFAULT '[]', -- [{name, formula}], computed on read, not stored
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dashboards (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      filters_json TEXT NOT NULL DEFAULT '{}',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS charts (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
      sheet_id TEXT NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'bar',
      x_field TEXT,
      y_field TEXT,
      agg TEXT NOT NULL DEFAULT 'sum',
      sort_order INTEGER NOT NULL DEFAULT 0,
      drill_fields_json TEXT -- ordered dimension field names to drill through; null means just [x_field]
    );

    DROP TABLE IF EXISTS share_links;
  `);

  // Backfill for databases that predate this migration and may be missing some of these
  // (all created via ad-hoc CREATE TABLE IF NOT EXISTS edits in earlier app versions).
  addColumnIfNotExists(db, "sheets", "source_type", "TEXT NOT NULL DEFAULT 'upload'");
  addColumnIfNotExists(db, "sheets", "source_url", "TEXT");
  addColumnIfNotExists(db, "sheets", "calculated_fields_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfNotExists(db, "charts", "drill_fields_json", "TEXT");

  // updated_at needs special handling: SQLite's ALTER TABLE ADD COLUMN only allows
  // constant defaults (not `datetime('now')`, and — empirically, in this SQLite build —
  // not even `CURRENT_TIMESTAMP`), so it can't be added with the same
  // `DEFAULT (datetime('now'))` the CREATE TABLE above uses for a fresh database. Add it
  // nullable instead and backfill existing rows in a single UPDATE; the app now sets
  // updated_at explicitly on every insert (see sheets.js) rather than depending on a
  // table-level default, so this works the same on both a fresh and a backfilled table.
  addColumnIfNotExists(db, "sheets", "updated_at", "TEXT");
  db.exec("UPDATE sheets SET updated_at = datetime('now') WHERE updated_at IS NULL");
}
