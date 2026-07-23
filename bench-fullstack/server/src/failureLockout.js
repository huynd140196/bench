// Simple in-memory, closure-based rate limiter for repeated-failure lockouts (admin login
// attempts, password-reset attempts). Not persisted across restarts -- fine for this app's
// scale and threat model (a single small deployment, not a distributed rate limiter).
export function createFailureLockout({ maxAttempts, windowMs }) {
  const attempts = new Map(); // key -> { count, firstFailureAt }

  function prune(key) {
    const entry = attempts.get(key);
    if (entry && Date.now() - entry.firstFailureAt > windowMs) {
      attempts.delete(key);
      return null;
    }
    return entry || null;
  }

  function isLocked(key) {
    const entry = prune(key);
    return !!entry && entry.count >= maxAttempts;
  }

  function recordFailure(key) {
    const entry = prune(key);
    if (!entry) {
      attempts.set(key, { count: 1, firstFailureAt: Date.now() });
    } else {
      entry.count += 1;
    }
  }

  function reset(key) {
    attempts.delete(key);
  }

  function remainingMs(key) {
    const entry = prune(key);
    if (!entry) return 0;
    return Math.max(0, windowMs - (Date.now() - entry.firstFailureAt));
  }

  return { isLocked, recordFailure, reset, remainingMs };
}
