import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { generatePassCode } from '@/lib/qrUtils';
import {
  sanitizeVisitsWithDbFlags,
  sanitizePersonForClient,
  ensureDeliveryDocColumns,
  formatVehicleNoForStorage,
  normalizeVehicleNoKey,
} from '@/lib/personSanitizer';
import {
  saveImageDataUrlToFile,
  ensureImageStoredAsFileUrl,
  StoredFileResult,
} from '@/lib/fileStorage';
import {
  InputError,
  isPersonCategory,
  keepExisting,
  normalizeCnic,
  normalizeDls,
  optionalText,
  requiredText,
  resolvePersonForCheckIn,
} from '@/lib/identity';

function imageField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Validates types, lengths, enums and identity formats before anything touches the DB. */
function parseCheckInBody(b: Record<string, unknown>) {
  const rawCategory = typeof b.category === 'string' && b.category.trim() ? b.category.trim().toUpperCase() : 'VISITOR';
  if (!isPersonCategory(rawCategory)) {
    throw new InputError('Invalid visitor category.');
  }
  return {
    fullName: requiredText(b.fullName, 'Full name', 120),
    fatherHusbandName: optionalText(b.fatherHusbandName, 'Father/Husband name', 120),
    cnicNumber: normalizeCnic(b.cnicNumber),
    dlsNumber: normalizeDls(b.dlsNumber),
    category: rawCategory,
    gender: optionalText(b.gender, 'Gender', 20),
    dateOfBirth: optionalText(b.dateOfBirth, 'Date of birth', 20),
    dateOfIssue: optionalText(b.dateOfIssue, 'Date of issue', 20),
    dateOfExpiry: optionalText(b.dateOfExpiry, 'Date of expiry', 20),
    licensingAuthority: optionalText(b.licensingAuthority, 'Licensing authority', 120),
    identification: optionalText(b.identification, 'Identification', 120),
    presentAddress: optionalText(b.presentAddress, 'Present address', 300),
    permanentAddress: optionalText(b.permanentAddress, 'Permanent address', 300),
    phoneNumber: optionalText(b.phoneNumber, 'Phone number', 20),
    photoUrl: imageField(b.photoUrl),
    cnicImageData: imageField(b.cnicImageData),
    dlsImageData: imageField(b.dlsImageData),
    deliveryDocImageData: imageField(b.deliveryDocImageData),
    deliverySource: optionalText(b.deliverySource, 'Delivery source', 120),
    company: optionalText(b.company, 'Company', 120),
    hostName: optionalText(b.hostName, 'Host name', 120),
    department: optionalText(b.department, 'Department', 120),
    departmentId: optionalText(b.departmentId, 'Department', 64),
    purpose: optionalText(b.purpose, 'Purpose', 300),
    visitorCardNo: optionalText(b.visitorCardNo, 'Visitor card number', 30),
    vehicleNo: optionalText(b.vehicleNo, 'Vehicle number', 30),
    belongings: optionalText(b.belongings, 'Belongings', 500),
    entryGateId: optionalText(b.entryGateId, 'Gate', 64),
    notes: optionalText(b.notes, 'Notes', 1000),
  };
}

