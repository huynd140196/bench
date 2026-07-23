-- Password-reset flow for the admin account, reachable only from the hidden admin login
-- page. Only the hash is ever stored -- the raw token is printed to the server console only
-- and never returned to the browser in any response body.
CREATE TABLE admin_reset_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
