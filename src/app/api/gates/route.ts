import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role === 'ADMIN') {
      const gates = await prisma.gate.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: {
              entryVisits: true,
              exitVisits: true,
            },
          },
        },
      });

      return NextResponse.json({ success: true, gates });
    }

    // For OPERATOR users: return ONLY active gates explicitly assigned to this Operator
    const assignedGates = await prisma.gate.findMany({
      where: {
        active: true,
        userAccess: {
          some: {
            userId: user.id,
          },
        },
      },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            entryVisits: true,
            exitVisits: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, gates: assignedGates });
  } catch (error: any) {
    console.error('Error fetching gates:', error);
    return NextResponse.json({ error: 'Failed to fetch gates' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin role required' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, type, active } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Gate name is required' }, { status: 400 });
    }

    const gate = await prisma.gate.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        type: type || 'BOTH',
        active: active !== undefined ? active : true,
      },
    });

    await logAudit({
      action: 'CREATE_GATE',
      entityType: 'Gate',
      entityId: gate.id,
      details: { name: gate.name, type: gate.type },
      performedById: user.id,
    });

    return NextResponse.json({ success: true, gate });
  } catch (error: any) {
    console.error('Error creating gate:', error);
    return NextResponse.json({ error: 'Failed to create gate' }, { status: 500 });
  }
}
