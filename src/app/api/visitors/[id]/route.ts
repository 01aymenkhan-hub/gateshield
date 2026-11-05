import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { sanitizePersonWithDbFlags, sanitizeVisitsWithDbFlags } from '@/lib/personSanitizer';

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

    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        visits: {
          orderBy: { checkInTime: 'desc' },
          include: {
            entryGate: true,
            exitGate: true,
            checkedInBy: { select: { id: true, name: true } },
            checkedOutBy: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    const sanitizedVisits = await sanitizeVisitsWithDbFlags(person.visits as any);
    const activeVisit =
      sanitizedVisits.find((v: Record<string, any>) => v.status === 'CHECKED_IN') || null;
    const sanitizedPerson = await sanitizePersonWithDbFlags({
      ...person,
      visits: sanitizedVisits,
    });

    return NextResponse.json({
      success: true,
      person: sanitizedPerson,
      activeVisit,
      totalVisits: person.visits.length,
    });
  } catch (error: any) {
    console.error('Error fetching person detail:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch person details' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();

    if (body.isVip !== undefined && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Only Administrators can assign or modify VIP status.' },
        { status: 403 }
      );
    }

    const allowedFields = [
      'fullName',
      'fatherHusbandName',
      'category',
      'gender',
      'phoneNumber',
      'company',
      'isVip',
      'isBlacklisted',
      'blacklistReason',
    ];

    const updateData: any = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updateData[key] = body[key];
      }
    }

    const updatedPerson = await prisma.person.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      action: 'UPDATE_PERSON_PROFILE',
      entityType: 'Person',
      entityId: id,
      details: updateData,
      performedById: user.id,
    });

    const sanitizedPerson = await sanitizePersonWithDbFlags(updatedPerson);

    return NextResponse.json({
      success: true,
      person: sanitizedPerson,
    });
  } catch (error: any) {
    console.error('Error updating person:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update person' },
      { status: 500 }
    );
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

    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Administrator privileges required to delete records' },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const existingPerson = await prisma.person.findUnique({
      where: { id },
      include: { visits: true },
    });

    if (!existingPerson) {
      return NextResponse.json({ error: 'Person record not found' }, { status: 404 });
    }

    await prisma.person.delete({
      where: { id },
    });

    await logAudit({
      action: 'DELETE_PERSON',
      entityType: 'Person',
      entityId: id,
      details: {
        fullName: existingPerson.fullName,
        cnicNumber: existingPerson.cnicNumber,
        visitsDeleted: existingPerson.visits.length,
        deletedBy: user.name,
      },
      performedById: user.id,
    });

    return NextResponse.json({
      success: true,
      message: `Person record for ${existingPerson.fullName} was deleted successfully`,
    });
  } catch (error: any) {
    console.error('Error deleting person:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete person record' },
      { status: 500 }
    );
  }
}
