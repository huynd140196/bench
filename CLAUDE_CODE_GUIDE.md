# Extending this with Claude Code

This project is a deliberately small starting point. The fastest way forward
is to open this folder in Claude Code (`claude` in the terminal, or the
desktop app) and hand it one of the prompts below at a time — each is scoped
to a single, reviewable change rather than "do everything."

Run Claude Code from the `bench-fullstack/` root so it can see both
`server/` and `client/`.

## Suggested order

1. Swap SQLite for Postgres (only worth it once you need real concurrency)
2. Real database connectors (the actual "BI" part of BI)
3. Roles & permissions polish
4. Bigger-data performance
5. Deployment
6. Nice-to-haves (exports, embedding, dark mode, tests)

## Prompts to use

### 1. Move from SQLite to Postgres + Prisma
```
Migrate server/ from better-sqlite3 to Postgres using Prisma. Keep the same
tables (users, workspaces, workspace_members, sheets, dashboards, charts)
and the same route behavior. Add a docker-compose.yml with a
Postgres service for local dev, and a Prisma schema + migration. Update
README.md accordingly.
```

### 2. Real database connectors (query live data, not just uploads)
```
Add a new connector type to the sheets table: alongside uploaded CSV/Excel,
support a "live" sheet backed by a saved read-only Postgres or MySQL
connection (host/port/db/user/password/query), stored encrypted at rest.
Add an endpoint that runs the saved query and caches results with a
configurable TTL, refreshed via a background job. Add a client UI for
adding a database connection and picking a query result as a sheet.
```

### 3. Scheduled refresh for uploaded/connected data
```
Add a background job (node-cron is fine) that refreshes any "live" sheet on
its configured schedule and updates dashboards that use it. Show a "last
refreshed" timestamp on each chart.
```

### 4. Roles & permissions polish
```
Extend workspace_members roles so "viewer" truly can't edit anything
(currently enforced server-side already — audit the client for places that
still show edit controls to viewers) and add a workspace settings page to
change a member's role or remove them.
```

### 5. Bigger datasets
```
Sheets currently store all rows as one JSON blob, which won't scale past
roughly 100k rows. Refactor sheet storage into a normalized rows table
(or Postgres JSONB with server-side aggregation) so chart aggregation happens
in SQL instead of in the Node process, and add pagination to the data table
chart type.
```

### 6. Deployment
```
Add a Dockerfile for server/ and client/, plus a docker-compose.yml that runs
both together with Postgres. Add deployment notes for Render/Fly.io (server)
and Vercel/Netlify (static client build) to README.md.
```

### 7. Nice-to-haves (pick any)
```
Add a "download as PNG" button to each chart card.
```
```
Add CSV export of a chart's underlying aggregated data.
```
```
Support embedding a single shared dashboard in an iframe on another site
(add appropriate CORS/CSP headers to the share route).
```
```
Add a dark mode toggle that respects prefers-color-scheme by default.
```
```
Add Vitest + React Testing Library for the client and a couple of
integration tests (Vitest or Jest + supertest) for the server auth and
dashboard routes.
```

## Tips when prompting Claude Code on this repo

- Mention `server/` or `client/` explicitly — the two are separate npm
  projects with separate `package.json` files.
- The chart aggregation logic is duplicated in `client/src/components/charting.js`
  (client-side charts) — if you move aggregation server-side, update or
  remove that duplication rather than leaving both paths.
- `server/src/db.js` runs `CREATE TABLE IF NOT EXISTS` on startup instead of
  using migrations — fine for this starter, but say so explicitly if you want
  Claude Code to add a real migration tool instead of just editing that file.
