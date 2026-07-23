-- Admin can disable an account without deleting it. Checked fresh on every request by
-- requireAuth/optionalAuth, so it takes effect immediately, not just at next login.
ALTER TABLE users ADD COLUMN is_disabled INTEGER NOT NULL DEFAULT 0;
