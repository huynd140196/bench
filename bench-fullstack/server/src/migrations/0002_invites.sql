-- Invite-gated signup. created_by is nullable: the very first invite code on a fresh site
-- (see bootstrap.js) has no creator, since there's no user yet to have created it.
CREATE TABLE invite_codes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  created_by TEXT REFERENCES users(id),
  used_by TEXT REFERENCES users(id),
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
