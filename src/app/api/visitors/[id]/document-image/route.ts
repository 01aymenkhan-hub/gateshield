import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import {
  validateDocumentImageDataUrl,
  getPersonImageFlagsMap,
  ensureDeliveryDocColumns,
} from '@/lib/personSanitizer';
import { readStoredFileBuffer, saveImageDataUrlToFile } from '@/lib/fileStorage';

const ALLOWED_DOC_TYPES = new Set([
  'cnic',
  'dls',
  'delivery_doc',
  'delivery_in',
  'delivery_out',
]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Both ADMIN and OPERATOR roles are authorized checkpoint staff
    if (user.role !== 'ADMIN' && user.role !== 'OPERATOR') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const docType = (searchParams.get('type') || 'cnic').toLowerCase();
    const visitId = searchParams.get('visitId')?.trim() || null;

    if (!ALLOWED_DOC_TYPES.has(docType)) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
    }

    await ensureDeliveryDocColumns();

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        cnicImagePath: string | null;
        cnicImageData: string | null;
        cnicImageMime: string | null;
        dlsImagePath: string | null;
        dlsImageData: string | null;
        dlsImageMime: string | null;
        deliveryDocImagePath: string | null;
        deliveryDocImageData: string | null;
        deliveryDocImageMime: string | null;
      }>
    >`
      SELECT
        "id",
        "cnicImagePath",
        "cnicImageData",
        "cnicImageMime",
        "dlsImagePath",
        "dlsImageData",
        "dlsImageMime",
        "deliveryDocImagePath",
        "deliveryDocImageData",
        "deliveryDocImageMime"
      FROM "persons"
      WHERE "id" = ${id}
      LIMIT 1
    `;

    const person = rows[0];
    if (!person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    // 1. Handle Delivery Incoming / Outgoing Documents from Visit or Person
    if (docType === 'delivery_in' || docType === 'delivery_doc' || docType === 'delivery_out') {
      const visitRows = visitId
        ? await prisma.$queryRaw<
            Array<{
              incomingDocPath: string | null;
              incomingDocMime: string | null;
              outgoingDocPath: string | null;
              outgoingDocMime: string | null;
            }>
          >`
            SELECT "incomingDocPath", "incomingDocMime", "outgoingDocPath", "outgoingDocMime"
            FROM "visits"
            WHERE "id" = ${visitId} AND "personId" = ${id}
            LIMIT 1
          `
        : await prisma.$queryRaw<
            Array<{
              incomingDocPath: string | null;
              incomingDocMime: string | null;
              outgoingDocPath: string | null;
              outgoingDocMime: string | null;
            }>
          >`
            SELECT "incomingDocPath", "incomingDocMime", "outgoingDocPath", "outgoingDocMime"
            FROM "visits"
            WHERE "personId" = ${id}
              AND (
                (${docType === 'delivery_out'} AND "outgoingDocPath" IS NOT NULL)
                OR (${docType !== 'delivery_out'} AND "incomingDocPath" IS NOT NULL)
              )
            ORDER BY "checkInTime" DESC
            LIMIT 1
          `;

      const visitDoc = visitRows[0];

      if (docType === 'delivery_out') {
        if (visitDoc?.outgoingDocPath) {
          const fileData = await readStoredFileBuffer(visitDoc.outgoingDocPath);
          if (fileData) {
            return new NextResponse(new Uint8Array(fileData.buffer), {
              status: 200,
              headers: {
                'Content-Type': visitDoc.outgoingDocMime || fileData.mime,
                'Cache-Control': 'private, no-store, max-age=0',
                'X-Content-Type-Options': 'nosniff',
              },
            });
          }
        }
        return NextResponse.json(
          { error: 'Outgoing delivery document not available' },
          { status: 404 }
        );
      }

      // Incoming delivery document: check visit.incomingDocPath -> person.deliveryDocImagePath -> legacy Base64
      const incomingFilePath = visitDoc?.incomingDocPath || person.deliveryDocImagePath;
      if (incomingFilePath) {
        const fileData = await readStoredFileBuffer(incomingFilePath);
        if (fileData) {
          return new NextResponse(new Uint8Array(fileData.buffer), {
            status: 200,
            headers: {
              'Content-Type':
                visitDoc?.incomingDocMime || person.deliveryDocImageMime || fileData.mime,
              'Cache-Control': 'private, no-store, max-age=0',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        }
      }

      if (person.deliveryDocImageData) {
        const parsed = validateDocumentImageDataUrl(person.deliveryDocImageData);
        const contentType = person.deliveryDocImageMime || parsed.mime || 'image/jpeg';
        return new NextResponse(new Uint8Array(parsed.buffer), {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'private, no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }

      return NextResponse.json(
        { error: 'Incoming delivery document not available' },
        { status: 404 }
      );
    }

    // 2. Handle CNIC or DLS Document Images (File path first, Base64 fallback)
    const filePath = docType === 'cnic' ? person.cnicImagePath : person.dlsImagePath;
    const storedMime = docType === 'cnic' ? person.cnicImageMime : person.dlsImageMime;

    if (filePath) {
      const fileData = await readStoredFileBuffer(filePath);
      if (fileData) {
        return new NextResponse(new Uint8Array(fileData.buffer), {
          status: 200,
          headers: {
            'Content-Type': storedMime || fileData.mime,
            'Cache-Control': 'private, no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
    }

    const rawImage = docType === 'cnic' ? person.cnicImageData : person.dlsImageData;
    if (!rawImage) {
      return NextResponse.json({ error: 'Document image not available' }, { status: 404 });
    }

    const parsed = validateDocumentImageDataUrl(rawImage);
    const contentType = storedMime || parsed.mime || 'image/jpeg';

    return new NextResponse(new Uint8Array(parsed.buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('Error loading identity document image:', err);
    return NextResponse.json(
      { error: 'Unable to load identity document image' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'ADMIN' && user.role !== 'OPERATOR') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await ensureDeliveryDocColumns();

    const { id } = await context.params;
    const body = await request.json();

    let incomingCnic: string | undefined = body.cnicImageData;
    let incomingDls: string | undefined = body.dlsImageData;

    if (typeof body.imageDataUrl === 'string' && body.imageDataUrl.trim()) {
      const normalizedType = String(body.type || 'cnic').toLowerCase();
      if (normalizedType === 'dls') {
        incomingDls = body.imageDataUrl;
      } else {
        incomingCnic = body.imageDataUrl;
      }
    }

    if (!incomingCnic && !incomingDls) {
      return NextResponse.json(
        { error: 'At least one identity document image is required' },
        { status: 400 }
      );
    }

    const existingPerson = await prisma.person.findUnique({
      where: { id },
      select: { id: true, fullName: true },
    });

    if (!existingPerson) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    const updatedTypes: string[] = [];

    if (typeof incomingCnic === 'string' && incomingCnic.trim()) {
      const savedCnic = await saveImageDataUrlToFile(incomingCnic, 'cnic', `cnic_${id}`);
      await prisma.$executeRaw`
        UPDATE "persons"
        SET "cnicImagePath" = ${savedCnic.storageKey},
            "cnicImageMime" = ${savedCnic.mime},
            "cnicImageSize" = ${savedCnic.size},
            "updatedAt" = NOW()
        WHERE "id" = ${id}
      `;
      updatedTypes.push('CNIC');
    }

    if (typeof incomingDls === 'string' && incomingDls.trim()) {
      const savedDls = await saveImageDataUrlToFile(incomingDls, 'dls', `dls_${id}`);
      await prisma.$executeRaw`
        UPDATE "persons"
        SET "dlsImagePath" = ${savedDls.storageKey},
            "dlsImageMime" = ${savedDls.mime},
            "dlsImageSize" = ${savedDls.size},
            "updatedAt" = NOW()
        WHERE "id" = ${id}
      `;
      updatedTypes.push('DLS');
    }

    await logAudit({
      action: 'SAVE_DOCUMENT_IMAGE',
      entityType: 'Person',
      entityId: id,
      details: {
        personName: existingPerson.fullName,
        documentTypes: updatedTypes,
      },
      performedById: user.id,
    });

    const flagsMap = await getPersonImageFlagsMap([id]);
    const flags = flagsMap.get(id) || {
      hasCnicImage: Boolean(incomingCnic),
      hasDlsImage: Boolean(incomingDls),
      hasDeliveryDocImage: false,
      hasOutgoingDocImage: false,
    };

    return NextResponse.json({
      success: true,
      hasCnicImage: flags.hasCnicImage,
      hasDlsImage: flags.hasDlsImage,
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : 'Failed to save identity document image';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
