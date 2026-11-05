import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import {
  getSessionUser,
  getEmployeeSessionUser,
  hashPassword,
  EmployeeApprovalStatus,
} from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { sendEmployeeApprovedEmail } from '@/lib/emailService';
import {
  ensurePasswordResetSchema,
  expireStalePasswordResetRequests,
  getTenantId,
  PasswordResetStatusType,
} from '@/lib/passwordReset';

export interface AdminEmployeeRow {
  id: string;
  name: string;
  email: string;
  departmentId: string | null;
  departmentName: string | null;
  position: string | null;
  phoneNumber: string | null;
  approvalStatus: EmployeeApprovalStatus;
  active: boolean;
  approvedAt: Date | null;
  approvedById: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  totalInvitations: number;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      const empUser = await getEmployeeSessionUser();
      if (empUser) {
        return NextResponse.json(
          { error: 'Forbidden: Employees cannot access Admin endpoints.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Administrator access required.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const summaryOnly = searchParams.get('summaryOnly') === 'true';

    await ensurePasswordResetSchema();
    await expireStalePasswordResetRequests();
    const tenantId = getTenantId();

    const [regCountRows, pwdCountRows] = await Promise.all([
      prisma.$queryRaw<Array<{ pendingCount: number }>>`
        SELECT COUNT(*)::int AS "pendingCount"
        FROM "users"
        WHERE "role"::text = 'EMPLOYEE'
          AND COALESCE("approvalStatus"::text, 'PENDING') = 'PENDING'
      `,
      prisma.$queryRaw<Array<{ pendingCount: number }>>`
        SELECT COUNT(*)::int AS "pendingCount"
        FROM "password_reset_requests"
        WHERE "tenantId" = ${tenantId}
          AND "userRole"::text = 'EMPLOYEE'
          AND "status"::text = 'PENDING'
      `,
    ]);

    const pendingRegistrationCount = regCountRows[0]?.pendingCount ?? 0;
    const pendingPasswordResetCount = pwdCountRows[0]?.pendingCount ?? 0;
    const pendingCount = pendingRegistrationCount + pendingPasswordResetCount;

    if (summaryOnly) {
      return NextResponse.json({
        success: true,
        pendingCount,
        pendingRegistrationCount,
        pendingPasswordResetCount,
      });
    }

    const [allEmployeeRows, passwordResetRequests] = await Promise.all([
      prisma.$queryRaw<AdminEmployeeRow[]>`
        SELECT
          u."id",
          u."name",
          u."email",
          u."departmentId",
          COALESCE(d."name", u."departmentName", 'Unassigned') AS "departmentName",
          u."position",
          u."phoneNumber",
          COALESCE(u."approvalStatus"::text, 'PENDING') AS "approvalStatus",
          u."active",
          u."approvedAt",
          u."approvedById",
          u."rejectedAt",
          u."rejectionReason",
          u."createdAt",
          u."updatedAt",
          (
            SELECT COUNT(*)::int
            FROM "guest_invitations" gi
            WHERE gi."employeeId" = u."id"
          ) AS "totalInvitations"
        FROM "users" u
        LEFT JOIN "departments" d ON d."id" = u."departmentId"
        WHERE u."role"::text = 'EMPLOYEE'
        ORDER BY
          CASE WHEN COALESCE(u."approvalStatus"::text, 'PENDING') = 'PENDING' THEN 0
               WHEN COALESCE(u."approvalStatus"::text, 'PENDING') = 'REJECTED' THEN 1
               ELSE 2
          END ASC,
          u."createdAt" DESC
      `,
      prisma.$queryRaw<
        Array<{
          id: string;
          userId: string;
          userEmail: string;
          userName: string;
          userRole: 'EMPLOYEE';
          status: PasswordResetStatusType;
          reviewedById: string | null;
          reviewedByName: string | null;
          approvedAt: Date | null;
          rejectedAt: Date | null;
          rejectionReason: string | null;
          expiresAt: Date | null;
          usedAt: Date | null;
          completedAt: Date | null;
          createdAt: Date;
          updatedAt: Date;
          departmentName: string | null;
          position: string | null;
          phoneNumber: string | null;
        }>
      >`
        SELECT
          prr."id",
          prr."userId",
          prr."userEmail",
          prr."userName",
          prr."userRole"::text AS "userRole",
          prr."status"::text AS "status",
          prr."reviewedById",
          prr."reviewedByName",
          prr."approvedAt",
          prr."rejectedAt",
          prr."rejectionReason",
          prr."expiresAt",
          prr."usedAt",
          prr."completedAt",
          prr."createdAt",
          prr."updatedAt",
          COALESCE(d."name", u."departmentName", 'Unassigned') AS "departmentName",
          u."position",
          u."phoneNumber"
        FROM "password_reset_requests" prr
        LEFT JOIN "users" u ON u."id" = prr."userId"
        LEFT JOIN "departments" d ON d."id" = u."departmentId"
        WHERE prr."tenantId" = ${tenantId}
          AND prr."userRole"::text = 'EMPLOYEE'
        ORDER BY
          CASE WHEN prr."status"::text = 'PENDING' THEN 0
               WHEN prr."status"::text = 'APPROVED' THEN 1
               WHEN prr."status"::text = 'COMPLETED' THEN 2
               WHEN prr."status"::text = 'REJECTED' THEN 3
               ELSE 4
          END ASC,
          prr."createdAt" DESC
        LIMIT 200
      `,
    ]);

    const requests = allEmployeeRows;
    const employees = allEmployeeRows.filter((row) => row.approvalStatus === 'APPROVED');

    return NextResponse.json({
      success: true,
      pendingCount,
      pendingRegistrationCount,
      pendingPasswordResetCount,
      requests,
      passwordResetRequests,
      employees,
    });
  } catch (error: unknown) {
    console.error('Error fetching admin employees:', error);
    return NextResponse.json(
      { error: 'Failed to load employee records.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      const empUser = await getEmployeeSessionUser();
      if (empUser) {
        return NextResponse.json(
          { error: 'Forbidden: Employees cannot create employee accounts.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Only administrators can create employee accounts.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const rawName =
      typeof body.fullName === 'string' && body.fullName.trim()
        ? body.fullName.trim()
        : typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : '';
    const fullName = rawName.replace(/\s+/g, ' ');
    const departmentId =
      typeof body.departmentId === 'string' ? body.departmentId.trim() : '';
    const departmentNameInput =
      typeof body.department === 'string' ? body.department.trim() : '';
    const position =
      typeof body.position === 'string'
        ? body.position.trim().replace(/\s+/g, ' ')
        : '';
    const rawPhone =
      typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
    const rawEmail =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const confirmPassword =
      typeof body.confirmPassword === 'string' ? body.confirmPassword : password;

    if (!fullName) {
      return NextResponse.json(
        { error: 'Employee Full Name is required.' },
        { status: 400 }
      );
    }

    if (!departmentId && !departmentNameInput) {
      return NextResponse.json(
        { error: 'Department is required.' },
        { status: 400 }
      );
    }

    if (!position) {
      return NextResponse.json(
        { error: 'Position / Designation is required.' },
        { status: 400 }
      );
    }

    const cleanedPhone = rawPhone ? rawPhone.replace(/[\s\-()]/g, '') : '';
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

    // Resolve department from existing departments table
    let resolvedDeptId: string | null = null;
    let resolvedDeptName = '';

    if (departmentId) {
      const deptRows = await prisma.$queryRaw<
        Array<{ id: string; name: string; active: boolean }>
      >`
        SELECT "id", "name", "active"
        FROM "departments"
        WHERE "id" = ${departmentId}
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
        WHERE "normalizedName" = ${normalized}
        LIMIT 1
      `;
      if (deptRows.length > 0) {
        resolvedDeptId = deptRows[0].id;
        resolvedDeptName = deptRows[0].name;
      }
    }

    if (!resolvedDeptName) {
      return NextResponse.json(
        { error: 'Please select a valid department.' },
        { status: 400 }
      );
    }

    // Check duplicate email in users table
    const existingUsers = await prisma.$queryRaw<Array<{ id: string; email: string }>>`
      SELECT "id", "email"
      FROM "users"
      WHERE LOWER("email") = ${rawEmail}
      LIMIT 1
    `;

    if (existingUsers.length > 0) {
      return NextResponse.json(
        {
          error: 'An account with this email address already exists.',
          code: 'DUPLICATE_EMAIL',
        },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const newId = `emp_${crypto.randomBytes(12).toString('hex')}`;
    const now = new Date();

    // Admin-created employee is immediately active and APPROVED (never placed in pending queue)
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
        "approvedAt",
        "approvedById",
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
        'APPROVED'::"EmployeeApprovalStatus",
        ${resolvedDeptId},
        ${resolvedDeptName},
        ${position},
        ${cleanedPhone},
        ${now},
        ${user.id},
        ${now},
        ${now}
      )
    `;

    await logAudit({
      action: 'CREATE_EMPLOYEE_BY_ADMIN',
      entityType: 'User',
      entityId: newId,
      details: {
        name: fullName,
        email: rawEmail,
        departmentId: resolvedDeptId,
        departmentName: resolvedDeptName,
        position,
        phoneNumber: cleanedPhone,
        role: 'EMPLOYEE',
        approvalStatus: 'APPROVED',
        active: true,
      },
      performedById: user.id,
    });

    // Send account approved/welcome email (never contains plaintext password)
    const emailResult = await sendEmployeeApprovedEmail({
      id: newId,
      name: fullName,
      email: rawEmail,
      departmentName: resolvedDeptName,
      position,
      approvedAt: now,
    });

    const createdEmployee: AdminEmployeeRow = {
      id: newId,
      name: fullName,
      email: rawEmail,
      departmentId: resolvedDeptId,
      departmentName: resolvedDeptName,
      position,
      phoneNumber: cleanedPhone,
      approvalStatus: 'APPROVED',
      active: true,
      approvedAt: now,
      approvedById: user.id,
      rejectedAt: null,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
      totalInvitations: 0,
    };

    return NextResponse.json(
      {
        success: true,
        message: `Employee account created and activated for ${fullName}.`,
        employee: createdEmployee,
        emailDispatch: emailResult,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating employee by admin:', error);
    return NextResponse.json(
      { error: 'Failed to create employee account.' },
      { status: 500 }
    );
  }
}
