import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, getEmployeeSessionUser } from '@/lib/auth';
import { readStoredFileBuffer, resolveSafeStoragePath } from '@/lib/fileStorage';
import prisma from '@/lib/prisma';
import { visitAccessWhere } from '@/lib/gateAccess';
import type { AuthUser, EmployeeAuthUser } from '@/lib/auth';

const STAFF_ONLY_PREFIXES = ['cnic/', 'dls/', 'delivery/incoming/', 'delivery/outgoing/'];

async function mayReadFile(key: string, staff: AuthUser | null, employee: EmployeeAuthUser | null) {
  const references = [key, '/api/files/' + key, 'uploads/' + key, '/uploads/' + key];
  const ref = { in: references };
  if (key.startsWith('profiles/') || key.startsWith('cnic/') || key.startsWith('dls/')) {
    if (!staff) return false;
    const ownerField = key.startsWith('profiles/') ? 'photoUrl' : key.startsWith('cnic/') ? 'cnicImagePath' : 'dlsImagePath';
    return Boolean(await prisma.person.findFirst({
      where: { [ownerField]: ref, ...(staff.role === 'OPERATOR' ? { visits: { some: visitAccessWhere(staff) } } : {}) },
      select: { id: true },
    }));
  }
  if (key.startsWith('delivery/')) {
    if (!staff) return false;
    const incoming = key.startsWith('delivery/incoming/');
    const ownerField = incoming ? 'incomingDocPath' : 'outgoingDocPath';
    const linked = await prisma.visit.findFirst({ where: { [ownerField]: ref }, select: { id: true } });
    if (linked) return Boolean(await prisma.visit.findFirst({
      where: { [ownerField]: ref, ...visitAccessWhere(staff) }, select: { id: true },
    }));
    return incoming && Boolean(await prisma.person.findFirst({
      where: {
        deliveryDocImagePath: ref,
        ...(staff.role === 'OPERATOR' ? { visits: { some: visitAccessWhere(staff), every: visitAccessWhere(staff) } } : {}),
      },
      select: { id: true },
    }));
  }
  if (key.startsWith('parcels/')) return Boolean(await prisma.parcel.findFirst({
    where: { photoUrl: ref, ...(!staff ? { employeeId: employee?.id } : {}) }, select: { id: true },
  }));
  if (key.startsWith('invitations/')) return Boolean(await prisma.guestInvitation.findFirst({
    where: { guestPhotoUrl: ref, ...(!staff ? { employeeId: employee?.id } : {}) }, select: { id: true },
  }));
  return Boolean(staff && key.startsWith('vip/') && await prisma.vipGuest.findFirst({
    where: { photoUrl: ref }, select: { id: true },
  }));
}

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
    const employee = !staffUser && !isStaffOnly ? await getEmployeeSessionUser() : null;
    if (isStaffOnly) {
      if (!staffUser || (staffUser.role !== 'ADMIN' && staffUser.role !== 'OPERATOR')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else {
      if (!staffUser) {
        if (!employee) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
      }
    }

    if (!(await mayReadFile(normalizedKey, staffUser, employee))) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
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
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[FilesRoute] Error serving file:', err);
    return NextResponse.json({ error: 'Unable to load file' }, { status: 500 });
  }
}
