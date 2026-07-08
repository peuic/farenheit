// Per-IP rate limiter for the /login POST endpoint.
//
// Strategy: count failed attempts inside a rolling window. Once the
// threshold is exceeded, block further attempts from that IP for a
// cooldown period. Successful login clears the IP's record.
//
// In-memory only — restarts reset all counters. That's fine for a
// personal-scale service: an attacker who can trigger restarts to
// reset state already has way more access than the rate limit
// guards against.

const MAX_ATTEMPTS  = 5;
const WINDOW_MS     = 15 * 60_000;  // 15 minutes — failures decay after
const BLOCK_MS      = 60 * 60_000;  // 1 hour cooldown when threshold hit

type Record = {
  failures: number;
  firstFailureAt: number;
  blockedUntil?: number;
};

const records = new Map<string, Record>();

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function checkLoginRateLimit(ip: string): RateLimitResult {
  const r = records.get(ip);
  if (!r) return { allowed: true };
  const now = Date.now();
  if (r.blockedUntil && r.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((r.blockedUntil - now) / 1000),
    };
  }
  return { allowed: true };
}

export function recordLoginFailure(ip: string): void {
  const now = Date.now();
  let r = records.get(ip);
  if (!r || now - r.firstFailureAt > WINDOW_MS) {
    // Window expired (or first ever) — start a fresh count.
    r = { failures: 0, firstFailureAt: now };
  }
  r.failures++;
  if (r.failures >= MAX_ATTEMPTS) {
    r.blockedUntil = now + BLOCK_MS;
  }
  records.set(ip, r);
}

export function recordLoginSuccess(ip: string): void {
  records.delete(ip);
}

// Test/reset hook — used only by the unit test suite.
export function __resetLoginRateLimitForTests(): void {
  records.clear();
}
