import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
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

function cleanAndValidatePhone(raw: string): { valid: boolean; cleaned: string } {
  const cleaned = raw.trim().replace(/[\s\-()]+/g, '');
  if (!cleaned) {
    return { valid: false, cleaned: '' };
  }
  const isPakLocal = /^03\d{9}$/.test(cleaned);
  const isInternational = /^\+?[1-9]\d{9,14}$/.test(cleaned);
  return {
    valid: isPakLocal || isInternational,
    cleaned,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      const empUser = await getEmployeeSessionUser();
      if (empUser) {
        return NextResponse.json(
          { error: 'Forbidden: Employees must use /api/employee/parcels.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureParcelSenderColumns();

    const { searchParams } = new URL(request.url);
    const statusFilter = (searchParams.get('status') || 'ALL').toUpperCase();
    const sourceFilter = (searchParams.get('source') || 'ALL').toUpperCase();
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const includeEmployees = searchParams.get('includeEmployees') === 'true';

    const allParcels = await prisma.$queryRaw<ParcelRow[]>`
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
      ORDER BY
        CASE WHEN p."status"::text = 'EXPECTED' THEN 0
             WHEN p."status"::text = 'RECEIVED' THEN 1
             ELSE 2
        END ASC,
        COALESCE(p."receivedAt", p."createdAt") DESC
    `;

    const expectedCount = allParcels.filter((p) => p.status === 'EXPECTED').length;
    const receivedCount = allParcels.filter((p) => p.status === 'RECEIVED').length;
    const deliveredCount = allParcels.filter((p) => p.status === 'DELIVERED').length;

    let filtered = allParcels;

    if (statusFilter !== 'ALL' && ['EXPECTED', 'RECEIVED', 'DELIVERED'].includes(statusFilter)) {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }

    if (sourceFilter !== 'ALL' && ['EXPECTED', 'UNEXPECTED'].includes(sourceFilter)) {
      filtered = filtered.filter((p) => p.source === sourceFilter);
    }

    if (search) {
      filtered = filtered.filter(
        (p) =>
          p.ownerName.toLowerCase().includes(search) ||
          p.ownerPhone.toLowerCase().includes(search) ||
          p.departmentName.toLowerCase().includes(search) ||
          (p.senderName && p.senderName.toLowerCase().includes(search)) ||
          (p.senderPhone && p.senderPhone.toLowerCase().includes(search)) ||
          p.senderPlatform.toLowerCase().includes(search) ||
          (p.receivingGateName && p.receivingGateName.toLowerCase().includes(search)) ||
          (p.deliveryGateName && p.deliveryGateName.toLowerCase().includes(search)) ||
          (p.notes && p.notes.toLowerCase().includes(search))
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

    let employees: Array<{
      id: string;
      name: string;
      phoneNumber: string | null;
      departmentId: string | null;
      departmentName: string | null;
      position: string | null;
    }> = [];

    if (includeEmployees) {
      employees = await prisma.$queryRaw<
        Array<{
          id: string;
          name: string;
          phoneNumber: string | null;
          departmentId: string | null;
          departmentName: string | null;
          position: string | null;
        }>
      >`
        SELECT
          u."id",
          u."name",
          u."phoneNumber",
          u."departmentId",
          COALESCE(d."name", u."departmentName") AS "departmentName",
          u."position"
        FROM "users" u
        LEFT JOIN "departments" d ON d."id" = u."departmentId"
        WHERE u."role"::text = 'EMPLOYEE'
          AND COALESCE(u."approvalStatus"::text, 'PENDING') = 'APPROVED'
          AND u."active" = true
        ORDER BY u."name" ASC
      `;
    }

    return NextResponse.json({
      success: true,
      parcels: filtered,
      counts: {
        expectedCount,
        receivedCount,
        deliveredCount,
        totalCount: allParcels.length,
      },
      gates,
      employees: includeEmployees ? employees : undefined,
    });
  } catch (error: unknown) {
    console.error('[Parcels GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load parcels.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/parcels
 * Registers an Unexpected Parcel (Operator Dashboard -> Register -> Parcel)
 * Immediately marks status = 'RECEIVED' and source = 'UNEXPECTED'.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      const empUser = await getEmployeeSessionUser();
      if (empUser) {
        return NextResponse.json(
          { error: 'Forbidden: Employees cannot register gate receipt of parcels.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureParcelSenderColumns();

    const body = await request.json();
    const senderNameInput =
      typeof body.senderName === 'string'
        ? body.senderName.trim().replace(/\s+/g, ' ')
        : '';
    const rawSenderPhone =
      typeof body.senderPhone === 'string' ? body.senderPhone.trim() : '';
    const ownerNameInput =
      typeof body.ownerName === 'string'
        ? body.ownerName.trim().replace(/\s+/g, ' ')
        : typeof body.employeeName === 'string'
        ? body.employeeName.trim().replace(/\s+/g, ' ')
        : '';
    const rawPhone =
      typeof body.ownerPhone === 'string'
        ? body.ownerPhone.trim()
        : typeof body.employeePhone === 'string'
        ? body.employeePhone.trim()
        : '';
    const departmentIdInput =
      typeof body.departmentId === 'string' ? body.departmentId.trim() : '';
    const departmentNameInput =
      typeof body.departmentName === 'string'
        ? body.departmentName.trim()
        : typeof body.department === 'string'
        ? body.department.trim()
        : '';
    const senderPlatform =
      typeof body.senderPlatform === 'string'
        ? body.senderPlatform.trim().replace(/\s+/g, ' ')
        : '';
    const photoUrl =
      typeof body.photoUrl === 'string' && body.photoUrl.trim()
        ? body.photoUrl.trim()
        : null;
    const notes =
      typeof body.notes === 'string' && body.notes.trim()
        ? body.notes.trim()
        : null;
    const explicitEmployeeId =
      typeof body.employeeId === 'string' && body.employeeId.trim()
        ? body.employeeId.trim()
        : null;

    // 1. Validate the 5 top fields in exact order:
    // (1) Parcel Sender Name
    if (!senderNameInput) {
      return NextResponse.json(
        { error: 'Parcel Sender Name is required.', field: 'senderName' },
        { status: 400 }
      );
    }

    // (2) Parcel Sender Phone Number
    const senderPhoneCheck = cleanAndValidatePhone(rawSenderPhone);
    if (!senderPhoneCheck.valid) {
      return NextResponse.json(
        {
          error:
            'Please enter a valid Parcel Sender Phone Number (e.g., 03001234567).',
          field: 'senderPhone',
        },
        { status: 400 }
      );
    }
    const cleanedSenderPhone = senderPhoneCheck.cleaned;

    // (3) Employee Name
    if (!ownerNameInput) {
      return NextResponse.json(
        { error: 'Employee Name is required.', field: 'ownerName' },
        { status: 400 }
      );
    }

    // (4) Employee Phone Number
    const ownerPhoneCheck = cleanAndValidatePhone(rawPhone);
    if (!ownerPhoneCheck.valid) {
      return NextResponse.json(
        {
          error:
            'Please enter a valid Employee Phone Number (e.g., 03001234567).',
          field: 'ownerPhone',
        },
        { status: 400 }
      );
    }
    const cleanedPhone = ownerPhoneCheck.cleaned;

    // (5) Employee Department — Validate against departments configured in Admin Panel
    let resolvedDeptId: string | null = null;
    let resolvedDeptName = '';

    if (departmentIdInput) {
      const deptRows = await prisma.$queryRaw<
        Array<{ id: string; name: string }>
      >`
        SELECT "id", "name"
        FROM "departments"
        WHERE "id" = ${departmentIdInput}
          AND "active" = true
        LIMIT 1
      `;
      if (deptRows.length > 0) {
        resolvedDeptId = deptRows[0].id;
        resolvedDeptName = deptRows[0].name;
      }
    }

    if (!resolvedDeptName && departmentNameInput) {
      const normalized = departmentNameInput.toLowerCase().replace(/\s+/g, ' ');
      const deptRows = await prisma.$queryRaw<
        Array<{ id: string; name: string }>
      >`
        SELECT "id", "name"
        FROM "departments"
        WHERE "normalizedName" = ${normalized}
          AND "active" = true
        LIMIT 1
      `;
      if (deptRows.length > 0) {
        resolvedDeptId = deptRows[0].id;
        resolvedDeptName = deptRows[0].name;
      }
    }

    if (!resolvedDeptId || !resolvedDeptName) {
      return NextResponse.json(
        {
          error: 'Please select a valid Employee Department.',
          field: 'departmentId',
        },
        { status: 400 }
      );
    }

    // (6) Parcel From
    if (!senderPlatform) {
      return NextResponse.json(
        {
          error: 'Parcel From is required.',
          field: 'senderPlatform',
        },
        { status: 400 }
      );
    }

    // (7) Parcel Photo
    if (!photoUrl) {
      return NextResponse.json(
        { error: 'Please capture a Parcel Photo.', field: 'photoUrl' },
        { status: 400 }
      );
    }

    let storedPhotoUrl: string | null = null;
    try {
      storedPhotoUrl = await ensureImageStoredAsFileUrl(photoUrl, 'parcels', 'parcel');
    } catch (imgErr: any) {
      return NextResponse.json(
        { error: imgErr?.message || 'Invalid Parcel Photo format.', field: 'photoUrl' },
        { status: 400 }
      );
    }

    // Optional Employee account matching (for in-app notification & Employee Portal linkage)
    interface EmployeeProfileRow {
      id: string;
      name: string;
    }

    let matchedEmployee: EmployeeProfileRow | null = null;

    if (explicitEmployeeId) {
      const empRows = await prisma.$queryRaw<EmployeeProfileRow[]>`
        SELECT u."id", u."name"
        FROM "users" u
        WHERE u."id" = ${explicitEmployeeId}
          AND u."role"::text = 'EMPLOYEE'
          AND COALESCE(u."approvalStatus"::text, 'PENDING') = 'APPROVED'
          AND u."active" = true
        LIMIT 1
      `;
      if (empRows.length > 0) {
        matchedEmployee = empRows[0];
      }
    }

    if (!matchedEmployee) {
      const empRows = await prisma.$queryRaw<EmployeeProfileRow[]>`
        SELECT u."id", u."name"
        FROM "users" u
        WHERE u."role"::text = 'EMPLOYEE'
          AND COALESCE(u."approvalStatus"::text, 'PENDING') = 'APPROVED'
          AND u."active" = true
          AND (
            u."phoneNumber" = ${cleanedPhone}
            OR LOWER(u."name") = ${ownerNameInput.toLowerCase()}
          )
        ORDER BY CASE WHEN u."phoneNumber" = ${cleanedPhone} THEN 0 ELSE 1 END ASC
        LIMIT 1
      `;
      if (empRows.length > 0) {
        matchedEmployee = empRows[0];
      }
    }

    const resolvedEmployeeId = matchedEmployee ? matchedEmployee.id : null;
    const ownerName = ownerNameInput;

    // 3. Automatically resolve Receiving Gate from the authenticated Operator's assigned gate on the server
    // Never allow the frontend to override an Operator's assigned gate.
    let receivingGateId: string | null = null;
    let receivingGateName = 'Main Gate';

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

    if (activeAssignedGates.length > 0) {
      receivingGateId = activeAssignedGates[0].id;
      receivingGateName = activeAssignedGates[0].name;
    } else if (user.gateIds && user.gateIds.length > 0) {
      const assignedGate = await prisma.gate.findFirst({
        where: { id: { in: user.gateIds }, active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      if (assignedGate) {
        receivingGateId = assignedGate.id;
        receivingGateName = assignedGate.name;
      }
    }

    if (!receivingGateId) {
      const fallbackGate = await prisma.gate.findFirst({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      if (fallbackGate) {
        receivingGateId = fallbackGate.id;
        receivingGateName = fallbackGate.name;
      }
    }

    const newId = `prc_${crypto.randomBytes(12).toString('hex')}`;
    const now = new Date();
    const dateStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const parcelNumber = `PRC-${dateStamp}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    await prisma.$executeRaw`
      INSERT INTO "parcels" (
        "id",
        "parcelNumber",
        "employeeId",
        "ownerName",
        "ownerPhone",
        "departmentId",
        "departmentName",
        "senderName",
        "senderPhone",
        "senderPlatform",
        "source",
        "status",
        "photoUrl",
        "notes",
        "receivingGateId",
        "receivingGateName",
        "receivedAt",
        "receivedById",
        "receivedByName",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${newId},
        ${parcelNumber},
        ${resolvedEmployeeId},
        ${ownerName},
        ${cleanedPhone},
        ${resolvedDeptId},
        ${resolvedDeptName},
        ${senderNameInput},
        ${cleanedSenderPhone},
        ${senderPlatform},
        'UNEXPECTED'::"ParcelSource",
        'RECEIVED'::"ParcelStatus",
        ${storedPhotoUrl},
        ${notes},
        ${receivingGateId},
        ${receivingGateName},
        ${now},
        ${user.id},
        ${user.name},
        ${now},
        ${now}
      )
    `;

    // Notify Employee if matched
    if (resolvedEmployeeId) {
      await createAppNotification({
        recipientUserId: resolvedEmployeeId,
        recipientRole: 'EMPLOYEE',
        type: 'PARCEL_RECEIVED',
        title: 'Parcel Received at Gate',
        message: `Your parcel from ${senderPlatform} (Sender: ${senderNameInput}) has been received at ${receivingGateName} by ${user.name}.`,
        parcelId: newId,
        targetUrl: '/employee?section=parcels&tab=arrived',
        dedupeKey: `prc_received_${newId}`,
      });
    }

    await logAudit({
      action: 'REGISTER_UNEXPECTED_PARCEL',
      entityType: 'Parcel',
      entityId: newId,
      details: {
        parcelNumber,
        senderName: senderNameInput,
        senderPhone: cleanedSenderPhone,
        ownerName,
        ownerPhone: cleanedPhone,
        departmentId: resolvedDeptId,
        departmentName: resolvedDeptName,
        senderPlatform,
        receivingGateId,
        receivingGateName,
        source: 'UNEXPECTED',
        status: 'RECEIVED',
        employeeId: resolvedEmployeeId,
      },
      performedById: user.id,
    });

    const createdParcel: ParcelRow = {
      id: newId,
      parcelNumber,
      employeeId: resolvedEmployeeId,
      ownerName,
      ownerPhone: cleanedPhone,
      departmentId: resolvedDeptId,
      departmentName: resolvedDeptName,
      senderName: senderNameInput,
      senderPhone: cleanedSenderPhone,
      senderPlatform,
      expectedArrivalDate: null,
      source: 'UNEXPECTED',
      status: 'RECEIVED',
      photoUrl: storedPhotoUrl,
      notes,
      receivingGateId,
      receivingGateName,
      receivedAt: now,
      receivedById: user.id,
      receivedByName: user.name,
      deliveryGateId: null,
      deliveryGateName: null,
      deliveredAt: null,
      deliveredById: null,
      deliveredByName: null,
      createdAt: now,
      updatedAt: now,
    };

    return NextResponse.json(
      {
        success: true,
        message: `Unexpected parcel for ${ownerName} received at ${receivingGateName}.`,
        parcel: createdParcel,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('[Parcels POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to register and receive parcel.' },
      { status: 500 }
    );
  }
}
