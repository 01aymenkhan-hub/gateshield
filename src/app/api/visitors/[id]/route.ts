import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { sanitizePersonWithDbFlags, sanitizeVisitsWithDbFlags } from '@/lib/personSanitizer';
import { canAccessPerson, visitAccessWhere } from '@/lib/gateAccess';
import { InputError, isPersonCategory, optionalText, requiredText } from '@/lib/identity';
import type { Prisma } from '@prisma/client';

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
          where: visitAccessWhere(user),
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

    // Operators only see people who passed through their gates or are inside right now.
    if (!person || !(await canAccessPerson(user, person.id))) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    const sanitizedVisits = await sanitizeVisitsWithDbFlags(person.visits as any);
    const activeVisit =
      sanitizedVisits.find((v: Record<string, any>) => v.status === 'CHECKED_IN') || null;
    const sanitizedPerson = await sanitizePersonWithDbFlags({
      ...person,
      visits: sanitizedVisits,
    });
    const visibleVisit = activeVisit || sanitizedVisits[0];
    const responsePerson = user.role === 'ADMIN' ? sanitizedPerson : {
      ...sanitizedPerson,
      hasDeliveryDocImage: Boolean(visibleVisit?.hasIncomingDoc),
      hasOutgoingDocImage: Boolean(visibleVisit?.hasOutgoingDoc),
      latestDeliveryVisitId: person.category === 'DELIVERY' ? visibleVisit?.id ?? null : null,
      incomingDocCapturedAt: visibleVisit?.incomingDocCapturedAt ?? null,
      outgoingDocCapturedAt: visibleVisit?.outgoingDocCapturedAt ?? null,
    };

    return NextResponse.json({
      success: true,
      person: responsePerson,
      activeVisit,
      totalVisits: person.visits.length,
    });
  } catch (error: any) {
    console.error('Error fetching person detail:', error);
    return NextResponse.json(
      { error: 'Failed to fetch person details' },
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
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const isAdminUser = user.role === 'ADMIN';

    if (body.isVip !== undefined && !isAdminUser) {
      return NextResponse.json(
        { error: 'Forbidden: Only Administrators can assign or modify VIP status.' },
        { status: 403 }
      );
    }

    const existing = await prisma.person.findUnique({
      where: { id },
      select: { id: true, isBlacklisted: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }
    if (!(await canAccessPerson(user, id))) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    // Operators may flag someone at the gate, but only an Administrator can lift
    // or rewrite an existing blacklist entry.
    if (!isAdminUser && existing.isBlacklisted) {
      if (body.isBlacklisted === false || body.blacklistReason !== undefined) {
        return NextResponse.json(
          { error: 'Forbidden: Only Administrators can remove or change a blacklist entry.' },
          { status: 403 }
        );
      }
    }

    const updateData: Prisma.PersonUpdateInput = {};
    try {
      if (body.fullName !== undefined) updateData.fullName = requiredText(body.fullName, 'Full name', 120);
      if (body.fatherHusbandName !== undefined)
        updateData.fatherHusbandName = optionalText(body.fatherHusbandName, 'Father/Husband name', 120);
      if (body.gender !== undefined) updateData.gender = optionalText(body.gender, 'Gender', 20);
      if (body.company !== undefined) updateData.company = optionalText(body.company, 'Company', 120);
      if (body.phoneNumber !== undefined) {
        const phone = optionalText(body.phoneNumber, 'Phone number', 20);
        if (phone && !/^03\d{9}$/.test(phone)) {
          throw new InputError('Phone number must be an 11-digit mobile number starting with 03.');
        }
        updateData.phoneNumber = phone;
      }
      if (body.category !== undefined) {
        const category = typeof body.category === 'string' ? body.category.trim().toUpperCase() : '';
        if (!isPersonCategory(category)) throw new InputError('Invalid visitor category.');
        updateData.category = category;
      }
      if (body.isVip !== undefined) {
        if (typeof body.isVip !== 'boolean') throw new InputError('isVip must be true or false.');
        updateData.isVip = body.isVip;
      }
      if (body.isBlacklisted !== undefined) {
        if (typeof body.isBlacklisted !== 'boolean') throw new InputError('isBlacklisted must be true or false.');
        updateData.isBlacklisted = body.isBlacklisted;
        if (!body.isBlacklisted) updateData.blacklistReason = null;
      }
      if (body.blacklistReason !== undefined && body.isBlacklisted !== false) {
        updateData.blacklistReason = optionalText(body.blacklistReason, 'Blacklist reason', 500);
      }
    } catch (err) {
      if (err instanceof InputError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
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
      { error: 'Failed to update person' },
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
      { error: 'Failed to delete person record' },
      { status: 500 }
    );
  }
}
