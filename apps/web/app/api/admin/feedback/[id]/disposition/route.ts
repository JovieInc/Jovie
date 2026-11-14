import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  type OperatorRouteInput,
  operatorAccess,
} from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  getFeedbackDecisions,
  recordFeedbackDisposition,
} from '@/lib/feedback';

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
async function getHandler(
  _input: OperatorRouteInput,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const decisions = await getFeedbackDecisions(id);
  return NextResponse.json({ decisions });
}

export const GET = defineRoute(
  {
    route: '/api/admin/feedback/[id]/disposition',
    access: operatorAccess({ purpose: 'read' }),
    legacy: { cache: 'none', unhandledErrors: 'rethrow' },
  },
  getHandler
);

async function postHandler(
  { request }: OperatorRouteInput,
  context: { params: Promise<{ id: string }> }
) {
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

export const POST = defineRoute(
  {
    route: '/api/admin/feedback/[id]/disposition',
    access: operatorAccess({ session: 'fresh' }),
    legacy: { cache: 'none', unhandledErrors: 'rethrow' },
  },
  postHandler
);
