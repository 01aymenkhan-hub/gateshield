import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { saveImageDataUrlToFile, StoredFileResult } from '@/lib/fileStorage';
import {
  ensureDeliveryDocColumns,
  sanitizePersonWithDbFlags,
  sanitizeVisitsWithDbFlags,
} from '@/lib/personSanitizer';

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureDeliveryDocColumns();

    const body = await request.json();
    const { visitId, identifier, exitGateId, notes, outgoingDocImageData } = body;

    let targetVisit = null;

    if (visitId) {
      targetVisit = await prisma.visit.findUnique({
        where: { id: visitId },
        include: { person: true, entryGate: true },
      });
    } else if (identifier) {
      const clean = identifier.trim();
      const norm = clean.replace(/[\s\-_./,\\]+/g, '').toLowerCase();
      const normUpper = norm.toUpperCase();
      const digitsOnly = clean.replace(/\D/g, '');
      const cnicVariants: string[] = [];
      if (digitsOnly.length >= 13) {
        cnicVariants.push(`${digitsOnly.slice(0, 5)}-${digitsOnly.slice(5, 12)}-${digitsOnly.slice(12, 13)}`);
      } else if (digitsOnly.length >= 5) {
        cnicVariants.push(`${digitsOnly.slice(0, 5)}-${digitsOnly.slice(5)}`);
      }

      // First try exact/normalized vehicle match via SQL for active visits
      if (normUpper) {
        try {
          const vehicleMatches = await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "visits"
            WHERE "status"::text = 'CHECKED_IN'
              AND (
                COALESCE("vehicleNoNormalized", '') = ${normUpper}
                OR REGEXP_REPLACE(COALESCE("vehicleNo", ''), '[^a-zA-Z0-9]', '', 'g') ILIKE ${normUpper}
              )
            ORDER BY "checkInTime" DESC
            LIMIT 1
          `;
          if (vehicleMatches.length > 0) {
            targetVisit = await prisma.visit.findUnique({
              where: { id: vehicleMatches[0].id },
              include: { person: true, entryGate: true },
            });
          }
        } catch (vehErr) {
          console.warn('[CheckOut] Vehicle normalized lookup warning:', vehErr);
        }
      }

      if (!targetVisit) {
        // Search active visit by visitNumber, visitorCardNo, vehicleNo, CNIC, DLS, or phone
        targetVisit = await prisma.visit.findFirst({
          where: {
            status: 'CHECKED_IN',
            OR: [
              { visitNumber: { equals: clean, mode: 'insensitive' } },
              { visitorCardNo: { equals: clean, mode: 'insensitive' } },
              { vehicleNo: { equals: clean, mode: 'insensitive' } },
              { person: { cnicNumber: { equals: clean, mode: 'insensitive' } } },
              { person: { dlsNumber: { equals: clean, mode: 'insensitive' } } },
              { person: { phoneNumber: clean } },
              ...(norm ? [
                { visitNumber: { contains: norm, mode: 'insensitive' as const } },
                { visitorCardNo: { contains: norm, mode: 'insensitive' as const } },
                { vehicleNo: { contains: norm, mode: 'insensitive' as const } },
              ] : []),
              ...cnicVariants.map((v) => ({ person: { cnicNumber: { contains: v, mode: 'insensitive' as const } } })),
              ...(digitsOnly.length >= 5 ? [
                { person: { cnicNumber: { contains: digitsOnly, mode: 'insensitive' as const } } },
                { person: { phoneNumber: { contains: digitsOnly, mode: 'insensitive' as const } } },
              ] : []),
            ],
          },
          include: { person: true, entryGate: true },
        });
      }
    }

    if (!targetVisit) {
      return NextResponse.json(
        { error: 'No active visit found with the provided details' },
        { status: 404 }
      );
    }

    if (targetVisit.status === 'CHECKED_OUT') {
      return NextResponse.json(
        { error: `This visit was already checked out at ${new Date(targetVisit.checkOutTime!).toLocaleString()}` },
        { status: 400 }
      );
    }

    const isDeliveryCategory = targetVisit.person.category === 'DELIVERY';
    const rawOutgoingDocImage =
      typeof outgoingDocImageData === 'string' && outgoingDocImageData.trim().length > 0
        ? outgoingDocImageData.trim()
        : null;

    if (isDeliveryCategory && !rawOutgoingDocImage) {
      return NextResponse.json(
        {
          error: 'Outgoing delivery document capture is required before checking out a delivery.',
          code: 'DELIVERY_OUTGOING_DOC_REQUIRED',
        },
        { status: 400 }
      );
    }

    // Resolve and validate exit gate
    let resolvedExitGateId: string | null =
      typeof exitGateId === 'string' && exitGateId.trim() ? exitGateId.trim() : null;

    if (user.role === 'OPERATOR') {
      const operatorGateAccess = await prisma.userGateAccess.findMany({
        where: { userId: user.id },
        include: { gate: true },
      });
      const assignedActiveGates = operatorGateAccess
        .map((ga) => ga.gate)
        .filter((g): g is NonNullable<typeof g> => Boolean(g && g.active));

      if (resolvedExitGateId) {
        const isAssigned = assignedActiveGates.some((g) => g.id === resolvedExitGateId);
        if (!isAssigned) {
          return NextResponse.json(
            {
              error: 'You are not authorized to check out visitors at the selected gate.',
              code: 'UNAUTHORIZED_GATE',
            },
            { status: 403 }
          );
        }
      } else if (assignedActiveGates.length > 0) {
        resolvedExitGateId = assignedActiveGates[0].id;
      } else {
        resolvedExitGateId = targetVisit.entryGateId;
      }
    } else if (!resolvedExitGateId) {
      resolvedExitGateId = targetVisit.entryGateId;
    }

    // Persist and verify outgoing document on disk BEFORE completing checkout transaction
    let savedOutgoingDoc: StoredFileResult | null = null;
    if (rawOutgoingDocImage) {
      try {
        savedOutgoingDoc = await saveImageDataUrlToFile(
          rawOutgoingDocImage,
          'delivery/outgoing',
          `delivery_out_${targetVisit.id}`
        );
      } catch (storageErr: any) {
        console.error('[CheckOut] Outgoing document storage failed:', storageErr);
        return NextResponse.json(
          {
            error:
              storageErr?.message ||
              'Failed to save outgoing delivery document. Checkout was not completed; please try again.',
            code: 'OUTGOING_DOC_STORAGE_FAILED',
          },
          { status: 400 }
        );
      }
    }

    const updatedVisit = await prisma.$transaction(async (tx) => {
      const freshVisit = await tx.visit.findUnique({
        where: { id: targetVisit.id },
      });

      if (!freshVisit || freshVisit.status === 'CHECKED_OUT') {
        const alreadyOutErr: any = new Error(
          `This visit was already checked out${freshVisit?.checkOutTime ? ` at ${new Date(freshVisit.checkOutTime).toLocaleString()}` : ''}`
        );
        alreadyOutErr.status = 400;
        throw alreadyOutErr;
      }

      const checkOutDate = new Date();
      const checkedOutVisit = await tx.visit.update({
        where: { id: targetVisit.id },
        data: {
          status: 'CHECKED_OUT',
          checkOutTime: checkOutDate,
          exitGateId: resolvedExitGateId,
          checkedOutById: user.id,
          notes: notes
            ? targetVisit.notes
              ? `${targetVisit.notes}\nCheckout: ${notes}`
              : `Checkout: ${notes}`
            : targetVisit.notes,
        },
        include: {
          person: true,
          entryGate: true,
          exitGate: true,
          checkedInBy: { select: { id: true, name: true } },
          checkedOutBy: { select: { id: true, name: true } },
        },
      });

      if (savedOutgoingDoc) {
        await tx.$executeRaw`
          UPDATE "visits"
          SET "outgoingDocPath" = ${savedOutgoingDoc.storageKey},
              "outgoingDocMime" = ${savedOutgoingDoc.mime},
              "outgoingDocSize" = ${savedOutgoingDoc.size},
              "outgoingDocCapturedAt" = ${checkOutDate},
              "updatedAt" = NOW()
          WHERE "id" = ${checkedOutVisit.id}
        `;
      }

      await tx.$executeRaw`
        UPDATE "guest_invitations"
        SET "status" = 'CHECKED_OUT'::"InvitationStatus",
            "actualCheckOutTime" = ${checkOutDate},
            "updatedAt" = NOW()
        WHERE "visitId" = ${checkedOutVisit.id}
      `;

      return checkedOutVisit;
    });

    await logAudit({
      action: 'CHECK_OUT',
      entityType: 'Visit',
      entityId: updatedVisit.id,
      details: {
        visitNumber: updatedVisit.visitNumber,
        personName: updatedVisit.person.fullName,
        category: updatedVisit.person.category,
        cnic: updatedVisit.person.cnicNumber,
        cardNo: updatedVisit.visitorCardNo,
        vehicleNo: updatedVisit.vehicleNo,
        hasOutgoingDoc: Boolean(savedOutgoingDoc),
        durationMinutes: Math.round(
          (new Date(updatedVisit.checkOutTime!).getTime() - new Date(updatedVisit.checkInTime).getTime()) / 60000
        ),
      },
      performedById: user.id,
    });

    const sanitizedVisits = await sanitizeVisitsWithDbFlags([updatedVisit as any]);
    const sanitizedPerson = await sanitizePersonWithDbFlags(updatedVisit.person);

    return NextResponse.json({
      success: true,
      message: `${updatedVisit.person.fullName} checked out successfully`,
      visit: {
        ...sanitizedVisits[0],
        person: sanitizedPerson,
      },
    });
  } catch (error: any) {
    if (error?.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Check-out error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to complete check out' },
      { status: 500 }
    );
  }
}
