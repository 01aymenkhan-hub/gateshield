import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export async function proxyOcr(request: NextRequest, document: 'cnic' | 'dls') {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Please sign in to scan identity documents.' }, { status: 401 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid image upload.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || typeof file === 'string' || file.size === 0) {
    return NextResponse.json({ success: false, error: 'Please upload an image file.' }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ success: false, error: 'Image must be smaller than 15 MB.' }, { status: 413 });
  }
  const body = new FormData();
  body.append('file', file);
  try {
    const upstream = await fetch(`${process.env.FASTAPI_URL || 'http://127.0.0.1:8000'}/scan-${document}`, {
      method: 'POST', body, signal: AbortSignal.timeout(90_000),
    });
    const result = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return NextResponse.json({ success: false, error: typeof result?.detail === 'string' ? result.detail : 'Unable to read the card. Please try again.' }, {
        status: upstream.status,
        ...(upstream.status === 503 ? { headers: { 'Retry-After': upstream.headers.get('Retry-After') || '2' } } : {}),
      });
    }
    if (!result || typeof result.success !== 'boolean') {
      return NextResponse.json({ success: false, error: 'Invalid response from the scanning service.' }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    return NextResponse.json({ success: false, error: timeout ? 'The scan timed out. Please try again.' : 'The scanning service is unavailable. Please try again shortly.' }, { status: timeout ? 504 : 503 });
  }
}
