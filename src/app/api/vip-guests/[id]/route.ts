import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser, getEmployeeSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createAppNotification } from '@/lib/notifications';
import { VipGuestRow } from '@/app/api/vip-guests/route';
import { ensureImageStoredAsFileUrl } from '@/lib/fileStorage';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      const empUser = await getEmployeeSessionUser();
      if (empUser) {
        return NextResponse.json(
          { error: 'Forbidden: Employees cannot modify VIP Guest records.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const action = typeof body.action === 'string' ? body.action.toUpperCase() : 'UPDATE';

    const existingRows = await prisma.$queryRaw<VipGuestRow[]>`
      SELECT
        v."id",
        v."vipName",
        v."phoneNumber",
        v."designation",
        v."vehicleNumber",
        v."plannedArrivalTime",
        v."cnicNumber",
        v."photoUrl",
        v."notes",
        v."status"::text AS "status",
        v."active",
        v."createdById",
        v."createdByName",
        v."actualCheckInTime",
        v."checkInGateId",
        v."checkInGateName",
        v."checkedInById",
        v."checkedInByName",
        v."actualCheckOutTime",
        v."checkOutGateId",
        v."checkOutGateName",
        v."checkedOutById",
        v."checkedOutByName",
        v."createdAt",
        v."updatedAt"
      FROM "vip_guests" v
      WHERE v."id" = ${id}
      LIMIT 1
    `;

    if (existingRows.length === 0) {
      return NextResponse.json({ error: 'VIP Guest not found.' }, { status: 404 });
    }

    const vip = existingRows[0];
    const now = new Date();

    // Admin-only actions: UPDATE or CANCEL
    if (action === 'UPDATE' || action === 'CANCEL') {
      if (user.role !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Forbidden: Only Administrators can edit or cancel VIP Guest records.' },
          { status: 403 }
        );
      }

      if (action === 'CANCEL') {
        await prisma.$executeRaw`
          UPDATE "vip_guests"
          SET
            "status" = 'CANCELLED'::"VipVisitStatus",
            "active" = false,
            "updatedAt" = ${now}
          WHERE "id" = ${id}
        `;

        await createAppNotification({
          recipientRole: 'OPERATOR',
          type: 'VIP_UPDATED',
          title: 'VIP Visit Cancelled',
          message: `Scheduled VIP visit for ${vip.vipName} (${vip.designation}) • Vehicle [${vip.vehicleNumber}] was cancelled by Admin.`,
          vipGuestId: id,
          targetUrl: '/vip-guests',
          dedupeKey: `vip_cancel_${id}_${now.getTime()}`,
        });

        await logAudit({
          action: 'CANCEL_VIP_GUEST',
          entityType: 'VipGuest',
          entityId: id,
          details: { vipName: vip.vipName, vehicleNumber: vip.vehicleNumber },
          performedById: user.id,
        });

        return NextResponse.json({
          success: true,
          message: `VIP visit for ${vip.vipName} cancelled.`,
        });
      }

      // action === 'UPDATE'
      const vipName =
        typeof body.vipName === 'string' && body.vipName.trim()
          ? body.vipName.trim().replace(/\s+/g, ' ')
          : vip.vipName;
      const phoneNumber =
        typeof body.phoneNumber === 'string' && body.phoneNumber.trim()
          ? body.phoneNumber.trim().replace(/[\s\-()]/g, '')
          : vip.phoneNumber;
      const designation =
        typeof body.designation === 'string' && body.designation.trim()
          ? body.designation.trim().replace(/\s+/g, ' ')
          : vip.designation;
      const vehicleNumber =
        typeof body.vehicleNumber === 'string' && body.vehicleNumber.trim()
          ? body.vehicleNumber.trim().toUpperCase().replace(/\s+/g, ' ')
          : vip.vehicleNumber;
      const plannedArrivalTime =
        typeof body.plannedArrivalTime === 'string' && body.plannedArrivalTime.trim()
          ? new Date(body.plannedArrivalTime.trim())
          : new Date(vip.plannedArrivalTime);
      const cnicNumber =
        body.cnicNumber !== undefined
          ? typeof body.cnicNumber === 'string' && body.cnicNumber.trim()
            ? body.cnicNumber.trim()
            : null
          : vip.cnicNumber;
      const rawPhotoUrl =
        body.photoUrl !== undefined
          ? typeof body.photoUrl === 'string' && body.photoUrl.trim()
            ? body.photoUrl.trim()
            : null
          : vip.photoUrl;
      let photoUrl: string | null = rawPhotoUrl;
      if (rawPhotoUrl) {
        try {
          photoUrl = await ensureImageStoredAsFileUrl(rawPhotoUrl, 'vip', 'vip');
        } catch (imgErr: any) {
          return NextResponse.json(
            { error: imgErr?.message || 'Invalid VIP Guest photo format.' },
            { status: 400 }
          );
        }
      }
      const notes =
        body.notes !== undefined
          ? typeof body.notes === 'string' && body.notes.trim()
            ? body.notes.trim()
            : null
          : vip.notes;
      const active =
        typeof body.active === 'boolean' ? body.active : vip.active;
      const nextStatus =
        typeof body.status === 'string' &&
        ['UPCOMING', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'].includes(
          body.status.toUpperCase()
        )
          ? body.status.toUpperCase()
          : vip.status;

      const plannedArrivalIso = plannedArrivalTime.toISOString();

      await prisma.$executeRaw`
        UPDATE "vip_guests"
        SET
          "vipName" = ${vipName},
          "phoneNumber" = ${phoneNumber},
          "designation" = ${designation},
          "vehicleNumber" = ${vehicleNumber},
          "plannedArrivalTime" = ${plannedArrivalIso},
          "cnicNumber" = ${cnicNumber},
          "photoUrl" = ${photoUrl},
          "notes" = ${notes},
          "active" = ${active},
          "status" = ${nextStatus}::"VipVisitStatus",
          "updatedAt" = ${now}
        WHERE "id" = ${id}
      `;

      const formattedArrival = plannedArrivalTime.toLocaleString('en-PK', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      await createAppNotification({
        recipientRole: 'OPERATOR',
        type: 'VIP_UPDATED',
        title: 'VIP Guest Details Updated',
        message: `VIP Guest ${vipName} (${designation}) • Vehicle [${vehicleNumber}] arrival updated (${formattedArrival}).`,
        vipGuestId: id,
        targetUrl: '/vip-guests',
        dedupeKey: `vip_updated_${id}_${now.getTime()}`,
      });

      await logAudit({
        action: 'UPDATE_VIP_GUEST',
        entityType: 'VipGuest',
        entityId: id,
        details: {
          vipName,
          designation,
          vehicleNumber,
          plannedArrivalTime,
          active,
          status: nextStatus,
        },
        performedById: user.id,
      });

      const updatedVip: VipGuestRow = {
        ...vip,
        vipName,
        phoneNumber,
        designation,
        vehicleNumber,
        plannedArrivalTime,
        cnicNumber,
        photoUrl,
        notes,
        active,
        status: nextStatus as VipGuestRow['status'],
        updatedAt: now,
      };

      return NextResponse.json({
        success: true,
        message: `VIP Guest ${vipName} updated and notified to all Operator gates.`,
        vipGuest: updatedVip,
      });
    }

    // Operator / Admin Gate Actions: CHECK_IN and CHECK_OUT
    if (action !== 'CHECK_IN' && action !== 'CHECK_OUT') {
      return NextResponse.json(
        { error: 'Invalid VIP action. Expected CHECK_IN, CHECK_OUT, UPDATE, or CANCEL.' },
        { status: 400 }
      );
    }

    const requestedGateId =
      typeof body.gateId === 'string' && body.gateId.trim()
        ? body.gateId.trim()
        : null;

    let gateId: string | null = null;
    let gateName = 'Main Gate';

    const assignedAccess = await prisma.userGateAccess.findMany({
      where: { userId: user.id },
      include: {
        gate: { select: { id: true, name: true, active: true } },
      },
      orderBy: { gate: { name: 'asc' } },
    });
    const activeAssignedGates = assignedAccess
      .map((ga) => ga.gate)
      .filter((g) => g.active);

    if (user.role === 'OPERATOR' && activeAssignedGates.length > 0) {
      const matchedAssigned = requestedGateId
        ? activeAssignedGates.find((g) => g.id === requestedGateId)
        : null;
      const chosen = matchedAssigned || activeAssignedGates[0];
      gateId = chosen.id;
      gateName = chosen.name;
    } else if (requestedGateId) {
      const g = await prisma.gate.findUnique({
        where: { id: requestedGateId },
        select: { id: true, name: true },
      });
      if (g) {
        gateId = g.id;
        gateName = g.name;
      }
    }

    if (!gateId) {
      if (user.gateIds && user.gateIds.length > 0) {
        const assignedGate = await prisma.gate.findFirst({
          where: { id: { in: user.gateIds }, active: true },
          select: { id: true, name: true },
        });
        if (assignedGate) {
          gateId = assignedGate.id;
          gateName = assignedGate.name;
        }
      }
      if (!gateId) {
        const fallbackGate = await prisma.gate.findFirst({
          where: { active: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        if (fallbackGate) {
          gateId = fallbackGate.id;
          gateName = fallbackGate.name;
        }
      }
    }

    if (action === 'CHECK_IN') {
      if (vip.status !== 'UPCOMING') {
        return NextResponse.json(
          {
            error: `Cannot check in VIP Guest because status is already ${vip.status}.`,
          },
          { status: 409 }
        );
      }

      const updatedCount = await prisma.$executeRaw`
        UPDATE "vip_guests"
        SET
          "status" = 'CHECKED_IN'::"VipVisitStatus",
          "actualCheckInTime" = ${now},
          "checkInGateId" = ${gateId},
          "checkInGateName" = ${gateName},
          "checkedInById" = ${user.id},
          "checkedInByName" = ${user.name},
          "updatedAt" = ${now}
        WHERE "id" = ${id}
          AND "status"::text = 'UPCOMING'
      `;

      if (updatedCount === 0) {
        return NextResponse.json(
          { error: 'VIP Guest was already checked in.' },
          { status: 409 }
        );
      }

      await createAppNotification({
        recipientRole: 'ADMIN',
        type: 'VIP_CHECKED_IN',
        title: 'VIP Guest Checked In',
        message: `VIP Guest ${vip.vipName} (${vip.designation}) • Vehicle [${vip.vehicleNumber}] checked in at ${gateName} by ${user.name}.`,
        vipGuestId: id,
        targetUrl: '/vip-guests',
        dedupeKey: `vip_checkin_${id}_${now.getTime()}`,
      });

      await logAudit({
        action: 'VIP_GUEST_CHECK_IN',
        entityType: 'VipGuest',
        entityId: id,
        details: {
          vipName: vip.vipName,
          designation: vip.designation,
          vehicleNumber: vip.vehicleNumber,
          checkInGateId: gateId,
          checkInGateName: gateName,
          checkedInBy: user.name,
          noVisitorCardIssued: true,
        },
        performedById: user.id,
      });

      const updatedVip: VipGuestRow = {
        ...vip,
        status: 'CHECKED_IN',
        actualCheckInTime: now,
        checkInGateId: gateId,
        checkInGateName: gateName,
        checkedInById: user.id,
        checkedInByName: user.name,
        updatedAt: now,
      };

      return NextResponse.json({
        success: true,
        message: `VIP Guest ${vip.vipName} (${vip.vehicleNumber}) checked in at ${gateName}.`,
        vipGuest: updatedVip,
      });
    }

    // action === 'CHECK_OUT'
    if (vip.status !== 'CHECKED_IN') {
      return NextResponse.json(
        {
          error:
            vip.status === 'CHECKED_OUT'
              ? 'VIP Guest has already been checked out.'
              : 'Only a checked-in VIP Guest can be checked out.',
        },
        { status: 409 }
      );
    }

    const checkOutGateId = gateId || vip.checkInGateId;
    const checkOutGateName = gateName || vip.checkInGateName || 'Main Gate';

    const updatedCount = await prisma.$executeRaw`
      UPDATE "vip_guests"
      SET
        "status" = 'CHECKED_OUT'::"VipVisitStatus",
        "actualCheckOutTime" = ${now},
        "checkOutGateId" = ${checkOutGateId},
        "checkOutGateName" = ${checkOutGateName},
        "checkedOutById" = ${user.id},
        "checkedOutByName" = ${user.name},
        "updatedAt" = ${now}
      WHERE "id" = ${id}
        AND "status"::text = 'CHECKED_IN'
    `;

    if (updatedCount === 0) {
      return NextResponse.json(
        { error: 'VIP Guest was already checked out.' },
        { status: 409 }
      );
    }

    await createAppNotification({
      recipientRole: 'ADMIN',
      type: 'VIP_CHECKED_OUT',
      title: 'VIP Guest Checked Out',
      message: `VIP Guest ${vip.vipName} (${vip.designation}) • Vehicle [${vip.vehicleNumber}] checked out from ${checkOutGateName} by ${user.name}.`,
      vipGuestId: id,
      targetUrl: '/vip-guests',
      dedupeKey: `vip_checkout_${id}_${now.getTime()}`,
    });

    await logAudit({
      action: 'VIP_GUEST_CHECK_OUT',
      entityType: 'VipGuest',
      entityId: id,
      details: {
        vipName: vip.vipName,
        designation: vip.designation,
        vehicleNumber: vip.vehicleNumber,
        checkOutGateId,
        checkOutGateName,
        checkedOutBy: user.name,
      },
      performedById: user.id,
    });

    const updatedVip: VipGuestRow = {
      ...vip,
      status: 'CHECKED_OUT',
      actualCheckOutTime: now,
      checkOutGateId,
      checkOutGateName,
      checkedOutById: user.id,
      checkedOutByName: user.name,
      updatedAt: now,
    };

    return NextResponse.json({
      success: true,
      message: `VIP Guest ${vip.vipName} (${vip.vehicleNumber}) checked out from ${checkOutGateName}.`,
      vipGuest: updatedVip,
    });
  } catch (error: unknown) {
    console.error('[VIP Guests PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update VIP Guest status.' },
      { status: 500 }
    );
  }
}
