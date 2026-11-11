import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { canAccessVisit } from '@/lib/gateAccess';
import { sanitizeVisitsWithDbFlags } from '@/lib/personSanitizer';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const visit = await prisma.visit.findUnique({
      where: { id },
      include: {
        person: true,
        entryGate: true,
        exitGate: true,
        checkedInBy: { select: { id: true, name: true } },
        checkedOutBy: { select: { id: true, name: true } },
      },
    });

    if (!visit || !canAccessVisit(user, visit)) {
      return NextResponse.json({ error: 'Visit record not found' }, { status: 404 });
    }

    // Strip raw document image data and internal storage paths before responding.
    const [sanitizedVisit] = await sanitizeVisitsWithDbFlags([visit]);
    return NextResponse.json({ success: true, visit: sanitizedVisit });
  } catch (error: any) {
    console.error('Error fetching visit:', error);
    return NextResponse.json({ error: 'Failed to fetch visit' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Role enforcement: ONLY ADMIN CAN DELETE
    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Administrator privileges required to delete records' },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const existingVisit = await prisma.visit.findUnique({
      where: { id },
      include: {
        person: { select: { id: true, fullName: true, cnicNumber: true } },
      },
    });

    if (!existingVisit) {
      return NextResponse.json({ error: 'Visit record not found' }, { status: 404 });
    }

    // Delete the visit
    await prisma.visit.delete({
      where: { id },
    });

    // Log the audit event
    await logAudit({
      action: 'DELETE_VISIT',
      entityType: 'Visit',
      entityId: id,
      details: {
        visitNumber: existingVisit.visitNumber,
        personName: existingVisit.person?.fullName,
        cnic: existingVisit.person?.cnicNumber,
        deletedBy: user.name,
      },
      performedById: user.id,
    });

    return NextResponse.json({
      success: true,
      message: `Visit #${existingVisit.visitNumber} was deleted successfully`,
    });
  } catch (error: any) {
    console.error('Error deleting visit:', error);
    return NextResponse.json(
      { error: 'Failed to delete visit record' },
      { status: 500 }
    );
  }
}
