import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, getEmployeeSessionUser } from '@/lib/auth';
import { readStoredFileBuffer, resolveSafeStoragePath } from '@/lib/fileStorage';

const STAFF_ONLY_PREFIXES = ['cnic/', 'dls/', 'delivery/incoming/', 'delivery/outgoing/'];

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key } = await context.params;
    if (!Array.isArray(key) || key.length < 2) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    const joinedKey = key.join('/');
    let normalizedKey: string;
    try {
      const resolved = resolveSafeStoragePath(joinedKey);
      normalizedKey = resolved.normalizedKey;
    } catch {
      return NextResponse.json({ error: 'Invalid or unauthorized file path' }, { status: 400 });
    }

    const isStaffOnly = STAFF_ONLY_PREFIXES.some((prefix) =>
      normalizedKey.startsWith(prefix)
    );

    const staffUser = await getSessionUser();
    if (isStaffOnly) {
      if (!staffUser || (staffUser.role !== 'ADMIN' && staffUser.role !== 'OPERATOR')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else {
      if (!staffUser) {
        const empUser = await getEmployeeSessionUser();
        if (!empUser) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
      }
    }

    const fileData = await readStoredFileBuffer(normalizedKey);
    if (!fileData) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(fileData.buffer), {
      status: 200,
      headers: {
        'Content-Type': fileData.mime,
        'Content-Length': String(fileData.size),
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[FilesRoute] Error serving file:', err);
    return NextResponse.json({ error: 'Unable to load file' }, { status: 500 });
  }
}
