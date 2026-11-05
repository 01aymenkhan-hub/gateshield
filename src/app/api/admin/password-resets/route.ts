import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser, getEmployeeSessionUser } from '@/lib/auth';
import {
  ensurePasswordResetSchema,
  expireStalePasswordResetRequests,
  getTenantId,
  PasswordResetStatusType,
} from '@/lib/passwordReset';

export interface AdminPasswordResetRow {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  userRole: 'ADMIN' | 'OPERATOR' | 'EMPLOYEE';
  portalContext: string | null;
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

    await ensurePasswordResetSchema();
    await expireStalePasswordResetRequests();

    const tenantId = getTenantId();
    const { searchParams } = new URL(request.url);
    const summaryOnly = searchParams.get('summaryOnly') === 'true';
    const rawRoleFilter = searchParams.get('role')?.trim().toUpperCase();
    const roleFilter =
      rawRoleFilter === 'EMPLOYEE' || rawRoleFilter === 'OPERATOR' || rawRoleFilter === 'ADMIN'
        ? rawRoleFilter
        : null;

    const countBreakdown = await prisma.$queryRaw<
      Array<{
        totalPendingCount: number;
        employeePendingCount: number;
        operatorPendingCount: number;
        adminPendingCount: number;
      }>
    >`
      SELECT
        COUNT(*)::int AS "totalPendingCount",
        COUNT(*) FILTER (WHERE "userRole"::text = 'EMPLOYEE')::int AS "employeePendingCount",
        COUNT(*) FILTER (WHERE "userRole"::text = 'OPERATOR')::int AS "operatorPendingCount",
        COUNT(*) FILTER (WHERE "userRole"::text = 'ADMIN')::int AS "adminPendingCount"
      FROM "password_reset_requests"
      WHERE "tenantId" = ${tenantId}
        AND "status"::text = 'PENDING'
    `;

    const breakdown = countBreakdown[0] || {
      totalPendingCount: 0,
      employeePendingCount: 0,
      operatorPendingCount: 0,
      adminPendingCount: 0,
    };

    const pendingCount =
      roleFilter === 'EMPLOYEE'
        ? breakdown.employeePendingCount
        : roleFilter === 'OPERATOR'
        ? breakdown.operatorPendingCount
        : roleFilter === 'ADMIN'
        ? breakdown.adminPendingCount
        : breakdown.totalPendingCount;

    if (summaryOnly) {
      return NextResponse.json({
        success: true,
        pendingCount,
        employeePendingCount: breakdown.employeePendingCount,
        operatorPendingCount: breakdown.operatorPendingCount,
        adminPendingCount: breakdown.adminPendingCount,
      });
    }

    const requests = roleFilter
      ? await prisma.$queryRaw<AdminPasswordResetRow[]>`
          SELECT
            "id",
            "userId",
            "userEmail",
            "userName",
            "userRole"::text AS "userRole",
            "portalContext",
            "status"::text AS "status",
            "reviewedById",
            "reviewedByName",
            "approvedAt",
            "rejectedAt",
            "rejectionReason",
            "expiresAt",
            "usedAt",
            "completedAt",
            "createdAt",
            "updatedAt"
          FROM "password_reset_requests"
          WHERE "tenantId" = ${tenantId}
            AND "userRole"::text = ${roleFilter}
          ORDER BY
            CASE WHEN "status"::text = 'PENDING' THEN 0
                 WHEN "status"::text = 'APPROVED' THEN 1
                 WHEN "status"::text = 'COMPLETED' THEN 2
                 WHEN "status"::text = 'REJECTED' THEN 3
                 ELSE 4
            END ASC,
            "createdAt" DESC
          LIMIT 200
        `
      : await prisma.$queryRaw<AdminPasswordResetRow[]>`
          SELECT
            "id",
            "userId",
            "userEmail",
            "userName",
            "userRole"::text AS "userRole",
            "portalContext",
            "status"::text AS "status",
            "reviewedById",
            "reviewedByName",
            "approvedAt",
            "rejectedAt",
            "rejectionReason",
            "expiresAt",
            "usedAt",
            "completedAt",
            "createdAt",
            "updatedAt"
          FROM "password_reset_requests"
          WHERE "tenantId" = ${tenantId}
          ORDER BY
            CASE WHEN "status"::text = 'PENDING' THEN 0
                 WHEN "status"::text = 'APPROVED' THEN 1
                 WHEN "status"::text = 'COMPLETED' THEN 2
                 WHEN "status"::text = 'REJECTED' THEN 3
                 ELSE 4
            END ASC,
            "createdAt" DESC
          LIMIT 200
        `;

    return NextResponse.json({
      success: true,
      pendingCount,
      employeePendingCount: breakdown.employeePendingCount,
      operatorPendingCount: breakdown.operatorPendingCount,
      adminPendingCount: breakdown.adminPendingCount,
      requests,
    });
  } catch (error) {
    console.error('[Admin PasswordResets GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load password reset requests.' },
      { status: 500 }
    );
  }
}
