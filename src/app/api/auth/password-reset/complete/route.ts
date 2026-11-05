import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  hashPassword,
  TOKEN_COOKIE_NAME,
  EMPLOYEE_TOKEN_COOKIE_NAME,
  EMPLOYEE_STATUS_COOKIE_NAME,
  OPERATOR_STATUS_COOKIE_NAME,
} from '@/lib/auth';
import {
  ensurePasswordResetSchema,
  expireStalePasswordResetRequests,
  hashToken,
  deriveResetAuthorizationToken,
  getTenantId,
  RESET_AUTH_COOKIE,
  RESET_TRACKER_COOKIE,
} from '@/lib/passwordReset';
import { createAppNotification } from '@/lib/notifications';
import { logAudit } from '@/lib/audit';
import { sendPasswordResetCompletedEmail } from '@/lib/emailService';

export async function POST(request: NextRequest) {
  try {
    await ensurePasswordResetSchema();
    await expireStalePasswordResetRequests();

    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';
    const confirmPassword =
      typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'New password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'New password and confirm password do not match.' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const rawAuthToken = cookieStore.get(RESET_AUTH_COOKIE)?.value || '';
    const rawTrackerToken = cookieStore.get(RESET_TRACKER_COOKIE)?.value || '';

    if (!rawAuthToken && !rawTrackerToken) {
      return NextResponse.json(
        {
          error:
            'Your password reset authorization is missing or has expired. Please submit a new password reset request.',
        },
        { status: 401 }
      );
    }

    const tenantId = getTenantId();

    interface TargetResetRow {
      id: string;
      userId: string;
      userEmail: string;
      userName: string;
      userRole: 'ADMIN' | 'OPERATOR' | 'EMPLOYEE';
      portalContext: string | null;
      status: string;
      approvedAt: Date | null;
      expiresAt: Date | null;
      usedAt: Date | null;
      resetTokenHash: string | null;
    }

    let target: TargetResetRow | null = null;

    if (rawAuthToken) {
      const authHash = hashToken(rawAuthToken);
      const rows = await prisma.$queryRaw<TargetResetRow[]>`
        SELECT
          "id",
          "userId",
          "userEmail",
          "userName",
          "userRole"::text AS "userRole",
          "portalContext",
          "status"::text AS "status",
          "approvedAt",
          "expiresAt",
          "usedAt",
          "resetTokenHash"
        FROM "password_reset_requests"
        WHERE "resetTokenHash" = ${authHash}
          AND "tenantId" = ${tenantId}
        LIMIT 1
      `;
      target = rows[0] || null;
    }

    if (!target && rawTrackerToken) {
      const trackerHash = hashToken(rawTrackerToken);
      const rows = await prisma.$queryRaw<TargetResetRow[]>`
        SELECT
          "id",
          "userId",
          "userEmail",
          "userName",
          "userRole"::text AS "userRole",
          "portalContext",
          "status"::text AS "status",
          "approvedAt",
          "expiresAt",
          "usedAt",
          "resetTokenHash"
        FROM "password_reset_requests"
        WHERE "trackerTokenHash" = ${trackerHash}
          AND "tenantId" = ${tenantId}
        LIMIT 1
      `;
      const candidate = rows[0] || null;
      if (candidate && candidate.approvedAt && candidate.resetTokenHash) {
        const derivedAuth = deriveResetAuthorizationToken({
          requestId: candidate.id,
          userId: candidate.userId,
          approvedAtIso: new Date(candidate.approvedAt).toISOString(),
        });
        if (hashToken(derivedAuth) === candidate.resetTokenHash) {
          target = candidate;
        }
      }
    }

    if (!target) {
      return NextResponse.json(
        {
          error:
            'Invalid or expired password reset authorization. Please submit a new request.',
        },
        { status: 403 }
      );
    }

    if (target.usedAt || target.status === 'COMPLETED') {
      return NextResponse.json(
        {
          error:
            'This password reset authorization has already been used and cannot be reused.',
        },
        { status: 403 }
      );
    }

    if (
      target.status !== 'APPROVED' ||
      !target.resetTokenHash ||
      (target.expiresAt && new Date(target.expiresAt).getTime() <= Date.now())
    ) {
      return NextResponse.json(
        {
          error:
            'This password reset authorization is no longer valid or has expired.',
        },
        { status: 403 }
      );
    }

    const newPasswordHash = await hashPassword(password);
    const now = new Date();

    // Atomic single-use token consumption + password update + session revocation timestamp
    const updatedRows = await prisma.$transaction(async (tx) => {
      const consumed = await tx.$executeRaw`
        UPDATE "password_reset_requests"
        SET "status" = 'COMPLETED'::"PasswordResetStatus",
            "usedAt" = ${now},
            "completedAt" = ${now},
            "resetTokenHash" = NULL,
            "updatedAt" = ${now}
        WHERE "id" = ${target!.id}
          AND "userId" = ${target!.userId}
          AND "status"::text = 'APPROVED'
          AND "usedAt" IS NULL
      `;

      if (consumed === 0) {
        return 0;
      }

      await tx.$executeRaw`
        UPDATE "users"
        SET "passwordHash" = ${newPasswordHash},
            "passwordChangedAt" = ${now},
            "updatedAt" = ${now}
        WHERE "id" = ${target!.userId}
      `;

      return consumed;
    });

    if (updatedRows === 0) {
      return NextResponse.json(
        {
          error:
            'This password reset authorization was already used or expired.',
        },
        { status: 409 }
      );
    }

    await createAppNotification({
      recipientUserId: target.userId,
      type: 'PASSWORD_RESET_COMPLETED',
      title: 'Password Updated Successfully',
      message:
        'Your GateShield password was updated and previous active sessions have been revoked.',
      dedupeKey: `pwd_reset_done_user_${target.id}`,
    });

    await createAppNotification({
      recipientRole: 'ADMIN',
      type: 'PASSWORD_RESET_COMPLETED',
      title: 'Password Reset Completed',
      message: `${target.userName} (${target.userEmail}) completed their approved password reset.`,
      targetUrl: '/dashboard#password-reset-requests',
      dedupeKey: `pwd_reset_done_admin_${target.id}`,
    });

    const forwardedFor = request.headers.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';

    await logAudit({
      action: 'COMPLETE_PASSWORD_RESET',
      entityType: 'PasswordResetRequest',
      entityId: target.id,
      details: {
        userId: target.userId,
        userEmail: target.userEmail,
        userRole: target.userRole,
      },
      performedById: target.userId,
      ipAddress: clientIp,
    });

    void sendPasswordResetCompletedEmail({
      requestId: target.id,
      userName: target.userName,
      userEmail: target.userEmail,
      userRole: target.userRole,
      completedAt: now,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Your password has been updated successfully. You may now sign in with your new password.',
      userRole: target.userRole,
      portalContext: target.portalContext || target.userRole,
    });

    // Clear reset authorization & tracker cookies + revoke any active session cookies on this browser
    response.cookies.delete(RESET_AUTH_COOKIE);
    response.cookies.delete(RESET_TRACKER_COOKIE);
    response.cookies.delete(TOKEN_COOKIE_NAME);
    response.cookies.delete(EMPLOYEE_TOKEN_COOKIE_NAME);
    response.cookies.delete(EMPLOYEE_STATUS_COOKIE_NAME);
    response.cookies.delete(OPERATOR_STATUS_COOKIE_NAME);

    return response;
  } catch (error) {
    console.error('[PasswordReset Complete POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update password. Please try again.' },
      { status: 500 }
    );
  }
}
