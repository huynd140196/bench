import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import db from "../db.js";
import { adminLoginAttempts } from "../adminLoginAttempts.js";
import { requestResetAttempts, REQUEST_RESET_KEY, resetPasswordAttempts } from "../adminResetAttempts.js";

const router = Router();

// Reset tokens are valid for 30 minutes -- long enough to go check the server console and
// come back, short enough that a stale, unused token isn't sitting around indefinitely.
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

// Separate, rate-limited login for the one is_admin account only -- deliberately not just
// "the regular /api/auth/login endpoint, but check is_admin afterward", since this endpoint
// exists specifically to be reachable only from the hidden admin login page and to fail
// closed (locked out) after repeated bad attempts, independent of the regular login route.
router.post("/login", (req, res) => {
  const ip = req.ip;
  if (adminLoginAttempts.isLocked(ip)) {
    return res.status(429).json({ error: "Too many failed attempts. Try again later." });
  }

  const { email, password } = req.body;
  const row = email ? db.prepare("SELECT * FROM users WHERE email = ? AND is_admin = 1").get(email.trim().toLowerCase()) : null;
  if (!row || !bcrypt.compareSync(password || "", row.password_hash)) {
    adminLoginAttempts.recordFailure(ip);
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (row.is_disabled) return res.status(401).json({ error: "This account has been disabled" });

  adminLoginAttempts.reset(ip);
  const user = { id: row.id, email: row.email, name: row.name, is_admin: true };
  res.json({ token: issueToken(user), user });
});

// No auth required -- this is precisely how a locked-out (or password-forgotten) admin gets
// back in. Rate-limited globally (one shared counter, not per-IP) since minting a token is a
// real side effect every time, not just a failed guess.
router.post("/request-reset", (req, res) => {
  if (requestResetAttempts.isLocked(REQUEST_RESET_KEY)) {
    return res.status(429).json({ error: "Too many reset requests. Try again later." });
  }
  requestResetAttempts.recordFailure(REQUEST_RESET_KEY);

  const admin = db.prepare("SELECT id, email FROM users WHERE is_admin = 1").get();
  if (admin) {
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("INSERT INTO admin_reset_tokens (id, token_hash) VALUES (?, ?)").run(nanoid(), hashToken(token));
    // Never returned in the response body -- only ever visible in the server's own console.
    console.log(`=== Admin password reset token: ${token} (expires in 30 minutes) ===`);
  }
  // Same generic response whether or not an admin account currently exists, so this endpoint
  // can't be used to probe for one.
  res.json({ ok: true, message: "If an admin account exists, a reset token has been generated." });
});

// Keyed by IP, and fully independent from the login lockout above -- being locked out of
// login should never also block someone from using a valid reset token they already have.
router.post("/reset-password", (req, res) => {
  const ip = req.ip;
  if (resetPasswordAttempts.isLocked(ip)) {
    return res.status(429).json({ error: "Too many failed attempts. Try again later." });
  }

  const { token, newPassword } = req.body;
  if (!token || !newPassword || newPassword.length < 8) {
    resetPasswordAttempts.recordFailure(ip);
    return res.status(400).json({ error: "A valid token and a password of at least 8 characters are required" });
  }

  const tokenHash = hashToken(token);
  const row = db.prepare("SELECT * FROM admin_reset_tokens WHERE token_hash = ?").get(tokenHash);
  const isExpired = row && Date.now() - new Date(row.created_at.replace(" ", "T") + "Z").getTime() > RESET_TOKEN_TTL_MS;
  if (!row || row.used || isExpired) {
    resetPasswordAttempts.recordFailure(ip);
    return res.status(400).json({ error: "Invalid, expired, or already-used reset token" });
  }

  const admin = db.prepare("SELECT id FROM users WHERE is_admin = 1").get();
  if (!admin) {
    resetPasswordAttempts.recordFailure(ip);
    return res.status(400).json({ error: "No admin account exists" });
  }

  db.prepare("UPDATE admin_reset_tokens SET used = 1 WHERE id = ?").run(row.id);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(newPassword, 10), admin.id);
  resetPasswordAttempts.reset(ip);
  res.json({ ok: true });
});

export default router;
