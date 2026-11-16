import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getPortalNetworkPolicy, PORTAL_NETWORK_KEY, portalNetworkSchema, trustedPortalIp } from '@/lib/portalNetwork';
import { readJson, RequestValidationError } from '@/lib/requestValidation';

export async function GET(request: Request) {
  const admin = await getSessionUser();
  if (admin?.role !== 'ADMIN') return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });

  const clientIp = trustedPortalIp(request.headers);
  try {
    const policy = await getPortalNetworkPolicy();
    return NextResponse.json({ policy, clientIp }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to load the portal network settings.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const admin = await getSessionUser();
  if (admin?.role !== 'ADMIN') return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });

  try {
    const policy = await readJson(request, portalNetworkSchema);
    const ip = trustedPortalIp(request.headers);
    if (policy.enabled && !ip) {
      return NextResponse.json({ error: 'A trusted reverse proxy must provide the client IP before restrictions can be enabled.' }, { status: 400 });
    }

    const value = JSON.stringify(policy);
    await prisma.systemSetting.upsert({
      where: { key: PORTAL_NETWORK_KEY },
      update: { value },
      create: { key: PORTAL_NETWORK_KEY, value },
    });
    await logAudit({
      action: 'UPDATE_PORTAL_NETWORK_ACCESS',
      entityType: 'SystemSetting',
      entityId: PORTAL_NETWORK_KEY,
      details: policy,
      performedById: admin.id,
      ipAddress: ip ?? undefined,
    });
    return NextResponse.json({ policy, clientIp: ip });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Unable to save the portal network settings.' }, { status: 500 });
  }
}
