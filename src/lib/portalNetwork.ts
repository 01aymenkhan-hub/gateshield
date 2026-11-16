import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeIp } from './ipAddress';
import prisma from './prisma';

export const PORTAL_NETWORK_KEY = 'portal_network_access';

export const portalNetworkSchema = z.object({
  enabled: z.boolean(),
  addresses: z.array(z.string().max(64).transform((value, ctx) => {
    const ip = normalizeIp(value);
    if (ip) return ip;
    ctx.addIssue({ code: 'custom', message: 'Each entry must be a valid IPv4 or IPv6 address.' });
    return z.NEVER;
  })).max(100).transform(addresses => [...new Set(addresses)]),
}).strict().refine(policy => !policy.enabled || policy.addresses.length > 0, {
  message: 'Add at least one IP address before enabling restrictions.',
});

export function trustedPortalIp(headers: Pick<Headers, 'get'>) {
  // The app listener must be reachable only through the reverse proxy that overwrites this header.
  return process.env.PORTAL_TRUST_PROXY === 'true'
    ? normalizeIp(headers.get('x-real-ip') ?? '')
    : null;
}

export async function getPortalNetworkPolicy() {
  const row = await prisma.systemSetting.findUnique({
    where: { key: PORTAL_NETWORK_KEY },
    select: { value: true },
  });
  return row
    ? portalNetworkSchema.parse(JSON.parse(row.value))
    : { enabled: false, addresses: [] };
}

export async function isPortalNetworkAllowed(headers: Pick<Headers, 'get'>) {
  const policy = await getPortalNetworkPolicy();
  if (!policy.enabled) return true;
  const ip = trustedPortalIp(headers);
  return ip !== null && policy.addresses.includes(ip);
}

export function portalNetworkDenied() {
  return NextResponse.json({
    code: 'NETWORK_RESTRICTED',
    error: 'This network is not approved. Connect to an approved network or contact your administrator.',
  }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
}
