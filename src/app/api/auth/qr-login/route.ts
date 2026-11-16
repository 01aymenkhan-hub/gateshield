import { isPortalNetworkAllowed, portalNetworkDenied } from '@/lib/portalNetwork';
import { z } from 'zod';
import { readJson, RequestValidationError } from '@/lib/requestValidation';
import { getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateToken, TOKEN_COOKIE_NAME, OPERATOR_STATUS_COOKIE_NAME } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import {
  cleanOperatorQrToken,
  hashOperatorQrToken,
  checkQrLoginRateLimit,
  resetQrLoginRateLimit,
} from '@/lib/operatorQr';

export async function POST(request: NextRequest) {
  try {
    // Client IP only from a trusted proxy; spoofed X-Forwarded-For no longer opens new buckets.
    // Without a proxy every client shares one bucket, so it gets a larger global budget
    // (QR tokens are 256-bit encrypted, so this limit is anti-flood, not anti-guessing).
    const ip = getClientIp(request);
    const rateLimit = checkQrLoginRateLimit(ip, ip === 'direct' ? 120 : 15);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many failed login attempts. Please wait a minute before trying again.' },
        { status: 429 }
      );
    }

    const { token: rawToken } = await readJson(request, z.object({ token: z.string().trim().min(1).max(2048) }));
    const token = cleanOperatorQrToken(rawToken);

    // Safeguard: Check if this was a visitor checkout QR
    if (token.startsWith('GKP-') || token.startsWith('VIS-')) {
      return NextResponse.json(
        { error: 'This is a visitor pass, not an operator login QR code.' },
        { status: 400 }
      );
    }

    if (!token.startsWith('GKOP_')) {
      return NextResponse.json(
        { error: 'Invalid QR code. Please scan a valid GateShield Operator Card.' },
        { status: 400 }
      );
    }

    // Compute cryptographic SHA-256 hash to find the operator
    const tokenHash = hashOperatorQrToken(token);

    const userRows = await prisma.$queryRaw<
      Array<{
        id: string;
        email: string;
        name: string;
        role: string;
        active: boolean;
        operatorNumber: string | null;
        qrLoginRevokedAt: Date | null;
        approvalStatus: string;
      }>
    >`
      SELECT
        "id",
        "email",
        "name",
        "role"::text AS "role",
        "active",
        "operatorNumber",
        "qrLoginRevokedAt",
        COALESCE("approvalStatus"::text, 'APPROVED') AS "approvalStatus"
      FROM "users"
      WHERE "qrLoginHash" = ${tokenHash}
      LIMIT 1
    `;

    if (userRows.length === 0) {
      return NextResponse.json(
        { error: 'Unrecognized operator QR code. Please contact your administrator.' },
        { status: 401 }
      );
    }

    const user = userRows[0];
    if (user.role === 'OPERATOR' && !(await isPortalNetworkAllowed(request.headers))) {
      return portalNetworkDenied();
    }

    if (user.approvalStatus !== 'APPROVED') {
      return NextResponse.json(
        { error: 'Operator account is not approved. Please contact an administrator.' },
        { status: 403 }
      );
    }

    // Check account status: deactivation invalidates login immediately
    if (!user.active) {
      return NextResponse.json(
        { error: 'Account is deactivated. Please contact an administrator.' },
        { status: 403 }
      );
    }

    // Check revocation status
    if (user.qrLoginRevokedAt) {
      return NextResponse.json(
        { error: 'This QR card has been revoked or replaced. Please request a new card.' },
        { status: 401 }
      );
    }

    // Reset rate limiter on successful authentication
    // Never let one success reset the shared bucket used when no proxy is configured.
    if (ip !== 'direct') resetQrLoginRateLimit(ip);

    const gateAccess = await prisma.userGateAccess.findMany({
      where: { userId: user.id },
      select: { gateId: true },
    });

    const gateIds = gateAccess.map((ga) => ga.gateId);

    const sessionToken = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'ADMIN' | 'OPERATOR',
      gateIds,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        operatorNumber: user.operatorNumber || `OP-${user.id.slice(-6).toUpperCase()}`,
        gateIds,
      },
    });

    // Set secure HTTP-only cookie
    response.cookies.set(TOKEN_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    response.cookies.delete(OPERATOR_STATUS_COOKIE_NAME);

    await logAudit({
      action: 'OPERATOR_QR_LOGIN',
      entityType: 'User',
      entityId: user.id,
      details: {
        name: user.name,
        operatorNumber: user.operatorNumber,
        email: user.email,
        role: user.role,
      },
      performedById: user.id,
      ipAddress: ip,
    });

    return response;
  } catch (error) {
    if (error instanceof RequestValidationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[QR Login] Error:', error);
    const msg = 'Authentication error during QR scan';
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
