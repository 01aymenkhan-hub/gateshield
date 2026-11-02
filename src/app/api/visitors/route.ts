import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { normalizeSearchValue, getCnicHyphenatedVariants } from '@/lib/searchUtils';
import { sanitizeVisitsWithDbFlags, formatVehicleNoForStorage } from '@/lib/personSanitizer';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const gateId = searchParams.get('gateId');
    const query = searchParams.get('q')?.trim();
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (category && category !== 'ALL') {
      where.person = {
        category: category as any,
      };
    }

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (user.role === 'OPERATOR') {
      const operatorGateAccess = await prisma.userGateAccess.findMany({
        where: { userId: user.id },
        include: { gate: true },
      });
      const assignedGateIds = operatorGateAccess
        .filter((ga) => ga.gate && ga.gate.active)
        .map((ga) => ga.gateId);

      if (gateId && gateId !== 'ALL') {
        if (!assignedGateIds.includes(gateId)) {
          return NextResponse.json(
            { error: 'You are not authorized to access visitor records for the selected gate.' },
            { status: 403 }
          );
        }
        where.entryGateId = gateId;
      } else {
        where.entryGateId = { in: assignedGateIds };
      }
    } else if (gateId && gateId !== 'ALL') {
      where.entryGateId = gateId;
    }

    if (dateFrom || dateTo) {
      where.checkInTime = {};
      if (dateFrom) {
        where.checkInTime.gte = new Date(`${dateFrom}T00:00:00.000Z`);
      }
      if (dateTo) {
        where.checkInTime.lte = new Date(`${dateTo}T23:59:59.999Z`);
      }
    }

    if (query) {
      const normQ = normalizeSearchValue(query);
      const digitsOnly = query.replace(/\D/g, '');
      const cnicVariants = getCnicHyphenatedVariants(digitsOnly);

      const orConditions: any[] = [
        { visitNumber: { contains: query, mode: 'insensitive' } },
        { visitorCardNo: { contains: query, mode: 'insensitive' } },
        { hostName: { contains: query, mode: 'insensitive' } },
        { department: { contains: query, mode: 'insensitive' } },
        { vehicleNo: { contains: query, mode: 'insensitive' } },
        { person: { fullName: { contains: query, mode: 'insensitive' } } },
        { person: { cnicNumber: { contains: query, mode: 'insensitive' } } },
        { person: { dlsNumber: { contains: query, mode: 'insensitive' } } },
        { person: { phoneNumber: { contains: query, mode: 'insensitive' } } },
        { person: { company: { contains: query, mode: 'insensitive' } } },
      ];

      if (normQ) {
        const formattedVeh = formatVehicleNoForStorage(query);
        orConditions.push(
          { visitNumber: { contains: normQ, mode: 'insensitive' } },
          { visitorCardNo: { contains: normQ, mode: 'insensitive' } },
          { vehicleNo: { contains: normQ, mode: 'insensitive' } }
        );
        if (formattedVeh && formattedVeh.toLowerCase() !== query.toLowerCase()) {
          orConditions.push({ vehicleNo: { contains: formattedVeh, mode: 'insensitive' } });
        }
      }

      for (const variant of cnicVariants) {
        orConditions.push({ person: { cnicNumber: { contains: variant, mode: 'insensitive' } } });
      }

      if (digitsOnly.length >= 4) {
        orConditions.push(
          { person: { cnicNumber: { contains: digitsOnly, mode: 'insensitive' } } },
          { person: { phoneNumber: { contains: digitsOnly, mode: 'insensitive' } } }
        );
      }

      where.OR = orConditions;
    }

    const [total, visits] = await Promise.all([
      prisma.visit.count({ where }),
      prisma.visit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { checkInTime: 'desc' },
        include: {
          person: true,
          entryGate: true,
          exitGate: true,
          checkedInBy: { select: { id: true, name: true } },
          checkedOutBy: { select: { id: true, name: true } },
        },
      }),
    ]);

    const sanitizedVisits = await sanitizeVisitsWithDbFlags(visits);

    return NextResponse.json({
      success: true,
      visits: sanitizedVisits,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching visitors list:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch visitors' },
      { status: 500 }
    );
  }
}
