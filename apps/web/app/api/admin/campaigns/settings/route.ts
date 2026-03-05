/**
 * Campaign Settings API
 *
 * GET/POST singleton row of campaign configuration: fit score threshold,
 * batch limit, and throttling config.
 */

import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { campaignSettings } from '@/lib/db/schema/admin';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const SETTINGS_ID = 1;

/**
 * GET /api/admin/campaigns/settings — Returns current campaign settings.
 * Returns defaults if no row has been saved yet.
 */
export async function GET() {
  try {
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

    const [row] = await db
      .select()
      .from(campaignSettings)
      .where(eq(campaignSettings.id, SETTINGS_ID))
      .limit(1);

    if (!row) {
      // Return defaults if singleton not yet persisted
      return NextResponse.json(
        {
          ok: true,
          settings: {
            fitScoreThreshold: 50,
            batchLimit: 20,
            throttlingConfig: {
              minDelayMs: 30000,
              maxDelayMs: 120000,
              maxPerHour: 30,
            },
            updatedAt: null,
            updatedBy: null,
          },
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        settings: {
          fitScoreThreshold: Number(row.fitScoreThreshold),
          batchLimit: row.batchLimit,
          throttlingConfig: row.throttlingConfig,
          updatedAt: row.updatedAt.toISOString(),
          updatedBy: row.updatedBy,
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[Campaign Settings] Failed to fetch settings', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await captureError('Admin campaign settings GET failed', error, {
      route: '/api/admin/campaigns/settings',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to fetch campaign settings' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

interface UpdateCampaignSettingsBody {
  fitScoreThreshold?: number;
  batchLimit?: number;
  throttlingConfig?: {
    minDelayMs: number;
    maxDelayMs: number;
    maxPerHour: number;
  };
}

/**
 * POST /api/admin/campaigns/settings — Upserts campaign settings.
 */
export async function POST(request: NextRequest) {
  try {
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

    const parsed = await parseJsonBody(request, {
      route: '/api/admin/campaigns/settings',
    });
    if (!parsed.ok) return parsed.response;

    const body = parsed.data as UpdateCampaignSettingsBody;

    // Validate fields if provided
    if (
      body.fitScoreThreshold !== undefined &&
      (typeof body.fitScoreThreshold !== 'number' ||
        body.fitScoreThreshold < 0 ||
        body.fitScoreThreshold > 100)
    ) {
      return NextResponse.json(
        { error: 'fitScoreThreshold must be a number between 0 and 100' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (
      body.batchLimit !== undefined &&
      (typeof body.batchLimit !== 'number' ||
        body.batchLimit < 1 ||
        body.batchLimit > 500)
    ) {
      return NextResponse.json(
        { error: 'batchLimit must be a number between 1 and 500' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (body.throttlingConfig !== undefined) {
      const { minDelayMs, maxDelayMs, maxPerHour } = body.throttlingConfig;
      if (
        typeof minDelayMs !== 'number' ||
        typeof maxDelayMs !== 'number' ||
        typeof maxPerHour !== 'number' ||
        minDelayMs < 0 ||
        maxDelayMs < minDelayMs ||
        maxPerHour < 1
      ) {
        return NextResponse.json(
          { error: 'Invalid throttlingConfig values' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
    }

    const updatedBy = entitlements.userId ?? null;

    const updates: Partial<typeof campaignSettings.$inferInsert> = {
      updatedAt: new Date(),
      updatedBy,
    };
    if (body.fitScoreThreshold !== undefined) {
      updates.fitScoreThreshold = String(body.fitScoreThreshold);
    }
    if (body.batchLimit !== undefined) {
      updates.batchLimit = body.batchLimit;
    }
    if (body.throttlingConfig !== undefined) {
      updates.throttlingConfig = body.throttlingConfig;
    }

    const [row] = await db
      .insert(campaignSettings)
      .values({
        id: SETTINGS_ID,
        ...updates,
      })
      .onConflictDoUpdate({
        target: campaignSettings.id,
        set: updates,
      })
      .returning();

    return NextResponse.json(
      {
        ok: true,
        settings: {
          fitScoreThreshold: Number(row!.fitScoreThreshold),
          batchLimit: row!.batchLimit,
          throttlingConfig: row!.throttlingConfig,
          updatedAt: row!.updatedAt.toISOString(),
          updatedBy: row!.updatedBy,
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('[Campaign Settings] Failed to update settings', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await captureError('Admin campaign settings POST failed', error, {
      route: '/api/admin/campaigns/settings',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Failed to update campaign settings' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
