import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { getEmployeeSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createAppNotification } from '@/lib/notifications';

export interface ParcelRow {
  id: string;
  parcelNumber?: string;
  employeeId: string | null;
  ownerName: string;
  ownerPhone: string;
  departmentId: string | null;
  departmentName: string;
  senderName?: string | null;
  senderPhone?: string | null;
  senderPlatform: string;
  expectedArrivalDate: Date | string | null;
  source: 'EXPECTED' | 'UNEXPECTED';
  status: 'EXPECTED' | 'RECEIVED' | 'DELIVERED';
  photoUrl: string | null;
  notes: string | null;
  receivingGateId: string | null;
  receivingGateName: string | null;
  receivedAt: Date | null;
  receivedById: string | null;
  receivedByName: string | null;
  deliveryGateId: string | null;
  deliveryGateName: string | null;
  deliveredAt: Date | null;
  deliveredById: string | null;
  deliveredByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

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

export async function GET() {
  try {
    const emp = await getEmployeeSessionUser();
    if (!emp) {
      return NextResponse.json(
        { error: 'Unauthorized: Employee login required.' },
        { status: 401 }
      );
    }

    if (emp.approvalStatus !== 'APPROVED' || !emp.active) {
      return NextResponse.json(
        { error: 'Forbidden: Approved and active employee account required.' },
        { status: 403 }
      );
    }

    await ensureParcelSenderColumns();

    // Strict horizontal privilege isolation: ONLY parcels belonging to this logged-in employee
    const parcels = await prisma.$queryRaw<ParcelRow[]>`
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
      WHERE p."employeeId" = ${emp.id}
      ORDER BY p."createdAt" DESC
    `;

    const expectedCount = parcels.filter((p) => p.status === 'EXPECTED').length;
    const receivedCount = parcels.filter((p) => p.status === 'RECEIVED').length;
    const deliveredCount = parcels.filter((p) => p.status === 'DELIVERED').length;

    return NextResponse.json({
      success: true,
      parcels,
      counts: {
        expectedCount,
        receivedCount,
        deliveredCount,
        totalCount: parcels.length,
      },
    });
  } catch (error: unknown) {
    console.error('[Employee Parcels GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load parcel records.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const emp = await getEmployeeSessionUser();
    if (!emp) {
      return NextResponse.json(
        { error: 'Unauthorized: Employee login required.' },
        { status: 401 }
      );
    }

    if (emp.approvalStatus !== 'APPROVED' || !emp.active) {
      return NextResponse.json(
        { error: 'Forbidden: Approved and active employee account required.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const ownerName =
      typeof body.ownerName === 'string' && body.ownerName.trim()
        ? body.ownerName.trim().replace(/\s+/g, ' ')
        : emp.name;
    const senderPlatform =
      typeof body.senderPlatform === 'string'
        ? body.senderPlatform.trim().replace(/\s+/g, ' ')
        : '';
    const expectedArrivalDateRaw =
      typeof body.expectedArrivalDate === 'string'
        ? body.expectedArrivalDate.trim()
        : '';
    const rawPhone =
      typeof body.ownerPhone === 'string' && body.ownerPhone.trim()
        ? body.ownerPhone.trim()
        : emp.phoneNumber || '';
    const notes =
      typeof body.notes === 'string' && body.notes.trim()
        ? body.notes.trim()
        : null;

    if (!ownerName) {
      return NextResponse.json(
        { error: 'Owner Name is required.', field: 'ownerName' },
        { status: 400 }
      );
    }

    if (!senderPlatform) {
      return NextResponse.json(
        {
          error: 'Parcel From is required.',
          field: 'senderPlatform',
        },
        { status: 400 }
      );
    }

    if (!expectedArrivalDateRaw) {
      return NextResponse.json(
        { error: 'Arrival Date is required.', field: 'expectedArrivalDate' },
        { status: 400 }
      );
    }

    const expectedArrivalDate = new Date(expectedArrivalDateRaw);
    if (isNaN(expectedArrivalDate.getTime())) {
      return NextResponse.json(
        { error: 'Please enter a valid Arrival Date.', field: 'expectedArrivalDate' },
        { status: 400 }
      );
    }

    const cleanedPhone = rawPhone.replace(/[\s\-()]/g, '');
    if (!cleanedPhone || cleanedPhone.length < 10 || cleanedPhone.length > 15) {
      return NextResponse.json(
        { error: 'Please enter a valid Phone Number (e.g., 03001234567).', field: 'ownerPhone' },
        { status: 400 }
      );
    }

    // Strictly derive department from the authenticated employee's registered database profile.
    // Ignore any departmentId/department submitted in the frontend request payload.
    const profileRows = await prisma.$queryRaw<
      Array<{
        departmentId: string | null;
        verifiedDeptId: string | null;
        verifiedDeptName: string | null;
        registeredDeptName: string | null;
      }>
    >`
      SELECT
        u."departmentId",
        d."id" AS "verifiedDeptId",
        d."name" AS "verifiedDeptName",
        NULLIF(BTRIM(u."departmentName"), '') AS "registeredDeptName"
      FROM "users" u
      LEFT JOIN "departments" d ON d."id" = u."departmentId"
      WHERE u."id" = ${emp.id}
      LIMIT 1
    `;

    const profile = profileRows[0];
    let resolvedDeptId: string | null = profile?.verifiedDeptId || null;
    let resolvedDeptName: string = profile?.verifiedDeptName?.trim() || '';

    if (!resolvedDeptName && profile?.registeredDeptName) {
      const normalized = profile.registeredDeptName.toLowerCase().replace(/\s+/g, ' ');
      const matchedDeptRows = await prisma.$queryRaw<
        Array<{ id: string; name: string }>
      >`
        SELECT "id", "name"
        FROM "departments"
        WHERE "normalizedName" = ${normalized}
        LIMIT 1
      `;
      if (matchedDeptRows.length > 0) {
        resolvedDeptId = matchedDeptRows[0].id;
        resolvedDeptName = matchedDeptRows[0].name;
      } else {
        resolvedDeptName = profile.registeredDeptName;
      }
    }

    if (!resolvedDeptName) {
      return NextResponse.json(
        {
          error:
            'Your employee profile does not have a valid department assigned. Please contact an Administrator.',
          field: 'departmentId',
        },
        { status: 400 }
      );
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
        "senderPlatform",
        "expectedArrivalDate",
        "source",
        "status",
        "notes",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${newId},
        ${parcelNumber},
        ${emp.id},
        ${ownerName},
        ${cleanedPhone},
        ${resolvedDeptId},
        ${resolvedDeptName},
        ${senderPlatform},
        ${expectedArrivalDateRaw},
        'EXPECTED'::"ParcelSource",
        'EXPECTED'::"ParcelStatus",
        ${notes},
        ${now},
        ${now}
      )
    `;

    // Notify Operator Dashboard Parcel Tracker
    const formattedDate = expectedArrivalDate.toLocaleDateString('en-PK', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    await createAppNotification({
      recipientRole: 'OPERATOR',
      type: 'PARCEL_EXPECTED',
      title: 'New Expected Parcel Reminder',
      message: `${ownerName} (${resolvedDeptName}) added a parcel reminder from ${senderPlatform} expected on ${formattedDate}.`,
      parcelId: newId,
      targetUrl: '/parcels?tab=expected',
      dedupeKey: `prc_expected_${newId}`,
    });

    await logAudit({
      action: 'CREATE_PARCEL_REMINDER',
      entityType: 'Parcel',
      entityId: newId,
      details: {
        parcelNumber,
        employeeId: emp.id,
        ownerName,
        ownerPhone: cleanedPhone,
        departmentName: resolvedDeptName,
        senderPlatform,
        expectedArrivalDate: expectedArrivalDateRaw,
        source: 'EXPECTED',
        status: 'EXPECTED',
      },
      performedById: emp.id,
    });

    const createdParcel: ParcelRow = {
      id: newId,
      parcelNumber,
      employeeId: emp.id,
      ownerName,
      ownerPhone: cleanedPhone,
      departmentId: resolvedDeptId,
      departmentName: resolvedDeptName,
      senderPlatform,
      expectedArrivalDate: expectedArrivalDateRaw,
      source: 'EXPECTED',
      status: 'EXPECTED',
      photoUrl: null,
      notes,
      receivingGateId: null,
      receivingGateName: null,
      receivedAt: null,
      receivedById: null,
      receivedByName: null,
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
        message: 'Parcel reminder added and sent to Gate Operators.',
        parcel: createdParcel,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('[Employee Parcels POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create parcel reminder.' },
      { status: 500 }
    );
  }
}
