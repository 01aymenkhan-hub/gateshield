import crypto from 'crypto';
import prisma from '@/lib/prisma';

const COOKIE_PREFIX = process.env.AUTH_COOKIE_PREFIX || 'gk';
export const RESET_TRACKER_COOKIE = `${COOKIE_PREFIX}_pwd_reset_tracker`;
export const RESET_AUTH_COOKIE = `${COOKIE_PREFIX}_pwd_reset_auth`;

export type PasswordResetStatusType =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED'
  | 'EXPIRED';

export interface PasswordResetRequestRow {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  userRole: 'ADMIN' | 'OPERATOR' | 'EMPLOYEE';
  portalContext: string | null;
  status: PasswordResetStatusType;
  trackerTokenHash: string | null;
  resetTokenHash: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  expiresAt: Date | null;
  usedAt: Date | null;
  completedAt: Date | null;
  requestIp: string | null;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

const SECRET_SEED =
  (process.env.JWT_SECRET || 'gatekeeper_secret_jwt_key_2026') + ':gateshield_pwd_reset_v1';

function getEncryptionKey(): Buffer {
  return crypto.createHash('sha256').update(SECRET_SEED).digest();
}

export function getTenantId(): string {
  return (process.env.TENANT_ID || 'default').trim() || 'default';
}

export function getResetExpiryMinutes(): number {
  const raw = parseInt(process.env.PASSWORD_RESET_EXPIRY_MINUTES || '30', 10);
  if (Number.isNaN(raw) || raw < 5 || raw > 1440) {
    return 30;
  }
  return raw;
}

export function generateSecureRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Deterministically derives the one-time authorization token from requestId + userId + approvedAt + server secret,
 * while ONLY storing its SHA-256 hash (`resetTokenHash`) in the database.
 * This allows the backend to issue the httpOnly `gk_pwd_reset_auth` cookie when the verified owner's
 * real-time status tracker polls after Admin approval, without ever storing plaintext tokens in the DB
 * or exposing tokens in notification payloads or logs.
 */
export function deriveResetAuthorizationToken(params: {
  requestId: string;
  userId: string;
  approvedAtIso: string;
}): string {
  return crypto
    .createHmac('sha256', getEncryptionKey())
    .update(`auth:${params.requestId}:${params.userId}:${params.approvedAtIso}`)
    .digest('hex');
}

/**
 * Generates a short-lived signed email exchange ticket that does NOT expose the raw reset token
 * and is immediately exchanged for an httpOnly cookie + 303 redirect to a clean URL.
 */
export function createEmailExchangeTicket(params: {
  requestId: string;
  userId: string;
  expiresAtMs: number;
}): string {
  const payload = Buffer.from(
    JSON.stringify({
      r: params.requestId,
      u: params.userId,
      e: params.expiresAtMs,
    }),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getEncryptionKey())
    .update(`ticket:${payload}`)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyEmailExchangeTicket(
  ticket: string
): { requestId: string; userId: string; expiresAtMs: number } | null {
  try {
    const parts = ticket.split('.');
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', getEncryptionKey())
      .update(`ticket:${payload}`)
      .digest('base64url');

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      !decoded ||
      typeof decoded.r !== 'string' ||
      typeof decoded.u !== 'string' ||
      typeof decoded.e !== 'number'
    ) {
      return null;
    }
    if (!Number.isFinite(decoded.e) || Date.now() >= decoded.e) {
      return null;
    }
    return {
      requestId: decoded.r,
      userId: decoded.u,
      expiresAtMs: decoded.e,
    };
  } catch {
    return null;
  }
}

// In-memory rate limiter per IP (max 6 reset requests per 10 minutes)
const ipRateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 6;

export function checkPasswordResetRateLimit(ip: string): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const key = ip || 'unknown';
  const entry = ipRateLimitMap.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipRateLimitMap.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
  }

  entry.count += 1;
  return { allowed: true };
}

let schemaInitialized = false;

/**
 * Safely ensures the `password_reset_requests` table and `users.passwordChangedAt` column exist
 * without modifying or deleting any existing database records.
 */
export async function ensurePasswordResetSchema(): Promise<void> {
  if (schemaInitialized) return;
  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PasswordResetStatus') THEN
          CREATE TYPE "PasswordResetStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'EXPIRED');
        END IF;
      END
      $$;
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "password_reset_requests" (
        "id" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "userEmail" TEXT NOT NULL,
        "userName" TEXT NOT NULL,
        "userRole" "Role" NOT NULL,
        "portalContext" TEXT,
        "status" "PasswordResetStatus" NOT NULL DEFAULT 'PENDING',
        "trackerTokenHash" TEXT,
        "resetTokenHash" TEXT,
        "reviewedById" TEXT,
        "reviewedByName" TEXT,
        "approvedAt" TIMESTAMP(3),
        "rejectedAt" TIMESTAMP(3),
        "rejectionReason" TEXT,
        "expiresAt" TIMESTAMP(3),
        "usedAt" TIMESTAMP(3),
        "completedAt" TIMESTAMP(3),
        "requestIp" TEXT,
        "tenantId" TEXT NOT NULL DEFAULT 'default',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "password_reset_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "password_reset_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_requests_trackerTokenHash_key"
      ON "password_reset_requests"("trackerTokenHash");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_requests_resetTokenHash_key"
      ON "password_reset_requests"("resetTokenHash");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "password_reset_requests_userId_status_idx"
      ON "password_reset_requests"("userId", "status");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "password_reset_requests_status_createdAt_idx"
      ON "password_reset_requests"("status", "createdAt");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "password_reset_requests_tenantId_status_idx"
      ON "password_reset_requests"("tenantId", "status");
    `);

    schemaInitialized = true;
  } catch (err) {
    console.error('[PasswordReset] Schema initialization check error:', err);
  }
}

/**
 * Automatically transitions any APPROVED requests whose expiresAt has passed into EXPIRED status.
 */
export async function expireStalePasswordResetRequests(): Promise<void> {
  await ensurePasswordResetSchema();
  try {
    await prisma.$executeRaw`
      UPDATE "password_reset_requests"
      SET "status" = 'EXPIRED'::"PasswordResetStatus",
          "resetTokenHash" = NULL,
          "updatedAt" = NOW()
      WHERE "status"::text = 'APPROVED'
        AND "expiresAt" IS NOT NULL
        AND "expiresAt" < NOW()
    `;
  } catch (err) {
    console.error('[PasswordReset] Failed to expire stale requests:', err);
  }
}
