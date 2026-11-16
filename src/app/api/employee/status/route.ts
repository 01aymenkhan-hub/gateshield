import { isPortalNetworkAllowed, portalNetworkDenied } from '@/lib/portalNetwork';
import { NextResponse } from 'next/server';
import {
  getEmployeePortalAccountFromCookies,
  generateEmployeeToken,
  EMPLOYEE_TOKEN_COOKIE_NAME,
} from '@/lib/auth';

export async function GET(request: Request) {
  try {
    if (!(await isPortalNetworkAllowed(request.headers))) return portalNetworkDenied();
    const account = await getEmployeePortalAccountFromCookies();
    if (!account) {
      return NextResponse.json({
        authenticated: false,
        approvalStatus: null,
        employee: null,
        applicant: null,
      });
    }

    if (account.approvalStatus === 'APPROVED' && account.active) {
      const sessionToken = generateEmployeeToken({
        id: account.id,
        email: account.email,
        name: account.name,
        purpose: 'EMPLOYEE_SESSION',
      });

      const res = NextResponse.json({
        authenticated: true,
        approvalStatus: 'APPROVED',
        employee: account,
        applicant: account,
      });

      // Upgrade/refresh session cookie automatically if applicant was waiting on PENDING screen and got approved
      res.cookies.set(EMPLOYEE_TOKEN_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
      return res;
    }

    const res = NextResponse.json({
      authenticated: false,
      approvalStatus: account.approvalStatus,
      active: account.active,
      employee: null,
      applicant: account,
    });

    res.cookies.delete(EMPLOYEE_TOKEN_COOKIE_NAME);
    return res;
  } catch (error: unknown) {
    console.error('Error checking employee status:', error);
    return NextResponse.json(
      {
        authenticated: false,
        approvalStatus: null,
        employee: null,
        applicant: null,
      },
      { status: 500 }
    );
  }
}
