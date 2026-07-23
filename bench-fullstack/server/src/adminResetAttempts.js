import { createFailureLockout } from "./failureLockout.js";

// request-reset: a single global counter (one fixed key, not keyed per-IP) -- capped at 3
// requests per 15 minutes site-wide, since each call has a real side effect (mints a new
// token, logged server-side) rather than just checking a password.
export const requestResetAttempts = createFailureLockout({ maxAttempts: 3, windowMs: 15 * 60 * 1000 });
export const REQUEST_RESET_KEY = "global";

// reset-password: keyed by IP, and fully independent from the login lockout above -- being
// locked out of login should never also block someone from using a valid reset token they
// already have in hand.
export const resetPasswordAttempts = createFailureLockout({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });
