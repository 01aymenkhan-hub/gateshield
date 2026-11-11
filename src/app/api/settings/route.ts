import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { z } from 'zod';
import { readJson, RequestValidationError } from '@/lib/requestValidation';

const settingsSchema = z.object({
  default_visitor_badge_prefix: z.string().optional(),
  auto_checkout_hours: z.string().regex(/^\d+$/).refine(value => Number.isSafeInteger(Number(value)) && Number(value) > 0).optional(),
  require_visitor_photo: z.enum(['true', 'false']).optional(),
  company_name: z.string().optional(),
});

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin role required' }, { status: 403 });
    }

    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: Object.keys(settingsSchema.shape) } },
      orderBy: { key: 'asc' },
    });

    const settingsMap: Record<string, string> = {};
    settings.forEach((s: { key: string; value: string }) => {
      settingsMap[s.key] = s.value;
    });

    return NextResponse.json({ success: true, settings: settingsMap });
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized: Admin role required' }, { status: 403 });
    }

    const { settings } = await readJson(request, z.object({ settings: settingsSchema.strict() }));
    const entries = Object.entries(settings);
    if (!entries.length) {
      return NextResponse.json({ error: 'Settings object is required' }, { status: 400 });
    }

    await prisma.$transaction(entries.map(([key, value]) =>
      prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    ));

    await logAudit({
      action: 'UPDATE_SYSTEM_SETTINGS',
      entityType: 'SystemSetting',
      details: settings,
      performedById: user.id,
    });

    return NextResponse.json({ success: true, message: 'Settings saved successfully' });
  } catch (error: unknown) {
    if (error instanceof RequestValidationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Error saving settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
