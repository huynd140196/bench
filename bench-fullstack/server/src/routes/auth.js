import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

router.post("/signup", (req, res) => {
  const { email, password, name, inviteCode } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: "Email, password, and name are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
  if (existing) return res.status(409).json({ error: "An account with that email already exists" });

  const invite = inviteCode ? db.prepare("SELECT * FROM invite_codes WHERE code = ?").get(inviteCode.trim().toUpperCase()) : null;
  if (!invite || invite.used_by) {
    return res.status(400).json({ error: "Invalid or already-used invite code" });
  }

  const id = nanoid();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)").run(id, normalizedEmail, name.trim(), passwordHash);
  db.prepare("UPDATE invite_codes SET used_by = ?, used_at = datetime('now') WHERE id = ?").run(id, invite.id);

  // Every new user gets a personal workspace to start in.
  const workspaceId = nanoid();
  db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, ?, ?)").run(workspaceId, `${name.trim()}'s workspace`, id);
  db.prepare("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')").run(workspaceId, id);

  const user = { id, email: normalizedEmail, name: name.trim(), is_admin: false };
  res.json({ token: issueToken(user), user });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (row.is_disabled) return res.status(401).json({ error: "This account has been disabled" });

  const user = { id: row.id, email: row.email, name: row.name, is_admin: !!row.is_admin };
  res.json({ token: issueToken(user), user });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
