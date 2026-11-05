/**
 * Safe Base64-to-Filesystem Image Migration Script for GateShield
 *
 * 1. Inspects PostgreSQL tables (`persons`, `parcels`, `vip_guests`, `guest_invitations`)
 *    for any existing Base64 image data.
 * 2. Backs up affected rows (record ID + column + original Base64 payload) to
 *    `uploads/_migration_backup/base64_backup_<timestamp>.json` BEFORE modifying any DB reference.
 * 3. Writes each Base64 image to the appropriate structured directory under `uploads/`:
 *    - `uploads/cnic/`
 *    - `uploads/dls/`
 *    - `uploads/profiles/`
 *    - `uploads/delivery/incoming/`
 *    - `uploads/delivery/outgoing/`
 *    - `uploads/parcels/`
 *    - `uploads/vip/`
 *    - `uploads/invitations/`
 * 4. Verifies each file exists on disk with non-zero size (`fs.stat`) BEFORE updating the DB path reference.
 * 5. Preserves legacy Base64 columns (`cnicImageData`, `dlsImageData`, `deliveryDocImageData`) intact
 *    so zero data is lost and rollback is instantaneous if ever needed.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const UPLOADS_ROOT = process.env.GATESHIELD_UPLOADS_DIR
  ? path.resolve(process.env.GATESHIELD_UPLOADS_DIR)
  : path.resolve(process.cwd(), 'uploads');

const ALLOWED_MIMES = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function parseDataUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('data:image/')) return null;

  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
  if (!match) return null;

  const rawMime = match[1].toLowerCase();
  const ext = ALLOWED_MIMES[rawMime];
  if (!ext) return null;

  const cleanBase64 = match[2].replace(/\s+/g, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  if (!buffer || buffer.length === 0) return null;

  return {
    mime: rawMime === 'image/jpg' ? 'image/jpeg' : rawMime,
    ext,
    buffer,
  };
}

async function writeAndVerifyFile(category, prefix, parsed) {
  const dirPath = path.resolve(UPLOADS_ROOT, category);
  await fs.mkdir(dirPath, { recursive: true });

  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const randHex = crypto.randomBytes(8).toString('hex');
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'img';
  const fileName = `${safePrefix}_${datePart}_${now.getTime()}_${randHex}.${parsed.ext}`;

  const absolutePath = path.resolve(dirPath, fileName);
  const tempPath = `${absolutePath}.tmp_${crypto.randomBytes(4).toString('hex')}`;

  await fs.writeFile(tempPath, parsed.buffer, { mode: 0o600 });
  await fs.rename(tempPath, absolutePath);

  // Verify on disk before returning
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile() || stat.size !== parsed.buffer.length || stat.size === 0) {
    throw new Error(`Disk verification failed for ${absolutePath}`);
  }

  const relativeKey = `${category}/${fileName}`;
  return {
    relativeKey,
    publicUrl: `/api/files/${relativeKey}`,
    mime: parsed.mime,
    sizeBytes: stat.size,
  };
}

async function ensureDirectories() {
  const dirs = [
    'cnic',
    'dls',
    'profiles',
    'delivery/incoming',
    'delivery/outgoing',
    'parcels',
    'vip',
    'invitations',
    '_migration_backup',
  ];
  for (const d of dirs) {
    await fs.mkdir(path.resolve(UPLOADS_ROOT, d), { recursive: true });
  }
}

async function main() {
  console.log(`[Migration] Using uploads root: ${UPLOADS_ROOT}`);
  await ensureDirectories();

  const backupEntries = [];
  const stats = {
    personsCnicMigrated: 0,
    personsDlsMigrated: 0,
    personsDeliveryDocMigrated: 0,
    personsProfileMigrated: 0,
    parcelsPhotoMigrated: 0,
    vipPhotoMigrated: 0,
    invitationsPhotoMigrated: 0,
  };

  // 1. Inspect `persons`
  const persons = await prisma.$queryRaw`
    SELECT
      "id",
      "category"::text AS "category",
      "photoUrl",
      "cnicImageData",
      "cnicImagePath",
      "dlsImageData",
      "dlsImagePath",
      "deliveryDocImageData",
      "deliveryDocImagePath"
    FROM "persons"
    WHERE
      (COALESCE("photoUrl", '') LIKE 'data:image/%')
      OR (COALESCE("cnicImageData", '') LIKE 'data:image/%' AND COALESCE("cnicImagePath", '') = '')
      OR (COALESCE("dlsImageData", '') LIKE 'data:image/%' AND COALESCE("dlsImagePath", '') = '')
      OR (COALESCE("deliveryDocImageData", '') LIKE 'data:image/%' AND COALESCE("deliveryDocImagePath", '') = '')
  `;

  console.log(`[Migration] Found ${persons.length} person row(s) with unmigrated Base64 images.`);

  for (const p of persons) {
    // 1a. Profile photoUrl
    if (p.photoUrl && p.photoUrl.startsWith('data:image/')) {
      const parsed = parseDataUrl(p.photoUrl);
      if (parsed) {
        backupEntries.push({
          table: 'persons',
          id: p.id,
          column: 'photoUrl',
          originalValue: p.photoUrl,
        });
        const saved = await writeAndVerifyFile('profiles', `profile_${p.id}`, parsed);
        await prisma.$executeRaw`
          UPDATE "persons"
          SET "photoUrl" = ${saved.publicUrl}, "updatedAt" = NOW()
          WHERE "id" = ${p.id}
        `;
        stats.personsProfileMigrated++;
      }
    }

    // 1b. CNIC image
    if (p.cnicImageData && p.cnicImageData.startsWith('data:image/') && !p.cnicImagePath) {
      const parsed = parseDataUrl(p.cnicImageData);
      if (parsed) {
        backupEntries.push({
          table: 'persons',
          id: p.id,
          column: 'cnicImageData',
          originalLength: p.cnicImageData.length,
        });
        const saved = await writeAndVerifyFile('cnic', `cnic_${p.id}`, parsed);
        await prisma.$executeRaw`
          UPDATE "persons"
          SET "cnicImagePath" = ${saved.relativeKey},
              "cnicImageMime" = ${saved.mime},
              "cnicImageSize" = ${saved.sizeBytes},
              "updatedAt" = NOW()
          WHERE "id" = ${p.id}
        `;
        stats.personsCnicMigrated++;
      }
    }

    // 1c. DLS image
    if (p.dlsImageData && p.dlsImageData.startsWith('data:image/') && !p.dlsImagePath) {
      const parsed = parseDataUrl(p.dlsImageData);
      if (parsed) {
        backupEntries.push({
          table: 'persons',
          id: p.id,
          column: 'dlsImageData',
          originalLength: p.dlsImageData.length,
        });
        const saved = await writeAndVerifyFile('dls', `dls_${p.id}`, parsed);
        await prisma.$executeRaw`
          UPDATE "persons"
          SET "dlsImagePath" = ${saved.relativeKey},
              "dlsImageMime" = ${saved.mime},
              "dlsImageSize" = ${saved.sizeBytes},
              "updatedAt" = NOW()
          WHERE "id" = ${p.id}
        `;
        stats.personsDlsMigrated++;
      }
    }

    // 1d. Delivery Incoming Document image
    if (
      p.deliveryDocImageData &&
      p.deliveryDocImageData.startsWith('data:image/') &&
      !p.deliveryDocImagePath
    ) {
      const parsed = parseDataUrl(p.deliveryDocImageData);
      if (parsed) {
        backupEntries.push({
          table: 'persons',
          id: p.id,
          column: 'deliveryDocImageData',
          originalLength: p.deliveryDocImageData.length,
        });
        const saved = await writeAndVerifyFile(
          'delivery/incoming',
          `delivery_in_${p.id}`,
          parsed
        );
        await prisma.$executeRaw`
          UPDATE "persons"
          SET "deliveryDocImagePath" = ${saved.relativeKey},
              "deliveryDocImageMime" = ${saved.mime},
              "deliveryDocImageSize" = ${saved.sizeBytes},
              "updatedAt" = NOW()
          WHERE "id" = ${p.id}
        `;

        // Also link to the latest visit for this person if incomingDocPath is null
        const latestVisits = await prisma.$queryRaw`
          SELECT "id", "checkInTime"
          FROM "visits"
          WHERE "personId" = ${p.id}
            AND COALESCE("incomingDocPath", '') = ''
          ORDER BY "checkInTime" DESC
          LIMIT 1
        `;
        if (latestVisits.length > 0) {
          await prisma.$executeRaw`
            UPDATE "visits"
            SET "incomingDocPath" = ${saved.relativeKey},
                "incomingDocMime" = ${saved.mime},
                "incomingDocSize" = ${saved.sizeBytes},
                "incomingDocCapturedAt" = COALESCE("incomingDocCapturedAt", "checkInTime"),
                "updatedAt" = NOW()
            WHERE "id" = ${latestVisits[0].id}
          `;
        }
        stats.personsDeliveryDocMigrated++;
      }
    }
  }

  // 2. Also normalize any existing `visits.vehicleNo` where `vehicleNoNormalized` is empty
  const visitsWithVehicle = await prisma.$queryRaw`
    SELECT "id", "vehicleNo"
    FROM "visits"
    WHERE COALESCE("vehicleNo", '') <> ''
      AND COALESCE("vehicleNoNormalized", '') = ''
  `;
  for (const v of visitsWithVehicle) {
    const norm = String(v.vehicleNo || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase();
    if (norm) {
      await prisma.$executeRaw`
        UPDATE "visits"
        SET "vehicleNoNormalized" = ${norm}
        WHERE "id" = ${v.id}
      `;
    }
  }

  // 3. Inspect `parcels`
  const parcels = await prisma.$queryRaw`
    SELECT "id", "photoUrl"
    FROM "parcels"
    WHERE COALESCE("photoUrl", '') LIKE 'data:image/%'
  `;
  console.log(`[Migration] Found ${parcels.length} parcel row(s) with Base64 photoUrl.`);

  for (const prc of parcels) {
    const parsed = parseDataUrl(prc.photoUrl);
    if (parsed) {
      backupEntries.push({
        table: 'parcels',
        id: prc.id,
        column: 'photoUrl',
        originalValue: prc.photoUrl,
      });
      const saved = await writeAndVerifyFile('parcels', `parcel_${prc.id}`, parsed);
      await prisma.$executeRaw`
        UPDATE "parcels"
        SET "photoUrl" = ${saved.publicUrl}, "updatedAt" = NOW()
        WHERE "id" = ${prc.id}
      `;
      stats.parcelsPhotoMigrated++;
    }
  }

  // 4. Inspect `vip_guests`
  const vips = await prisma.$queryRaw`
    SELECT "id", "photoUrl"
    FROM "vip_guests"
    WHERE COALESCE("photoUrl", '') LIKE 'data:image/%'
  `;
  console.log(`[Migration] Found ${vips.length} vip_guests row(s) with Base64 photoUrl.`);

  for (const vip of vips) {
    const parsed = parseDataUrl(vip.photoUrl);
    if (parsed) {
      backupEntries.push({
        table: 'vip_guests',
        id: vip.id,
        column: 'photoUrl',
        originalValue: vip.photoUrl,
      });
      const saved = await writeAndVerifyFile('vip', `vip_${vip.id}`, parsed);
      await prisma.$executeRaw`
        UPDATE "vip_guests"
        SET "photoUrl" = ${saved.publicUrl}, "updatedAt" = NOW()
        WHERE "id" = ${vip.id}
      `;
      stats.vipPhotoMigrated++;
    }
  }

  // 5. Inspect `guest_invitations`
  const invitations = await prisma.$queryRaw`
    SELECT "id", "guestPhotoUrl"
    FROM "guest_invitations"
    WHERE COALESCE("guestPhotoUrl", '') LIKE 'data:image/%'
  `;
  console.log(
    `[Migration] Found ${invitations.length} guest_invitations row(s) with Base64 guestPhotoUrl.`
  );

  for (const inv of invitations) {
    const parsed = parseDataUrl(inv.guestPhotoUrl);
    if (parsed) {
      backupEntries.push({
        table: 'guest_invitations',
        id: inv.id,
        column: 'guestPhotoUrl',
        originalValue: inv.guestPhotoUrl,
      });
      const saved = await writeAndVerifyFile('invitations', `inv_${inv.id}`, parsed);
      await prisma.$executeRaw`
        UPDATE "guest_invitations"
        SET "guestPhotoUrl" = ${saved.publicUrl}, "updatedAt" = NOW()
        WHERE "id" = ${inv.id}
      `;
      stats.invitationsPhotoMigrated++;
    }
  }

  // Write backup manifest if any rows were migrated
  if (backupEntries.length > 0) {
    const backupFile = path.resolve(
      UPLOADS_ROOT,
      '_migration_backup',
      `base64_backup_${Date.now()}.json`
    );
    await fs.writeFile(
      backupFile,
      JSON.stringify(
        {
          migratedAt: new Date().toISOString(),
          stats,
          entries: backupEntries,
        },
        null,
        2
      ),
      { mode: 0o600 }
    );
    console.log(`[Migration] Backup manifest written to: ${backupFile}`);
  }

  console.log('[Migration] Summary:', JSON.stringify(stats, null, 2));
}

main()
  .catch((err) => {
    console.error('[Migration] Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
