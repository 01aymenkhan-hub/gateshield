import prisma from '@/lib/prisma';

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);
const MAX_DECODED_BYTES = 8 * 1024 * 1024; // 8 MB generous safety ceiling for full-card images

export function validateDocumentImageDataUrl(raw: string): {
  mime: string;
  buffer: Buffer;
  normalizedDataUrl: string;
} {
  const trimmed = raw.trim();
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(trimmed);
  if (!match) {
    throw new Error('Invalid image format. Expected a base64-encoded image data URL.');
  }

  const mime = match[1].toLowerCase();
  if (!ALLOWED_MIMES.has(mime)) {
    throw new Error('Unsupported document image type. Allowed types: JPEG, PNG, WebP.');
  }

  const base64Clean = match[2].replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(base64Clean)) {
    throw new Error('Invalid base64 encoding in document image.');
  }

  const buffer = Buffer.from(base64Clean, 'base64');

  if (!buffer || buffer.byteLength === 0) {
    throw new Error('Empty document image payload.');
  }

  if (buffer.byteLength > MAX_DECODED_BYTES) {
    throw new Error('Document image exceeds the maximum allowed size (8 MB).');
  }

  const normalizedMime = mime === 'image/jpg' ? 'image/jpeg' : mime;
  return {
    mime: normalizedMime,
    buffer,
    normalizedDataUrl: `data:${normalizedMime};base64,${base64Clean}`,
  };
}

