// Server-side identity normalization and person matching for gate check-ins.
// Every person lookup that decides "who is this?" or "is this person blacklisted?"
// must go through here so formatting tricks (dashes, spaces, case) cannot split
// one human into two records or slip past a blacklist.
import type { Prisma, Person } from '@prisma/client';

export const PERSON_CATEGORIES = [
  'VISITOR',
  'VENDOR',
  'INTERVIEW',
  'SPECIAL_GUEST',
  'CONTRACTOR',
  'DELIVERY',
] as const;
export type PersonCategoryValue = (typeof PERSON_CATEGORIES)[number];

export function isPersonCategory(value: unknown): value is PersonCategoryValue {
  return typeof value === 'string' && (PERSON_CATEGORIES as readonly string[]).includes(value);
}

export class InputError extends Error {
  status = 400;
}

/** Returns the canonical `XXXXX-XXXXXXX-X` CNIC, or throws InputError if not 13 digits. */
export function normalizeCnic(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw new InputError('CNIC number must be text.');
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length !== 13 || /[^\d\s-]/.test(trimmed)) {
    throw new InputError('CNIC number must contain exactly 13 digits (e.g. 12345-1234567-1).');
  }
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

/** Driving licence numbers vary by province; canonicalize case and separators only. */
export function normalizeDls(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw new InputError('Driving licence number must be text.');
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!cleaned) return null;
  if (cleaned.length > 40 || !/^[A-Z0-9][A-Z0-9 /#.-]*$/.test(cleaned)) {
    throw new InputError('Driving licence number contains invalid characters.');
  }
  return cleaned;
}

/** Key used to compare licence numbers regardless of separators. */
export function dlsKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Optional bounded string field. Returns null for empty, throws InputError on wrong type
 * or excessive length. Control characters are stripped.
 */
export function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new InputError(`${field} must be text.`);
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!cleaned) return null;
  if (cleaned.length > max) throw new InputError(`${field} must be at most ${max} characters.`);
  return cleaned;
}

export function requiredText(value: unknown, field: string, max: number): string {
  const v = optionalText(value, field, max);
  if (!v) throw new InputError(`${field} is required.`);
  return v;
}

type Tx = Prisma.TransactionClient;

async function findByCnic(tx: Tx, cnic: string): Promise<Person | null> {
  const digits = cnic.replace(/\D/g, '');
  // Matches canonical, digits-only and any legacy spacing/dash variants.
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "persons"
    WHERE REGEXP_REPLACE(COALESCE("cnicNumber", ''), '[^0-9]', '', 'g') = ${digits}
    ORDER BY "isBlacklisted" DESC, "createdAt" ASC
    LIMIT 1
  `;
  return rows[0] ? tx.person.findUnique({ where: { id: rows[0].id } }) : null;
}

async function findByDls(tx: Tx, dls: string): Promise<Person | null> {
  const key = dlsKey(dls);
  if (!key) return null;
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "persons"
    WHERE REGEXP_REPLACE(UPPER(COALESCE("dlsNumber", '')), '[^A-Z0-9]', '', 'g') = ${key}
    ORDER BY "isBlacklisted" DESC, "createdAt" ASC
    LIMIT 1
  `;
  return rows[0] ? tx.person.findUnique({ where: { id: rows[0].id } }) : null;
}

export class IdentityConflictError extends Error {
  status = 409;
  code = 'IDENTITY_CONFLICT';
}

export class BlacklistedError extends Error {
  status = 403;
  blacklisted = true;
  constructor(public person: Person) {
    super(
      `ACCESS DENIED: This person is blacklisted! Reason: ${person.blacklistReason || 'Security alert'}`
    );
  }
}

/**
 * Resolves the existing Person for a check-in.
 * - Identity documents (CNIC / DLS) are authoritative. A phone number alone is used only
 *   when no identity document was supplied, so a reused or shared phone can never
 *   overwrite another person's identity.
 * - If CNIC and DLS point at two different records, the check-in is refused for review.
 * - Any blacklisted record reachable through the supplied CNIC, DLS or phone blocks entry.
 */
export async function resolvePersonForCheckIn(
  tx: Tx,
  ids: { cnic: string | null; dls: string | null; phone: string | null }
): Promise<Person | null> {
  const byCnic = ids.cnic ? await findByCnic(tx, ids.cnic) : null;
  const byDls = ids.dls ? await findByDls(tx, ids.dls) : null;

  for (const candidate of [byCnic, byDls]) {
    if (candidate?.isBlacklisted) throw new BlacklistedError(candidate);
  }

  if (byCnic && byDls && byCnic.id !== byDls.id) {
    throw new IdentityConflictError(
      'The CNIC and driving licence numbers belong to two different visitor records. Please ask an administrator to review this visitor.'
    );
  }

  let match = byCnic || byDls;

  // A licence-matched record that already carries a different CNIC is a different person.
  if (match && ids.cnic && match.cnicNumber) {
    if (match.cnicNumber.replace(/\D/g, '') !== ids.cnic.replace(/\D/g, '')) {
      throw new IdentityConflictError(
        'This driving licence is registered to a visitor with a different CNIC. Please ask an administrator to review this visitor.'
      );
    }
  }

  if (ids.phone) {
    const phoneMatches = await tx.person.findMany({
      where: { phoneNumber: ids.phone },
      take: 20,
    });
    const blacklistedByPhone = phoneMatches.find((p) => p.isBlacklisted);
    // Without a document the phone is the only identity we have.
    if (!ids.cnic && !ids.dls) {
      if (blacklistedByPhone) throw new BlacklistedError(blacklistedByPhone);
      match = match || phoneMatches[0] || null;
    } else if (blacklistedByPhone && !match) {
      // New document but the phone belongs to a blacklisted person: block for review.
      throw new BlacklistedError(blacklistedByPhone);
    }
  }

  return match;
}

/** Merge new values over an existing record without erasing data the form left blank. */
export function keepExisting<T>(next: T | null | undefined, existing: T | null | undefined): T | null {
  return next !== null && next !== undefined ? next : existing ?? null;
}
