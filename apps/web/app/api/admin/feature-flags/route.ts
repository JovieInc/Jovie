/**
 * POST /api/admin/feature-flags
 *
 * Admin-only. Sets the per-environment override for a runtime feature flag.
 * `enabled: null` clears the cell (flag falls back to its code default for
 * that environment). Works in all environments including production, gated by
 * `requireAdmin()`. Backs the admin Features page and the dev bar
 * "publish to env" action.
 *
 * Every write appends a `feature_flag_audit_events` row (actor, previous/new
 * value, action, optional reason) so flag changes are attributable; see
 * `lib/flags/write-override.server.ts`.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/middleware';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { writeFlagOverride } from '@/lib/flags/write-override.server';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const KNOWN_FLAG_KEYS = Object.keys(APP_FLAG_DEFAULTS) as [string, ...string[]];

const RequestSchema = z.object({
  flagKey: z.enum(KNOWN_FLAG_KEYS),
  envTier: z.enum(['dev', 'staging', 'prod']),
  enabled: z.boolean().nullable(),
  reason: z.string().trim().max(500).optional(),
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

  const { flagKey, envTier, enabled, reason } = parsed.data;

  try {
    await writeFlagOverride({
      flagKey,
      envTier,
      enabled,
      actor: userId,
      reason,
    });

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
