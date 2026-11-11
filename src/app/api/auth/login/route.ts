import { passwordLoginSchema, readJson, RequestValidationError } from '@/lib/requestValidation';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  checkLoginThrottle,
  getClientIp,
  deviceCookieName,
  DEVICE_COOKIE_MAX_AGE,
} from '@/lib/rateLimit';
import {
  comparePasswordConstantTime,
  generateToken,
  TOKEN_COOKIE_NAME,
  OPERATOR_STATUS_COOKIE_NAME,
  generateOperatorApplicantToken,
} from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST(request: NextRequest) {
  let releaseAttempt: (() => void) | undefined;
  try {
    const { email: normalizedEmail, password } = await readJson(request, passwordLoginSchema);
    const throttle = checkLoginThrottle(
      'staff',
      normalizedEmail,
      getClientIp(request),
      request.cookies.get(deviceCookieName('staff'))?.value
    );
    releaseAttempt = throttle.release;
    if (throttle.limited) {
      return NextResponse.json(
        { error: `Too many failed sign-in attempts. Please try again in ${throttle.retryAfterSeconds} seconds.` },
        { status: 429, headers: { 'Retry-After': String(throttle.retryAfterSeconds) } }
      );
    }
    const roleCheck = await prisma.$queryRaw<
      Array<{
        id: string;
        email: string;
        name: string;
        role: string;
        active: boolean;
        passwordHash: string;
        approvalStatus: string;
        rejectionReason: string | null;
        operatorNumber: string | null;
      }>
    >`
      SELECT
        "id",
        "email",
        "name",
        "role"::text AS "role",
        "active",
        "passwordHash",
        COALESCE("approvalStatus"::text, 'APPROVED') AS "approvalStatus",
        "rejectionReason",
        "operatorNumber"
      FROM "users"
      WHERE LOWER("email") = ${normalizedEmail}
      LIMIT 1
    `;

    const userRow = roleCheck[0];

    // Verify the password before revealing anything about the account (OWASP A07).
    const isMatch = await comparePasswordConstantTime(password, userRow?.passwordHash);
    if (!userRow || !isMatch) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }
    const deviceToken = throttle.succeed();

    if (userRow.role === 'EMPLOYEE') {
      return NextResponse.json(
        {
          error:
            'Employee accounts cannot sign in to the Admin/Operator portal. Please use the Employee Portal (/employee).',
        },
        { status: 403 }
      );
    }

    if (userRow.approvalStatus === 'PENDING') {
      const applicantToken = generateOperatorApplicantToken({
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
      });
      const pendingRes = NextResponse.json(
        {
          error: 'Your operator registration request is awaiting Admin approval.',
          code: 'PENDING_APPROVAL',
          approvalStatus: 'PENDING',
        },
        { status: 403 }
      );
      pendingRes.cookies.set(OPERATOR_STATUS_COOKIE_NAME, applicantToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
      return pendingRes;
    }

    if (userRow.approvalStatus === 'REJECTED') {
      const applicantToken = generateOperatorApplicantToken({
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
      });
      const rejectedRes = NextResponse.json(
        {
          error: userRow.rejectionReason
            ? `Your operator registration request was not approved: ${userRow.rejectionReason}`
            : 'Your operator registration request was not approved by the Administrator.',
          code: 'REJECTED_APPROVAL',
          approvalStatus: 'REJECTED',
          rejectionReason: userRow.rejectionReason,
        },
        { status: 403 }
      );
      rejectedRes.cookies.set(OPERATOR_STATUS_COOKIE_NAME, applicantToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
      return rejectedRes;
    }

    if (!userRow.active) {
      return NextResponse.json(
        { error: 'Account is deactivated. Please contact an administrator.' },
        { status: 403 }
      );
    }

    const gateAccessRows = await prisma.userGateAccess.findMany({
      where: { userId: userRow.id },
      select: { gateId: true },
    });

    const gateIds = gateAccessRows.map((ga) => ga.gateId);

    const token = generateToken({
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      role: userRow.role as 'ADMIN' | 'OPERATOR',
      gateIds,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        role: userRow.role,
        operatorNumber: userRow.operatorNumber,
        gateIds,
      },
    });

    // Set session cookie & clear any pending applicant cookie
    response.cookies.set(TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    response.cookies.delete(OPERATOR_STATUS_COOKIE_NAME);

    await logAudit({
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: userRow.id,
      details: { email: userRow.email, role: userRow.role, method: 'EMAIL' },
      performedById: userRow.id,
    });

    // Marks this browser as known so attacker lockouts don't block the real user.
    response.cookies.set(deviceCookieName('staff'), deviceToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: DEVICE_COOKIE_MAX_AGE,
    });

    return response;
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error during login' },
      { status: 500 }
    );
  } finally {
    releaseAttempt?.();
  }
}
