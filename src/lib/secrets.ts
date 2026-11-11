import crypto from 'crypto';

/**
 * Single source of truth for the application signing secret.
 *
 * Production must provide a strong JWT_SECRET (>= 32 characters). Outside
 * production a random per-process secret is used when none is configured, so
 * there is never a well-known default that would let anyone forge sessions.
 */
let cachedSecret: string | null = null;

export function getJwtSecret(): string {
  if (cachedSecret) return cachedSecret;

  const configured = (process.env.JWT_SECRET || '').trim();
  if (configured.length >= 32) {
    cachedSecret = configured;
    return cachedSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to at least 32 characters in production.');
  }

  if (configured) {
    console.warn('[Security] JWT_SECRET is shorter than 32 characters. Use a longer random value.');
    cachedSecret = configured;
    return cachedSecret;
  }

  console.warn('[Security] JWT_SECRET is not set. Using a random development secret; sessions reset on restart.');
  cachedSecret = crypto.randomBytes(48).toString('hex');
  return cachedSecret;
}
