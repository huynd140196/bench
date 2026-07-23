-- There is exactly one admin for the whole site, set purely by matching ADMIN_EMAIL
-- against a signed-up account (see bootstrap.js's syncAdmin) — no in-app promotion flow.
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
