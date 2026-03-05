import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { leadPipelineSettings } from '@/lib/db/schema/leads';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError, getSafeErrorMessage } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export const runtime = 'nodejs';

const settingsUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  discoveryEnabled: z.boolean().optional(),
  autoIngestEnabled: z.boolean().optional(),
  autoIngestMinFitScore: z.number().int().min(0).max(100).optional(),
  dailyQueryBudget: z.number().int().min(1).max(10000).optional(),
});

/**
 * GET /api/admin/leads/settings — Return pipeline settings.
 */
export async function GET() {
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  if (!entitlements.isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    let [settings] = await db
      .select()
      .from(leadPipelineSettings)
      .where(eq(leadPipelineSettings.id, 1))
      .limit(1);

    if (!settings) {
      [settings] = await db
        .insert(leadPipelineSettings)
        .values({ id: 1 })
        .returning();
    }

    return NextResponse.json(
      { settings },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to get pipeline settings', error, {
      route: '/api/admin/leads/settings',
    });
    return NextResponse.json(
      { error: getSafeErrorMessage(error, 'Failed to get pipeline settings') },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * PATCH /api/admin/leads/settings — Update pipeline settings.
 */
export async function PATCH(request: NextRequest) {
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  if (!entitlements.isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const parsed = await parseJsonBody(request, {
      route: '/api/admin/leads/settings',
    });
    if (!parsed.ok) return parsed.response;

    const validated = settingsUpdateSchema.safeParse(parsed.data);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validated.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const [updated] = await db
      .update(leadPipelineSettings)
      .set({
        ...validated.data,
        updatedAt: new Date(),
      })
      .where(eq(leadPipelineSettings.id, 1))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Settings not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { settings: updated },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Failed to update pipeline settings', error, {
      route: '/api/admin/leads/settings',
    });
    return NextResponse.json(
      {
        error: getSafeErrorMessage(error, 'Failed to update pipeline settings'),
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
