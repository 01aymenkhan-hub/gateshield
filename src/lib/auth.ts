import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import prisma from './prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'gatekeeper_secret_jwt_key_2026';
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
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      gateIds: user.gateIds || [],
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function generateEmployeeToken(user: {
  id: string;
  email: string;
  name: string;
  purpose: 'EMPLOYEE_SESSION' | 'APPLICANT_STATUS';
}): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'EMPLOYEE',
      purpose: user.purpose,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): (AuthUser & { iat?: number }) | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser & { iat?: number };
  } catch {
    return null;
  }
}

export function verifyEmployeeToken(
  token: string
): { id: string; email: string; name: string; role: 'EMPLOYEE'; purpose?: string; iat?: number } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      name: string;
      role: string;
      purpose?: string;
      iat?: number;
    };
    if (!decoded || !decoded.id || decoded.role !== 'EMPLOYEE') return null;
    return {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: 'EMPLOYEE',
      purpose: decoded.purpose,
      iat: decoded.iat,
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
      typeof decoded.iat === 'number' &&
      decoded.iat * 1000 < new Date(dbUser.passwordChangedAt).getTime() - 2000
    ) {
      return null;
    }

    // Strict vertical privilege separation: EMPLOYEE role is never allowed in staff session
    if (dbUser.role !== 'ADMIN' && dbUser.role !== 'OPERATOR') {
      return null;
    }

    return {
      ...decoded,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
    };
  } catch {
    return null;
  }
}

export function generateOperatorApplicantToken(user: {
  id: string;
  email: string;
  name: string;
}): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'OPERATOR',
      purpose: 'OPERATOR_APPLICANT_STATUS',
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyOperatorApplicantToken(
  token: string
): { id: string; email: string; name: string; role: 'OPERATOR'; purpose?: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      email: string;
      name: string;
      role: string;
      purpose?: string;
    };
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
      typeof decoded.iat === 'number' &&
      decoded.iat * 1000 < new Date(dbUser.passwordChangedAt).getTime() - 2000
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
  } catch {
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
