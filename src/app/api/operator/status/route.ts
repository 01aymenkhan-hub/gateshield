import { isPortalNetworkAllowed, portalNetworkDenied } from '@/lib/portalNetwork';
import { NextResponse } from 'next/server';
import {
  getOperatorApplicantFromCookies,
  OPERATOR_STATUS_COOKIE_NAME,
} from '@/lib/auth';

export async function GET(request: Request) {
  try {
    if (!(await isPortalNetworkAllowed(request.headers))) return portalNetworkDenied();
    const applicant = await getOperatorApplicantFromCookies();
    if (!applicant) {
      return NextResponse.json({
        authenticated: false,
        approvalStatus: null,
        applicant: null,
      });
    }

    return NextResponse.json({
      authenticated: false,
      approvalStatus: applicant.approvalStatus,
      active: applicant.active,
      applicant: {
        ...applicant,
        phone: applicant.phoneNumber,
      },
    });
  } catch (error: unknown) {
    console.error('[Operator Status GET] Error:', error);
    return NextResponse.json(
      {
        authenticated: false,
        approvalStatus: null,
        applicant: null,
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(OPERATOR_STATUS_COOKIE_NAME);
  return response;
}
