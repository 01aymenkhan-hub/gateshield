import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { getSessionUser, getEmployeeSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createAppNotification } from '@/lib/notifications';
import { ensureImageStoredAsFileUrl } from '@/lib/fileStorage';

export interface VipGuestRow {
  id: string;
  vipName: string;
  phoneNumber: string;
  designation: string;
  vehicleNumber: string;
  plannedArrivalTime: Date | string;
  cnicNumber: string | null;
  photoUrl: string | null;
  notes: string | null;
  status: 'UPCOMING' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';
  active: boolean;
  createdById: string;
  createdByName: string;
  actualCheckInTime: Date | null;
  checkInGateId: string | null;
  checkInGateName: string | null;
  checkedInById: string | null;
  checkedInByName: string | null;
  actualCheckOutTime: Date | null;
  checkOutGateId: string | null;
  checkOutGateName: string | null;
  checkedOutById: string | null;
  checkedOutByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      const empUser = await getEmployeeSessionUser();
      if (empUser) {
        return NextResponse.json(
          { error: 'Forbidden: Employees cannot access VIP Guest Management.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = (searchParams.get('status') || 'ALL').toUpperCase();
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const includeCancelled = searchParams.get('includeCancelled') === 'true';

    const allVips = await prisma.$queryRaw<VipGuestRow[]>`
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
      ORDER BY
        CASE WHEN v."status"::text = 'UPCOMING' THEN 0
             WHEN v."status"::text = 'CHECKED_IN' THEN 1
             WHEN v."status"::text = 'CHECKED_OUT' THEN 2
             ELSE 3
        END ASC,
        v."plannedArrivalTime" ASC
    `;

    const activeVips = includeCancelled
      ? allVips
      : allVips.filter((v) => v.active && v.status !== 'CANCELLED');

    const upcomingCount = allVips.filter(
      (v) => v.active && v.status === 'UPCOMING'
    ).length;
    const checkedInCount = allVips.filter(
      (v) => v.active && v.status === 'CHECKED_IN'
    ).length;
    const checkedOutCount = allVips.filter(
      (v) => v.active && v.status === 'CHECKED_OUT'
    ).length;

    let filtered = activeVips;

    if (
      statusFilter !== 'ALL' &&
      ['UPCOMING', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'].includes(statusFilter)
    ) {
      filtered = allVips.filter((v) => v.status === statusFilter);
    }

    if (search) {
      filtered = filtered.filter(
        (v) =>
          v.vipName.toLowerCase().includes(search) ||
          v.vehicleNumber.toLowerCase().includes(search) ||
          v.vehicleNumber.replace(/[\s\-]/g, '').toLowerCase().includes(search.replace(/[\s\-]/g, '')) ||
          v.designation.toLowerCase().includes(search) ||
          v.phoneNumber.toLowerCase().includes(search)
      );
    }

    // Fetch operator's authorized gates (or all active gates for Admin)
    let gates: Array<{ id: string; name: string; type: string }> = [];
    if (user.role === 'ADMIN') {
      gates = await prisma.gate.findMany({
        where: { active: true },
        select: { id: true, name: true, type: true },
        orderBy: { name: 'asc' },
      });
    } else {
      const assigned = await prisma.userGateAccess.findMany({
        where: { userId: user.id },
        include: {
          gate: { select: { id: true, name: true, type: true, active: true } },
        },
      });
      gates = assigned
        .filter((ga) => ga.gate.active)
        .map((ga) => ({
          id: ga.gate.id,
          name: ga.gate.name,
          type: ga.gate.type,
        }));
      if (gates.length === 0) {
        gates = await prisma.gate.findMany({
          where: { active: true },
          select: { id: true, name: true, type: true },
          orderBy: { name: 'asc' },
        });
      }
    }

    return NextResponse.json({
      success: true,
      vipGuests: filtered,
      counts: {
        upcomingCount,
        checkedInCount,
        checkedOutCount,
        totalCount: activeVips.length,
      },
      gates,
    });
  } catch (error: unknown) {
    console.error('[VIP Guests GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load VIP Guest list.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      const empUser = await getEmployeeSessionUser();
      if (empUser) {
        return NextResponse.json(
          { error: 'Forbidden: Only Administrators can create VIP Guests.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Strict server-side RBAC: Only ADMIN can create VIP guests
    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Only Administrators can create VIP Guests or assign VIP status.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const vipName =
      typeof body.vipName === 'string'
        ? body.vipName.trim().replace(/\s+/g, ' ')
        : '';
    const rawPhone =
      typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
    const designation =
      typeof body.designation === 'string'
        ? body.designation.trim().replace(/\s+/g, ' ')
        : '';
    const vehicleNumber =
      typeof body.vehicleNumber === 'string'
        ? body.vehicleNumber.trim().toUpperCase().replace(/\s+/g, ' ')
        : '';
    const plannedArrivalRaw =
      typeof body.plannedArrivalTime === 'string'
        ? body.plannedArrivalTime.trim()
        : '';
    const cnicNumber =
      typeof body.cnicNumber === 'string' && body.cnicNumber.trim()
        ? body.cnicNumber.trim()
        : null;
    const photoUrl =
      typeof body.photoUrl === 'string' && body.photoUrl.trim()
        ? body.photoUrl.trim()
        : null;
    const notes =
      typeof body.notes === 'string' && body.notes.trim()
        ? body.notes.trim()
        : null;

    if (!vipName) {
      return NextResponse.json(
        { error: 'VIP Name is required.' },
        { status: 400 }
      );
    }

    const cleanedPhone = rawPhone.replace(/[\s\-()]/g, '');
    if (!cleanedPhone || cleanedPhone.length < 10 || cleanedPhone.length > 15) {
      return NextResponse.json(
        { error: 'Please enter a valid Phone Number (e.g., 03001234567).' },
        { status: 400 }
      );
    }

    if (!designation) {
      return NextResponse.json(
        { error: 'Designation is required.' },
        { status: 400 }
      );
    }

    if (!vehicleNumber) {
      return NextResponse.json(
        { error: 'Vehicle Number is required for gate verification.' },
        { status: 400 }
      );
    }

    if (!plannedArrivalRaw) {
      return NextResponse.json(
        { error: 'Planned Arrival Time is required.' },
        { status: 400 }
      );
    }

    const plannedArrivalTime = new Date(plannedArrivalRaw);
    if (isNaN(plannedArrivalTime.getTime())) {
      return NextResponse.json(
        { error: 'Please enter a valid Planned Arrival Time.' },
        { status: 400 }
      );
    }

    const newId = `vip_${crypto.randomBytes(12).toString('hex')}`;
    const now = new Date();
    const plannedArrivalIso = plannedArrivalTime.toISOString();
    let storedPhotoUrl: string | null = photoUrl;
    if (photoUrl) {
      try {
        storedPhotoUrl = await ensureImageStoredAsFileUrl(photoUrl, 'vip', 'vip');
      } catch (imgErr: any) {
        return NextResponse.json(
          { error: imgErr?.message || 'Invalid VIP Guest photo format.' },
          { status: 400 }
        );
      }
    }

    await prisma.$executeRaw`
      INSERT INTO "vip_guests" (
        "id",
        "vipName",
        "phoneNumber",
        "designation",
        "vehicleNumber",
        "plannedArrivalTime",
        "cnicNumber",
        "photoUrl",
        "notes",
        "status",
        "active",
        "createdById",
        "createdByName",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${newId},
        ${vipName},
        ${cleanedPhone},
        ${designation},
        ${vehicleNumber},
        ${plannedArrivalIso},
        ${cnicNumber},
        ${storedPhotoUrl},
        ${notes},
        'UPCOMING'::"VipVisitStatus",
        true,
        ${user.id},
        ${user.name},
        ${now},
        ${now}
      )
    `;

    // Notify all Operator gates (never expose full CNIC in notification text)
    const formattedArrival = plannedArrivalTime.toLocaleString('en-PK', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    await createAppNotification({
      recipientRole: 'OPERATOR',
      type: 'VIP_ADDED',
      title: 'New VIP Guest Scheduled',
      message: `VIP Guest ${vipName} (${designation}) • Vehicle [${vehicleNumber}] scheduled for arrival at ${formattedArrival}.`,
      vipGuestId: newId,
      targetUrl: '/vip-guests',
      dedupeKey: `vip_added_${newId}`,
    });

    await logAudit({
      action: 'CREATE_VIP_GUEST',
      entityType: 'VipGuest',
      entityId: newId,
      details: {
        vipName,
        designation,
        vehicleNumber,
        plannedArrivalTime,
        hasCnic: Boolean(cnicNumber),
        hasPhoto: Boolean(photoUrl),
      },
      performedById: user.id,
    });

    const createdVip: VipGuestRow = {
      id: newId,
      vipName,
      phoneNumber: cleanedPhone,
      designation,
      vehicleNumber,
      plannedArrivalTime,
      cnicNumber,
      photoUrl: storedPhotoUrl,
      notes,
      status: 'UPCOMING',
      active: true,
      createdById: user.id,
      createdByName: user.name,
      actualCheckInTime: null,
      checkInGateId: null,
      checkInGateName: null,
      checkedInById: null,
      checkedInByName: null,
      actualCheckOutTime: null,
      checkOutGateId: null,
      checkOutGateName: null,
      checkedOutById: null,
      checkedOutByName: null,
      createdAt: now,
      updatedAt: now,
    };

    return NextResponse.json(
      {
        success: true,
        message: `VIP Guest ${vipName} (${vehicleNumber}) added and notified to all Operator gates.`,
        vipGuest: createdVip,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('[VIP Guests POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create VIP Guest.' },
      { status: 500 }
    );
  }
}
