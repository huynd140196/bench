import { createFailureLockout } from "./failureLockout.js";

// Keyed by IP -- there's only one admin account site-wide, so keying by email would let a
// single attacker lock out the real admin globally; keying by IP means only that attacker's
// own access gets locked out.
export const adminLoginAttempts = createFailureLockout({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });
