/**
 * POST /api/admin/feature-flags/rollback
 *
 * Admin-only. Re-applies the previous override cell recorded on a
 * `feature_flag_audit_events` row. Refuses when the event is unknown or the
 * flag is no longer registered in code (the prior state would have no
 * meaning). The rollback itself is audited with action 'rollback', so a
 * rollback can be rolled back.
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/middleware';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { featureFlagAuditEvents } from '@/lib/db/schema/feature-flags';
import { captureError } from '@/lib/error-tracking';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import type { FlagEnvTier } from '@/lib/flags/env-tier';
import { writeFlagOverride } from '@/lib/flags/write-override.server';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  auditEventId: z.string().uuid(),
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

  const { auditEventId, reason } = parsed.data;

  try {
    const events = await db
      .select()
      .from(featureFlagAuditEvents)
      .where(eq(featureFlagAuditEvents.id, auditEventId))
      .limit(1);
    const event = events[0];

    if (!event) {
      return NextResponse.json(
        { error: 'Audit event not found' },
        { status: 404 }
      );
    }

    if (!(event.flagKey in APP_FLAG_DEFAULTS)) {
      return NextResponse.json(
        { error: 'Flag is no longer registered; rollback is not safe' },
        { status: 409 }
      );
    }

    await writeFlagOverride({
      flagKey: event.flagKey,
      envTier: event.envTier as FlagEnvTier,
      enabled: event.previousValue,
      actor: userId,
      action: 'rollback',
      reason,
    });

    return NextResponse.json({
      ok: true,
      flagKey: event.flagKey,
      envTier: event.envTier,
      enabled: event.previousValue,
    });
  } catch (error) {
    logger.error('[api/admin/feature-flags/rollback] rollback failed:', error);
    await captureError('Feature flag rollback failed', error, {
      route: '/api/admin/feature-flags/rollback',
      method: 'POST',
    });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
