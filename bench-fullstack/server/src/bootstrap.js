import { nanoid, customAlphabet } from "nanoid";

// Avoids visually ambiguous characters (0/O, 1/I/L) since these are meant to be typed by hand.
const generateInviteCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

// Chicken-and-egg fix for invite-gated signup: the very first account can't be invited by
// an existing user because there isn't one yet. If the site has no users at all and no
// unused invite code is already sitting around, mint one with no creator and log it —
// that's the only way the eventual admin account (see syncAdmin below) ever gets created.
// Never regenerates once a user exists or an unused code is already pending.
export function bootstrapInviteCode(db) {
  const userCount = db.prepare("SELECT COUNT(*) c FROM users").get().c;
  if (userCount > 0) return;

  const pending = db.prepare("SELECT code FROM invite_codes WHERE used_by IS NULL LIMIT 1").get();
  if (pending) {
    console.log(`=== First-run bootstrap invite code still pending: ${pending.code} — use this to create the first account, then it's consumed ===`);
    return;
  }

  const code = generateInviteCode();
  db.prepare("INSERT INTO invite_codes (id, code, created_by) VALUES (?, ?, NULL)").run(nanoid(), code);
  console.log(`=== First-run bootstrap invite code: ${code} — use this to create the first account, then it's consumed ===`);
}

// There is exactly one admin for the whole site, set purely by matching ADMIN_EMAIL
// against a signed-up account — no in-app promotion flow, ever. Re-running this (e.g. on
// every restart) is what lets changing ADMIN_EMAIL + restarting move admin to a different
// account later; it's also what makes it safe to call before any account exists at all.
export function syncAdmin(db) {
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const match = adminEmail ? db.prepare("SELECT id, email FROM users WHERE email = ?").get(adminEmail) : null;

  if (!match) {
    console.log("No admin set — add ADMIN_EMAIL to .env once that account has signed up, then restart.");
    return;
  }

  db.prepare("UPDATE users SET is_admin = CASE WHEN id = ? THEN 1 ELSE 0 END").run(match.id);
  console.log(`Admin set: ${match.email} is the site admin (and the only one).`);
}