export function formatVehicleNoForStorage(raw: string): string {
  return raw
    .trim()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function normalizeVehicleNoKey(raw: string): string {
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toUpperCase();
}

let deliveryDocColumnsEnsured = false;

export async function ensureDeliveryDocColumns(): Promise<void> {
  if (deliveryDocColumnsEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "persons"
      ADD COLUMN IF NOT EXISTS "cnicImagePath" TEXT,
      ADD COLUMN IF NOT EXISTS "cnicImageSize" INTEGER,
      ADD COLUMN IF NOT EXISTS "dlsImagePath" TEXT,
      ADD COLUMN IF NOT EXISTS "dlsImageSize" INTEGER,
      ADD COLUMN IF NOT EXISTS "deliveryDocImageData" TEXT,
      ADD COLUMN IF NOT EXISTS "deliveryDocImageMime" TEXT,
      ADD COLUMN IF NOT EXISTS "deliveryDocImagePath" TEXT,
      ADD COLUMN IF NOT EXISTS "deliveryDocImageSize" INTEGER;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "visits"
      ADD COLUMN IF NOT EXISTS "vehicleNoNormalized" TEXT,
      ADD COLUMN IF NOT EXISTS "incomingDocPath" TEXT,
      ADD COLUMN IF NOT EXISTS "incomingDocMime" TEXT,
      ADD COLUMN IF NOT EXISTS "incomingDocSize" INTEGER,
      ADD COLUMN IF NOT EXISTS "incomingDocCapturedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "outgoingDocPath" TEXT,
      ADD COLUMN IF NOT EXISTS "outgoingDocMime" TEXT,
      ADD COLUMN IF NOT EXISTS "outgoingDocSize" INTEGER,
      ADD COLUMN IF NOT EXISTS "outgoingDocCapturedAt" TIMESTAMP(3);
    `);
    deliveryDocColumnsEnsured = true;
  } catch (err) {
    console.warn('Could not auto-ensure delivery/file storage columns:', err);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizePersonForClient<T extends Record<string, any> | null | undefined>(
  person: T
): T {
  if (!person || typeof person !== 'object') return person;

  const hasCnicImage =
    typeof person.hasCnicImage === 'boolean'
      ? person.hasCnicImage
      : Boolean(person.cnicImagePath || person.cnicImageData);
  const hasDlsImage =
    typeof person.hasDlsImage === 'boolean'
      ? person.hasDlsImage
      : Boolean(person.dlsImagePath || person.dlsImageData);
  const hasDeliveryDocImage =
    typeof person.hasDeliveryDocImage === 'boolean'
      ? person.hasDeliveryDocImage
      : Boolean(person.deliveryDocImagePath || person.deliveryDocImageData);
  const hasOutgoingDocImage =
    typeof person.hasOutgoingDocImage === 'boolean'
      ? person.hasOutgoingDocImage
      : false;

  const clone = { ...person };
  delete clone.cnicImageData;
  delete clone.cnicImageMime;
  delete clone.cnicImagePath;
  delete clone.dlsImageData;
  delete clone.dlsImageMime;
  delete clone.dlsImagePath;
  delete clone.deliveryDocImageData;
  delete clone.deliveryDocImageMime;
  delete clone.deliveryDocImagePath;

  return {
    ...clone,
    hasCnicImage,
    hasDlsImage,
    hasDeliveryDocImage,
    hasOutgoingDocImage,
  } as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeVisitForClient<T extends Record<string, any> | null | undefined>(
  visit: T
): T {
  if (!visit || typeof visit !== 'object') return visit;
  const clone = { ...visit };
  delete clone.incomingDocPath;
  delete clone.outgoingDocPath;
  if (!clone.person) return clone as T;
  return {
    ...clone,
    person: sanitizePersonForClient(clone.person),
  } as T;
}

export interface PersonImageFlags {
  hasCnicImage: boolean;
  hasDlsImage: boolean;
  hasDeliveryDocImage: boolean;
  hasOutgoingDocImage: boolean;
  latestDeliveryVisitId?: string | null;
  incomingDocCapturedAt?: Date | string | null;
  outgoingDocCapturedAt?: Date | string | null;
}

export async function getPersonImageFlagsMap(
  personIds: string[]
): Promise<Map<string, PersonImageFlags>> {
  const uniqueIds = Array.from(new Set(personIds.filter(Boolean)));
  const map = new Map<string, PersonImageFlags>();
  if (uniqueIds.length === 0) return map;

  try {
    await ensureDeliveryDocColumns();
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        hasCnicImage: boolean;
        hasDlsImage: boolean;
        hasDeliveryDocImage: boolean;
        hasOutgoingDocImage: boolean;
        latestDeliveryVisitId: string | null;
        incomingDocCapturedAt: Date | null;
        outgoingDocCapturedAt: Date | null;
      }>
    >`
      SELECT
        p."id",
        ((p."cnicImagePath" IS NOT NULL AND LENGTH(p."cnicImagePath") > 0) OR (p."cnicImageData" IS NOT NULL AND LENGTH(p."cnicImageData") > 0)) AS "hasCnicImage",
        ((p."dlsImagePath" IS NOT NULL AND LENGTH(p."dlsImagePath") > 0) OR (p."dlsImageData" IS NOT NULL AND LENGTH(p."dlsImageData") > 0)) AS "hasDlsImage",
        (
          (p."deliveryDocImagePath" IS NOT NULL AND LENGTH(p."deliveryDocImagePath") > 0)
          OR (p."deliveryDocImageData" IS NOT NULL AND LENGTH(p."deliveryDocImageData") > 0)
          OR EXISTS (
            SELECT 1 FROM "visits" v
            WHERE v."personId" = p."id"
              AND v."incomingDocPath" IS NOT NULL
              AND LENGTH(v."incomingDocPath") > 0
          )
        ) AS "hasDeliveryDocImage",
        EXISTS (
          SELECT 1 FROM "visits" v
          WHERE v."personId" = p."id"
            AND v."outgoingDocPath" IS NOT NULL
            AND LENGTH(v."outgoingDocPath") > 0
        ) AS "hasOutgoingDocImage",
        (
          SELECT v."id" FROM "visits" v
          WHERE v."personId" = p."id"
          ORDER BY v."checkInTime" DESC
          LIMIT 1
        ) AS "latestDeliveryVisitId",
        (
          SELECT v."incomingDocCapturedAt" FROM "visits" v
          WHERE v."personId" = p."id" AND v."incomingDocPath" IS NOT NULL
          ORDER BY v."checkInTime" DESC
          LIMIT 1
        ) AS "incomingDocCapturedAt",
        (
          SELECT v."outgoingDocCapturedAt" FROM "visits" v
          WHERE v."personId" = p."id" AND v."outgoingDocPath" IS NOT NULL
          ORDER BY v."checkInTime" DESC
          LIMIT 1
        ) AS "outgoingDocCapturedAt"
      FROM "persons" p
      WHERE p."id" = ANY(${uniqueIds}::text[])
    `;
    for (const row of rows) {
      map.set(row.id, {
        hasCnicImage: Boolean(row.hasCnicImage),
        hasDlsImage: Boolean(row.hasDlsImage),
        hasDeliveryDocImage: Boolean(row.hasDeliveryDocImage),
        hasOutgoingDocImage: Boolean(row.hasOutgoingDocImage),
        latestDeliveryVisitId: row.latestDeliveryVisitId || null,
        incomingDocCapturedAt: row.incomingDocCapturedAt || null,
        outgoingDocCapturedAt: row.outgoingDocCapturedAt || null,
      });
    }
  } catch (err) {
    console.warn('Failed to query person image flags via raw SQL:', err);
  }

  return map;
}

export interface VisitDeliveryDocFlags {
  hasIncomingDoc: boolean;
  incomingDocCapturedAt: Date | null;
  hasOutgoingDoc: boolean;
  outgoingDocCapturedAt: Date | null;
}

export async function getVisitDeliveryFlagsMap(
  visitIds: string[]
): Promise<Map<string, VisitDeliveryDocFlags>> {
  const uniqueIds = Array.from(new Set(visitIds.filter(Boolean)));
  const map = new Map<string, VisitDeliveryDocFlags>();
  if (uniqueIds.length === 0) return map;

  try {
    await ensureDeliveryDocColumns();
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        hasIncomingDoc: boolean;
        incomingDocCapturedAt: Date | null;
        hasOutgoingDoc: boolean;
        outgoingDocCapturedAt: Date | null;
      }>
    >`
      SELECT
        "id",
        ("incomingDocPath" IS NOT NULL AND LENGTH("incomingDocPath") > 0) AS "hasIncomingDoc",
        "incomingDocCapturedAt",
        ("outgoingDocPath" IS NOT NULL AND LENGTH("outgoingDocPath") > 0) AS "hasOutgoingDoc",
        "outgoingDocCapturedAt"
      FROM "visits"
      WHERE "id" = ANY(${uniqueIds}::text[])
    `;
    for (const row of rows) {
      map.set(row.id, {
        hasIncomingDoc: Boolean(row.hasIncomingDoc),
        incomingDocCapturedAt: row.incomingDocCapturedAt || null,
        hasOutgoingDoc: Boolean(row.hasOutgoingDoc),
        outgoingDocCapturedAt: row.outgoingDocCapturedAt || null,
      });
    }
  } catch (err) {
    console.warn('Failed to query visit delivery doc flags via raw SQL:', err);
  }

  return map;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sanitizePersonWithDbFlags<T extends Record<string, any> | null | undefined>(
  person: T
): Promise<T> {
  if (!person || typeof person !== 'object') return person;
  const id = typeof person.id === 'string' ? person.id : '';
  if (!id) return sanitizePersonForClient(person);

  const flagsMap = await getPersonImageFlagsMap([id]);
  const dbFlags = flagsMap.get(id);

  return sanitizePersonForClient({
    ...person,
    hasCnicImage: dbFlags ? dbFlags.hasCnicImage : Boolean(person.cnicImageData ?? person.hasCnicImage),
    hasDlsImage: dbFlags ? dbFlags.hasDlsImage : Boolean(person.dlsImageData ?? person.hasDlsImage),
    hasDeliveryDocImage: dbFlags
      ? dbFlags.hasDeliveryDocImage
      : Boolean(person.deliveryDocImageData ?? person.hasDeliveryDocImage),
    hasOutgoingDocImage: dbFlags ? dbFlags.hasOutgoingDocImage : false,
    latestDeliveryVisitId: dbFlags?.latestDeliveryVisitId ?? null,
    incomingDocCapturedAt: dbFlags?.incomingDocCapturedAt ?? null,
    outgoingDocCapturedAt: dbFlags?.outgoingDocCapturedAt ?? null,
  }) as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sanitizeVisitsWithDbFlags<T extends Record<string, any>>(
  visits: T[]
): Promise<T[]> {
  if (!Array.isArray(visits) || visits.length === 0) return visits;
  const personIds = visits
    .map((v) => (v?.person?.id ? String(v.person.id) : ''))
    .filter(Boolean);
  const visitIds = visits.map((v) => (v?.id ? String(v.id) : '')).filter(Boolean);

  const [flagsMap, visitFlagsMap] = await Promise.all([
    getPersonImageFlagsMap(personIds),
    getVisitDeliveryFlagsMap(visitIds),
  ]);

  return visits.map((visit) => {
    if (!visit || !visit.person) return visit;
    const pid = String(visit.person.id || '');
    const vid = String(visit.id || '');
    const dbFlags = flagsMap.get(pid);
    const vFlags = visitFlagsMap.get(vid);

    return sanitizeVisitForClient({
      ...visit,
      hasIncomingDoc: vFlags ? vFlags.hasIncomingDoc : Boolean(dbFlags?.hasDeliveryDocImage),
      incomingDocCapturedAt: vFlags?.incomingDocCapturedAt ?? dbFlags?.incomingDocCapturedAt ?? null,
      hasOutgoingDoc: vFlags ? vFlags.hasOutgoingDoc : false,
      outgoingDocCapturedAt: vFlags?.outgoingDocCapturedAt ?? null,
      person: sanitizePersonForClient({
        ...visit.person,
        hasCnicImage: dbFlags
          ? dbFlags.hasCnicImage
          : Boolean(visit.person.cnicImageData ?? visit.person.hasCnicImage),
        hasDlsImage: dbFlags
          ? dbFlags.hasDlsImage
          : Boolean(visit.person.dlsImageData ?? visit.person.hasDlsImage),
        hasDeliveryDocImage: vFlags?.hasIncomingDoc
          ? true
          : dbFlags
          ? dbFlags.hasDeliveryDocImage
          : Boolean(visit.person.deliveryDocImageData ?? visit.person.hasDeliveryDocImage),
        hasOutgoingDocImage: vFlags?.hasOutgoingDoc
          ? true
          : dbFlags
          ? dbFlags.hasOutgoingDocImage
          : false,
        latestDeliveryVisitId: vid || dbFlags?.latestDeliveryVisitId || null,
        incomingDocCapturedAt: vFlags?.incomingDocCapturedAt ?? dbFlags?.incomingDocCapturedAt ?? null,
        outgoingDocCapturedAt: vFlags?.outgoingDocCapturedAt ?? dbFlags?.outgoingDocCapturedAt ?? null,
      }),
    });
  });
}
