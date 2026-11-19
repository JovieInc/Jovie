import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/middleware';
import { db } from '@/lib/db';
import { investorSettings } from '@/lib/db/schema/investors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Schema for the update-portal-settings request body. */
const updateInvestorSettingsSchema = z.object({
  showProgressBar: z.boolean().optional(),
  raiseTarget: z.number().int().optional(),
  committedAmount: z.number().int().optional(),
  investorCount: z.number().int().optional(),
  bookCallUrl: z.string().nullish(),
  investUrl: z.string().nullish(),
  slackWebhookUrl: z.string().nullish(),
  followupEnabled: z.boolean().optional(),
  followupDelayHours: z.number().int().optional(),
  engagedThreshold: z.number().int().optional(),
});

/**
 * GET /api/admin/investors/settings
 * Get portal settings (single row).
 */
export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;

  const [settings] = await db.select().from(investorSettings).limit(1);

  if (!settings) {
    return NextResponse.json({ settings: null });
  }

  return NextResponse.json({ settings });
}

/**
 * PUT /api/admin/investors/settings
 * Update portal settings.
 */
export async function PUT(request: Request) {
  const authError = await requireAdmin({ session: 'fresh' });
  if (authError) return authError;

  const body: unknown = await request.json().catch(() => null);
  const parsed = updateInvestorSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const allowedFields = [
    'showProgressBar',
    'raiseTarget',
    'committedAmount',
    'investorCount',
    'bookCallUrl',
    'investUrl',
    'slackWebhookUrl',
    'followupEnabled',
    'followupDelayHours',
    'engagedThreshold',
  ] as const;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const field of allowedFields) {
    if (field in parsed.data) {
      updates[field] = parsed.data[field];
    }
  }

  // Get existing settings row
  const [existing] = await db.select().from(investorSettings).limit(1);

  let settings;
  if (existing) {
    [settings] = await db
      .update(investorSettings)
      .set(updates)
      .where(eq(investorSettings.id, existing.id))
      .returning();
  } else {
    // Create settings row if it doesn't exist
    [settings] = await db.insert(investorSettings).values(updates).returning();
  }

  return NextResponse.json({ settings });
}
