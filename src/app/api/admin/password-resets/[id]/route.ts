import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser, getEmployeeSessionUser } from '@/lib/auth';
import {
  ensurePasswordResetSchema,
  expireStalePasswordResetRequests,
  deriveResetAuthorizationToken,
  hashToken,
  createEmailExchangeTicket,
  getResetExpiryMinutes,
  getTenantId,
} from '@/lib/passwordReset';
import { createAppNotification } from '@/lib/notifications';
import { logAudit } from '@/lib/audit';
import {
  sendPasswordResetApprovedEmail,
  sendPasswordResetRejectedEmail,
} from '@/lib/emailService';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getSessionUser();
    if (!admin) {
      const empUser = await getEmployeeSessionUser();
      if (empUser) {
        return NextResponse.json(
          { error: 'Forbidden: Employees cannot access Admin endpoints.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (admin.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Administrator access required.' },
        { status: 403 }
      );
    }

    await ensurePasswordResetSchema();
    await expireStalePasswordResetRequests();

    const { id } = await context.params;
    const requestId = (id || '').trim();
    if (!requestId) {
      return NextResponse.json(
        { error: 'Password reset request ID is required.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action.trim().toUpperCase() : '';
    const rejectionReason =
      typeof body.rejectionReason === 'string' && body.rejectionReason.trim()
        ? body.rejectionReason.trim().slice(0, 300)
        : null;

    if (action !== 'APPROVE' && action !== 'REJECT') {
      return NextResponse.json(
        { error: 'Action must be APPROVE or REJECT.' },
        { status: 400 }
      );
    }

    const tenantId = getTenantId();

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        userId: string;
        userEmail: string;
        userName: string;
        userRole: 'ADMIN' | 'OPERATOR' | 'EMPLOYEE';
        status: string;
      }>
    >`
      SELECT
        "id",
        "userId",
        "userEmail",
        "userName",
        "userRole"::text AS "userRole",
        "status"::text AS "status"
      FROM "password_reset_requests"
      WHERE "id" = ${requestId}
        AND "tenantId" = ${tenantId}
      LIMIT 1
    `;

    const target = rows[0];
    if (!target) {
      return NextResponse.json(
        { error: 'Password reset request not found.' },
        { status: 404 }
      );
    }

    if (target.status !== 'PENDING') {
      return NextResponse.json(
        {
          error: `This request has already been ${target.status.toLowerCase()}.`,
        },
        { status: 409 }
      );
    }

    const now = new Date();

    if (action === 'APPROVE') {
      const expiryMinutes = getResetExpiryMinutes();
      const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000);

      const rawResetToken = deriveResetAuthorizationToken({
        requestId: target.id,
        userId: target.userId,
        approvedAtIso: now.toISOString(),
      });
      const resetTokenHash = hashToken(rawResetToken);

      const updated = await prisma.$executeRaw`
        UPDATE "password_reset_requests"
        SET "status" = 'APPROVED'::"PasswordResetStatus",
            "resetTokenHash" = ${resetTokenHash},
            "reviewedById" = ${admin.id},
            "reviewedByName" = ${admin.name},
            "approvedAt" = ${now},
            "expiresAt" = ${expiresAt},
            "updatedAt" = ${now}
        WHERE "id" = ${target.id}
          AND "tenantId" = ${tenantId}
          AND "status"::text = 'PENDING'
      `;

      if (updated === 0) {
        return NextResponse.json(
          { error: 'Request was already resolved by another Administrator.' },
          { status: 409 }
        );
      }

      await createAppNotification({
        recipientUserId: target.userId,
        type: 'PASSWORD_RESET_APPROVED',
        title: 'Password Reset Request Approved',
        message: `Your password reset request was approved by ${admin.name}. You may now create a new password (valid for ${expiryMinutes} minutes).`,
        targetUrl: '/reset-password',
        dedupeKey: `pwd_reset_approved_ntf_${target.id}`,
      });

      await logAudit({
        action: 'APPROVE_PASSWORD_RESET',
        entityType: 'PasswordResetRequest',
        entityId: target.id,
        details: {
          userId: target.userId,
          userEmail: target.userEmail,
          userRole: target.userRole,
          approvedBy: admin.email,
          expiresAt: expiresAt.toISOString(),
        },
        performedById: admin.id,
      });

      const authorizeTicket = createEmailExchangeTicket({
        requestId: target.id,
        userId: target.userId,
        expiresAtMs: expiresAt.getTime(),
      });

      void sendPasswordResetApprovedEmail({
        requestId: target.id,
        userName: target.userName,
        userEmail: target.userEmail,
        userRole: target.userRole,
        expiryMinutes,
        authorizeTicket,
      });

      return NextResponse.json({
        success: true,
        status: 'APPROVED',
        approvedAt: now,
        expiresAt,
        message: `Password reset request approved for ${target.userName} (${target.userEmail}).`,
      });
    }

    // REJECT action
    const updated = await prisma.$executeRaw`
      UPDATE "password_reset_requests"
      SET "status" = 'REJECTED'::"PasswordResetStatus",
          "resetTokenHash" = NULL,
          "reviewedById" = ${admin.id},
          "reviewedByName" = ${admin.name},
          "rejectedAt" = ${now},
          "rejectionReason" = ${rejectionReason},
          "updatedAt" = ${now}
      WHERE "id" = ${target.id}
        AND "tenantId" = ${tenantId}
        AND "status"::text = 'PENDING'
    `;

    if (updated === 0) {
      return NextResponse.json(
        { error: 'Request was already resolved by another Administrator.' },
        { status: 409 }
      );
    }

    await createAppNotification({
      recipientUserId: target.userId,
      type: 'PASSWORD_RESET_REJECTED',
      title: 'Password Reset Request Rejected',
      message: rejectionReason
        ? `Your password reset request was rejected by ${admin.name}: ${rejectionReason}`
        : `Your password reset request was not approved by ${admin.name}.`,
      dedupeKey: `pwd_reset_rejected_ntf_${target.id}`,
    });

    await logAudit({
      action: 'REJECT_PASSWORD_RESET',
      entityType: 'PasswordResetRequest',
      entityId: target.id,
      details: {
        userId: target.userId,
        userEmail: target.userEmail,
        userRole: target.userRole,
        rejectedBy: admin.email,
        rejectionReason,
      },
      performedById: admin.id,
    });

    void sendPasswordResetRejectedEmail({
      requestId: target.id,
      userName: target.userName,
      userEmail: target.userEmail,
      userRole: target.userRole,
      rejectionReason,
    });

    return NextResponse.json({
      success: true,
      status: 'REJECTED',
      rejectedAt: now,
      message: `Password reset request rejected for ${target.userName} (${target.userEmail}).`,
    });
  } catch (error) {
    console.error('[Admin PasswordReset PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update password reset request.' },
      { status: 500 }
    );
  }
}
