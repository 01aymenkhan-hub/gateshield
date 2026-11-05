import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { getSessionUser, getEmployeeSessionUser, hashPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createAppNotification } from '@/lib/notifications';
import { generateQrDataUrl } from '@/lib/qrUtils';
import {
  generateOperatorQrToken,
  hashOperatorQrToken,
  encryptOperatorQrToken,
} from '@/lib/operatorQr';

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
          { error: 'Forbidden: Employees cannot manage operators.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Only administrators can manage operators.' },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await request.json();
    const action = typeof body.action === 'string' ? body.action.toUpperCase() : 'UPDATE';

    const targetRows = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        email: string;
        role: string;
        active: boolean;
        approvalStatus: string;
        phoneNumber: string | null;
        position: string | null;
        operatorNumber: string | null;
        qrLoginHash: string | null;
      }>
    >`
      SELECT
        "id",
        "name",
        "email",
        "role"::text AS "role",
        "active",
        COALESCE("approvalStatus"::text, 'APPROVED') AS "approvalStatus",
        "phoneNumber",
        "position",
        "operatorNumber",
        "qrLoginHash"
      FROM "users"
      WHERE "id" = ${id}
        AND "role"::text IN ('ADMIN', 'OPERATOR')
      LIMIT 1
    `;

    if (targetRows.length === 0) {
      return NextResponse.json(
        { error: 'Operator account not found.' },
        { status: 404 }
      );
    }

    const target = targetRows[0];
    const now = new Date();

    if (action === 'APPROVE') {
      const gateIds: string[] = Array.isArray(body.gateIds)
        ? body.gateIds.filter((g: unknown): g is string => typeof g === 'string' && g.trim().length > 0)
        : [];

      let operatorNumber = target.operatorNumber;
      let qrLoginHash = target.qrLoginHash;
      let rawToken: string | null = null;

      if (!operatorNumber) {
        const opCount = await prisma.user.count({ where: { role: 'OPERATOR' } });
        operatorNumber = `OP-${String(1001 + opCount).padStart(4, '0')}`;
      }

      if (!qrLoginHash) {
        rawToken = generateOperatorQrToken();
        qrLoginHash = hashOperatorQrToken(rawToken);
        const qrLoginEncrypted = encryptOperatorQrToken(rawToken);

        await prisma.$executeRaw`
          UPDATE "users"
          SET
            "approvalStatus" = 'APPROVED'::"EmployeeApprovalStatus",
            "active" = true,
            "operatorNumber" = ${operatorNumber},
            "qrLoginHash" = ${qrLoginHash},
            "qrLoginEncrypted" = ${qrLoginEncrypted},
            "qrLoginCreatedAt" = ${now},
            "qrLoginRevokedAt" = NULL,
            "approvedAt" = ${now},
            "approvedById" = ${user.id},
            "rejectedAt" = NULL,
            "rejectionReason" = NULL,
            "updatedAt" = ${now}
          WHERE "id" = ${id}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE "users"
          SET
            "approvalStatus" = 'APPROVED'::"EmployeeApprovalStatus",
            "active" = true,
            "operatorNumber" = ${operatorNumber},
            "approvedAt" = ${now},
            "approvedById" = ${user.id},
            "rejectedAt" = NULL,
            "rejectionReason" = NULL,
            "updatedAt" = ${now}
          WHERE "id" = ${id}
        `;
      }

      // Update gate assignments if supplied
      if (Array.isArray(body.gateIds)) {
        await prisma.userGateAccess.deleteMany({ where: { userId: id } });
        if (gateIds.length > 0) {
          await prisma.userGateAccess.createMany({
            data: gateIds.map((gateId) => ({ userId: id, gateId })),
            skipDuplicates: true,
          });
        }
      }

      const assignedGates = await prisma.userGateAccess.findMany({
        where: { userId: id },
        include: { gate: { select: { id: true, name: true, type: true } } },
      });

      const gateNames =
        assignedGates.length > 0
          ? assignedGates.map((g) => g.gate.name).join(', ')
          : 'All Authorized Gates';

      await createAppNotification({
        recipientUserId: id,
        recipientRole: 'OPERATOR',
        type: 'OPERATOR_APPROVED',
        title: 'Operator Registration Approved',
        message: `Welcome ${target.name}! Your operator account (${operatorNumber}) is now active for: ${gateNames}.`,
        operatorUserId: id,
        targetUrl: '/dashboard',
        dedupeKey: `op_approved_${id}_${now.getTime()}`,
      });

      await logAudit({
        action: 'APPROVE_OPERATOR_REQUEST',
        entityType: 'User',
        entityId: id,
        details: {
          name: target.name,
          email: target.email,
          operatorNumber,
          gateIds,
        },
        performedById: user.id,
      });

      let qrCard = null;
      if (rawToken) {
        const qrDataUrl = await generateQrDataUrl(rawToken);
        qrCard = {
          id,
          name: target.name,
          email: target.email,
          operatorNumber,
          qrDataUrl,
          createdAt: now,
          isRevoked: false,
          active: true,
        };
      }

      return NextResponse.json({
        success: true,
        message: `Operator request for ${target.name} has been approved and activated.`,
        operatorNumber,
        qrCard,
      });
    }

    if (action === 'REJECT') {
      const rejectionReason =
        typeof body.rejectionReason === 'string' && body.rejectionReason.trim()
          ? body.rejectionReason.trim()
          : 'Not approved by administrator.';

      await prisma.$executeRaw`
        UPDATE "users"
        SET
          "approvalStatus" = 'REJECTED'::"EmployeeApprovalStatus",
          "active" = false,
          "rejectedAt" = ${now},
          "rejectionReason" = ${rejectionReason},
          "updatedAt" = ${now}
        WHERE "id" = ${id}
      `;

      await createAppNotification({
        recipientUserId: id,
        recipientRole: 'OPERATOR',
        type: 'OPERATOR_REJECTED',
        title: 'Operator Registration Not Approved',
        message: `Your operator registration request was not approved: ${rejectionReason}`,
        operatorUserId: id,
        dedupeKey: `op_rejected_${id}_${now.getTime()}`,
      });

      await logAudit({
        action: 'REJECT_OPERATOR_REQUEST',
        entityType: 'User',
        entityId: id,
        details: {
          name: target.name,
          email: target.email,
          rejectionReason,
        },
        performedById: user.id,
      });

      return NextResponse.json({
        success: true,
        message: `Operator request for ${target.name} has been rejected.`,
      });
    }

    if (action === 'RESET_PASSWORD') {
      const autoGenerate = Boolean(body.autoGeneratePassword);
      let newPassword =
        typeof body.password === 'string' ? body.password.trim() : '';

      if (autoGenerate || !newPassword) {
        newPassword = `GS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      }

      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: 'Password must be at least 6 characters long.' },
          { status: 400 }
        );
      }

      const passwordHash = await hashPassword(newPassword);

      await prisma.$executeRaw`
        UPDATE "users"
        SET
          "passwordHash" = ${passwordHash},
          "passwordChangedAt" = ${now},
          "updatedAt" = ${now}
        WHERE "id" = ${id}
      `;

      await logAudit({
        action: 'RESET_OPERATOR_PASSWORD',
        entityType: 'User',
        entityId: id,
        details: {
          name: target.name,
          email: target.email,
        },
        performedById: user.id,
      });

      return NextResponse.json({
        success: true,
        message: `Password reset successfully for ${target.name}.`,
        oneTimeCredentials: {
          name: target.name,
          email: target.email,
          temporaryPassword: newPassword,
          operatorNumber: target.operatorNumber,
          role: target.role,
        },
      });
    }

    if (action === 'TOGGLE_ACTIVE') {
      const nextActive =
        typeof body.active === 'boolean' ? body.active : !target.active;

      await prisma.$executeRaw`
        UPDATE "users"
        SET
          "active" = ${nextActive},
          "updatedAt" = ${now}
        WHERE "id" = ${id}
      `;

      await logAudit({
        action: nextActive ? 'ACTIVATE_OPERATOR' : 'DEACTIVATE_OPERATOR',
        entityType: 'User',
        entityId: id,
        details: {
          name: target.name,
          email: target.email,
          active: nextActive,
        },
        performedById: user.id,
      });

      return NextResponse.json({
        success: true,
        message: `Operator ${target.name} ${nextActive ? 'activated' : 'deactivated'}.`,
        active: nextActive,
      });
    }

    // Default UPDATE action (edit details, gates, role, active, optional password)
    const nextName =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : target.name;
    const nextEmail =
      typeof body.email === 'string' && body.email.trim()
        ? body.email.trim().toLowerCase()
        : target.email;
    const nextPhone =
      typeof body.phoneNumber === 'string'
        ? body.phoneNumber.trim() || null
        : target.phoneNumber;
    const nextPosition =
      typeof body.position === 'string'
        ? body.position.trim() || null
        : target.position;
    const nextRole =
      body.role === 'ADMIN'
        ? 'ADMIN'
        : body.role === 'OPERATOR'
        ? 'OPERATOR'
        : target.role;
    const nextActive =
      typeof body.active === 'boolean' ? body.active : target.active;

    if (nextEmail !== target.email) {
      const dup = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "users"
        WHERE LOWER("email") = ${nextEmail}
          AND "id" != ${id}
        LIMIT 1
      `;
      if (dup.length > 0) {
        return NextResponse.json(
          { error: 'Another user with this email already exists.' },
          { status: 409 }
        );
      }
    }

    if (typeof body.password === 'string' && body.password.trim().length >= 6) {
      const passwordHash = await hashPassword(body.password.trim());
      await prisma.$executeRaw`
        UPDATE "users"
        SET
          "name" = ${nextName},
          "email" = ${nextEmail},
          "phoneNumber" = ${nextPhone},
          "position" = ${nextPosition},
          "role" = ${nextRole}::"Role",
          "active" = ${nextActive},
          "passwordHash" = ${passwordHash},
          "passwordChangedAt" = ${now},
          "updatedAt" = ${now}
        WHERE "id" = ${id}
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE "users"
        SET
          "name" = ${nextName},
          "email" = ${nextEmail},
          "phoneNumber" = ${nextPhone},
          "position" = ${nextPosition},
          "role" = ${nextRole}::"Role",
          "active" = ${nextActive},
          "updatedAt" = ${now}
        WHERE "id" = ${id}
      `;
    }

    if (nextRole === 'ADMIN') {
      await prisma.userGateAccess.deleteMany({ where: { userId: id } });
    } else if (Array.isArray(body.gateIds)) {
      await prisma.userGateAccess.deleteMany({ where: { userId: id } });
      const gateIds: string[] = body.gateIds.filter(
        (g: unknown): g is string => typeof g === 'string' && g.trim().length > 0
      );
      if (gateIds.length > 0) {
        await prisma.userGateAccess.createMany({
          data: gateIds.map((gateId: string) => ({ userId: id, gateId })),
          skipDuplicates: true,
        });
      }
    }

    await logAudit({
      action: 'UPDATE_OPERATOR',
      entityType: 'User',
      entityId: id,
      details: {
        name: nextName,
        email: nextEmail,
        role: nextRole,
        active: nextActive,
      },
      performedById: user.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Operator updated successfully.',
    });
  } catch (error: unknown) {
    console.error('[Admin Operators PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update operator.' },
      { status: 500 }
    );
  }
}
