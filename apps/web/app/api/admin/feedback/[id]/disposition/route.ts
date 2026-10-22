import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  getFeedbackDecisions,
  recordFeedbackDisposition,
} from '@/lib/feedback';
import { getOvieOperatorEntitlements } from '@/lib/ovie/privacy-lock/access';

export const runtime = 'nodejs';

const bodySchema = z.object({
  disposition: z.enum(['now', 'later', 'never']),
  reason: z.string().trim().min(1).max(2000),
  payload: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Decision-ledger access (JOV-6433).
 *
 * GET returns the item's full decision history, oldest first — dispositions
 * are never re-made without prior context.
 *
 * POST records a now/later/never disposition: ledger row first, then the
 * item's disposition. Event-driven only; nothing reshuffles on a timer.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const entitlements = await getOvieOperatorEntitlements({ purpose: 'read' });

  if (!entitlements.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!entitlements.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  const decisions = await getFeedbackDecisions(id);
  return NextResponse.json({ decisions });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const entitlements = await getOvieOperatorEntitlements({ session: 'fresh' });

  if (!entitlements.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!entitlements.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid disposition' },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  const auth = await getCachedAuth();
  const item = await recordFeedbackDisposition({
    feedbackItemId: id,
    disposition: parsed.data.disposition,
    reason: parsed.data.reason,
    actor: auth.userId ?? 'admin',
    payload: parsed.data.payload,
  });

  if (!item) {
    return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
