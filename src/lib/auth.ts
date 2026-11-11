import { passwordSchema, RequestValidationError } from '@/lib/requestValidation';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import prisma from './prisma';
import { getJwtSecret } from './secrets';
import { ensureOperatorUserSchema } from './operatorQr';

const JWT_ALGORITHM = 'HS256' as const;
const STAFF_SESSION_PURPOSE = 'STAFF_SESSION';

function signJwt(payload: object): string {
  return jwt.sign(payload, getJwtSecret(), { algorithm: JWT_ALGORITHM, expiresIn: '7d' });
}

function verifyJwt<T>(token: string): T {
  return jwt.verify(token, getJwtSecret(), { algorithms: [JWT_ALGORITHM] }) as T;
}
// Independent installations on different ports still share a browser cookie
// host. Give each installation its own cookie names as well as its JWT secret.
const COOKIE_PREFIX = process.env.AUTH_COOKIE_PREFIX || 'gk';
const TOKEN_COOKIE_NAME = `${COOKIE_PREFIX}_token`;
const EMPLOYEE_TOKEN_COOKIE_NAME = `${COOKIE_PREFIX}_emp_token`;
const EMPLOYEE_STATUS_COOKIE_NAME = `${COOKIE_PREFIX}_emp_applicant`;
const OPERATOR_STATUS_COOKIE_NAME = `${COOKIE_PREFIX}_op_applicant`;

export type UserRole = 'ADMIN' | 'OPERATOR' | 'EMPLOYEE';
export type EmployeeApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'OPERATOR';
  gateIds?: string[];
}

export interface OperatorApplicantUser {
  id: string;
  email: string;
  name: string;
  role: 'OPERATOR';
  approvalStatus: EmployeeApprovalStatus;
  phoneNumber: string | null;
  departmentId: string | null;
  departmentName: string | null;
  operatorNumber: string | null;
  active: boolean;
  approvedAt?: Date | string | null;
  rejectedAt?: Date | string | null;
  rejectionReason?: string | null;
  createdAt?: Date | string;
}

export interface EmployeeAuthUser {
  id: string;
  email: string;
  name: string;
  role: 'EMPLOYEE';
  approvalStatus: EmployeeApprovalStatus;
  departmentId: string | null;
  departmentName: string | null;
  position: string | null;
  phoneNumber: string | null;
  active: boolean;
  approvedAt?: Date | string | null;
  rejectedAt?: Date | string | null;
  rejectionReason?: string | null;
  createdAt?: Date | string;
}

interface DbUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  approvalStatus: EmployeeApprovalStatus;
  departmentId: string | null;
  departmentName: string | null;
  position: string | null;
  phoneNumber: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  passwordChangedAt?: Date | null;
  createdAt: Date;
}

