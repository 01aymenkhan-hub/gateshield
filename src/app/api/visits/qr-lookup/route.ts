import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { extractPassCode } from '@/lib/qrUtils';
import { sanitizeVisitsWithDbFlags } from '@/lib/personSanitizer';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawCode = searchParams.get('code') || searchParams.get('passCode') || searchParams.get('q');

    if (!rawCode || !rawCode.trim()) {
      return NextResponse.json({ error: 'QR Pass Code is required' }, { status: 400 });
    }

    const cleanCode = extractPassCode(rawCode.trim());

    // Find visit by passCode, visitorCardNo, or visitNumber
    const visit = await prisma.visit.findFirst({
      where: {
        OR: [
          { passCode: cleanCode },
          { visitorCardNo: { equals: cleanCode, mode: 'insensitive' } },
          { visitNumber: { equals: cleanCode, mode: 'insensitive' } },
        ],
      },
      include: {
        person: true,
        entryGate: true,
        exitGate: true,
        checkedInBy: { select: { id: true, name: true } },
        checkedOutBy: { select: { id: true, name: true } },
      },
      orderBy: { checkInTime: 'desc' },
    });

    if (!visit) {
      return NextResponse.json(
        {
          found: false,
          error: 'Visitor Pass Not Found: The scanned QR code does not match any registered visitor record.',
        },
        { status: 404 }
      );
    }

    const [sanitizedVisit] = await sanitizeVisitsWithDbFlags([visit]);

    return NextResponse.json({
      found: true,
      visit: sanitizedVisit,
      isCurrentlyInside: sanitizedVisit.status === 'CHECKED_IN',
      person: sanitizedVisit.person,
    });
  } catch (error: any) {
    console.error('QR Lookup error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to lookup QR pass' },
      { status: 500 }
    );
  }
}
