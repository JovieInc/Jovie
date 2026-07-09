/**
 * POST /api/admin/feature-flags
 *
 * Admin-only. Sets the per-environment override for a runtime feature flag.
 * `enabled: null` clears the cell (flag falls back to its code default for
 * that environment). Works in all environments including production, gated by
 * `requireAdmin()`. Backs the admin Features page and the dev bar
 * "publish to env" action.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/middleware';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { featureFlagOverrides } from '@/lib/db/schema/feature-flags';
import { captureError } from '@/lib/error-tracking';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { FLAG_ENV_TIER_COLUMN } from '@/lib/flags/env-tier';
import { revalidateFeatureFlags } from '@/lib/flags/overrides-store.server';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const KNOWN_FLAG_KEYS = Object.keys(APP_FLAG_DEFAULTS) as [string, ...string[]];

const RequestSchema = z.object({
  flagKey: z.enum(KNOWN_FLAG_KEYS),
  envTier: z.enum(['dev', 'staging', 'prod']),
  enabled: z.boolean().nullable(),
});

export async function POST(req: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { flagKey, envTier, enabled } = parsed.data;
  const column = FLAG_ENV_TIER_COLUMN[envTier];

  try {
    await db
      .insert(featureFlagOverrides)
      .values({
        flagKey,
        [column]: enabled,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: featureFlagOverrides.flagKey,
        set: {
          [column]: enabled,
          updatedAt: new Date(),
          updatedBy: userId,
        },
      });

    revalidateFeatureFlags();

    return NextResponse.json({ ok: true, flagKey, envTier, enabled });
  } catch (error) {
    logger.error('[api/admin/feature-flags] write failed:', error);
    await captureError('Feature flag override write failed', error, {
      route: '/api/admin/feature-flags',
      method: 'POST',
    });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
