import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { getSessionUser, getEmployeeSessionUser, hashPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { generateQrDataUrl } from '@/lib/qrUtils';
import {
  generateOperatorQrToken,
  hashOperatorQrToken,
  encryptOperatorQrToken,
  ensureOperatorUserSchema,
  generateUniqueOperatorNumber,
} from '@/lib/operatorQr';
import {
  ensurePasswordResetSchema,
  expireStalePasswordResetRequests,
  getTenantId,
  PasswordResetStatusType,
} from '@/lib/passwordReset';

export interface AdminOperatorRow {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR';
  active: boolean;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  phoneNumber: string | null;
  position: string | null;
  operatorNumber: string | null;
  qrLoginHash: string | null;
  qrLoginCreatedAt: Date | null;
  qrLoginRevokedAt: Date | null;
  approvedAt: Date | null;
  approvedById: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
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

    const { searchParams } = new URL(request.url);
    const summaryOnly = searchParams.get('summaryOnly') === 'true';

    await ensureOperatorUserSchema(prisma);
    await ensurePasswordResetSchema();
    await expireStalePasswordResetRequests();
    const tenantId = getTenantId();

    const [regCountRows, pwdCountRows] = await Promise.all([
      prisma.$queryRaw<Array<{ pendingCount: number }>>`
        SELECT COUNT(*)::int AS "pendingCount"
        FROM "users"
        WHERE "role"::text = 'OPERATOR'
          AND COALESCE("approvalStatus"::text, 'APPROVED') = 'PENDING'
      `,
      prisma.$queryRaw<Array<{ pendingCount: number }>>`
        SELECT COUNT(*)::int AS "pendingCount"
        FROM "password_reset_requests"
        WHERE "tenantId" = ${tenantId}
          AND "userRole"::text = 'OPERATOR'
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

    const [allOperatorRows, passwordResetRequests] = await Promise.all([
      prisma.$queryRaw<AdminOperatorRow[]>`
        SELECT
          u."id",
          u."name",
          u."email",
          u."role"::text AS "role",
          u."active",
          COALESCE(u."approvalStatus"::text, 'APPROVED') AS "approvalStatus",
          u."phoneNumber",
          u."position",
          u."operatorNumber",
          u."qrLoginHash",
          u."qrLoginCreatedAt",
          u."qrLoginRevokedAt",
          u."approvedAt",
          u."approvedById",
          u."rejectedAt",
          u."rejectionReason",
          u."createdAt",
          u."updatedAt"
        FROM "users" u
        WHERE u."role"::text IN ('ADMIN', 'OPERATOR')
        ORDER BY
          CASE WHEN COALESCE(u."approvalStatus"::text, 'APPROVED') = 'PENDING' THEN 0
               WHEN COALESCE(u."approvalStatus"::text, 'APPROVED') = 'REJECTED' THEN 1
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
          userRole: 'OPERATOR';
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
          phoneNumber: string | null;
          operatorNumber: string | null;
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
          u."phoneNumber",
          u."operatorNumber"
        FROM "password_reset_requests" prr
        LEFT JOIN "users" u ON u."id" = prr."userId"
        WHERE prr."tenantId" = ${tenantId}
          AND prr."userRole"::text = 'OPERATOR'
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

    // Fetch gate assignments for all these users
    const allGateAccess = await prisma.userGateAccess.findMany({
      include: {
        gate: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    const gateMap = new Map<
      string,
      Array<{ id: string; gateId: string; gate: { id: string; name: string; type: string } }>
    >();
    for (const ga of allGateAccess) {
      const list = gateMap.get(ga.userId) || [];
      list.push({
        id: ga.id,
        gateId: ga.gateId,
        gate: ga.gate,
      });
      gateMap.set(ga.userId, list);
    }

    const enrichedRows = allOperatorRows.map((u) => ({
      ...u,
      operatorNumber:
        u.operatorNumber ||
        (u.role === 'OPERATOR' ? `OP-${u.id.slice(-6).toUpperCase()}` : null),
      hasActiveQr: Boolean(u.qrLoginHash && !u.qrLoginRevokedAt),
      gateAccess: gateMap.get(u.id) || [],
    }));

    const operators = enrichedRows.filter((row) => row.approvalStatus === 'APPROVED');
    const requests = enrichedRows.filter((row) => row.role === 'OPERATOR');

    const enrichedPasswordResetRequests = passwordResetRequests.map((prr) => ({
      ...prr,
      operatorNumber:
        prr.operatorNumber || `OP-${prr.userId.slice(-6).toUpperCase()}`,
    }));

    return NextResponse.json({
      success: true,
      pendingCount,
      pendingRegistrationCount,
      pendingPasswordResetCount,
      operators,
      requests,
      passwordResetRequests: enrichedPasswordResetRequests,
    });
  } catch (error: unknown) {
    console.error('[Admin Operators GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load operator records.' },
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
          { error: 'Forbidden: Employees cannot create operator accounts.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Only administrators can create operator accounts.' },
        { status: 403 }
      );
    }

    await ensureOperatorUserSchema(prisma);

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request payload. Please check the entered fields.' },
        { status: 400 }
      );
    }

    const rawName =
      typeof body.fullName === 'string' && body.fullName.trim()
        ? body.fullName.trim()
        : typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : '';
    const fullName = rawName.replace(/\s+/g, ' ');
    const rawEmail =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const rawPhone =
      typeof body.phoneNumber === 'string' && body.phoneNumber.trim()
        ? body.phoneNumber.trim()
        : typeof body.phone === 'string' && body.phone.trim()
        ? body.phone.trim()
        : '';
    const position =
      typeof body.position === 'string' && body.position.trim()
        ? body.position.trim().replace(/\s+/g, ' ')
        : body.role === 'ADMIN'
        ? 'Administrator'
        : 'Gate Operator';

    if (
      body.role !== undefined &&
      body.role !== 'OPERATOR' &&
      body.role !== 'ADMIN'
    ) {
      return NextResponse.json(
        { error: 'Invalid role selected. Role must be Operator or Administrator.' },
        { status: 400 }
      );
    }

    const role: 'ADMIN' | 'OPERATOR' = body.role === 'ADMIN' ? 'ADMIN' : 'OPERATOR';
    const gateIds: string[] = Array.isArray(body.gateIds)
      ? Array.from(
          new Set(
            body.gateIds.filter(
              (g: unknown): g is string => typeof g === 'string' && g.trim().length > 0
            ).map((g) => g.trim())
          )
        )
      : [];

    if (!fullName) {
      return NextResponse.json(
        { error: 'Full Name is required.' },
        { status: 400 }
      );
    }

    if (!rawEmail) {
      return NextResponse.json(
        { error: 'Email Address is required.' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid Email Address.' },
        { status: 400 }
      );
    }

    // Support either Admin-entered password or auto-generated temporary password
    const autoGeneratePassword = Boolean(body.autoGeneratePassword);
    const enteredPassword =
      typeof body.password === 'string' ? body.password.trim() : '';

    if (!autoGeneratePassword && enteredPassword.length > 0 && enteredPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    const plainPassword =
      autoGeneratePassword || !enteredPassword
        ? `GS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
        : enteredPassword;

    const cleanedPhone = rawPhone ? rawPhone.replace(/[\s\-()]/g, '') : null;
    if (cleanedPhone && !/^\+?[0-9]{7,15}$/.test(cleanedPhone)) {
      return NextResponse.json(
        { error: 'Please enter a valid phone number (7 to 15 digits).' },
        { status: 400 }
      );
    }

    // Validate gateIds against existing gates before creating the user
    if (gateIds.length > 0) {
      const existingGates = await prisma.gate.findMany({
        where: { id: { in: gateIds } },
        select: { id: true },
      });
      if (existingGates.length !== gateIds.length) {
        return NextResponse.json(
          { error: 'Invalid gate selection. One or more selected gates do not exist.' },
          { status: 400 }
        );
      }
    }

    // Check duplicate email
    const existingUsers = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
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

    const passwordHash = await hashPassword(plainPassword);
    const isOperator = role === 'OPERATOR';

    let operatorNumber: string | null = null;
    let qrLoginHash: string | null = null;
    let qrLoginEncrypted: string | null = null;
    let rawToken: string | null = null;

    if (isOperator) {
      operatorNumber = await generateUniqueOperatorNumber(prisma);
      rawToken = generateOperatorQrToken();
      qrLoginHash = hashOperatorQrToken(rawToken);
      qrLoginEncrypted = encryptOperatorQrToken(rawToken);
    }

    const newId = `opr_${crypto.randomBytes(12).toString('hex')}`;
    const now = new Date();

    // Create user and gate assignments atomically in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
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
          "operatorNumber",
          "qrLoginHash",
          "qrLoginEncrypted",
          "qrLoginCreatedAt",
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
          ${role}::"Role",
          true,
          'APPROVED'::"EmployeeApprovalStatus",
          ${position},
          ${cleanedPhone},
          ${operatorNumber},
          ${qrLoginHash},
          ${qrLoginEncrypted},
          ${isOperator ? now : null},
          ${now},
          ${user.id},
          ${now},
          ${now}
        )
      `;

      if (isOperator && gateIds.length > 0) {
        await tx.userGateAccess.createMany({
          data: gateIds.map((gateId) => ({ userId: newId, gateId })),
          skipDuplicates: true,
        });
      }
    });

    const assignedGateRows = await prisma.userGateAccess.findMany({
      where: { userId: newId },
      include: {
        gate: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    await logAudit({
      action: 'CREATE_OPERATOR_BY_ADMIN',
      entityType: 'User',
      entityId: newId,
      details: {
        name: fullName,
        email: rawEmail,
        role,
        operatorNumber,
        phoneNumber: cleanedPhone,
        gateIds,
        approvalStatus: 'APPROVED',
        active: true,
      },
      performedById: user.id,
    });

    let qrCard = null;
    if (isOperator && rawToken) {
      const qrDataUrl = await generateQrDataUrl(rawToken);
      qrCard = {
        id: newId,
        name: fullName,
        email: rawEmail,
        operatorNumber,
        qrDataUrl,
        createdAt: now,
        isRevoked: false,
        active: true,
      };
    }

    const credentialPayload = {
      name: fullName,
      email: rawEmail,
      phone: cleanedPhone,
      phoneNumber: cleanedPhone,
      temporaryPassword: plainPassword,
      operatorNumber,
      role,
      assignedGates: assignedGateRows.map((ga) => ga.gate.name),
    };

    return NextResponse.json(
      {
        success: true,
        message: `${role === 'ADMIN' ? 'Administrator' : 'Operator'} account created and activated for ${fullName}.`,
        operator: {
          id: newId,
          name: fullName,
          email: rawEmail,
          role,
          active: true,
          approvalStatus: 'APPROVED',
          phone: cleanedPhone,
          phoneNumber: cleanedPhone,
          position,
          operatorNumber,
          hasActiveQr: Boolean(qrLoginHash),
          gateAccess: assignedGateRows,
          createdAt: now,
        },
        qrCard,
        // Returned ONCE in the creation response for explicit Admin copying/sharing; never stored in plaintext
        credentials: credentialPayload,
        oneTimeCredentials: credentialPayload,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('[Admin Operators POST] Error:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    if (
      errMsg.includes('users_email_key') ||
      (errMsg.includes('23505') && errMsg.toLowerCase().includes('email')) ||
      (errMsg.includes('P2002') && errMsg.toLowerCase().includes('email'))
    ) {
      return NextResponse.json(
        {
          error: 'An account with this email address already exists.',
          code: 'DUPLICATE_EMAIL',
        },
        { status: 409 }
      );
    }
    if (errMsg.includes('23503') || errMsg.includes('P2003')) {
      return NextResponse.json(
        { error: 'Invalid gate selection. One or more selected gates do not exist.' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Unable to create account due to a server or database error. Please try again.' },
      { status: 500 }
    );
  }
}
