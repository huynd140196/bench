# Bench — full-stack BI workbench (starter)

A minimal but real full-stack version of the Bench BI app: accounts, workspaces,
uploaded sheets, and dashboards that are public by default — all backed by a
database instead of living only in the browser tab. The site itself is
invite-only to sign up, but every dashboard anyone creates is publicly
browsable from the homepage, no account required.

## Architecture

```
bench-fullstack/
├── server/     Express API + SQLite (better-sqlite3)
└── client/     React (Vite) single-page app
```

- **Database driver**: Node's built-in `node:sqlite` module — no native
  compilation, no build tools required on any OS. Requires Node.js 22.13+ /
  23.4+ (any current Node install qualifies). You'll see a one-line
  `ExperimentalWarning: SQLite is an experimental feature` in the server logs
  — that's expected and harmless, not an error.
- **Auth**: email/password, JWT stored in `sessionStorage` on the client.
- **Data model**: `users → workspaces → workspace_members`, and per-workspace
  `sheets` (uploaded CSV/Excel/Google Sheets, stored as JSON rows), `dashboards`,
  and `charts` (each chart points at one sheet + a chart type/fields/aggregation).
- **Sharing**: dashboards need no explicit "share" step — every dashboard (and
  a workspace's list of dashboard names/ids) is publicly viewable by anyone,
  logged in or not, at `/dashboards/:dashboardId` (and, for workspace members,
  at `/workspaces/:workspaceId/dashboards/:dashboardId`). The dashboard's own
  id is its public identifier — there's no separate token to generate or
  revoke. Editing (rename, filters, charts, delete) is permanently restricted
  to `dashboards.created_by`, the user who created it — this holds even if
  that user later leaves the workspace or the workspace changes owners.
  Sheets, workspaces, and membership stay private to workspace members.
- **File parsing**: uploads are parsed server-side (`papaparse` for CSV,
  `xlsx`/SheetJS for Excel). A multi-sheet workbook is split into one `sheets`
  row per tab automatically, same as the in-browser prototype. A public
  Google Sheets link can also be added directly as a sheet — the server
  fetches its CSV export and parses it the same way. Sheets imported from a
  link remember their `source_url` and can be manually refreshed later
  (updates the same row in place, doesn't create a duplicate); uploaded
  files have no source to refresh from.
- **Calculated fields**: define a derived measure per sheet (builder mode for
  simple `A op B` formulas, or an advanced free-text formula) and it appears
  alongside real measure columns anywhere one can be picked. Formulas are
  parsed and evaluated with `expr-eval` (never `eval`/`new Function`) and
  computed per-row on read, not stored.
- **Drill-down**: a bar/line/area/pie chart can be configured with an ordered
  list of dimension fields (e.g. Category → Product → SKU). Clicking a
  segment drills into the next level and re-aggregates; a breadcrumb above
  the chart tracks depth and jumps back to any prior level. Drill position
  is client-only (not persisted) — only the configured field order is saved.
- **Click-to-cross-filter**: clicking a segment also highlights it within its
  own chart and sets a dashboard-wide, client-only selection that filters
  every other chart sourced from the same sheet, shown as a dismissible
  "Filtered by field: value" chip. This is separate from, and additive to,
  the persisted checkbox Filters panel, and works for anonymous viewers on
  the public read-only view exactly as it does for the dashboard's owner.
- **Public homepage**: `/` lists every dashboard site-wide, grouped by
  workspace, with no login required — it's the landing page for everyone,
  logged in or not. A logged-in visitor gets a discreet "My workspaces" link
  in the corner; that's the only account-related UI on the page.
- **Invite-only signup**: `POST /api/auth/signup` requires a valid, unused
  invite code. `/login` and `/signup` are real routes reachable by direct
  URL, but nothing on the public homepage links to them — the invite-code
  check is the actual access control, hiding the links is just not
  advertising them.
- **Single site admin**: exactly one account is ever admin, set by matching
  `ADMIN_EMAIL` (server/.env) against a signed-up account at startup — no
  in-app promotion flow. Only the admin can generate invite codes, from the
  `/admin` page (also direct-URL-only, also enforced server-side).

This is intentionally a starting point, not a finished product — see
`CLAUDE_CODE_GUIDE.md` for the natural next steps and ready-to-use prompts.

## Quickstart

### 1. Server

```bash
cd server
cp .env.example .env      # edit JWT_SECRET at minimum
npm install
npm run dev                # http://localhost:4000
```

SQLite creates `bench.sqlite` automatically on first run — no separate
database server needed for local development. Schema changes are versioned
migrations (see below), so picking up a new one is just restarting the
server — migrations run automatically, there's nothing to delete.

### 2. Client

```bash
cd client
npm install
npm run dev                # http://localhost:5173
```

Open http://localhost:5173 — you'll land on the public homepage. Signing up
requires an invite code (see the first-run sequence just below); every new
account gets a personal workspace automatically once signed up.

### 3. First-run sequence (invite codes + the site admin)

Signup is invite-gated and there's exactly one site admin — set up in this
order the first time:

1. Start the server. Since there are no users yet, it logs a one-time
   bootstrap invite code to the console:
   `=== First-run bootstrap invite code: XXXXXXXX — use this to create the
   first account, then it's consumed ===`. It won't regenerate on later
   restarts as long as that code is still unused or any account exists.
2. Go to `/signup` (not linked from the homepage — this is the one time
   you'll need the direct URL) and create an account using that code.
3. Add `ADMIN_EMAIL=<that account's email>` to `server/.env`.
4. Restart the server. It logs `Admin set: <email> is the site admin (and
   the only one).` — that account can now sign in at `/admin` to generate
   further invite codes for everyone else. Changing `ADMIN_EMAIL` and
   restarting again is how admin would ever move to a different account.

### 4. Try multi-user sharing

- As the admin, generate an invite code on `/admin` and use it to sign up a
  second account with a different email.
- From the first account, in **Workspace → Members**, invite the second
  account's email as an editor.
- Or just click **Copy link** on any dashboard — every dashboard is public
  and read-only for everyone except the account that created it, no sharing
  step required. It's also listed on the public homepage (`/`) automatically.

## Migrations

Schema changes live in `server/src/migrations/` as numbered files
(`0001_init.js`, `0002_invites.sql`, `0003_admin.sql`, ...), run in filename
order on every server startup. Each one runs at most once, tracked in the
`schema_migrations` table, inside its own transaction. Most migrations are
plain `.sql` files executed as-is; a migration needs to be `.js` (exporting
`(db, { addColumnIfNotExists }) => { ... }`) only if it has to do something
conditional plain SQL can't express — `0001_init.js` is `.js` for exactly
this reason, since it has to safely backfill columns that earlier versions
of this app added ad-hoc and that may or may not already exist on a given
database.

**Going forward: every schema change is a new numbered file.** Never edit an
already-shipped migration file, and never go back to raw `CREATE TABLE`
statements in `db.js`.

## Environment variables (server/.env)

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 4000) |
| `JWT_SECRET` | Signing secret for auth tokens — change this |
| `CLIENT_ORIGIN` | Allowed CORS origin for the client |
| `DB_PATH` | SQLite file path |
| `ADMIN_EMAIL` | Email of the one site admin — see the first-run sequence above. Unset by default; changing it and restarting moves admin to a different account |

The client reads `VITE_API_URL` (defaults to `http://localhost:4000/api`) —
set this in a `client/.env` file when deploying client and server separately.

## Known limitations (by design, for a starter)

- SQLite, not Postgres — fine for a single small deployment, not for scaling.
- No email verification, password reset, or OAuth.
- No real-time collaboration (dashboards don't live-update between users).
- No native database connectors — sheets only (CSV/Excel/Google Sheets export).
- Sheet data is stored as a JSON blob per sheet, not normalized rows — simple,
  but not efficient for very large datasets (>~100k rows).

See `CLAUDE_CODE_GUIDE.md` for how to tackle these.
