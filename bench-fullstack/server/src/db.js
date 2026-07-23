import { DatabaseSync } from "node:sqlite";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "migrations");

// Node's built-in SQLite module (stable, no native compilation required —
// this is what avoids the better-sqlite3/node-gyp build-tools problem on
// Windows). Requires Node.js 22.13+ / 23.4+.
const db = new DatabaseSync(process.env.DB_PATH || "./bench.sqlite");
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — this checks PRAGMA table_info
// first so migrations can safely add a column whether or not it's already there.
function addColumnIfNotExists(db, table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (existing.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// Runs every migration in migrations/ (filename order) not yet recorded in
// schema_migrations, each inside its own transaction. `.sql` files are executed as-is;
// `.js` files export a `(db, helpers) => void` function, for migrations that need
// conditional logic plain SQL can't express (see 0001_init.js).
async function runMigrations() {
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql") || f.endsWith(".js"))
    .sort();
  const applied = new Set(db.prepare("SELECT name FROM schema_migrations").all().map((r) => r.name));
  const pending = files.filter((f) => !applied.has(f));

  if (!pending.length) {
    console.log("Migrations: up to date, nothing to run.");
    return;
  }

  for (const file of pending) {
    db.exec("BEGIN");
    try {
      if (file.endsWith(".sql")) {
        db.exec(fs.readFileSync(path.join(migrationsDir, file), "utf-8"));
      } else {
        const mod = await import(pathToFileURL(path.join(migrationsDir, file)));
        mod.default(db, { addColumnIfNotExists });
      }
      db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(file);
      db.exec("COMMIT");
      console.log(`Migrations: applied ${file}`);
    } catch (err) {
      db.exec("ROLLBACK");
      console.error(`Migrations: FAILED on ${file} — ${err.message}`);
      throw err;
    }
  }
}

await runMigrations();

export default db;