export async function hashPassword(password: string): Promise<string> {
  if (!passwordSchema.safeParse(password).success) {
    throw new RequestValidationError('Password must be at most 72 UTF-8 bytes.');
  }
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummyHashPromise: Promise<string> | null = null;

/**
 * Compares against a real hash, or a throwaway hash when the account does not
 * exist, so response timing does not reveal which email addresses are registered.
 */
export async function comparePasswordConstantTime(password: string, hash: string | null | undefined): Promise<boolean> {
  if (hash) return bcrypt.compare(password, hash);
  dummyHashPromise ??= bcrypt.hash('gateshield-dummy-password', 10);
  await bcrypt.compare(password, await dummyHashPromise);
  return false;
}

export function generateToken(user: AuthUser): string {
  return signJwt({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    gateIds: user.gateIds || [],
    purpose: STAFF_SESSION_PURPOSE,
    issuedAtMs: Date.now(),
  });
}

export function generateEmployeeToken(user: {
  id: string;
  email: string;
  name: string;
  purpose: 'EMPLOYEE_SESSION' | 'APPLICANT_STATUS';
}): string {
  return signJwt({
    id: user.id,
    email: user.email,
    name: user.name,
    role: 'EMPLOYEE',
    purpose: user.purpose,
    issuedAtMs: Date.now(),
  });
}

export function verifyToken(token: string): (AuthUser & { iat?: number; issuedAtMs?: number }) | null {
  try {
    const decoded = verifyJwt<AuthUser & { iat?: number; issuedAtMs?: number; purpose?: string }>(token);
    // Reject tokens minted for another purpose (applicant status, employee portal).
    // Legacy staff tokens issued before the purpose claim existed carry no purpose.
    if (!decoded || (decoded.purpose !== undefined && decoded.purpose !== STAFF_SESSION_PURPOSE)) {
      return null;
    }
    if (decoded.role !== 'ADMIN' && decoded.role !== 'OPERATOR') return null;
    return decoded;
  } catch {
    return null;
  }
}

export function verifyEmployeeToken(
  token: string
): { id: string; email: string; name: string; role: 'EMPLOYEE'; purpose?: string; iat?: number; issuedAtMs?: number } | null {
  try {
    const decoded = verifyJwt<{
      id: string;
      email: string;
      name: string;
      role: string;
      purpose?: string;
      iat?: number;
      issuedAtMs?: number;
    }>(token);
    if (!decoded || !decoded.id || decoded.role !== 'EMPLOYEE') return null;
    return {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: 'EMPLOYEE',
      purpose: decoded.purpose,
      iat: decoded.iat,
      issuedAtMs: decoded.issuedAtMs,
    };
  } catch {
    return null;
  }
}

/**
 * Staff session check (ADMIN or OPERATOR only).
 * Automatically blocks EMPLOYEE accounts and any PENDING/REJECTED/inactive OPERATOR accounts,
 * and revokes sessions issued before a password change.
 */
export async function getSessionUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;
    if (!token) return null;
    const decoded = verifyToken(token);
    if (!decoded || !decoded.id) return null;

    // Older local databases may lack newer user columns (e.g. passwordChangedAt);
    // without them this query fails and every login bounces back to /login.
    await ensureOperatorUserSchema(prisma);

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        email: string;
        name: string;
        role: string;
        active: boolean;
        approvalStatus: string;
        passwordChangedAt: Date | null;
      }>
    >`
      SELECT
        "id",
        "email",
        "name",
        "role"::text AS "role",
        "active",
        COALESCE("approvalStatus"::text, 'APPROVED') AS "approvalStatus",
        "passwordChangedAt"
      FROM "users"
      WHERE "id" = ${decoded.id}
      LIMIT 1
    `;

    const dbUser = rows[0];
    if (!dbUser || !dbUser.active || dbUser.approvalStatus !== 'APPROVED') {
      return null;
    }

    if (
      dbUser.passwordChangedAt &&
      (decoded.issuedAtMs ?? (decoded.iat ?? 0) * 1000) < new Date(dbUser.passwordChangedAt).getTime()
    ) {
      return null;
    }

    // Strict vertical privilege separation: EMPLOYEE role is never allowed in staff session
    if (dbUser.role !== 'ADMIN' && dbUser.role !== 'OPERATOR') {
      return null;
    }

    // Gate scoping must reflect current assignments, not the list baked into a 7-day token.
    const gateAccess =
      dbUser.role === 'ADMIN'
        ? []
        : await prisma.userGateAccess.findMany({
            where: { userId: dbUser.id },
            select: { gateId: true },
          });

    return {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      gateIds: gateAccess.map((ga) => ga.gateId),
    };
  } catch (error) {
    console.error("[auth] getSessionUser failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

export function generateOperatorApplicantToken(user: {
  id: string;
  email: string;
  name: string;
}): string {
  return signJwt({
    id: user.id,
    email: user.email,
    name: user.name,
    role: 'OPERATOR',
    purpose: 'OPERATOR_APPLICANT_STATUS',
  });
}

export function verifyOperatorApplicantToken(
  token: string
): { id: string; email: string; name: string; role: 'OPERATOR'; purpose?: string } | null {
  try {
    const decoded = verifyJwt<{
      id: string;
      email: string;
      name: string;
      role: string;
      purpose?: string;
    }>(token);
    if (!decoded || !decoded.id || decoded.role !== 'OPERATOR') return null;
    return {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: 'OPERATOR',
      purpose: decoded.purpose,
    };
  } catch {
    return null;
  }
}

export async function getOperatorApplicantFromCookies(): Promise<OperatorApplicantUser | null> {
  try {
    const cookieStore = await cookies();
    const rawToken = cookieStore.get(OPERATOR_STATUS_COOKIE_NAME)?.value;
    if (!rawToken) return null;

    const decoded = verifyOperatorApplicantToken(rawToken);
    if (!decoded || !decoded.id) return null;

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        email: string;
        name: string;
        role: string;
        active: boolean;
        approvalStatus: EmployeeApprovalStatus;
        phoneNumber: string | null;
        departmentId: string | null;
        departmentName: string | null;
        operatorNumber: string | null;
        approvedAt: Date | null;
        rejectedAt: Date | null;
        rejectionReason: string | null;
        createdAt: Date;
      }>
    >`
      SELECT
        "id",
        "email",
        "name",
        "role"::text AS "role",
        "active",
        COALESCE("approvalStatus"::text, 'PENDING') AS "approvalStatus",
        "phoneNumber",
        "departmentId",
        "departmentName",
        "operatorNumber",
        "approvedAt",
        "rejectedAt",
        "rejectionReason",
        "createdAt"
      FROM "users"
      WHERE "id" = ${decoded.id}
      LIMIT 1
    `;

    const dbUser = rows[0];
    if (!dbUser || dbUser.role !== 'OPERATOR') {
      return null;
    }

    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: 'OPERATOR',
      approvalStatus: dbUser.approvalStatus,
      phoneNumber: dbUser.phoneNumber,
      departmentId: dbUser.departmentId,
      departmentName: dbUser.departmentName,
      operatorNumber: dbUser.operatorNumber,
      active: dbUser.active,
      approvedAt: dbUser.approvedAt,
      rejectedAt: dbUser.rejectedAt,
      rejectionReason: dbUser.rejectionReason,
      createdAt: dbUser.createdAt,
    };
  } catch {
    return null;
  }
}

