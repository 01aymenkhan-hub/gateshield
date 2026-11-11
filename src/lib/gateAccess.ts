// Gate-scoped authorization for OPERATOR accounts.
// Admins see everything. An operator may open a person or visit record only when
// it touched one of their assigned gates, or when the person is currently inside
// the premises (any exit gate must be able to process them).
import prisma from './prisma';
import type { AuthUser } from './auth';
import type { Prisma } from '@prisma/client';

type StaffUser = Pick<AuthUser, 'role' | 'gateIds'>;

export function isAdmin(user: StaffUser): boolean {
  return user.role === 'ADMIN';
}

export async function canAccessPerson(user: StaffUser, personId: string): Promise<boolean> {
  if (isAdmin(user)) return true;
  const hit = await prisma.visit.findFirst({
    where: { personId, ...visitAccessWhere(user) },
    select: { id: true },
  });
  return Boolean(hit);
}

export function visitAccessWhere(user: StaffUser): Prisma.VisitWhereInput {
  if (isAdmin(user)) return {};
  const gateIds = user.gateIds || [];
  return {
    OR: [
      { status: { in: ['CHECKED_IN', 'OVERSTAY'] }, checkOutTime: null },
      { entryGateId: { in: gateIds } },
      { exitGateId: { in: gateIds } },
    ],
  };
}

export function canAccessVisit(
  user: StaffUser,
  visit: { entryGateId: string; exitGateId: string | null; status: string; checkOutTime: Date | null }
): boolean {
  if (isAdmin(user)) return true;
  const gateIds = user.gateIds || [];
  if (gateIds.includes(visit.entryGateId)) return true;
  if (visit.exitGateId && gateIds.includes(visit.exitGateId)) return true;
  return (visit.status === 'CHECKED_IN' || visit.status === 'OVERSTAY') && !visit.checkOutTime;
}
