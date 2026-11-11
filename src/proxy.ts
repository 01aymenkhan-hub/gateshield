import { NextRequest, NextResponse } from 'next/server';
import { MAX_OCR_BODY_BYTES } from '@/lib/requestValidation';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export function proxy(request: NextRequest) {
  if (safeMethods.has(request.method)) return NextResponse.next();

  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  const appOrigin = process.env.APP_BASE_URL ? URL.parse(process.env.APP_BASE_URL)?.origin : undefined;
  const trusted = origin === request.nextUrl.origin || Boolean(appOrigin && origin === appOrigin);
  if ((origin !== null && !trusted) ||
      (origin === null && (fetchSite === 'cross-site' || fetchSite === 'same-site'))) {
    return NextResponse.json({ error: 'Cross-origin request denied.' }, { status: 403 });
  }

  const pathname = request.nextUrl.pathname;
  const isScan = pathname === '/api/scan-cnic' || pathname === '/api/scan-dls';
  const mediaType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  const expectedType = isScan ? 'multipart/form-data' : 'application/json';
  if (mediaType && mediaType !== expectedType) {
    return NextResponse.json({ error: 'Unsupported request content type.' }, { status: 415 });
  }
  const smallBody = pathname.startsWith('/api/auth/') ||
    /^\/api\/(?:employee|operator)\/(?:login|register)$/.test(pathname) || pathname === '/api/settings';
  const limit = isScan ? MAX_OCR_BODY_BYTES : smallBody ? 16 * 1024 : 48 * 1024 * 1024;
  if (Number(request.headers.get('content-length')) > limit) {
    return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
  }
  return NextResponse.next();
}

export const config = { matcher: '/api/:path*' };