/**
 * Approved Employee session check (strictly requires role === 'EMPLOYEE', approvalStatus === 'APPROVED', active === true).
 */
export async function getEmployeeSessionUser(): Promise<EmployeeAuthUser | null> {
  try {
    const cookieStore = await cookies();
    const empToken =
      cookieStore.get(EMPLOYEE_TOKEN_COOKIE_NAME)?.value ||
      cookieStore.get(EMPLOYEE_STATUS_COOKIE_NAME)?.value;
    if (!empToken) return null;

    const decoded = verifyEmployeeToken(empToken);
    if (!decoded || !decoded.id) return null;

    await ensureOperatorUserSchema(prisma);

    const rows = await prisma.$queryRaw<DbUserRow[]>`
      SELECT
        "id",
        "email",
        "name",
        "role"::text AS "role",
        "active",
        COALESCE("approvalStatus"::text, 'APPROVED') AS "approvalStatus",
        "departmentId",
        "departmentName",
        "position",
        "phoneNumber",
        "approvedAt",
        "rejectedAt",
        "rejectionReason",
        "passwordChangedAt",
        "createdAt"
      FROM "users"
      WHERE "id" = ${decoded.id}
      LIMIT 1
    `;

    const dbUser = rows[0];
    if (
      !dbUser ||
      !dbUser.active ||
      dbUser.role !== 'EMPLOYEE' ||
      dbUser.approvalStatus !== 'APPROVED'
    ) {
      return null;
    }

    if (
      dbUser.passwordChangedAt &&
      (decoded.issuedAtMs ?? (decoded.iat ?? 0) * 1000) < new Date(dbUser.passwordChangedAt).getTime()
    ) {
      return null;
    }

    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: 'EMPLOYEE',
      approvalStatus: dbUser.approvalStatus,
      departmentId: dbUser.departmentId,
      departmentName: dbUser.departmentName,
      position: dbUser.position,
      phoneNumber: dbUser.phoneNumber,
      active: dbUser.active,
      approvedAt: dbUser.approvedAt,
      rejectedAt: dbUser.rejectedAt,
      rejectionReason: dbUser.rejectionReason,
      createdAt: dbUser.createdAt,
    };
  } catch (error) {
    console.error("[auth] getEmployeeSessionUser failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Applicant/Employee status check (returns PENDING, APPROVED, or REJECTED employee record for /employee portal status polling).
 * Does NOT grant access to protected employee dashboard endpoints unless approvalStatus === 'APPROVED'.
 */
export async function getEmployeePortalAccountFromCookies(): Promise<EmployeeAuthUser | null> {
  try {
    const cookieStore = await cookies();
    const empSessionToken = cookieStore.get(EMPLOYEE_TOKEN_COOKIE_NAME)?.value;
    const applicantToken = cookieStore.get(EMPLOYEE_STATUS_COOKIE_NAME)?.value;
    const rawToken = empSessionToken || applicantToken;
    if (!rawToken) return null;

    const decoded = verifyEmployeeToken(rawToken);
    if (!decoded || !decoded.id) return null;

    const rows = await prisma.$queryRaw<DbUserRow[]>`
      SELECT
        "id",
        "email",
        "name",
        "role"::text AS "role",
        "active",
        COALESCE("approvalStatus"::text, 'PENDING') AS "approvalStatus",
        "departmentId",
        "departmentName",
        "position",
        "phoneNumber",
        "approvedAt",
        "rejectedAt",
        "rejectionReason",
        "createdAt"
      FROM "users"
      WHERE "id" = ${decoded.id}
      LIMIT 1
    `;

    const dbUser = rows[0];
    if (!dbUser || dbUser.role !== 'EMPLOYEE') {
      return null;
    }

    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: 'EMPLOYEE',
      approvalStatus: dbUser.approvalStatus,
      departmentId: dbUser.departmentId,
      departmentName: dbUser.departmentName,
      position: dbUser.position,
      phoneNumber: dbUser.phoneNumber,
      active: dbUser.active,
      approvedAt: dbUser.approvedAt,
      rejectedAt: dbUser.rejectedAt,
      rejectionReason: dbUser.rejectionReason,
      createdAt: dbUser.createdAt,
    };
  } catch {
    return null;
  }
}

export async function requireAuthUser(requiredRole?: 'ADMIN' | 'OPERATOR'): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  if (requiredRole && user.role !== requiredRole && user.role !== 'ADMIN') {
    throw new Error('FORBIDDEN');
  }
  return user;
}

export {
  TOKEN_COOKIE_NAME,
  EMPLOYEE_TOKEN_COOKIE_NAME,
  EMPLOYEE_STATUS_COOKIE_NAME,
  OPERATOR_STATUS_COOKIE_NAME,
};
