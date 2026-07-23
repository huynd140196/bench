import { Router } from "express";
import { nanoid, customAlphabet } from "nanoid";
import db from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

// Avoids visually ambiguous characters (0/O, 1/I/L) since these are meant to be typed by hand.
const generateInviteCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

const router = Router();

// Invite-only signup: the single site admin is the only one who can call this.
router.post("/", requireAuth, requireAdmin, (req, res) => {
  const code = generateInviteCode();
  const id = nanoid();
  db.prepare("INSERT INTO invite_codes (id, code, created_by) VALUES (?, ?, ?)").run(id, code, req.user.id);
  res.json({ invite: { code } });
});

export default router;
