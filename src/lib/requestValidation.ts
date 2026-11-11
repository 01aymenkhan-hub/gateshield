import { z } from 'zod';

export const MAX_OCR_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_OCR_BODY_BYTES = MAX_OCR_FILE_BYTES + 64 * 1024;

export class RequestValidationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export async function readBoundedBody(request: Request, limit: number) {
  const length = request.headers.get('content-length');
  if (length !== null && Number(length) > limit) {
    throw new RequestValidationError('Request body is too large.', 413);
  }
  if (!request.body) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) {
        void reader.cancel().catch(() => {});
        throw new RequestValidationError('Request body is too large.', 413);
      }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks, bytes);
  } finally {
    reader.releaseLock();
  }
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>, limit = 16 * 1024): Promise<T> {
  const mediaType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    throw new RequestValidationError('Expected application/json.', 415);
  }
  const body = await readBoundedBody(request, limit);
  let value: unknown;
  try {
    value = JSON.parse(body.toString('utf8'));
  } catch {
    throw new RequestValidationError('Invalid JSON body.');
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new RequestValidationError(parsed.error.issues[0]?.message || 'Invalid request.');
  return parsed.data;
}

export const passwordSchema = z.string().min(1).refine(
  value => Buffer.byteLength(value, 'utf8') <= 72,
  'Password must be at most 72 UTF-8 bytes.',
);

export const passwordLoginSchema = z.object({
  email: z.string().trim().min(1).max(254).transform(value => value.toLowerCase()),
  password: passwordSchema,
});
