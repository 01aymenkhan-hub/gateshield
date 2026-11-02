import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser, getEmployeeSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createAppNotification } from '@/lib/notifications';
import { ParcelRow } from '@/app/api/employee/parcels/route';
import { ensureImageStoredAsFileUrl } from '@/lib/fileStorage';

let parcelSenderColumnsEnsured = false;

async function ensureParcelSenderColumns() {
  if (parcelSenderColumnsEnsured) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "parcels" ADD COLUMN IF NOT EXISTS "senderName" TEXT, ADD COLUMN IF NOT EXISTS "senderPhone" TEXT;`
    );
    parcelSenderColumnsEnsured = true;
  } catch (err) {
    console.warn('[Parcels] Column check warning:', err);
  }
}

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
          { error: 'Forbidden: Only authorized Gate Operators or Admins can receive or deliver parcels.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const action = typeof body.action === 'string' ? body.action.toUpperCase() : '';

    if (action !== 'RECEIVE' && action !== 'DELIVER') {
      return NextResponse.json(
        { error: 'Invalid parcel action. Expected RECEIVE or DELIVER.' },
        { status: 400 }
      );
    }

    await ensureParcelSenderColumns();

    const existingRows = await prisma.$queryRaw<ParcelRow[]>`
      SELECT
        p."id",
        p."parcelNumber",
        p."employeeId",
        p."ownerName",
        p."ownerPhone",
        p."departmentId",
        p."departmentName",
        p."senderName",
        p."senderPhone",
        p."senderPlatform",
        p."expectedArrivalDate",
        p."source"::text AS "source",
        p."status"::text AS "status",
        p."photoUrl",
        p."notes",
        p."receivingGateId",
        p."receivingGateName",
        p."receivedAt",
        p."receivedById",
        p."receivedByName",
        p."deliveryGateId",
        p."deliveryGateName",
        p."deliveredAt",
        p."deliveredById",
        p."deliveredByName",
        p."createdAt",
        p."updatedAt"
      FROM "parcels" p
      WHERE p."id" = ${id}
      LIMIT 1
    `;

    if (existingRows.length === 0) {
      return NextResponse.json({ error: 'Parcel not found.' }, { status: 404 });
    }

    const parcel = existingRows[0];

    // Resolve gate from Operator's assigned gate in DB (or requested gate if Admin/authorized)
    const requestedGateId =
      typeof body.gateId === 'string' && body.gateId.trim()
        ? body.gateId.trim()
        : typeof body.receivingGateId === 'string' && body.receivingGateId.trim()
        ? body.receivingGateId.trim()
        : typeof body.deliveryGateId === 'string' && body.deliveryGateId.trim()
        ? body.deliveryGateId.trim()
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

    const now = new Date();

    if (action === 'RECEIVE') {
      if (parcel.status !== 'EXPECTED') {
        return NextResponse.json(
          {
            error: `Cannot receive this parcel because its status is already ${parcel.status}.`,
          },
          { status: 409 }
        );
      }

      const rawPhotoUrl =
        typeof body.photoUrl === 'string' && body.photoUrl.trim()
          ? body.photoUrl.trim()
          : parcel.photoUrl;

      if (!rawPhotoUrl) {
        return NextResponse.json(
          { error: 'Please capture or upload a Parcel Photo before receiving.' },
          { status: 400 }
        );
      }

      let photoUrl: string | null = rawPhotoUrl;
      try {
        photoUrl = await ensureImageStoredAsFileUrl(rawPhotoUrl, 'parcels', 'parcel');
      } catch (imgErr: any) {
        return NextResponse.json(
          { error: imgErr?.message || 'Invalid Parcel Photo format.' },
          { status: 400 }
        );
      }

      const notes =
        typeof body.notes === 'string' && body.notes.trim()
          ? body.notes.trim()
          : parcel.notes;

      const updatedCount = await prisma.$executeRaw`
        UPDATE "parcels"
        SET
          "status" = 'RECEIVED'::"ParcelStatus",
          "photoUrl" = ${photoUrl},
          "notes" = ${notes},
          "receivingGateId" = ${gateId},
          "receivingGateName" = ${gateName},
          "receivedAt" = ${now},
          "receivedById" = ${user.id},
          "receivedByName" = ${user.name},
          "updatedAt" = ${now}
        WHERE "id" = ${id}
          AND "status"::text = 'EXPECTED'
      `;

      if (updatedCount === 0) {
        return NextResponse.json(
          { error: 'This parcel was already received by another operator.' },
          { status: 409 }
        );
      }

      // Notify Employee
      if (parcel.employeeId) {
        await createAppNotification({
          recipientUserId: parcel.employeeId,
          recipientRole: 'EMPLOYEE',
          type: 'PARCEL_RECEIVED',
          title: 'Parcel Received at Gate',
          message: `Your expected parcel from ${parcel.senderPlatform} has been received at ${gateName} by ${user.name}.`,
          parcelId: id,
          targetUrl: '/employee?section=parcels&tab=arrived',
          dedupeKey: `prc_received_${id}`,
        });
      }

      await logAudit({
        action: 'RECEIVE_EXPECTED_PARCEL',
        entityType: 'Parcel',
        entityId: id,
        details: {
          ownerName: parcel.ownerName,
          senderPlatform: parcel.senderPlatform,
          receivingGateId: gateId,
          receivingGateName: gateName,
          source: parcel.source,
          status: 'RECEIVED',
        },
        performedById: user.id,
      });

      const updatedParcel: ParcelRow = {
        ...parcel,
        status: 'RECEIVED',
        photoUrl,
        notes,
        receivingGateId: gateId,
        receivingGateName: gateName,
        receivedAt: now,
        receivedById: user.id,
        receivedByName: user.name,
        updatedAt: now,
      };

      return NextResponse.json({
        success: true,
        message: `Parcel for ${parcel.ownerName} received at ${gateName}.`,
        parcel: updatedParcel,
      });
    }

    // action === 'DELIVER'
    if (parcel.status !== 'RECEIVED') {
      return NextResponse.json(
        {
          error:
            parcel.status === 'DELIVERED'
              ? 'This parcel has already been marked as delivered.'
              : 'Only a received parcel can be marked as delivered.',
        },
        { status: 409 }
      );
    }

    const deliveryGateId = gateId || parcel.receivingGateId;
    const deliveryGateName = gateName || parcel.receivingGateName || 'Main Gate';

    const updatedCount = await prisma.$executeRaw`
      UPDATE "parcels"
      SET
        "status" = 'DELIVERED'::"ParcelStatus",
        "deliveryGateId" = ${deliveryGateId},
        "deliveryGateName" = ${deliveryGateName},
        "deliveredAt" = ${now},
        "deliveredById" = ${user.id},
        "deliveredByName" = ${user.name},
        "updatedAt" = ${now}
      WHERE "id" = ${id}
        AND "status"::text = 'RECEIVED'
    `;

    if (updatedCount === 0) {
      return NextResponse.json(
        { error: 'This parcel was already delivered.' },
        { status: 409 }
      );
    }

    if (parcel.employeeId) {
      await createAppNotification({
        recipientUserId: parcel.employeeId,
        recipientRole: 'EMPLOYEE',
        type: 'PARCEL_DELIVERED',
        title: 'Parcel Delivered',
        message: `Your parcel from ${parcel.senderPlatform} has been delivered to you from ${deliveryGateName}.`,
        parcelId: id,
        targetUrl: '/employee?section=parcels&tab=arrived',
        dedupeKey: `prc_delivered_${id}`,
      });
    }

    await logAudit({
      action: 'DELIVER_PARCEL',
      entityType: 'Parcel',
      entityId: id,
      details: {
        ownerName: parcel.ownerName,
        senderPlatform: parcel.senderPlatform,
        receivingGateName: parcel.receivingGateName,
        deliveryGateId,
        deliveryGateName,
        source: parcel.source,
        status: 'DELIVERED',
      },
      performedById: user.id,
    });

    const updatedParcel: ParcelRow = {
      ...parcel,
      status: 'DELIVERED',
      deliveryGateId,
      deliveryGateName,
      deliveredAt: now,
      deliveredById: user.id,
      deliveredByName: user.name,
      updatedAt: now,
    };

    return NextResponse.json({
      success: true,
      message: `Parcel for ${parcel.ownerName} marked as delivered.`,
      parcel: updatedParcel,
    });
  } catch (error: unknown) {
    console.error('[Parcels PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update parcel status.' },
      { status: 500 }
    );
  }
}
