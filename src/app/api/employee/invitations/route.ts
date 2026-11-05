import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { getEmployeeSessionUser, getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { ensureImageStoredAsFileUrl } from '@/lib/fileStorage';

export interface GuestInvitationRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  departmentId: string | null;
  departmentName: string;
  guestName: string;
  guestPhone: string;
  guestCnic: string | null;
  guestPhotoUrl: string | null;
  alongWith: string | null;
  visitorCardNo: string | null;
  normalizedCardKey: string | null;
  visitDate: string;
  expectedArrivalTime: string;
  expectedDurationWindow: string | null;
  status: 'PENDING' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';
  visitId: string | null;
  visitNumber: string | null;
  actualCheckInTime: Date | string | null;
  actualCheckOutTime: Date | string | null;
  entryGateId: string | null;
  entryGateName: string | null;
  checkedInById: string | null;
  checkedInByName: string | null;
  reinvitedFromId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface EmployeeNotificationRecord {
  id: string;
  recipientUserId: string | null;
  type: string;
  title: string;
  message: string;
  invitationId: string | null;
  visitId: string | null;
  isRead: boolean;
  createdAt: Date | string;
}

export async function GET() {
  try {
    const emp = await getEmployeeSessionUser();
    if (!emp) {
      const staff = await getSessionUser();
      if (staff) {
        return NextResponse.json(
          { error: 'Forbidden: Only approved Employees can access the Employee Portal endpoints.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Strict horizontal privilege isolation: ONLY fetch rows where employeeId === emp.id
    const invitations = await prisma.$queryRaw<GuestInvitationRecord[]>`
      SELECT
        gi."id",
        gi."employeeId",
        gi."employeeName",
        gi."departmentId",
        gi."departmentName",
        gi."guestName",
        gi."guestPhone",
        gi."guestCnic",
        gi."guestPhotoUrl",
        gi."alongWith",
        COALESCE(v."visitorCardNo", gi."visitorCardNo") AS "visitorCardNo",
        gi."normalizedCardKey",
        gi."visitDate",
        gi."expectedArrivalTime",
        gi."expectedDurationWindow",
        CASE
          WHEN v."status"::text = 'CHECKED_OUT' THEN 'CHECKED_OUT'
          WHEN v."status"::text IN ('CHECKED_IN', 'OVERSTAY') THEN 'CHECKED_IN'
          ELSE gi."status"::text
        END AS "status",
        gi."visitId",
        v."visitNumber",
        COALESCE(v."checkInTime", gi."actualCheckInTime") AS "actualCheckInTime",
        COALESCE(v."checkOutTime", gi."actualCheckOutTime") AS "actualCheckOutTime",
        COALESCE(v."entryGateId", gi."entryGateId") AS "entryGateId",
        COALESCE(g."name", gi."entryGateName") AS "entryGateName",
        gi."checkedInById",
        gi."checkedInByName",
        gi."reinvitedFromId",
        gi."createdAt",
        gi."updatedAt"
      FROM "guest_invitations" gi
      LEFT JOIN "visits" v ON v."id" = gi."visitId"
      LEFT JOIN "gates" g ON g."id" = COALESCE(v."entryGateId", gi."entryGateId")
      WHERE gi."employeeId" = ${emp.id}
      ORDER BY gi."createdAt" DESC
    `;

    const notifications = await prisma.$queryRaw<EmployeeNotificationRecord[]>`
      SELECT
        "id",
        "recipientUserId",
        "type",
        "title",
        "message",
        "invitationId",
        "visitId",
        "isRead",
        "createdAt"
      FROM "app_notifications"
      WHERE "recipientUserId" = ${emp.id}
      ORDER BY "createdAt" DESC
      LIMIT 30
    `;

    const unreadCountRows = await prisma.$queryRaw<Array<{ unreadCount: number }>>`
      SELECT COUNT(*)::int AS "unreadCount"
      FROM "app_notifications"
      WHERE "recipientUserId" = ${emp.id}
        AND "isRead" = false
    `;

    return NextResponse.json({
      success: true,
      invitations,
      notifications,
      unreadNotificationCount: unreadCountRows[0]?.unreadCount ?? 0,
    });
  } catch (error: unknown) {
    console.error('Error fetching employee invitations:', error);
    return NextResponse.json(
      { error: 'Failed to load guest invitations.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const emp = await getEmployeeSessionUser();
    if (!emp) {
      const staff = await getSessionUser();
      if (staff) {
        return NextResponse.json(
          { error: 'Forbidden: Only approved Employees can create guest invitations here.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const guestName =
      typeof body.guestName === 'string' ? body.guestName.trim().replace(/\s+/g, ' ') : '';
    const rawPhone = typeof body.guestPhone === 'string' ? body.guestPhone.trim() : '';
    const rawCnic = typeof body.guestCnic === 'string' ? body.guestCnic.trim() : '';
    const rawGuestPhotoUrl =
      typeof body.guestPhotoUrl === 'string' && body.guestPhotoUrl.trim().length > 0
        ? body.guestPhotoUrl.trim()
        : null;
    let guestPhotoUrl: string | null = rawGuestPhotoUrl;
    if (rawGuestPhotoUrl) {
      try {
        guestPhotoUrl = await ensureImageStoredAsFileUrl(rawGuestPhotoUrl, 'invitations', 'inv');
      } catch (imgErr: any) {
        return NextResponse.json(
          { error: imgErr?.message || 'Invalid Guest Photo format.' },
          { status: 400 }
        );
      }
    }
    const alongWith =
      typeof body.alongWith === 'string' && body.alongWith.trim().length > 0
        ? body.alongWith.trim().replace(/\s+/g, ' ')
        : null;
    const visitDate = typeof body.visitDate === 'string' ? body.visitDate.trim() : '';
    const expectedArrivalTime =
      typeof body.expectedArrivalTime === 'string' ? body.expectedArrivalTime.trim() : '';
    const idempotencyKey =
      typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
        ? `${emp.id}_${body.idempotencyKey.trim().slice(0, 80)}`
        : null;
    const reinvitedFromId =
      typeof body.reinvitedFromId === 'string' && body.reinvitedFromId.trim()
        ? body.reinvitedFromId.trim()
        : null;

    if (!guestName) {
      return NextResponse.json({ error: 'Guest Name is required.' }, { status: 400 });
    }

    const cleanedPhone = rawPhone.replace(/[\s\-()]/g, '');
    if (!cleanedPhone || cleanedPhone.length < 10 || cleanedPhone.length > 15) {
      return NextResponse.json(
        { error: 'Please enter a valid Phone Number for the guest.' },
        { status: 400 }
      );
    }

    // Optional CNIC validation (13 digits with or without hyphens)
    let cleanedCnic: string | null = null;
    if (rawCnic) {
      const digitsOnly = rawCnic.replace(/\D/g, '');
      if (digitsOnly.length !== 13) {
        return NextResponse.json(
          { error: 'CNIC must be 13 digits (e.g., 35202-1234567-1).' },
          { status: 400 }
        );
      }
      cleanedCnic = `${digitsOnly.slice(0, 5)}-${digitsOnly.slice(5, 12)}-${digitsOnly.slice(12)}`;
    }

    if (!visitDate || !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
      return NextResponse.json(
        { error: 'Visit Date is required (YYYY-MM-DD).' },
        { status: 400 }
      );
    }

    if (!expectedArrivalTime) {
      return NextResponse.json(
        { error: 'Arrival Time is required.' },
        { status: 400 }
      );
    }

    // If reinvitedFromId is provided, verify ownership (horizontal privilege protection)
    if (reinvitedFromId) {
      const sourceRows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "guest_invitations"
        WHERE "id" = ${reinvitedFromId} AND "employeeId" = ${emp.id}
        LIMIT 1
      `;
      if (sourceRows.length === 0) {
        return NextResponse.json(
          { error: 'Forbidden: Source invitation does not belong to your account.' },
          { status: 403 }
        );
      }
    }

    // Employees do NOT assign or reserve a visitor card number.
    // The Gate Operator assigns the physical VC card when the guest arrives.
    const createdInvitation = await prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const existingIdemp = await tx.$queryRaw<GuestInvitationRecord[]>`
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
          WHERE "idempotencyKey" = ${idempotencyKey}
            AND "employeeId" = ${emp.id}
          LIMIT 1
        `;
        if (existingIdemp.length > 0) {
          return existingIdemp[0];
        }
      }

      const newId = `inv_${crypto.randomBytes(12).toString('hex')}`;
      const deptName = emp.departmentName || 'General';
      const now = new Date();

      // NOTE: No gate and no card are assigned on creation (entryGateId, entryGateName, visitorCardNo, normalizedCardKey are NULL)
      await tx.$executeRaw`
        INSERT INTO "guest_invitations" (
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
          "status",
          "idempotencyKey",
          "reinvitedFromId",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${newId},
          ${emp.id},
          ${emp.name},
          ${emp.departmentId},
          ${deptName},
          ${guestName},
          ${cleanedPhone},
          ${cleanedCnic},
          ${guestPhotoUrl},
          ${alongWith},
          NULL,
          NULL,
          ${visitDate},
          ${expectedArrivalTime},
          ${expectedArrivalTime},
          'PENDING'::"InvitationStatus",
          ${idempotencyKey},
          ${reinvitedFromId},
          ${now},
          ${now}
        )
      `;

      // Create persistent shared Operator notification
      const notifId = `ntf_${crypto.randomBytes(10).toString('hex')}`;
      const dedupeKey = `op_inv_${newId}`;
      await tx.$executeRaw`
        INSERT INTO "app_notifications" (
          "id",
          "recipientRole",
          "type",
          "title",
          "message",
          "invitationId",
          "dedupeKey",
          "isRead",
          "createdAt"
        )
        VALUES (
          ${notifId},
          'OPERATOR',
          'NEW_INVITATION',
          'New Guest Invitation',
          ${`${guestName} invited by ${emp.name} (${deptName}) • ${visitDate} (${expectedArrivalTime})`},
          ${newId},
          ${dedupeKey},
          false,
          ${now}
        )
        ON CONFLICT ("dedupeKey") DO NOTHING
      `;

      const insertedRows = await tx.$queryRaw<GuestInvitationRecord[]>`
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
        WHERE "id" = ${newId}
        LIMIT 1
      `;

      return insertedRows[0];
    });

    await logAudit({
      action: reinvitedFromId ? 'REINVITE_GUEST' : 'CREATE_GUEST_INVITATION',
      entityType: 'GuestInvitation',
      entityId: createdInvitation.id,
      details: {
        guestName,
        guestPhone: cleanedPhone,
        visitDate,
        expectedArrivalTime,
        employeeName: emp.name,
        departmentName: emp.departmentName,
        reinvitedFromId,
      },
      performedById: emp.id,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Guest invitation created and shared with all gate operators.',
        invitation: createdInvitation,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    if (err?.status) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }
    console.error('Error creating guest invitation:', error);
    return NextResponse.json(
      { error: 'Failed to create guest invitation.' },
      { status: 500 }
    );
  }
}
