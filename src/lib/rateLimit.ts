import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { getJwtSecret } from './secrets';

/**
 * Small fixed-window, in-memory rate limiter for a single Node.js instance.
 * Entries are pruned so a flood of distinct keys cannot grow memory unbounded.
 * For multi-instance deployments, back this with a shared store (e.g. Redis).
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_TRACKED_KEYS = 10_000;
const buckets = new Map<string, Bucket>();
let activePasswordChecks = 0;
const MAX_ACTIVE_PASSWORD_CHECKS = 4;

function prune(now: number) {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Still full: drop the oldest insertions.
  while (buckets.size >= MAX_TRACKED_KEYS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

export function isRateLimited(key: string, limit: number): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    return { limited: false, retryAfterSeconds: 0 };
  }
  return {
    limited: bucket.count >= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/** Records one failed attempt for `key` inside a `windowMs` window. */
export function recordFailure(key: string, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    prune(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
}

export function clearFailures(key: string): void {
  buckets.delete(key);
}

/**
 * Client IP for rate limiting. Forwarded headers are client-controlled unless a
 * trusted reverse proxy overwrites them, so they are only honoured when
 * TRUST_PROXY=true. Otherwise every request shares one network bucket and the
 * per-account limit does the real work.
 */
export function getClientIp(request: NextRequest): string {
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded.slice(0, 64);
    const realIp = request.headers.get('x-real-ip')?.trim();
    if (realIp) return realIp.slice(0, 64);
  }
  return 'direct';
}

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES_PER_ACCOUNT = 10;
export const LOGIN_MAX_FAILURES_PER_IP = 50;
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

/** Cookie that marks a browser which has previously signed in to this account. */
export function deviceCookieName(scope: string): string {
  return `gk_dev_${scope}`;
}

function deviceSignature(scope: string, email: string): string {
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(`login-device:v1:${scope}:${email}`)
    .digest('base64url');
}

/** Issued after a successful password login (OWASP "device cookie" lockout pattern). */
export function issueDeviceToken(scope: string, email: string): string {
  return `${Buffer.from(email).toString('base64url')}.${deviceSignature(scope, email)}`;
}

function isTrustedDevice(scope: string, email: string, token: string | undefined): boolean {
  if (!token) return false;
  const [encodedEmail, sig] = token.split('.');
  if (!encodedEmail || !sig) return false;
  let tokenEmail = '';
  try {
    tokenEmail = Buffer.from(encodedEmail, 'base64url').toString('utf8');
  } catch {
    return false;
  }
  if (tokenEmail !== email) return false;
  const expected = Buffer.from(deviceSignature(scope, email));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/**
 * Shared login throttle.
 * Browsers that previously signed in to the account (valid device cookie) get their own
 * failure budget, so an attacker hammering an email address locks out only unknown
 * devices, never the real user's own browser. Per-IP budgets apply when a trusted
 * proxy supplies client IPs.
 */
export function checkLoginThrottle(scope: string, email: string, ip: string, deviceToken?: string) {
  const trusted = isTrustedDevice(scope, email, deviceToken);
  const accountKey = trusted ? `${scope}:dev:${email}` : `${scope}:acct:${email}`;
  // Without a trusted client IP, a shared bucket would let one attacker lock out everyone.
  const ipKey = ip && ip !== 'direct' ? `${scope}:ip:${ip}` : null;
  const account = isRateLimited(accountKey, LOGIN_MAX_FAILURES_PER_ACCOUNT);
  const network = ipKey && !trusted
    ? isRateLimited(ipKey, LOGIN_MAX_FAILURES_PER_IP)
    : { limited: false, retryAfterSeconds: 0 };
  const busy = activePasswordChecks >= MAX_ACTIVE_PASSWORD_CHECKS;
  const limited = account.limited || network.limited || busy;
  if (!limited) {
    // Reserve capacity synchronously before any asynchronous database or hash work.
    activePasswordChecks++;
    recordFailure(accountKey, LOGIN_WINDOW_MS);
    if (ipKey && !trusted) recordFailure(ipKey, LOGIN_WINDOW_MS);
  }
  let reserved = !limited;
  return {
    limited,
    retryAfterSeconds: Math.max(1, account.retryAfterSeconds, network.retryAfterSeconds),
    release() {
      if (reserved) {
        activePasswordChecks--;
        reserved = false;
      }
    },
    succeed() {
      clearFailures(accountKey);
      return issueDeviceToken(scope, email);
    },
  };
}

/**
 * Generic per-key throttle for anonymous endpoints (QR login, password reset,
 * self-registration). `ip` is from getClientIp(); without a trusted proxy all
 * clients share the 'direct' key, so callers pass a larger global budget for it.
 */
export function checkAnonymousThrottle(
  scope: string,
  ip: string,
  opts: { windowMs: number; perIp: number; globalWhenDirect: number }
) {
  const key = ip === 'direct' ? `${scope}:global` : `${scope}:ip:${ip}`;
  const limit = ip === 'direct' ? opts.globalWhenDirect : opts.perIp;
  const state = isRateLimited(key, limit);
  return {
    limited: state.limited,
    retryAfterSeconds: state.retryAfterSeconds,
    hit() {
      recordFailure(key, opts.windowMs);
    },
  };
}
