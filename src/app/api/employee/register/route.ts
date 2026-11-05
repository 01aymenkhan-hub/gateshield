import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import {
  hashPassword,
  generateEmployeeToken,
  EMPLOYEE_STATUS_COOKIE_NAME,
  EMPLOYEE_TOKEN_COOKIE_NAME,
} from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import {
  sendEmployeeRegistrationConfirmationEmail,
  sendAdminNewEmployeeRequestEmail,
} from '@/lib/emailService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim().replace(/\s+/g, ' ') : '';
    const departmentId = typeof body.departmentId === 'string' ? body.departmentId.trim() : '';
    const departmentNameInput = typeof body.department === 'string' ? body.department.trim() : '';
    const position = typeof body.position === 'string' ? body.position.trim().replace(/\s+/g, ' ') : '';
    const rawPhone = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
    const rawEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

    if (!fullName) {
      return NextResponse.json({ error: 'Full Name is required.' }, { status: 400 });
    }

    if (!departmentId && !departmentNameInput) {
      return NextResponse.json({ error: 'Department is required.' }, { status: 400 });
    }

    if (!position) {
      return NextResponse.json({ error: 'Position / Designation is required.' }, { status: 400 });
    }

    const cleanedPhone = rawPhone.replace(/[\s\-()]/g, '');
    if (!cleanedPhone || cleanedPhone.length < 10 || cleanedPhone.length > 15) {
      return NextResponse.json(
        { error: 'Please enter a valid Phone Number (e.g., 03001234567).' },
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

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'Password and Confirm Password do not match.' },
        { status: 400 }
      );
    }

    // Resolve department from active departments
    let resolvedDeptId: string | null = null;
    let resolvedDeptName = '';

    if (departmentId) {
      const deptRows = await prisma.$queryRaw<
        Array<{ id: string; name: string; active: boolean }>
      >`
        SELECT "id", "name", "active"
        FROM "departments"
        WHERE "id" = ${departmentId} AND "active" = true
        LIMIT 1
      `;
      if (deptRows.length > 0) {
        resolvedDeptId = deptRows[0].id;
        resolvedDeptName = deptRows[0].name;
      }
    }

    if (!resolvedDeptName && departmentNameInput) {
      const normalized = departmentNameInput.toLowerCase().replace(/\s+/g, ' ');
      const deptRows = await prisma.$queryRaw<
        Array<{ id: string; name: string; active: boolean }>
      >`
        SELECT "id", "name", "active"
        FROM "departments"
        WHERE "normalizedName" = ${normalized} AND "active" = true
        LIMIT 1
      `;
      if (deptRows.length > 0) {
        resolvedDeptId = deptRows[0].id;
        resolvedDeptName = deptRows[0].name;
      }
    }

    if (!resolvedDeptName) {
      return NextResponse.json(
        { error: 'Please select a valid active department.' },
        { status: 400 }
      );
    }

    // Check duplicate email in users table
    const existingUsers = await prisma.$queryRaw<
      Array<{ id: string; role: string; approvalStatus: string }>
    >`
      SELECT "id", "role"::text AS "role", COALESCE("approvalStatus"::text, 'APPROVED') AS "approvalStatus"
      FROM "users"
      WHERE "email" = ${rawEmail}
      LIMIT 1
    `;

    if (existingUsers.length > 0) {
      return NextResponse.json(
        {
          error:
            'An account or registration request with this email address already exists. Please sign in to check your status.',
        },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const newId = `emp_${crypto.randomBytes(12).toString('hex')}`;
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
        "departmentId",
        "departmentName",
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
        'EMPLOYEE'::"Role",
        true,
        'PENDING'::"EmployeeApprovalStatus",
        ${resolvedDeptId},
        ${resolvedDeptName},
        ${position},
        ${cleanedPhone},
        ${now},
        ${now}
      )
    `;

    // Create persistent Admin notification in app_notifications
    const notifId = `ntf_${crypto.randomBytes(10).toString('hex')}`;
    const dedupeKey = `emp_req_${newId}`;
    const targetUrl = `/employees?tab=requests&requestType=REGISTRATION&requestId=${newId}`;
    await prisma.$executeRaw`
      INSERT INTO "app_notifications" (
        "id",
        "recipientRole",
        "type",
        "title",
        "message",
        "targetUrl",
        "dedupeKey",
        "isRead",
        "createdAt"
      )
      VALUES (
        ${notifId},
        'ADMIN',
        'EMPLOYEE_REQUEST',
        'New Employee Registration Request',
        ${`${fullName} (${resolvedDeptName} • ${position}) requested Employee Portal access.`},
        ${targetUrl},
        ${dedupeKey},
        false,
        NOW()
      )
      ON CONFLICT ("dedupeKey") DO NOTHING
    `;

    await logAudit({
      action: 'EMPLOYEE_REGISTRATION_REQUEST',
      entityType: 'User',
      entityId: newId,
      details: {
        name: fullName,
        email: rawEmail,
        departmentId: resolvedDeptId,
        departmentName: resolvedDeptName,
        position,
        phoneNumber: cleanedPhone,
        approvalStatus: 'PENDING',
      },
    });

    // Send confirmation email to employee and notification email to Admin AFTER DB state is persisted
    const [applicantEmailResult, adminEmailResult] = await Promise.all([
      sendEmployeeRegistrationConfirmationEmail({
        id: newId,
        name: fullName,
        email: rawEmail,
        departmentName: resolvedDeptName,
        position,
        phoneNumber: cleanedPhone,
        createdAt: now,
      }),
      sendAdminNewEmployeeRequestEmail({
        id: newId,
        name: fullName,
        email: rawEmail,
        departmentName: resolvedDeptName,
        position,
        phoneNumber: cleanedPhone,
        createdAt: now,
      }),
    ]);

    const statusToken = generateEmployeeToken({
      id: newId,
      email: rawEmail,
      name: fullName,
      purpose: 'APPLICANT_STATUS',
    });

    const response = NextResponse.json(
      {
        success: true,
        authenticated: false,
        approvalStatus: 'PENDING',
        message:
          'Your registration request has been submitted and is pending administrator approval.',
        applicant: {
          id: newId,
          name: fullName,
          email: rawEmail,
          departmentId: resolvedDeptId,
          departmentName: resolvedDeptName,
          position,
          phoneNumber: cleanedPhone,
          approvalStatus: 'PENDING',
          createdAt: now,
        },
        emailDispatch: {
          applicantConfirmation: applicantEmailResult.status,
          adminNotification: adminEmailResult.status,
        },
      },
      { status: 201 }
    );

    // Clear any old session cookie and set applicant status polling cookie
    response.cookies.delete(EMPLOYEE_TOKEN_COOKIE_NAME);
    response.cookies.set(EMPLOYEE_STATUS_COOKIE_NAME, statusToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error: unknown) {
    console.error('Employee registration error:', error);
    return NextResponse.json(
      { error: 'Failed to submit employee registration request.' },
      { status: 500 }
    );
  }
}