function formatCardNoForStorage(raw: string): string {
  return raw
    .trim()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizeCardKey(raw: string): string {
  return raw
    .trim()
    .replace(/[\s\-_.]+/g, '')
    .toUpperCase();
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = await request.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    const body = parseCheckInBody(rawBody as Record<string, unknown>);
    const {
      fullName,
      fatherHusbandName,
      cnicNumber,
      dlsNumber,
      category = 'VISITOR',
      gender,
      dateOfBirth,
      dateOfIssue,
      dateOfExpiry,
      licensingAuthority,
      identification,
      presentAddress,
      permanentAddress,
      phoneNumber,
      photoUrl,
      cnicImageData,
      dlsImageData,
      deliveryDocImageData,
      deliverySource,
      company,
      hostName,
      department,
      departmentId,
      purpose,
      visitorCardNo,
      vehicleNo,
      belongings,
      entryGateId,
      notes,
    } = body;

    const isDelivery = String(category || '').toUpperCase() === 'DELIVERY';

    if (!fullName || !fullName.trim()) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
    }

    const resolvedDeliverySource = isDelivery
      ? String(deliverySource || company || hostName || '').trim()
      : '';

    if (isDelivery && !resolvedDeliverySource) {
      return NextResponse.json(
        { error: 'Delivery Source / Company Name is required' },
        { status: 400 }
      );
    }

    const effectiveHostName = isDelivery
      ? resolvedDeliverySource
      : typeof hostName === 'string'
      ? hostName.trim()
      : '';
    const effectiveCompany = isDelivery
      ? resolvedDeliverySource
      : typeof company === 'string' && company.trim()
      ? company.trim()
      : null;

    if (!effectiveHostName) {
      return NextResponse.json({ error: 'Host person name is required' }, { status: 400 });
    }

    // Validate and store optional Incoming Delivery Document image to disk for DELIVERY category
    let savedIncomingDoc: StoredFileResult | null = null;
    const hasIncomingDeliveryDoc =
      isDelivery &&
      typeof deliveryDocImageData === 'string' &&
      deliveryDocImageData.trim().length > 0;

    if (hasIncomingDeliveryDoc) {
      try {
        savedIncomingDoc = await saveImageDataUrlToFile(
          deliveryDocImageData,
          'delivery/incoming',
          'delivery_in'
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid delivery document image';
        return NextResponse.json(
          { error: `Incoming delivery document: ${msg}` },
          { status: 400 }
        );
      }
    }

    // Store visitor/delivery portrait photo to persistent file storage if provided
    let storedProfilePhotoUrl: string | null = null;
    if (typeof photoUrl === 'string' && photoUrl.trim().length > 0) {
      try {
        storedProfilePhotoUrl = await ensureImageStoredAsFileUrl(
          photoUrl,
          'profiles',
          'profile'
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid profile photo';
        return NextResponse.json({ error: `Visitor photo: ${msg}` }, { status: 400 });
      }
    }

    // Resolve Department (supports both departmentId and department name)
    let resolvedDepartmentId: string | null =
      typeof departmentId === 'string' && departmentId.trim() ? departmentId.trim() : null;
    let resolvedDepartmentName: string =
      typeof department === 'string' ? department.trim() : '';

    if (resolvedDepartmentId) {
      try {
        const deptRows = await prisma.$queryRaw<
          Array<{ id: string; name: string; active: boolean }>
        >`
          SELECT "id", "name", "active"
          FROM "departments"
          WHERE "id" = ${resolvedDepartmentId}
          LIMIT 1
        `;
        if (deptRows.length > 0) {
          resolvedDepartmentId = deptRows[0].id;
          resolvedDepartmentName = deptRows[0].name;
        } else {
          resolvedDepartmentId = null;
        }
      } catch {
        resolvedDepartmentId = null;
      }
    } else if (resolvedDepartmentName) {
      try {
        const normalizedDept = resolvedDepartmentName.toLowerCase().replace(/\s+/g, ' ');
        const deptRows = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
          SELECT "id", "name"
          FROM "departments"
          WHERE "normalizedName" = ${normalizedDept}
          LIMIT 1
        `;
        if (deptRows.length > 0) {
          resolvedDepartmentId = deptRows[0].id;
          resolvedDepartmentName = deptRows[0].name;
        }
      } catch {
        // Non-fatal fallback: keep resolvedDepartmentName
      }
    }

    if (isDelivery && !resolvedDepartmentName) {
      resolvedDepartmentName = 'Delivery';
    }

    if (!resolvedDepartmentName) {
      return NextResponse.json({ error: 'Department is required' }, { status: 400 });
    }

    // Manual Visitor Card Number validation for standard categories; Vehicle Number required for DELIVERY
    const formattedCardNo =
      !isDelivery && visitorCardNo ? formatCardNoForStorage(String(visitorCardNo)) : '';
    const cardComparisonKey =
      !isDelivery && visitorCardNo ? normalizeCardKey(String(visitorCardNo)) : '';

    if (!isDelivery && (!formattedCardNo || !cardComparisonKey)) {
      return NextResponse.json(
        { error: 'Visitor Card Number is required. Please enter the number printed on the physical card.' },
        { status: 400 }
      );
    }

    const formattedVehicleNo = vehicleNo ? formatVehicleNoForStorage(String(vehicleNo)) : '';
    const normalizedVehicleNo = vehicleNo ? normalizeVehicleNoKey(String(vehicleNo)) : '';

    if (isDelivery && (!formattedVehicleNo || normalizedVehicleNo.length < 2)) {
      return NextResponse.json(
        { error: 'Vehicle Number is required for Delivery registration (e.g. KHI-1234).' },
        { status: 400 }
      );
    }

    // Phone number is optional; if provided (non-empty), validate 11 digits starting with 03
    const cleanPhone =
      typeof phoneNumber === 'string' && phoneNumber.trim().length > 0
        ? phoneNumber.trim()
        : null;

    if (cleanPhone && !/^03\d{9}$/.test(cleanPhone)) {
      return NextResponse.json(
        { error: 'Phone number must be an 11-digit Pakistani mobile number starting with 03 (e.g. 03001234567)' },
        { status: 400 }
      );
    }

    // Resolve and enforce Gate authorization from server-side session & UserGateAccess
    let resolvedGateId: string | null =
      typeof entryGateId === 'string' && entryGateId.trim() ? entryGateId.trim() : null;

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

      if (resolvedGateId) {
        const isAssigned = assignedActiveGates.some((g) => g.id === resolvedGateId);
        if (!isAssigned) {
          return NextResponse.json(
            {
              error: 'You are not authorized to check in visitors at the selected gate.',
              code: 'UNAUTHORIZED_GATE',
            },
            { status: 403 }
          );
        }
      } else {
        resolvedGateId = assignedActiveGates[0].id;
      }
    } else {
      // ADMIN: validate requested gate if provided, otherwise fall back to first active gate
      if (resolvedGateId) {
        const dbGate = await prisma.gate.findFirst({
          where: { id: resolvedGateId, active: true },
        });
        if (!dbGate) {
          resolvedGateId = null;
        }
      }
      if (!resolvedGateId) {
        const defaultGate = await prisma.gate.findFirst({
          where: { active: true },
          orderBy: { createdAt: 'asc' },
        });
        if (defaultGate) {
          resolvedGateId = defaultGate.id;
        } else {
          const newGate = await prisma.gate.create({
            data: {
              name: 'Main Gate - Entry & Exit',
              type: 'BOTH',
              active: true,
            },
          });
          resolvedGateId = newGate.id;
        }
      }
    }

    // Already canonicalized by parseCheckInBody (CNIC -> XXXXX-XXXXXXX-X, DLS -> upper case).
    const cleanCnic = cnicNumber;
    const cleanDls = dlsNumber;

    // Concurrency-safe transaction: acquire advisory lock on normalized card key,
    // verify card is not assigned to any active visitor, verify person is not blacklisted or already inside,
    // and atomically create the visit record.
    const { visit, person } = await prisma.$transaction(async (tx) => {
      if (formattedCardNo && cardComparisonKey) {
        const lockNamespaceKey = `gk_card_${cardComparisonKey}`;
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
          (v) => v.visitorCardNo && normalizeCardKey(v.visitorCardNo) === cardComparisonKey
        );

        if (duplicateCardVisit) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const conflictErr: any = new Error(
            'This card is already assigned. Please choose another available card.'
          );
          conflictErr.status = 409;
          conflictErr.code = 'CARD_ALREADY_ASSIGNED';
          throw conflictErr;
        }

        const duplicatePendingInvitation = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "guest_invitations"
          WHERE "status"::text = 'PENDING'
            AND "normalizedCardKey" IS NOT NULL
            AND "normalizedCardKey" = ${cardComparisonKey}
          LIMIT 1
        `;

        if (duplicatePendingInvitation.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const conflictErr: any = new Error(
            'This card is already preassigned to an upcoming invited guest. Please choose another available card.'
          );
          conflictErr.status = 409;
          conflictErr.code = 'CARD_ALREADY_ASSIGNED';
          throw conflictErr;
        }
      }

      // Identity documents decide who this is; blacklist is checked across CNIC/DLS/phone
      // in any formatting (throws BlacklistedError / IdentityConflictError).
      const existingPerson = await resolvePersonForCheckIn(tx, {
        cnic: cleanCnic,
        dls: cleanDls,
        phone: cleanPhone,
      });

      if (existingPerson) {
        const activeVisit = await tx.visit.findFirst({
          where: {
            personId: existingPerson.id,
            status: { in: ['CHECKED_IN', 'OVERSTAY'] },
            checkOutTime: null,
          },
        });

        if (activeVisit) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const alreadyInsideErr: any = new Error(
            `Warning: This person is already checked in (Visit #${activeVisit.visitNumber}). Please check them out before new entry.`
          );
          alreadyInsideErr.status = 409;
          alreadyInsideErr.activeVisitId = activeVisit.id;
          alreadyInsideErr.visitNumber = activeVisit.visitNumber;
          throw alreadyInsideErr;
        }
      }

      // Fields left blank on a revisit keep their stored values instead of being wiped.
      const prev = existingPerson;
      const personData = {
        fullName: fullName.trim(),
        fatherHusbandName: keepExisting(fatherHusbandName, prev?.fatherHusbandName),
        cnicNumber: keepExisting(cleanCnic, prev?.cnicNumber),
        dlsNumber: keepExisting(cleanDls, prev?.dlsNumber),
        category,
        gender: keepExisting(gender, prev?.gender),
        dateOfBirth: keepExisting(dateOfBirth, prev?.dateOfBirth),
        dateOfIssue: keepExisting(dateOfIssue, prev?.dateOfIssue),
        dateOfExpiry: keepExisting(dateOfExpiry, prev?.dateOfExpiry),
        licensingAuthority: keepExisting(licensingAuthority, prev?.licensingAuthority),
        identification: keepExisting(identification, prev?.identification),
        presentAddress: keepExisting(presentAddress, prev?.presentAddress),
        permanentAddress: keepExisting(permanentAddress, prev?.permanentAddress),
        phoneNumber: keepExisting(cleanPhone, prev?.phoneNumber),
        photoUrl: keepExisting(storedProfilePhotoUrl, prev?.photoUrl),
        company: keepExisting(effectiveCompany, prev?.company),
        belongings: belongings || null,
      };

      const savedPerson = existingPerson
        ? await tx.person.update({
            where: { id: existingPerson.id },
            data: personData,
          })
        : await tx.person.create({
            data: personData,
          });

      const today = new Date();
      const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      const todayVisitsCount = await tx.visit.count({
        where: {
          checkInTime: {
            gte: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0),
          },
        },
      });
      const visitNumber = `VIS-${datePrefix}-${String(todayVisitsCount + 1).padStart(4, '0')}`;
      const passCode = generatePassCode();

      const createdVisit = await tx.visit.create({
        data: {
          visitNumber,
          passCode,
          personId: savedPerson.id,
          hostName: effectiveHostName,
          department: resolvedDepartmentName,
          purpose: purpose?.trim() || (isDelivery ? 'Delivery' : null),
          visitorCardNo: isDelivery ? null : formattedCardNo || null,
          vehicleNo: formattedVehicleNo || null,
          belongings: belongings?.trim() || null,
          status: 'CHECKED_IN',
          entryGateId: resolvedGateId,
          checkedInById: user.id,
          notes: notes?.trim() || null,
        },
        include: {
          person: true,
          entryGate: true,
          checkedInBy: { select: { id: true, name: true } },
        },
      });

      if (resolvedDepartmentId) {
        await tx.$executeRaw`
          UPDATE "visits"
          SET "departmentId" = ${resolvedDepartmentId}
          WHERE "id" = ${createdVisit.id}
        `;
      }

      return { visit: createdVisit, person: savedPerson };
    });

    await ensureDeliveryDocColumns();

    if (normalizedVehicleNo) {
      await prisma.$executeRaw`
        UPDATE "visits"
        SET "vehicleNoNormalized" = ${normalizedVehicleNo}
        WHERE "id" = ${visit.id}
      `;
    }

    // Save scanned CNIC / DLS / Delivery document images to persistent file storage and store only metadata in PostgreSQL
    let imageStorageStatus: 'saved' | 'failed' | 'none' = 'none';
    let imageStorageError: string | null = null;
    const hasIncomingCnicImage = typeof cnicImageData === 'string' && cnicImageData.trim().length > 0;
    const hasIncomingDlsImage = typeof dlsImageData === 'string' && dlsImageData.trim().length > 0;

    if (savedIncomingDoc) {
      try {
        await prisma.$executeRaw`
          UPDATE "visits"
          SET "incomingDocPath" = ${savedIncomingDoc.storageKey},
              "incomingDocMime" = ${savedIncomingDoc.mime},
              "incomingDocSize" = ${savedIncomingDoc.size},
              "incomingDocCapturedAt" = NOW(),
              "updatedAt" = NOW()
          WHERE "id" = ${visit.id}
        `;
        await prisma.$executeRaw`
          UPDATE "persons"
          SET "deliveryDocImagePath" = ${savedIncomingDoc.storageKey},
              "deliveryDocImageMime" = ${savedIncomingDoc.mime},
              "deliveryDocImageSize" = ${savedIncomingDoc.size},
              "updatedAt" = NOW()
          WHERE "id" = ${person.id}
        `;
        imageStorageStatus = 'saved';
      } catch (docErr: unknown) {
        const msg = docErr instanceof Error ? docErr.message : 'Database update failed';
        console.error('Failed to store delivery document metadata for visit:', visit.id, msg);
        imageStorageStatus = 'failed';
        imageStorageError = 'Failed to save incoming delivery document metadata to database.';
      }
    }

    if (hasIncomingCnicImage || hasIncomingDlsImage) {
      let savedCnicFile: StoredFileResult | null = null;
      let savedDlsFile: StoredFileResult | null = null;
      const validationErrors: string[] = [];

      if (hasIncomingCnicImage) {
        try {
          savedCnicFile = await saveImageDataUrlToFile(
            cnicImageData,
            'cnic',
            `cnic_${person.id}`
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Invalid image';
          validationErrors.push(`CNIC image: ${msg}`);
        }
      }

      if (hasIncomingDlsImage) {
        try {
          savedDlsFile = await saveImageDataUrlToFile(
            dlsImageData,
            'dls',
            `dls_${person.id}`
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Invalid image';
          validationErrors.push(`Driving Licence image: ${msg}`);
        }
      }

      if (validationErrors.length > 0) {
        imageStorageStatus = 'failed';
        imageStorageError = validationErrors.join('; ');
      }

      if (savedCnicFile || savedDlsFile) {
        try {
          if (savedCnicFile && savedDlsFile) {
            await prisma.$executeRaw`
              UPDATE "persons"
              SET "cnicImagePath" = ${savedCnicFile.storageKey},
                  "cnicImageMime" = ${savedCnicFile.mime},
                  "cnicImageSize" = ${savedCnicFile.size},
                  "dlsImagePath" = ${savedDlsFile.storageKey},
                  "dlsImageMime" = ${savedDlsFile.mime},
                  "dlsImageSize" = ${savedDlsFile.size},
                  "updatedAt" = NOW()
              WHERE "id" = ${person.id}
            `;
          } else if (savedCnicFile) {
            await prisma.$executeRaw`
              UPDATE "persons"
              SET "cnicImagePath" = ${savedCnicFile.storageKey},
                  "cnicImageMime" = ${savedCnicFile.mime},
                  "cnicImageSize" = ${savedCnicFile.size},
                  "updatedAt" = NOW()
              WHERE "id" = ${person.id}
            `;
          } else if (savedDlsFile) {
            await prisma.$executeRaw`
              UPDATE "persons"
              SET "dlsImagePath" = ${savedDlsFile.storageKey},
                  "dlsImageMime" = ${savedDlsFile.mime},
                  "dlsImageSize" = ${savedDlsFile.size},
                  "updatedAt" = NOW()
              WHERE "id" = ${person.id}
            `;
          }

          if (validationErrors.length === 0) {
            imageStorageStatus = 'saved';
          }
        } catch (imgErr: unknown) {
          const msg = imgErr instanceof Error ? imgErr.message : 'Database update failed';
          console.error('Failed to store identity document metadata for person:', person.id, msg);
          imageStorageStatus = 'failed';
          imageStorageError = 'Failed to save scanned ID card image metadata to database.';
        }
      }
    }

    await logAudit({
      action: 'CHECK_IN',
      entityType: 'Visit',
      entityId: visit.id,
      details: {
        visitNumber: visit.visitNumber,
        personName: person.fullName,
        cnic: person.cnicNumber,
        host: visit.hostName,
        department: visit.department,
        departmentId: resolvedDepartmentId,
        cardNo: visit.visitorCardNo,
        imageStorageStatus,
      },
      performedById: user.id,
    });

    const [sanitizedVisit] = await sanitizeVisitsWithDbFlags([
      {
        ...visit,
        departmentId: resolvedDepartmentId,
      },
    ]);

    return NextResponse.json({
      success: true,
      message: 'Visitor checked in successfully',
      visit: sanitizedVisit,
      imageStorageStatus,
      imageStorageError,
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
          activeVisitId: err.activeVisitId,
          visitNumber: err.visitNumber,
        },
        { status: err.status }
      );
    }

    // Never echo internal (Prisma/SQL) messages: they can contain visitor PII and schema details.
    console.error('Check-in error:', error);
    return NextResponse.json({ error: 'Failed to complete check-in' }, { status: 500 });
  }
}
