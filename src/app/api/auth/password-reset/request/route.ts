import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import {
  ensurePasswordResetSchema,
  expireStalePasswordResetRequests,
  checkPasswordResetRateLimit,
  generateSecureRandomToken,
  hashToken,
  getTenantId,
  RESET_TRACKER_COOKIE,
  RESET_AUTH_COOKIE,
} from '@/lib/passwordReset';
import { createAppNotification } from '@/lib/notifications';
import { logAudit } from '@/lib/audit';
import { sendAdminPasswordResetRequestEmail } from '@/lib/emailService';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GENERIC_CONFIRMATION_MESSAGE =
  'If an active account is registered with this email address, your password reset request has been submitted for Administrator approval.';

export async function POST(request: NextRequest) {
  try {
    await ensurePasswordResetSchema();
    await expireStalePasswordResetRequests();

    const forwardedFor = request.headers.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';

    const rateCheck = checkPasswordResetRateLimit(clientIp);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `Too many password reset requests. Please wait ${rateCheck.retryAfterSeconds} seconds before trying again.`,
        },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const portalContext =
      typeof body.portalContext === 'string' &&
      ['ADMIN', 'OPERATOR', 'EMPLOYEE'].includes(body.portalContext.toUpperCase())
        ? body.portalContext.toUpperCase()
        : null;

    if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid registered email address.' },
        { status: 400 }
      );
    }

    const tenantId = getTenantId();

    const users = await prisma.$queryRaw<
      Array<{
        id: string;
        email: string;
        name: string;
        role: 'ADMIN' | 'OPERATOR' | 'EMPLOYEE';
        active: boolean;
        approvalStatus: string;
      }>
    >`
      SELECT
        "id",
        "email",
        "name",
        "role"::text AS "role",
        "active",
        COALESCE("approvalStatus"::text, 'APPROVED') AS "approvalStatus"
      FROM "users"
      WHERE LOWER("email") = ${rawEmail}
      LIMIT 1
    `;

    const user = users[0];

    // Prevent email enumeration: if no active/approved account exists, still set a random tracker cookie
    // and return the exact same 200 response structure.
    if (!user || !user.active || user.approvalStatus !== 'APPROVED') {
      const dummyTracker = generateSecureRandomToken(32);
      const res = NextResponse.json({
        success: true,
        message: GENERIC_CONFIRMATION_MESSAGE,
        status: 'PENDING',
      });
      res.cookies.set(RESET_TRACKER_COOKIE, dummyTracker, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24,
      });
      res.cookies.delete(RESET_AUTH_COOKIE);
      return res;
    }

    // Check if there is already an active PENDING or unexpired APPROVED request for this user
    const existingActive = await prisma.$queryRaw<
      Array<{
        id: string;
        status: 'PENDING' | 'APPROVED';
        expiresAt: Date | null;
      }>
    >`
      SELECT "id", "status"::text AS "status", "expiresAt"
      FROM "password_reset_requests"
      WHERE "userId" = ${user.id}
        AND "tenantId" = ${tenantId}
        AND (
          "status"::text = 'PENDING'
          OR ("status"::text = 'APPROVED' AND "usedAt" IS NULL AND ("expiresAt" IS NULL OR "expiresAt" > NOW()))
        )
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;

    const rawTrackerToken = generateSecureRandomToken(32);
    const trackerTokenHash = hashToken(rawTrackerToken);

    if (existingActive.length > 0) {
      const activeReq = existingActive[0];
      // Update trackerTokenHash so the user's current browser tracks the existing request in real time
      await prisma.$executeRaw`
        UPDATE "password_reset_requests"
        SET "trackerTokenHash" = ${trackerTokenHash},
            "portalContext" = COALESCE(${portalContext}, "portalContext"),
            "updatedAt" = NOW()
        WHERE "id" = ${activeReq.id}
      `;

      const res = NextResponse.json({
        success: true,
        message: GENERIC_CONFIRMATION_MESSAGE,
        status: 'PENDING',
        duplicatePrevented: true,
      });
      res.cookies.set(RESET_TRACKER_COOKIE, rawTrackerToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24,
      });
      res.cookies.delete(RESET_AUTH_COOKIE);
      return res;
    }

    const requestId = `prr_${crypto.randomBytes(12).toString('hex')}`;
    const now = new Date();

    await prisma.$executeRaw`
      INSERT INTO "password_reset_requests" (
        "id",
        "userId",
        "userEmail",
        "userName",
        "userRole",
        "portalContext",
        "status",
        "trackerTokenHash",
        "requestIp",
        "tenantId",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${requestId},
        ${user.id},
        ${user.email},
        ${user.name},
        ${user.role}::"Role",
        ${portalContext || user.role},
        'PENDING'::"PasswordResetStatus",
        ${trackerTokenHash},
        ${clientIp},
        ${tenantId},
        ${now},
        ${now}
      )
    `;

    const targetUrl =
      user.role === 'EMPLOYEE'
        ? `/employees?tab=requests&requestType=PASSWORD_RESET&requestId=${requestId}`
        : user.role === 'OPERATOR'
        ? `/access?tab=requests&requestType=PASSWORD_RESET&requestId=${requestId}`
        : `/settings?section=admin-security&requestId=${requestId}`;

    const notificationType =
      user.role === 'EMPLOYEE'
        ? 'EMPLOYEE_PASSWORD_RESET_REQUEST'
        : user.role === 'OPERATOR'
        ? 'OPERATOR_PASSWORD_RESET_REQUEST'
        : 'ADMIN_PASSWORD_RESET_REQUEST';

    const notificationTitle =
      user.role === 'EMPLOYEE'
        ? 'Employee Password Reset Request'
        : user.role === 'OPERATOR'
        ? 'Operator Password Reset Request'
        : 'Admin Password Reset Request';

    await createAppNotification({
      recipientRole: 'ADMIN',
      type: notificationType,
      title: notificationTitle,
      message: `${user.name} (${user.role}) submitted a password reset request for ${user.email}.`,
      targetUrl,
      dedupeKey: `pwd_reset_req_${requestId}`,
    });

    await logAudit({
      action: 'REQUEST_PASSWORD_RESET',
      entityType: 'PasswordResetRequest',
      entityId: requestId,
      details: {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        portalContext: portalContext || user.role,
      },
      performedById: user.id,
      ipAddress: clientIp,
    });

    void sendAdminPasswordResetRequestEmail({
      requestId,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      createdAt: now,
    });

    const response = NextResponse.json({
      success: true,
      message: GENERIC_CONFIRMATION_MESSAGE,
      status: 'PENDING',
    });

    response.cookies.set(RESET_TRACKER_COOKIE, rawTrackerToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
    response.cookies.delete(RESET_AUTH_COOKIE);

    return response;
  } catch (error) {
    console.error('[PasswordReset Request POST] Error:', error);
    return NextResponse.json(
      { error: 'Unable to process password reset request at this time.' },
      { status: 500 }
    );
  }
}
