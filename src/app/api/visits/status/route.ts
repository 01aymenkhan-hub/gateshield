import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { normalizeSearchValue, getCnicHyphenatedVariants } from '@/lib/searchUtils';
import {
  sanitizePersonForClient,
  getPersonImageFlagsMap,
  sanitizeVisitsWithDbFlags,
  ensureDeliveryDocColumns,
} from '@/lib/personSanitizer';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const mode = searchParams.get('mode'); // e.g. 'checkout'

    if (!q) {
      return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
    }

    const rawQ = q;
    const normQ = normalizeSearchValue(rawQ);
    const digitsOnly = rawQ.replace(/\D/g, '');
    const cnicVariants = getCnicHyphenatedVariants(digitsOnly);

    await ensureDeliveryDocColumns();

    let personIds: string[] = [];
    let visitRows: Array<{
      id: string;
      personId: string;
      visitorCardNo: string | null;
      vehicleNo?: string | null;
      visitNumber: string;
    }> = [];

    try {
      // 1. PostgreSQL query with regex replacement to ignore hyphens, spaces, and punctuation
      const personResults = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "persons"
        WHERE 
          REGEXP_REPLACE(COALESCE("cnicNumber", ''), '[^a-zA-Z0-9]', '', 'g') ILIKE ${'%' + normQ + '%'}
          OR REGEXP_REPLACE(COALESCE("dlsNumber", ''), '[^a-zA-Z0-9]', '', 'g') ILIKE ${'%' + normQ + '%'}
          OR REGEXP_REPLACE(COALESCE("phoneNumber", ''), '[^a-zA-Z0-9]', '', 'g') ILIKE ${'%' + normQ + '%'}
          OR "fullName" ILIKE ${'%' + rawQ + '%'}
          OR COALESCE("company", '') ILIKE ${'%' + rawQ + '%'}
        LIMIT 20
      `;
      personIds = personResults.map((r) => r.id);

      const visitResults = await prisma.$queryRaw<
        Array<{
          id: string;
          personId: string;
          visitorCardNo: string | null;
          vehicleNo: string | null;
          visitNumber: string;
        }>
      >`
        SELECT id, "personId", "visitorCardNo", "vehicleNo", "visitNumber" FROM "visits"
        WHERE 
          REGEXP_REPLACE(COALESCE("visitorCardNo", ''), '[^a-zA-Z0-9]', '', 'g') ILIKE ${'%' + normQ + '%'}
          OR REGEXP_REPLACE(COALESCE("vehicleNo", ''), '[^a-zA-Z0-9]', '', 'g') ILIKE ${'%' + normQ + '%'}
          OR COALESCE("vehicleNoNormalized", '') ILIKE ${'%' + normQ + '%'}
          OR REGEXP_REPLACE(COALESCE("passCode", ''), '[^a-zA-Z0-9]', '', 'g') ILIKE ${'%' + normQ + '%'}
          OR REGEXP_REPLACE(COALESCE("visitNumber", ''), '[^a-zA-Z0-9]', '', 'g') ILIKE ${'%' + normQ + '%'}
          OR "hostName" ILIKE ${'%' + rawQ + '%'}
        ORDER BY CASE WHEN "status"::text = 'CHECKED_IN' THEN 0 ELSE 1 END ASC, "checkInTime" DESC
        LIMIT 25
      `;
      visitRows = visitResults;
    } catch (rawError) {
      console.warn('Raw query failed, falling back to standard Prisma query:', rawError);
      // Fallback using Prisma OR conditions
      const fallbackPersons = await prisma.person.findMany({
        where: {
          OR: [
            { cnicNumber: { contains: rawQ, mode: 'insensitive' as const } },
            { dlsNumber: { contains: rawQ, mode: 'insensitive' as const } },
            { phoneNumber: { contains: rawQ } },
            { fullName: { contains: rawQ, mode: 'insensitive' as const } },
            { company: { contains: rawQ, mode: 'insensitive' as const } },
            ...cnicVariants.map((v) => ({ cnicNumber: { contains: v, mode: 'insensitive' as const } })),
            ...(normQ ? [{ cnicNumber: { contains: normQ, mode: 'insensitive' as const } }] : []),
          ],
        },
        select: { id: true },
        take: 20,
      });
      personIds = fallbackPersons.map((p) => p.id);

      const fallbackVisits = await prisma.visit.findMany({
        where: {
          OR: [
            { visitorCardNo: { contains: rawQ, mode: 'insensitive' as const } },
            { vehicleNo: { contains: rawQ, mode: 'insensitive' as const } },
            { passCode: { contains: rawQ, mode: 'insensitive' as const } },
            { visitNumber: { contains: rawQ, mode: 'insensitive' as const } },
            { hostName: { contains: rawQ, mode: 'insensitive' as const } },
            ...(normQ ? [
              { visitorCardNo: { contains: normQ, mode: 'insensitive' as const } },
              { vehicleNo: { contains: normQ, mode: 'insensitive' as const } },
              { passCode: { contains: normQ, mode: 'insensitive' as const } },
            ] : []),
          ],
        },
        select: { id: true, personId: true, visitorCardNo: true, vehicleNo: true, visitNumber: true },
        take: 20,
      });
      visitRows = fallbackVisits;
    }

    // Combine all person IDs
    const allPersonIdSet = new Set<string>(personIds);
    visitRows.forEach((v) => allPersonIdSet.add(v.personId));

    if (allPersonIdSet.size === 0) {
      return NextResponse.json({
        found: false,
        matches: [],
        message: 'No record found matching the search criteria',
      });
    }

    // Fetch complete person records with recent visits
    const persons = await prisma.person.findMany({
      where: {
        id: { in: Array.from(allPersonIdSet) },
      },
      include: {
        visits: {
          orderBy: { checkInTime: 'desc' },
          take: 5,
          include: {
            entryGate: true,
            exitGate: true,
            checkedInBy: { select: { id: true, name: true } },
          },
        },
      },
    });

    const imageFlagsMap = await getPersonImageFlagsMap(persons.map((p) => p.id));

    // Build matches array
    const matches = await Promise.all(
      persons.map(async (p) => {
        const sanitizedVisits = await sanitizeVisitsWithDbFlags(p.visits as any);
        const activeVisit = sanitizedVisits.find((v: any) => v.status === 'CHECKED_IN') || null;
        const totalVisits = await prisma.visit.count({
          where: { personId: p.id },
        });

        const latestVisit = sanitizedVisits[0] || null;
        const currentCardNo = activeVisit?.visitorCardNo || latestVisit?.visitorCardNo || null;
        const currentVehicleNo = activeVisit?.vehicleNo || latestVisit?.vehicleNo || null;
        const dbFlags = imageFlagsMap.get(p.id);

        return {
          id: p.id,
          person: sanitizePersonForClient({
            ...p,
            visits: sanitizedVisits,
            hasCnicImage: dbFlags ? dbFlags.hasCnicImage : undefined,
            hasDlsImage: dbFlags ? dbFlags.hasDlsImage : undefined,
            hasDeliveryDocImage: dbFlags ? dbFlags.hasDeliveryDocImage : undefined,
            hasOutgoingDocImage: dbFlags ? dbFlags.hasOutgoingDocImage : undefined,
            latestDeliveryVisitId: dbFlags ? dbFlags.latestDeliveryVisitId : null,
          }),
          activeVisit,
          isCurrentlyInside: !!activeVisit,
          latestVisit,
          totalVisits,
          cardNo: currentCardNo,
          vehicleNo: currentVehicleNo,
          recentVisits: sanitizedVisits,
        };
      })
    );

    // Sort matches intelligently:
    // 1. Currently inside (checked-in) records first when searching for checkout or by vehicle/card
    // 2. Exact normalized Vehicle Number match
    // 3. Exact normalized CNIC match
    // 4. Exact normalized card match
    matches.sort((a, b) => {
      const aVehNorm = normalizeSearchValue(a.vehicleNo);
      const bVehNorm = normalizeSearchValue(b.vehicleNo);
      const aExactVeh = Boolean(normQ && aVehNorm && aVehNorm === normQ);
      const bExactVeh = Boolean(normQ && bVehNorm && bVehNorm === normQ);

      // Prioritize active (checked-in) exact vehicle match first
      if (aExactVeh && a.isCurrentlyInside && !(bExactVeh && b.isCurrentlyInside)) return -1;
      if (bExactVeh && b.isCurrentlyInside && !(aExactVeh && a.isCurrentlyInside)) return 1;

      if (mode === 'checkout') {
        if (a.isCurrentlyInside && !b.isCurrentlyInside) return -1;
        if (!a.isCurrentlyInside && b.isCurrentlyInside) return 1;
      }

      if (aExactVeh && !bExactVeh) return -1;
      if (bExactVeh && !aExactVeh) return 1;

      const aCnicNorm = normalizeSearchValue(a.person.cnicNumber);
      const bCnicNorm = normalizeSearchValue(b.person.cnicNumber);
      if (aCnicNorm === normQ && bCnicNorm !== normQ) return -1;
      if (bCnicNorm === normQ && aCnicNorm !== normQ) return 1;

      const aCardNorm = normalizeSearchValue(a.cardNo);
      const bCardNorm = normalizeSearchValue(b.cardNo);
      if (aCardNorm === normQ && bCardNorm !== normQ) return -1;
      if (bCardNorm === normQ && aCardNorm !== normQ) return 1;

      if (a.isCurrentlyInside && !b.isCurrentlyInside) return -1;
      if (!a.isCurrentlyInside && b.isCurrentlyInside) return 1;

      return 0;
    });

    if (matches.length === 0) {
      return NextResponse.json({
        found: false,
        matches: [],
        message: 'No record found matching the search criteria',
      });
    }

    const primary = matches[0];

    return NextResponse.json({
      found: true,
      matches,
      // Backward compatibility fields for existing consumers
      person: primary.person,
      isCurrentlyInside: primary.isCurrentlyInside,
      activeVisit: primary.activeVisit,
      totalVisits: primary.totalVisits,
      recentVisits: primary.recentVisits,
    });
  } catch (error: any) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to check person status' },
      { status: 500 }
    );
  }
}
