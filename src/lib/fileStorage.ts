import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';

export type StorageCategory =
  | 'cnic'
  | 'dls'
  | 'profiles'
  | 'delivery/incoming'
  | 'delivery/outgoing'
  | 'parcels'
  | 'vip'
  | 'invitations';

const ALLOWED_CATEGORIES = new Set<StorageCategory>([
  'cnic',
  'dls',
  'profiles',
  'delivery/incoming',
  'delivery/outgoing',
  'parcels',
  'vip',
  'invitations',
]);

const ALLOWED_MIMES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

export function getUploadsRootDir(): string {
  const configured = process.env.GATESHIELD_UPLOADS_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(process.cwd(), 'uploads');
}

function verifyMagicBytes(buffer: Buffer, mime: string): boolean {
  if (buffer.byteLength < 12) return false;

  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mime === 'image/webp') {
    const riff = buffer.subarray(0, 4).toString('ascii');
    const webp = buffer.subarray(8, 12).toString('ascii');
    return riff === 'RIFF' && webp === 'WEBP';
  }
  return false;
}

export interface ParsedImagePayload {
  mime: string;
  ext: string;
  buffer: Buffer;
  size: number;
}

export function parseAndValidateImageDataUrl(raw: string): ParsedImagePayload {
  const trimmed = raw.trim();
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(trimmed);
  if (!match) {
    throw new Error('Invalid image format. Expected a base64-encoded image data URL.');
  }

  const rawMime = match[1].toLowerCase();
  const ext = ALLOWED_MIMES[rawMime];
  if (!ext) {
    throw new Error('Unsupported image type. Allowed types: JPEG, PNG, WebP.');
  }

  const base64Clean = match[2].replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(base64Clean)) {
    throw new Error('Invalid base64 encoding in image payload.');
  }

  const buffer = Buffer.from(base64Clean, 'base64');
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('Empty image payload.');
  }

  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error('Image exceeds the maximum allowed size (8 MB).');
  }

  const normalizedMime = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
  if (!verifyMagicBytes(buffer, normalizedMime)) {
    throw new Error('Image file signature does not match declared MIME type.');
  }

  return {
    mime: normalizedMime,
    ext,
    buffer,
    size: buffer.byteLength,
  };
}

export interface StoredFileResult {
  /** Relative storage key inside uploads root, e.g. "delivery/incoming/1761920000_a1b2c3.jpg" */
  storageKey: string;
  /** Normalized MIME type, e.g. "image/jpeg" */
  mime: string;
  /** File size in bytes */
  size: number;
  /** Authenticated URL for inline profile/parcel/vip images, e.g. "/api/files/profiles/..." */
  publicApiUrl: string;
}

/**
 * Resolves a storage key safely inside the uploads root directory, preventing path traversal.
 */
export function resolveSafeStoragePath(storageKey: string): {
  absolutePath: string;
  normalizedKey: string;
  mime: string;
} {
  if (!storageKey || typeof storageKey !== 'string') {
    throw new Error('Invalid storage key.');
  }

  const cleaned = storageKey
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^uploads\/+/, '');

  if (cleaned.includes('..') || cleaned.includes('\0')) {
    throw new Error('Path traversal attempt blocked.');
  }

  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error('Invalid storage key structure.');
  }

  const fileName = parts[parts.length - 1];
  const categoryPart = parts.slice(0, parts.length - 1).join('/') as StorageCategory;

  if (!ALLOWED_CATEGORIES.has(categoryPart)) {
    throw new Error(`Unauthorized storage category: ${categoryPart}`);
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) {
    throw new Error('Invalid filename characters.');
  }

  const rootDir = getUploadsRootDir();
  const normalizedKey = `${categoryPart}/${fileName}`;
  const absolutePath = path.resolve(rootDir, normalizedKey);

  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
  if (!absolutePath.startsWith(rootWithSep)) {
    throw new Error('Resolved path escapes uploads root directory.');
  }

  const ext = path.extname(fileName).toLowerCase();
  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
      ? 'image/webp'
      : 'image/jpeg';

  return {
    absolutePath,
    normalizedKey,
    mime,
  };
}

/**
 * Saves a validated Data URL image to persistent disk storage and verifies the written file.
 */
export async function saveImageDataUrlToFile(
  rawDataUrl: string,
  category: StorageCategory,
  prefix = 'img'
): Promise<StoredFileResult> {
  if (!ALLOWED_CATEGORIES.has(category)) {
    throw new Error(`Invalid storage category: ${category}`);
  }

  const parsed = parseAndValidateImageDataUrl(rawDataUrl);
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'img';
  const uniqueToken = crypto.randomBytes(8).toString('hex');
  const fileName = `${safePrefix}_${Date.now()}_${uniqueToken}.${parsed.ext}`;
  const storageKey = `${category}/${fileName}`;

  const { absolutePath, normalizedKey } = resolveSafeStoragePath(storageKey);
  const targetDir = path.dirname(absolutePath);

  await fs.mkdir(targetDir, { recursive: true });

  // Write atomically via temporary file in the same directory
  const tempPath = `${absolutePath}.tmp_${uniqueToken}`;
  await fs.writeFile(tempPath, parsed.buffer);
  await fs.rename(tempPath, absolutePath);

  // Verify the written file on disk before returning
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile() || stat.size !== parsed.size) {
    throw new Error('File verification failed after disk write.');
  }

  return {
    storageKey: normalizedKey,
    mime: parsed.mime,
    size: parsed.size,
    publicApiUrl: `/api/files/${normalizedKey}`,
  };
}

/**
 * If the incoming value is a base64 `data:image/...` string, saves it to disk and returns `/api/files/<key>`.
 * If it is already a `/api/files/...` URL or empty, returns it unchanged.
 */
export async function ensureImageStoredAsFileUrl(
  rawUrlOrData: string | null | undefined,
  category: StorageCategory,
  prefix = 'img'
): Promise<string | null> {
  if (!rawUrlOrData || typeof rawUrlOrData !== 'string') return null;
  const trimmed = rawUrlOrData.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:image/')) {
    const saved = await saveImageDataUrlToFile(trimmed, category, prefix);
    return saved.publicApiUrl;
  }

  return trimmed;
}

/**
 * Reads a stored file from disk by its storageKey (or `/api/files/<storageKey>` URL).
 */
export async function readStoredFileBuffer(
  keyOrUrl: string
): Promise<{ buffer: Buffer; mime: string; size: number } | null> {
  try {
    const cleanKey = keyOrUrl
      .trim()
      .replace(/^\/api\/files\/+/, '')
      .replace(/^\/+/, '');
    const { absolutePath, mime } = resolveSafeStoragePath(cleanKey);
    if (!fsSync.existsSync(absolutePath)) {
      return null;
    }
    const buffer = await fs.readFile(absolutePath);
    if (!buffer || buffer.byteLength === 0) {
      return null;
    }
    return {
      buffer,
      mime,
      size: buffer.byteLength,
    };
  } catch (err) {
    console.warn('[FileStorage] Failed to read stored file:', keyOrUrl, err);
    return null;
  }
}
