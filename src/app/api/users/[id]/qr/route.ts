import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { generateQrDataUrl } from '@/lib/qrUtils';
import {
  generateOperatorQrToken,
  hashOperatorQrToken,
  encryptOperatorQrToken,
  decryptOperatorQrToken,
} from '@/lib/operatorQr';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getSessionUser();
    if (!admin || admin.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin role required' }, { status: 403 });
    }

    const { id } = await context.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        operatorNumber: true,
        qrLoginEncrypted: true,
        qrLoginCreatedAt: true,
        qrLoginRevokedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let rawToken: string | null = null;
    let operatorNumber = user.operatorNumber;

    // If operator has an active encrypted token, decrypt it
    if (user.qrLoginEncrypted && !user.qrLoginRevokedAt) {
      rawToken = decryptOperatorQrToken(user.qrLoginEncrypted);
    }

    // If no existing token or newly migrating an existing operator
    if (!rawToken && !user.qrLoginRevokedAt) {
      rawToken = generateOperatorQrToken();
      const hash = hashOperatorQrToken(rawToken);
      const encrypted = encryptOperatorQrToken(rawToken);
      if (!operatorNumber) {
        operatorNumber = `OP-${user.id.slice(-6).toUpperCase()}`;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          operatorNumber,
          qrLoginHash: hash,
          qrLoginEncrypted: encrypted,
          qrLoginCreatedAt: new Date(),
          qrLoginRevokedAt: null,
        },
      });
    }

    const qrDataUrl = rawToken ? await generateQrDataUrl(rawToken) : null;

    return NextResponse.json({
      success: true,
      card: {
        id: user.id,
        name: user.name,
        email: user.email,
        operatorNumber: operatorNumber || `OP-${user.id.slice(-6).toUpperCase()}`,
        qrDataUrl,
        createdAt: user.qrLoginCreatedAt,
        isRevoked: Boolean(user.qrLoginRevokedAt),
        active: user.active,
      },
    });
  } catch (error: unknown) {
    console.error('[Operator QR GET] Error:', error);
    const msg = 'Failed to retrieve operator QR card';
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getSessionUser();
    if (!admin || admin.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin role required' }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const action = body?.action; // 'regenerate' | 'revoke'

    const targetUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (action === 'regenerate') {
      const rawToken = generateOperatorQrToken();
      const hash = hashOperatorQrToken(rawToken);
      const encrypted = encryptOperatorQrToken(rawToken);
      const operatorNumber = targetUser.operatorNumber || `OP-${targetUser.id.slice(-6).toUpperCase()}`;

      const updated = await prisma.user.update({
        where: { id },
        data: {
          operatorNumber,
          qrLoginHash: hash,
          qrLoginEncrypted: encrypted,
          qrLoginCreatedAt: new Date(),
          qrLoginRevokedAt: null,
        },
      });

      const qrDataUrl = await generateQrDataUrl(rawToken);

      await logAudit({
        action: 'REGENERATE_OPERATOR_QR',
        entityType: 'User',
        entityId: id,
        details: { operatorNumber, name: updated.name },
        performedById: admin.id,
      });

      return NextResponse.json({
        success: true,
        message: 'Operator QR card regenerated successfully',
        card: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          operatorNumber,
          qrDataUrl,
          createdAt: updated.qrLoginCreatedAt,
          isRevoked: false,
          active: updated.active,
        },
      });
    }

    if (action === 'revoke') {
      await prisma.user.update({
        where: { id },
        data: {
          qrLoginHash: null,
          qrLoginEncrypted: null,
          qrLoginRevokedAt: new Date(),
        },
      });

      await logAudit({
        action: 'REVOKE_OPERATOR_QR',
        entityType: 'User',
        entityId: id,
        details: { name: targetUser.name, operatorNumber: targetUser.operatorNumber },
        performedById: admin.id,
      });

      return NextResponse.json({
        success: true,
        message: 'Operator QR credential revoked successfully',
      });
    }

    return NextResponse.json({ error: 'Invalid action. Use regenerate or revoke.' }, { status: 400 });
  } catch (error: unknown) {
    console.error('[Operator QR POST] Error:', error);
    const msg = 'Failed to update operator QR status';
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
