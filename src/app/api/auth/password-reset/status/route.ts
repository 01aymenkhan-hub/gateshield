import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  ensurePasswordResetSchema,
  expireStalePasswordResetRequests,
  hashToken,
  deriveResetAuthorizationToken,
  getTenantId,
  RESET_TRACKER_COOKIE,
  RESET_AUTH_COOKIE,
  PasswordResetStatusType,
} from '@/lib/passwordReset';

export async function GET() {
  try {
    await ensurePasswordResetSchema();
    await expireStalePasswordResetRequests();

    const cookieStore = await cookies();
    const rawAuthToken = cookieStore.get(RESET_AUTH_COOKIE)?.value || '';
    const rawTrackerToken = cookieStore.get(RESET_TRACKER_COOKIE)?.value || '';

    if (!rawAuthToken && !rawTrackerToken) {
      return NextResponse.json({
        active: false,
        status: null,
        canResetPassword: false,
      });
    }

    const tenantId = getTenantId();

    // 1. Check active reset authorization cookie first
    if (rawAuthToken) {
      const authHash = hashToken(rawAuthToken);
      const authRows = await prisma.$queryRaw<
        Array<{
          id: string;
          userId: string;
          userRole: 'ADMIN' | 'OPERATOR' | 'EMPLOYEE';
          portalContext: string | null;
          status: PasswordResetStatusType;
          expiresAt: Date | null;
          usedAt: Date | null;
          rejectionReason: string | null;
          updatedAt: Date;
        }>
      >`
        SELECT
          "id",
          "userId",
          "userRole"::text AS "userRole",
          "portalContext",
          "status"::text AS "status",
          "expiresAt",
          "usedAt",
          "rejectionReason",
          "updatedAt"
        FROM "password_reset_requests"
        WHERE "resetTokenHash" = ${authHash}
          AND "tenantId" = ${tenantId}
        LIMIT 1
      `;

      if (authRows.length > 0) {
        const row = authRows[0];
        const isUnexpired =
          !row.expiresAt || new Date(row.expiresAt).getTime() > Date.now();
        const canResetPassword =
          row.status === 'APPROVED' && !row.usedAt && isUnexpired;

        return NextResponse.json({
          active: true,
          requestId: row.id,
          status: row.status,
          canResetPassword,
          expiresAt: row.expiresAt,
          rejectionReason: row.rejectionReason,
          userRole: row.userRole,
          portalContext: row.portalContext,
          updatedAt: row.updatedAt,
        });
      }
    }

    // 2. Check real-time tracker cookie
    if (rawTrackerToken) {
      const trackerHash = hashToken(rawTrackerToken);
      const trackerRows = await prisma.$queryRaw<
        Array<{
          id: string;
          userId: string;
          userRole: 'ADMIN' | 'OPERATOR' | 'EMPLOYEE';
          portalContext: string | null;
          status: PasswordResetStatusType;
          approvedAt: Date | null;
          expiresAt: Date | null;
          usedAt: Date | null;
          resetTokenHash: string | null;
          rejectionReason: string | null;
          updatedAt: Date;
        }>
      >`
        SELECT
          "id",
          "userId",
          "userRole"::text AS "userRole",
          "portalContext",
          "status"::text AS "status",
          "approvedAt",
          "expiresAt",
          "usedAt",
          "resetTokenHash",
          "rejectionReason",
          "updatedAt"
        FROM "password_reset_requests"
        WHERE "trackerTokenHash" = ${trackerHash}
          AND "tenantId" = ${tenantId}
        LIMIT 1
      `;

      // If dummy tracker cookie (unregistered email), return generic PENDING state to prevent enumeration
      if (trackerRows.length === 0) {
        return NextResponse.json({
          active: true,
          status: 'PENDING',
          canResetPassword: false,
        });
      }

      const row = trackerRows[0];
      const isUnexpired =
        !row.expiresAt || new Date(row.expiresAt).getTime() > Date.now();
      const canResetPassword =
        row.status === 'APPROVED' &&
        !row.usedAt &&
        isUnexpired &&
        Boolean(row.approvedAt) &&
        Boolean(row.resetTokenHash);

      const response = NextResponse.json({
        active: true,
        requestId: row.id,
        status: row.status,
        canResetPassword,
        expiresAt: row.expiresAt,
        rejectionReason: row.rejectionReason,
        userRole: row.userRole,
        portalContext: row.portalContext,
        updatedAt: row.updatedAt,
      });

      // If approved, issue the single-use httpOnly authorization cookie so the user can submit their new password immediately
      if (canResetPassword && row.approvedAt) {
        const derivedAuthToken = deriveResetAuthorizationToken({
          requestId: row.id,
          userId: row.userId,
          approvedAtIso: new Date(row.approvedAt).toISOString(),
        });
        if (hashToken(derivedAuthToken) === row.resetTokenHash) {
          const maxAgeSec = row.expiresAt
            ? Math.max(
                Math.floor((new Date(row.expiresAt).getTime() - Date.now()) / 1000),
                60
              )
            : 1800;
          response.cookies.set(RESET_AUTH_COOKIE, derivedAuthToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: maxAgeSec,
          });
        }
      }

      return response;
    }

    return NextResponse.json({
      active: false,
      status: null,
      canResetPassword: false,
    });
  } catch (error) {
    console.error('[PasswordReset Status GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check password reset status.' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(RESET_TRACKER_COOKIE);
  response.cookies.delete(RESET_AUTH_COOKIE);
  return response;
}
