import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser, getEmployeeSessionUser, EmployeeApprovalStatus } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import {
  sendEmployeeApprovedEmail,
  sendEmployeeRejectedEmail,
} from '@/lib/emailService';

interface EmployeeDbRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: string | null;
  departmentName: string | null;
  position: string | null;
  phoneNumber: string | null;
  approvalStatus: EmployeeApprovalStatus;
  active: boolean;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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
        { error: 'Forbidden: Only administrators can approve or manage employees.' },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Employee ID is required.' }, { status: 400 });
    }

    const body = await request.json();
    const action = typeof body.action === 'string' ? body.action.trim().toUpperCase() : '';
    const rejectionReason =
      typeof body.rejectionReason === 'string' && body.rejectionReason.trim()
        ? body.rejectionReason.trim()
        : null;

    if (!['APPROVE', 'REJECT', 'TOGGLE_ACTIVE', 'UPDATE_DEPARTMENT'].includes(action)) {
      return NextResponse.json(
        {
          error:
            'Invalid action. Supported actions: APPROVE, REJECT, TOGGLE_ACTIVE, UPDATE_DEPARTMENT.',
        },
        { status: 400 }
      );
    }

    const existingRows = await prisma.$queryRaw<EmployeeDbRecord[]>`
      SELECT
        u."id",
        u."name",
        u."email",
        u."role"::text AS "role",
        u."departmentId",
        COALESCE(d."name", u."departmentName", 'General') AS "departmentName",
        u."position",
        u."phoneNumber",
        COALESCE(u."approvalStatus"::text, 'PENDING') AS "approvalStatus",
        u."active",
        u."approvedAt",
        u."rejectedAt",
        u."rejectionReason",
        u."createdAt"
      FROM "users" u
      LEFT JOIN "departments" d ON d."id" = u."departmentId"
      WHERE u."id" = ${id} AND u."role"::text = 'EMPLOYEE'
      LIMIT 1
    `;

    const targetEmployee = existingRows[0];
    if (!targetEmployee) {
      return NextResponse.json(
        { error: 'Employee record not found.' },
        { status: 404 }
      );
    }

    if (action === 'APPROVE') {
      const now = new Date();
      // Atomic conditional update: only succeeds if currently PENDING
      const updatedCount = await prisma.$executeRaw`
        UPDATE "users"
        SET "approvalStatus" = 'APPROVED'::"EmployeeApprovalStatus",
            "approvedAt" = ${now},
            "approvedById" = ${user.id},
            "rejectedAt" = NULL,
            "rejectionReason" = NULL,
            "active" = true,
            "updatedAt" = ${now}
        WHERE "id" = ${id}
          AND "role"::text = 'EMPLOYEE'
          AND COALESCE("approvalStatus"::text, 'PENDING') = 'PENDING'
      `;

      if (updatedCount === 0) {
        return NextResponse.json(
          {
            error: `This employee request has already been processed (current status: ${targetEmployee.approvalStatus}).`,
          },
          { status: 409 }
        );
      }

      await logAudit({
        action: 'APPROVE_EMPLOYEE_REQUEST',
        entityType: 'User',
        entityId: id,
        details: {
          name: targetEmployee.name,
          email: targetEmployee.email,
          departmentName: targetEmployee.departmentName,
          position: targetEmployee.position,
        },
        performedById: user.id,
      });

      // Dispatch approval email AFTER database state is committed
      const emailResult = await sendEmployeeApprovedEmail({
        id: targetEmployee.id,
        name: targetEmployee.name,
        email: targetEmployee.email,
        departmentName: targetEmployee.departmentName || 'General',
        position: targetEmployee.position || 'Employee',
        approvedAt: now,
      });

      return NextResponse.json({
        success: true,
        message: `Approved ${targetEmployee.name}'s employee account.`,
        employee: {
          ...targetEmployee,
          approvalStatus: 'APPROVED',
          active: true,
          approvedAt: now,
        },
        emailDispatch: emailResult,
      });
    }

    if (action === 'REJECT') {
      const now = new Date();
      // Atomic conditional update: only succeeds if currently PENDING
      const updatedCount = await prisma.$executeRaw`
        UPDATE "users"
        SET "approvalStatus" = 'REJECTED'::"EmployeeApprovalStatus",
            "rejectedAt" = ${now},
            "rejectionReason" = ${rejectionReason},
            "active" = false,
            "updatedAt" = ${now}
        WHERE "id" = ${id}
          AND "role"::text = 'EMPLOYEE'
          AND COALESCE("approvalStatus"::text, 'PENDING') = 'PENDING'
      `;

      if (updatedCount === 0) {
        return NextResponse.json(
          {
            error: `This employee request has already been processed (current status: ${targetEmployee.approvalStatus}).`,
          },
          { status: 409 }
        );
      }

      await logAudit({
        action: 'REJECT_EMPLOYEE_REQUEST',
        entityType: 'User',
        entityId: id,
        details: {
          name: targetEmployee.name,
          email: targetEmployee.email,
          departmentName: targetEmployee.departmentName,
          position: targetEmployee.position,
          rejectionReason,
        },
        performedById: user.id,
      });

      // Dispatch rejection email AFTER database state is committed
      const emailResult = await sendEmployeeRejectedEmail({
        id: targetEmployee.id,
        name: targetEmployee.name,
        email: targetEmployee.email,
        departmentName: targetEmployee.departmentName || 'General',
        position: targetEmployee.position || 'Employee',
        rejectionReason,
      });

      return NextResponse.json({
        success: true,
        message: `Rejected ${targetEmployee.name}'s registration request.`,
        employee: {
          ...targetEmployee,
          approvalStatus: 'REJECTED',
          active: false,
          rejectedAt: now,
          rejectionReason,
        },
        emailDispatch: emailResult,
      });
    }

    if (action === 'UPDATE_DEPARTMENT') {
      const nextDepartmentId =
        typeof body.departmentId === 'string' && body.departmentId.trim()
          ? body.departmentId.trim()
          : '';
      if (!nextDepartmentId) {
        return NextResponse.json(
          { error: 'Please select a valid Department.' },
          { status: 400 }
        );
      }

      const deptRows = await prisma.$queryRaw<
        Array<{ id: string; name: string }>
      >`
        SELECT "id", "name"
        FROM "departments"
        WHERE "id" = ${nextDepartmentId}
        LIMIT 1
      `;

      const dept = deptRows[0];
      if (!dept) {
        return NextResponse.json(
          { error: 'Selected department does not exist.' },
          { status: 404 }
        );
      }

      await prisma.$executeRaw`
        UPDATE "users"
        SET "departmentId" = ${dept.id},
            "departmentName" = ${dept.name},
            "updatedAt" = NOW()
        WHERE "id" = ${id} AND "role"::text = 'EMPLOYEE'
      `;

      await logAudit({
        action: 'UPDATE_EMPLOYEE_DEPARTMENT',
        entityType: 'User',
        entityId: id,
        details: {
          name: targetEmployee.name,
          email: targetEmployee.email,
          previousDepartment: targetEmployee.departmentName,
          newDepartmentId: dept.id,
          newDepartmentName: dept.name,
        },
        performedById: user.id,
      });

      return NextResponse.json({
        success: true,
        message: `Updated ${targetEmployee.name}'s department to ${dept.name}.`,
        employee: {
          ...targetEmployee,
          departmentId: dept.id,
          departmentName: dept.name,
        },
      });
    }

    // TOGGLE_ACTIVE on an approved employee
    if (targetEmployee.approvalStatus !== 'APPROVED') {
      return NextResponse.json(
        { error: 'Only approved employee accounts can be activated or deactivated.' },
        { status: 400 }
      );
    }

    const nextActive =
      typeof body.active === 'boolean' ? body.active : !targetEmployee.active;

    await prisma.$executeRaw`
      UPDATE "users"
      SET "active" = ${nextActive},
          "updatedAt" = NOW()
      WHERE "id" = ${id} AND "role"::text = 'EMPLOYEE'
    `;

    await logAudit({
      action: 'UPDATE_EMPLOYEE_STATUS',
      entityType: 'User',
      entityId: id,
      details: {
        name: targetEmployee.name,
        email: targetEmployee.email,
        active: nextActive,
      },
      performedById: user.id,
    });

    return NextResponse.json({
      success: true,
      message: `${targetEmployee.name}'s account is now ${nextActive ? 'Active' : 'Inactive'}.`,
      employee: {
        ...targetEmployee,
        active: nextActive,
      },
    });
  } catch (error: unknown) {
    console.error('Error updating employee request:', error);
    return NextResponse.json(
      { error: 'Failed to update employee status.' },
      { status: 500 }
    );
  }
}
