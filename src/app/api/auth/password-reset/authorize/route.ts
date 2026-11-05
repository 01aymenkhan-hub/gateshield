import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  ensurePasswordResetSchema,
  expireStalePasswordResetRequests,
  verifyEmailExchangeTicket,
  deriveResetAuthorizationToken,
  hashToken,
  generateSecureRandomToken,
  getTenantId,
  RESET_AUTH_COOKIE,
  RESET_TRACKER_COOKIE,
} from '@/lib/passwordReset';

export async function GET(request: NextRequest) {
  try {
    await ensurePasswordResetSchema();
    await expireStalePasswordResetRequests();

    const { searchParams } = new URL(request.url);
    const ticket = searchParams.get('ticket') || '';
    const verified = verifyEmailExchangeTicket(ticket);

    if (!verified) {
      return NextResponse.redirect(new URL('/reset-password?state=expired', request.url), 303);
    }

    const tenantId = getTenantId();

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        userId: string;
        status: string;
        approvedAt: Date | null;
        expiresAt: Date | null;
        usedAt: Date | null;
        resetTokenHash: string | null;
      }>
    >`
      SELECT
        "id",
        "userId",
        "status"::text AS "status",
        "approvedAt",
        "expiresAt",
        "usedAt",
        "resetTokenHash"
      FROM "password_reset_requests"
      WHERE "id" = ${verified.requestId}
        AND "userId" = ${verified.userId}
        AND "tenantId" = ${tenantId}
      LIMIT 1
    `;

    const reqRow = rows[0];
    if (
      !reqRow ||
      reqRow.status !== 'APPROVED' ||
      reqRow.usedAt ||
      !reqRow.approvedAt ||
      !reqRow.resetTokenHash ||
      (reqRow.expiresAt && new Date(reqRow.expiresAt).getTime() <= Date.now())
    ) {
      return NextResponse.redirect(new URL('/reset-password?state=expired', request.url), 303);
    }

    const derivedAuthToken = deriveResetAuthorizationToken({
      requestId: reqRow.id,
      userId: reqRow.userId,
      approvedAtIso: new Date(reqRow.approvedAt).toISOString(),
    });

    if (hashToken(derivedAuthToken) !== reqRow.resetTokenHash) {
      return NextResponse.redirect(new URL('/reset-password?state=expired', request.url), 303);
    }

    const newTrackerToken = generateSecureRandomToken(32);
    const newTrackerHash = hashToken(newTrackerToken);

    await prisma.$executeRaw`
      UPDATE "password_reset_requests"
      SET "trackerTokenHash" = ${newTrackerHash},
          "updatedAt" = NOW()
      WHERE "id" = ${reqRow.id}
    `;

    const maxAgeSec = reqRow.expiresAt
      ? Math.max(Math.floor((new Date(reqRow.expiresAt).getTime() - Date.now()) / 1000), 60)
      : 1800;

    // Redirect to clean /reset-password URL with zero tokens in URL query parameters
    const redirectResponse = NextResponse.redirect(new URL('/reset-password', request.url), 303);

    redirectResponse.cookies.set(RESET_AUTH_COOKIE, derivedAuthToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeSec,
    });

    redirectResponse.cookies.set(RESET_TRACKER_COOKIE, newTrackerToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    });

    return redirectResponse;
  } catch (error) {
    console.error('[PasswordReset Authorize GET] Error:', error);
    return NextResponse.redirect(new URL('/reset-password?state=error', request.url), 303);
  }
}
