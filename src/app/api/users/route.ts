import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser, hashPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { generateQrDataUrl } from '@/lib/qrUtils';
import {
  generateOperatorQrToken,
  hashOperatorQrToken,
  encryptOperatorQrToken,
  ensureOperatorUserSchema,
  generateUniqueOperatorNumber,
} from '@/lib/operatorQr';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin role required' }, { status: 403 });
    }

    await ensureOperatorUserSchema(prisma);

    const dbUsers = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'OPERATOR'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        role: true,
        active: true,
        operatorNumber: true,
        qrLoginHash: true,
        qrLoginCreatedAt: true,
        qrLoginRevokedAt: true,
        createdAt: true,
        gateAccess: {
          include: {
            gate: {
              select: { id: true, name: true, type: true },
            },
          },
        },
      },
    });

    const users = dbUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phoneNumber,
      phoneNumber: u.phoneNumber,
      role: u.role,
      active: u.active,
      operatorNumber: u.operatorNumber || (u.role === 'OPERATOR' ? `OP-${u.id.slice(-6).toUpperCase()}` : null),
      hasActiveQr: Boolean(u.qrLoginHash && !u.qrLoginRevokedAt),
      qrLoginRevokedAt: u.qrLoginRevokedAt,
      createdAt: u.createdAt,
      gateAccess: u.gateAccess,
    }));

    return NextResponse.json({ success: true, users });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin role required' }, { status: 403 });
    }

    await ensureOperatorUserSchema(prisma);

    const body = await request.json();
    const { name, email, password, role, gateIds, phone, phoneNumber } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Full Name is required.' }, { status: 400 });
    }
    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email Address is required.' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Please enter a valid Email Address.' }, { status: 400 });
    }

    if (!password || typeof password !== 'string' || password.trim().length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long.' }, { status: 400 });
    }

    const rawPhone =
      typeof phoneNumber === 'string' && phoneNumber.trim()
        ? phoneNumber.trim()
        : typeof phone === 'string' && phone.trim()
        ? phone.trim()
        : '';
    const cleanedPhone = rawPhone ? rawPhone.replace(/[\s\-()]/g, '') : null;
    if (cleanedPhone && !/^\+?[0-9]{7,15}$/.test(cleanedPhone)) {
      return NextResponse.json(
        { error: 'Please enter a valid phone number (7 to 15 digits).' },
        { status: 400 }
      );
    }

    const existingRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "users"
      WHERE LOWER("email") = ${normalizedEmail}
      LIMIT 1
    `;
    if (existingRows.length > 0) {
      return NextResponse.json(
        { error: 'An account with this email address already exists.', code: 'DUPLICATE_EMAIL' },
        { status: 409 }
      );
    }

    const validGateIds: string[] = Array.isArray(gateIds)
      ? Array.from(
          new Set(
            gateIds
              .filter((g: unknown): g is string => typeof g === 'string' && g.trim().length > 0)
              .map((g) => g.trim())
          )
        )
      : [];

    if (validGateIds.length > 0) {
      const existingGates = await prisma.gate.findMany({
        where: { id: { in: validGateIds } },
        select: { id: true },
      });
      if (existingGates.length !== validGateIds.length) {
        return NextResponse.json(
          { error: 'Invalid gate selection. One or more selected gates do not exist.' },
          { status: 400 }
        );
      }
    }

    const passwordHash = await hashPassword(password.trim());
    const isOperator = role !== 'ADMIN';

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

    const now = new Date();
    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        phoneNumber: cleanedPhone,
        passwordHash,
        role: role === 'ADMIN' ? 'ADMIN' : 'OPERATOR',
        active: true,
        approvalStatus: 'APPROVED',
        approvedAt: now,
        approvedById: user.id,
        operatorNumber,
        qrLoginHash,
        qrLoginEncrypted,
        qrLoginCreatedAt: isOperator ? now : null,
        gateAccess: isOperator && validGateIds.length > 0
          ? {
              create: validGateIds.map((gateId: string) => ({ gateId })),
            }
          : undefined,
      },
      include: {
        gateAccess: {
          include: { gate: true },
        },
      },
    });

    await logAudit({
      action: 'CREATE_USER',
      entityType: 'User',
      entityId: newUser.id,
      details: { email: newUser.email, role: newUser.role, operatorNumber, phoneNumber: cleanedPhone },
      performedById: user.id,
    });

    let qrCard: any = null;
    if (isOperator && rawToken) {
      const qrDataUrl = await generateQrDataUrl(rawToken);
      qrCard = {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        operatorNumber: newUser.operatorNumber,
        qrDataUrl,
        createdAt: newUser.qrLoginCreatedAt,
        isRevoked: false,
        active: newUser.active,
      };
    }

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phoneNumber,
        phoneNumber: newUser.phoneNumber,
        role: newUser.role,
        active: newUser.active,
        operatorNumber: newUser.operatorNumber,
        gateAccess: newUser.gateAccess,
      },
      qrCard,
    });
  } catch (error: any) {
    console.error('Error creating user:', error);
    const errMsg = error?.message || String(error);
    if (errMsg.includes('users_email_key') || (errMsg.includes('P2002') && errMsg.includes('email'))) {
      return NextResponse.json(
        { error: 'An account with this email address already exists.', code: 'DUPLICATE_EMAIL' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'Unable to create account due to a server or database error. Please try again.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin role required' }, { status: 403 });
    }

    await ensureOperatorUserSchema(prisma);

    const body = await request.json();
    const { id, name, email, role, active, password, gateIds, phone, phoneNumber } = body;

    if (!id) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

    const updateData: any = {};
    if (name) updateData.name = name.trim();
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return NextResponse.json({ error: 'Please enter a valid Email Address.' }, { status: 400 });
      }
      const existing = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "users"
        WHERE LOWER("email") = ${normalizedEmail}
          AND "id" != ${id}
        LIMIT 1
      `;
      if (existing.length > 0) {
        return NextResponse.json(
          { error: 'An account with this email address already exists.', code: 'DUPLICATE_EMAIL' },
          { status: 409 }
        );
      }
      updateData.email = normalizedEmail;
    }
    if (phone !== undefined || phoneNumber !== undefined) {
      const rawPhone =
        typeof phoneNumber === 'string'
          ? phoneNumber.trim()
          : typeof phone === 'string'
          ? phone.trim()
          : '';
      const cleanedPhone = rawPhone ? rawPhone.replace(/[\s\-()]/g, '') : null;
      if (cleanedPhone && !/^\+?[0-9]{7,15}$/.test(cleanedPhone)) {
        return NextResponse.json(
          { error: 'Please enter a valid phone number (7 to 15 digits).' },
          { status: 400 }
        );
      }
      updateData.phoneNumber = cleanedPhone;
    }
    if (role) updateData.role = role === 'ADMIN' ? 'ADMIN' : 'OPERATOR';
    if (active !== undefined) updateData.active = Boolean(active);
    if (password && typeof password === 'string' && password.trim().length > 0) {
      if (password.trim().length < 6) {
        return NextResponse.json(
          { error: 'Password must be at least 6 characters long.' },
          { status: 400 }
        );
      }
      updateData.passwordHash = await hashPassword(password.trim());
      updateData.passwordChangedAt = new Date();
    }

    // Validate gateIds if passed for OPERATOR
    const validGateIds: string[] = Array.isArray(gateIds)
      ? Array.from(
          new Set(
            gateIds
              .filter((g: unknown): g is string => typeof g === 'string' && g.trim().length > 0)
              .map((g) => g.trim())
          )
        )
      : [];

    if (role !== 'ADMIN' && validGateIds.length > 0) {
      const existingGates = await prisma.gate.findMany({
        where: { id: { in: validGateIds } },
        select: { id: true },
      });
      if (existingGates.length !== validGateIds.length) {
        return NextResponse.json(
          { error: 'Invalid gate selection. One or more selected gates do not exist.' },
          { status: 400 }
        );
      }
    }

    // Update user
    await prisma.user.update({
      where: { id },
      data: updateData,
    });

    // Update gate access if passed
    if (role === 'ADMIN') {
      // Admins have access to all gates, so clear specific gate mappings
      await prisma.userGateAccess.deleteMany({ where: { userId: id } });
    } else if (Array.isArray(gateIds)) {
      // Delete old access
      await prisma.userGateAccess.deleteMany({ where: { userId: id } });
      // Create new access
      if (validGateIds.length > 0) {
        await prisma.userGateAccess.createMany({
          data: validGateIds.map((gateId: string) => ({ userId: id, gateId })),
          skipDuplicates: true,
        });
      }
    }

    await logAudit({
      action: 'UPDATE_USER',
      entityType: 'User',
      entityId: id,
      details: {
        name: updateData.name,
        email: updateData.email,
        phoneNumber: updateData.phoneNumber,
        role: updateData.role,
        active: updateData.active,
        passwordChanged: Boolean(updateData.passwordHash),
        gateIds: role === 'ADMIN' ? 'ALL_GATES' : validGateIds,
      },
      performedById: user.id,
    });

    return NextResponse.json({ success: true, message: 'Member updated successfully' });
  } catch (error: any) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Unable to update account due to a server or database error. Please try again.' },
      { status: 500 }
    );
  }
}
