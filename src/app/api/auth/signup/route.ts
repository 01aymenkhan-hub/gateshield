import { RequestValidationError } from '@/lib/requestValidation';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword, generateToken, TOKEN_COOKIE_NAME } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    // Public self-signup is only for first-run bootstrap of the very first ADMIN.
    // Afterwards, staff accounts are created by an ADMIN (/api/users) or requested
    // through /api/operator/register, which requires ADMIN approval (OWASP A01).
    if ((await prisma.user.count()) > 0) {
      return NextResponse.json(
        {
          error:
            'Public sign-up is disabled. Ask an administrator for an account or submit an operator registration request from the login page.',
          code: 'SIGNUP_DISABLED',
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? body.email : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!name || !email || !password || name.length > 120 || email.length > 254) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8 || password.length > 256) {
      return NextResponse.json(
        { error: 'Password must be between 8 and 256 characters' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const passwordHash = await hashPassword(password);

    // Re-check inside a serializable transaction so two concurrent first-run
    // requests cannot both become ADMIN.
    const newUser = await prisma.$transaction(
      async (tx) => {
        if ((await tx.user.count()) > 0) return null;
        return tx.user.create({
          data: {
            name,
            email: normalizedEmail,
            passwordHash,
            role: 'ADMIN',
            active: true,
          },
        });
      },
      { isolationLevel: 'Serializable' }
    );

    if (!newUser) {
      return NextResponse.json(
        { error: 'Public sign-up is disabled.', code: 'SIGNUP_DISABLED' },
        { status: 403 }
      );
    }

    const token = generateToken({
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role as 'ADMIN' | 'OPERATOR',
      gateIds: [],
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        gateIds: [],
      },
    });

    response.cookies.set(TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    await logAudit({
      action: 'USER_SIGNUP',
      entityType: 'User',
      entityId: newUser.id,
      details: { email: newUser.email, role: newUser.role },
      performedById: newUser.id,
    });

    return response;
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error during signup' },
      { status: 500 }
    );
  }
}
