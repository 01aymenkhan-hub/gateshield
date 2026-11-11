import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { getSessionUser, getEmployeeSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { generatePassCode } from '@/lib/qrUtils';
import { sanitizeVisitsWithDbFlags, sanitizePersonForClient } from '@/lib/personSanitizer';
import { formatCardNoForStorage, normalizeCardKey } from '@/lib/cardUtils';
import { GuestInvitationRecord } from '@/app/api/employee/invitations/route';
import { normalizeCnic, resolvePersonForCheckIn } from '@/lib/identity';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      const emp = await getEmployeeSessionUser();
      if (emp) {
        return NextResponse.json(
          { error: 'Forbidden: Employees cannot perform Operator gate check-ins.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: invitationId } = await context.params;
    if (!invitationId) {
      return NextResponse.json({ error: 'Invitation ID is required.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const requestedGateId =
      typeof body.entryGateId === 'string' && body.entryGateId.trim()
        ? body.entryGateId.trim()
        : null;
    const rawCardInput =
      typeof body.visitorCardNo === 'string' && body.visitorCardNo.trim()
        ? body.visitorCardNo.trim()
        : typeof body.confirmedCardNo === 'string' && body.confirmedCardNo.trim()
        ? body.confirmedCardNo.trim()
        : '';
    const vehicleNo =
      typeof body.vehicleNo === 'string' && body.vehicleNo.trim()
        ? body.vehicleNo.trim()
        : null;
    const notes =
      typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

    const assignedCardNo = formatCardNoForStorage(rawCardInput);
    const assignedCardKey = normalizeCardKey(rawCardInput);

    if (!assignedCardNo || !assignedCardKey) {
      return NextResponse.json(
        {
          error: 'Please enter a valid VC Card No. before checking in the guest.',
          code: 'CARD_REQUIRED',
        },
        { status: 400 }
      );
    }

    // Resolve and verify Operator's gate authorization
    let resolvedGate: { id: string; name: string } | null = null;

    if (user.role === 'OPERATOR') {
      const operatorGateAccess = await prisma.userGateAccess.findMany({
        where: { userId: user.id },
        include: { gate: true },
      });
      const assignedActiveGates = operatorGateAccess
        .map((ga) => ga.gate)
        .filter((g): g is NonNullable<typeof g> => Boolean(g && g.active));

      if (assignedActiveGates.length === 0) {
        return NextResponse.json(
          {
            error:
              'No gate is assigned to your Operator account. Please contact an Administrator to assign a gate before checking in visitors.',
            code: 'NO_GATE_ASSIGNED',
          },
          { status: 403 }
        );
      }

      if (requestedGateId) {
        const match = assignedActiveGates.find((g) => g.id === requestedGateId);
        if (!match) {
          return NextResponse.json(
            {
              error: 'You are not authorized to check in visitors at the selected gate.',
              code: 'UNAUTHORIZED_GATE',
            },
            { status: 403 }
          );
        }
        resolvedGate = { id: match.id, name: match.name };
      } else {
        resolvedGate = {
          id: assignedActiveGates[0].id,
          name: assignedActiveGates[0].name,
        };
      }
    } else {
      // ADMIN: preserve access across all active gates
      if (requestedGateId) {
        const dbGate = await prisma.gate.findFirst({
          where: { id: requestedGateId, active: true },
        });
        if (dbGate) {
          resolvedGate = { id: dbGate.id, name: dbGate.name };
        }
      }

      if (!resolvedGate) {
        const defaultGate = await prisma.gate.findFirst({
          where: { active: true },
          orderBy: { createdAt: 'asc' },
        });
        if (defaultGate) {
          resolvedGate = { id: defaultGate.id, name: defaultGate.name };
        } else {
          const createdGate = await prisma.gate.create({
            data: {
              name: 'Main Gate - Entry & Exit',
              type: 'BOTH',
              active: true,
            },
          });
          resolvedGate = { id: createdGate.id, name: createdGate.name };
        }
      }
    }

    // Mandatory Atomic Concurrency-Safe Check-In Transaction
    const { visit, person, updatedInvitation } = await prisma.$transaction(async (tx) => {
      // 1. Row-level lock on the guest_invitations record so concurrent check-in requests serialize
      const lockedRows = await tx.$queryRaw<GuestInvitationRecord[]>`
        SELECT
          "id",
          "employeeId",
          "employeeName",
          "departmentId",
          "departmentName",
          "guestName",
          "guestPhone",
          "guestCnic",
          "guestPhotoUrl",
          "alongWith",
          "visitorCardNo",
          "normalizedCardKey",
          "visitDate",
          "expectedArrivalTime",
          "expectedDurationWindow",
          "status"::text AS "status",
          "visitId",
          "actualCheckInTime",
          "actualCheckOutTime",
          "entryGateId",
          "entryGateName",
          "checkedInById",
          "checkedInByName",
          "reinvitedFromId",
          "createdAt",
          "updatedAt"
        FROM "guest_invitations"
        WHERE "id" = ${invitationId}
        FOR UPDATE
      `;

      const invitation = lockedRows[0];
      if (!invitation) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const notFoundErr: any = new Error('Guest invitation not found.');
        notFoundErr.status = 404;
        throw notFoundErr;
      }

      if (invitation.status !== 'PENDING') {
        const checkedByText = invitation.checkedInByName
          ? ` by ${invitation.checkedInByName}`
          : '';
        const gateText = invitation.entryGateName ? ` at ${invitation.entryGateName}` : '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const conflictErr: any = new Error(
          `This guest has already been checked in${checkedByText}${gateText}.`
        );
        conflictErr.status = 409;
        conflictErr.code = 'INVITATION_ALREADY_CHECKED_IN';
        throw conflictErr;
      }

      // NOTE: Expected arrival slot is an estimate only. Never block or reject check-in based on arrival time or date.

      // 2. Acquire advisory lock on physical card key and verify no active visit holds it
      const lockNamespaceKey = `gk_card_${assignedCardKey}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockNamespaceKey}))`;

      const activeVisitsWithCards = await tx.visit.findMany({
        where: {
          status: { in: ['CHECKED_IN', 'OVERSTAY'] },
          checkOutTime: null,
          visitorCardNo: { not: null },
        },
        select: {
          id: true,
          visitorCardNo: true,
          visitNumber: true,
        },
      });

      const duplicateCardVisit = activeVisitsWithCards.find(
        (v) => v.visitorCardNo && normalizeCardKey(v.visitorCardNo) === assignedCardKey
      );

      if (duplicateCardVisit) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cardConflictErr: any = new Error(
          `VC Card ${assignedCardNo} is already assigned to an active visitor (Visit #${duplicateCardVisit.visitNumber}). Please enter another available card.`
        );
        cardConflictErr.status = 409;
        cardConflictErr.code = 'CARD_ALREADY_ASSIGNED';
        throw cardConflictErr;
      }

      // Also check if any legacy PENDING invitation (other than this one) holds this card
      const legacyPendingConflict = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "guest_invitations"
        WHERE "status"::text = 'PENDING'
          AND "id" <> ${invitation.id}
          AND "normalizedCardKey" IS NOT NULL
          AND "normalizedCardKey" = ${assignedCardKey}
        LIMIT 1
      `;

      if (legacyPendingConflict.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cardConflictErr: any = new Error(
          `VC Card ${assignedCardNo} is reserved for another pending invitation. Please enter another available card.`
        );
        cardConflictErr.status = 409;
        cardConflictErr.code = 'CARD_ALREADY_ASSIGNED';
        throw cardConflictErr;
      }

      // 3. Find or create Person record (preserving historical visitor records)
      // Same identity rules as walk-in check-in: CNIC is authoritative (any formatting),
      // phone only matches when no CNIC exists, blacklist checked across both.
      const guestCnic = normalizeCnic(invitation.guestCnic);
      const existingPerson = await resolvePersonForCheckIn(tx, {
        cnic: guestCnic,
        dls: null,
        phone: invitation.guestPhone || null,
      });

      if (existingPerson) {
        const activeVisitForPerson = await tx.visit.findFirst({
          where: {
            personId: existingPerson.id,
            status: { in: ['CHECKED_IN', 'OVERSTAY'] },
            checkOutTime: null,
          },
        });
        if (activeVisitForPerson) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const alreadyInsideErr: any = new Error(
            `This guest is already checked in (Visit #${activeVisitForPerson.visitNumber}).`
          );
          alreadyInsideErr.status = 409;
          throw alreadyInsideErr;
        }
      }

      const savedPerson = existingPerson
        ? await tx.person.update({
            where: { id: existingPerson.id },
            data: {
              fullName: invitation.guestName,
              cnicNumber: guestCnic || existingPerson.cnicNumber || null,
              phoneNumber: invitation.guestPhone || existingPerson.phoneNumber || null,
              photoUrl: invitation.guestPhotoUrl || existingPerson.photoUrl || null,
            },
          })
        : await tx.person.create({
            data: {
              fullName: invitation.guestName,
              cnicNumber: guestCnic,
              phoneNumber: invitation.guestPhone,
              photoUrl: invitation.guestPhotoUrl || null,
              category: 'SPECIAL_GUEST',
            },
          });

      // 4. Create Visit record with the Operator-assigned VC Card Number
      const now = new Date();
      const datePrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const todayVisitsCount = await tx.visit.count({
        where: {
          checkInTime: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0),
          },
        },
      });
      const visitNumber = `VIS-${datePrefix}-${String(todayVisitsCount + 1).padStart(4, '0')}`;
      const passCode = generatePassCode();
      const slotLabel = invitation.expectedArrivalTime || invitation.expectedDurationWindow || '';

      const defaultNotes = [
        `Pre-invited by ${invitation.employeeName} (${invitation.departmentName})`,
        invitation.alongWith ? `Along With: ${invitation.alongWith}` : null,
      ]
        .filter(Boolean)
        .join(' • ');

      const createdVisit = await tx.visit.create({
        data: {
          visitNumber,
          passCode,
          personId: savedPerson.id,
          hostName: invitation.employeeName,
          department: invitation.departmentName,
          purpose: slotLabel ? `Invited Guest (${slotLabel})` : 'Invited Guest',
          visitorCardNo: assignedCardNo,
          vehicleNo,
          status: 'CHECKED_IN',
          checkInTime: now,
          entryGateId: resolvedGate!.id,
          checkedInById: user.id,
          notes: notes || defaultNotes,
        },
        include: {
          person: true,
          entryGate: true,
          checkedInBy: { select: { id: true, name: true } },
        },
      });

      if (invitation.departmentId) {
        await tx.$executeRaw`
          UPDATE "visits"
          SET "departmentId" = ${invitation.departmentId}
          WHERE "id" = ${createdVisit.id}
        `;
      }

      // 5. Atomically transition invitation from PENDING -> CHECKED_IN and save assigned VC Card No.
      const conditionalUpdateCount = await tx.$executeRaw`
        UPDATE "guest_invitations"
        SET "status" = 'CHECKED_IN'::"InvitationStatus",
            "visitorCardNo" = ${assignedCardNo},
            "normalizedCardKey" = ${assignedCardKey},
            "visitId" = ${createdVisit.id},
            "actualCheckInTime" = ${now},
            "entryGateId" = ${resolvedGate!.id},
            "entryGateName" = ${resolvedGate!.name},
            "checkedInById" = ${user.id},
            "checkedInByName" = ${user.name},
            "updatedAt" = ${now}
        WHERE "id" = ${invitation.id}
          AND "status"::text = 'PENDING'
      `;

      if (conditionalUpdateCount === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raceErr: any = new Error(
          'This guest invitation was just checked in by another operator.'
        );
        raceErr.status = 409;
        raceErr.code = 'INVITATION_ALREADY_CHECKED_IN';
        throw raceErr;
      }

      // 6. Create exactly ONE persistent arrival notification for the inviting employee
      const arrivalTimeFormatted = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      const notifId = `ntf_${crypto.randomBytes(10).toString('hex')}`;
      const dedupeKey = `guest_arrived_${invitation.id}`;
      await tx.$executeRaw`
        INSERT INTO "app_notifications" (
          "id",
          "recipientUserId",
          "type",
          "title",
          "message",
          "invitationId",
          "visitId",
          "dedupeKey",
          "isRead",
          "createdAt"
        )
        VALUES (
          ${notifId},
          ${invitation.employeeId},
          'GUEST_ARRIVED',
          'Your Invited Guest Has Arrived',
          ${`Your guest ${invitation.guestName} (Card ${assignedCardNo}) has arrived and checked in at ${resolvedGate!.name} at ${arrivalTimeFormatted}.`},
          ${invitation.id},
          ${createdVisit.id},
          ${dedupeKey},
          false,
          ${now}
        )
        ON CONFLICT ("dedupeKey") DO NOTHING
      `;

      const updatedRows = await tx.$queryRaw<GuestInvitationRecord[]>`
        SELECT
          "id",
          "employeeId",
          "employeeName",
          "departmentId",
          "departmentName",
          "guestName",
          "guestPhone",
          "guestCnic",
          "guestPhotoUrl",
          "alongWith",
          "visitorCardNo",
          "normalizedCardKey",
          "visitDate",
          "expectedArrivalTime",
          "expectedDurationWindow",
          "status"::text AS "status",
          "visitId",
          NULL::text AS "visitNumber",
          "actualCheckInTime",
          "actualCheckOutTime",
          "entryGateId",
          "entryGateName",
          "checkedInById",
          "checkedInByName",
          "reinvitedFromId",
          "createdAt",
          "updatedAt"
        FROM "guest_invitations"
        WHERE "id" = ${invitation.id}
        LIMIT 1
      `;

      return {
        visit: createdVisit,
        person: savedPerson,
        updatedInvitation: updatedRows[0],
      };
    });

    await logAudit({
      action: 'CHECK_IN_INVITED_GUEST',
      entityType: 'Visit',
      entityId: visit.id,
      details: {
        invitationId,
        visitNumber: visit.visitNumber,
        guestName: person.fullName,
        visitorCardNo: visit.visitorCardNo,
        hostName: visit.hostName,
        department: visit.department,
        entryGateId: resolvedGate.id,
        entryGateName: resolvedGate.name,
      },
      performedById: user.id,
    });

    const [sanitizedVisit] = await sanitizeVisitsWithDbFlags([
      {
        ...visit,
        departmentId: updatedInvitation.departmentId,
      },
    ]);

    const remainingRows = await prisma.$queryRaw<Array<{ pendingCount: number }>>`
      SELECT COUNT(*)::int AS "pendingCount"
      FROM "guest_invitations"
      WHERE "status"::text = 'PENDING'
    `;

    return NextResponse.json({
      success: true,
      message: `${person.fullName} checked in at ${resolvedGate.name} using Card ${visit.visitorCardNo}.`,
      visit: sanitizedVisit,
      invitation: updatedInvitation,
      pendingCount: remainingRows[0]?.pendingCount ?? 0,
    });
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    if (err?.status) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          blacklisted: err.blacklisted,
          person: err.person ? sanitizePersonForClient(err.person) : undefined,
        },
        { status: err.status }
      );
    }

    console.error('Invited guest check-in error:', error);
    return NextResponse.json(
      { error: 'Failed to check in invited guest.' },
      { status: 500 }
    );
  }
}
