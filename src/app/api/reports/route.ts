import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin role required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const gateId = searchParams.get('gateId');
    const category = searchParams.get('category');
    const department = searchParams.get('department');
    const status = searchParams.get('status');

    const where: any = {};

    if (dateFrom || dateTo) {
      where.checkInTime = {};
      if (dateFrom) where.checkInTime.gte = new Date(`${dateFrom}T00:00:00.000Z`);
      if (dateTo) where.checkInTime.lte = new Date(`${dateTo}T23:59:59.999Z`);
    }

    if (gateId && gateId !== 'ALL') where.entryGateId = gateId;
    if (category && category !== 'ALL') where.person = { category: category as any };
    if (department && department !== 'ALL') where.department = { contains: department, mode: 'insensitive' };
    if (status && status !== 'ALL') where.status = status;

    const visits = await prisma.visit.findMany({
      where,
      orderBy: { checkInTime: 'desc' },
      take: 1000,
      include: {
        person: true,
        entryGate: true,
        exitGate: true,
        checkedInBy: { select: { id: true, name: true } },
        checkedOutBy: { select: { id: true, name: true } },
      },
    });

    const summary = {
      total: visits.length,
      checkedIn: visits.filter((v: { status: string }) => v.status === 'CHECKED_IN').length,
      checkedOut: visits.filter((v: { status: string }) => v.status === 'CHECKED_OUT').length,
      categories: visits.reduce((acc: Record<string, number>, v: { person?: { category: string } }) => {
        const cat = v.person?.category || 'VISITOR';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {}),
    };

    return NextResponse.json({
      success: true,
      summary,
      visits,
    });
  } catch (error: any) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    );
  }
}
