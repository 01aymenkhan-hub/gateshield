import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import {
  hashPassword,
  generateOperatorApplicantToken,
  OPERATOR_STATUS_COOKIE_NAME,
  TOKEN_COOKIE_NAME,
} from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createAppNotification } from '@/lib/notifications';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawName =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : typeof body.fullName === 'string' && body.fullName.trim()
        ? body.fullName.trim()
        : '';
    const fullName = rawName.replace(/\s+/g, ' ');
    const rawEmail =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const rawPhone =
      typeof body.phone === 'string' && body.phone.trim()
        ? body.phone.trim()
        : typeof body.phoneNumber === 'string' && body.phoneNumber.trim()
        ? body.phoneNumber.trim()
        : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const confirmPassword =
      typeof body.confirmPassword === 'string' ? body.confirmPassword : password;

    if (!fullName) {
      return NextResponse.json(
        { error: 'Operator Name is required.' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!rawEmail || !emailRegex.test(rawEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid Email Address.' },
        { status: 400 }
      );
    }

    const cleanedPhone = rawPhone.replace(/[\s\-()]/g, '');
    if (!cleanedPhone || cleanedPhone.length < 10 || cleanedPhone.length > 15) {
      return NextResponse.json(
        { error: 'Please enter a valid Phone Number (e.g., 03001234567).' },
        { status: 400 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'Passwords do not match.' },
        { status: 400 }
      );
    }

    const existingUsers = await prisma.$queryRaw<
      Array<{ id: string; role: string; approvalStatus: string }>
    >`
      SELECT "id", "role"::text AS "role", COALESCE("approvalStatus"::text, 'APPROVED') AS "approvalStatus"
      FROM "users"
      WHERE LOWER("email") = ${rawEmail}
      LIMIT 1
    `;

    if (existingUsers.length > 0) {
      return NextResponse.json(
        {
          error:
            'An account or registration request with this email address already exists.',
        },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const newId = `opr_${crypto.randomBytes(12).toString('hex')}`;
    const now = new Date();

    await prisma.$executeRaw`
      INSERT INTO "users" (
        "id",
        "email",
        "passwordHash",
        "name",
        "role",
        "active",
        "approvalStatus",
        "position",
        "phoneNumber",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${newId},
        ${rawEmail},
        ${passwordHash},
        ${fullName},
        'OPERATOR'::"Role",
        false,
        'PENDING'::"EmployeeApprovalStatus",
        'Gate Operator',
        ${cleanedPhone},
        ${now},
        ${now}
      )
    `;

    await createAppNotification({
      recipientRole: 'ADMIN',
      type: 'OPERATOR_REQUEST',
      title: 'New Operator Registration Request',
      message: `${fullName} (${rawEmail} • ${cleanedPhone}) requested Operator access.`,
      operatorUserId: newId,
      targetUrl: `/access?tab=requests&requestType=REGISTRATION&requestId=${newId}`,
      dedupeKey: `op_req_${newId}`,
    });

    await logAudit({
      action: 'OPERATOR_REGISTRATION_REQUEST',
      entityType: 'User',
      entityId: newId,
      details: {
        name: fullName,
        email: rawEmail,
        phoneNumber: cleanedPhone,
        approvalStatus: 'PENDING',
      },
    });

    const statusToken = generateOperatorApplicantToken({
      id: newId,
      email: rawEmail,
      name: fullName,
    });

    const response = NextResponse.json(
      {
        success: true,
        authenticated: false,
        approvalStatus: 'PENDING',
        message:
          'Your Operator registration request has been submitted for Administrator approval.',
        applicant: {
          id: newId,
          name: fullName,
          email: rawEmail,
          phone: cleanedPhone,
          phoneNumber: cleanedPhone,
          approvalStatus: 'PENDING',
          active: false,
          createdAt: now,
        },
      },
      { status: 201 }
    );

    response.cookies.delete(TOKEN_COOKIE_NAME);
    response.cookies.set(OPERATOR_STATUS_COOKIE_NAME, statusToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error: unknown) {
    console.error('[Operator Register POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to submit operator registration request.' },
      { status: 500 }
    );
  }
}
