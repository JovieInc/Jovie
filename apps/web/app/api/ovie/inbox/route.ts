import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  type OperatorRouteInput,
  operatorAccess,
} from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';
import { getFreshAuth } from '@/lib/auth/cached';
import { authorizeSummerControl } from '@/lib/ovie/control';
import { readOvieInbox } from '@/lib/ovie/inbox.server';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';
import {
  REVIEW_INBOX_DECISION_CONTRACT,
  REVIEW_INBOX_MARK_LIMITS,
  REVIEW_INBOX_PILOT_TENANT,
} from '@/lib/ovie/review-inbox/contract';
import { pilotReviewInboxScope } from '@/lib/ovie/review-inbox/ledger';
import { reviewInboxLedger } from '@/lib/ovie/review-inbox/store.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' } as const;

const unit = z.number().min(0).max(1);

const pinSchema = z.object({
  id: z.string(),
  assetDigest: z.string(),
  revision: z.string(),
  x: unit,
  y: unit,
  note: z.string().max(REVIEW_INBOX_MARK_LIMITS.noteChars),
});

const strokeSchema = z.object({
  id: z.string(),
  assetDigest: z.string(),
  revision: z.string(),
  points: z
    .array(z.tuple([unit, unit]))
    .min(2)
    .max(REVIEW_INBOX_MARK_LIMITS.pointsPerStroke),
});

const reviewDecisionBodySchema = z.object({
  contract: z.literal(REVIEW_INBOX_DECISION_CONTRACT),
  tenant: z.literal(REVIEW_INBOX_PILOT_TENANT),
  caseId: z.literal(REVIEW_INBOX_PILOT_TENANT),
  revision: z.string(),
  command: z.enum([
    'favorite',
    'request_changes',
    'accept_version',
    'publish',
    'spend',
  ]),
  actionId: z.string().min(1),
  acceptRevision: z.string().optional(),
  pins: z.array(pinSchema).max(REVIEW_INBOX_MARK_LIMITS.pins).optional(),
  strokes: z
    .array(strokeSchema)
    .max(REVIEW_INBOX_MARK_LIMITS.strokes)
    .optional(),
  notes: z.string().max(REVIEW_INBOX_MARK_LIMITS.commentChars).optional(),
});

/**
 * Review marks belong to the signed-in operator, never to an impersonated
 * account or a principal named in the payload.
 */
async function reviewPrincipalId(): Promise<string | null> {
  const auth = await getFreshAuth();
  return auth.actorUserId ?? auth.userId ?? null;
}

function isReviewInboxPilotRead(request: Request): boolean {
  const pilot = new URL(request.url).searchParams.get('pilot');
  return pilot === '1' || pilot === 'review-photo';
}

/** One authorized projection; mutations retain their domain authorization. */
export async function GET(request: Request): Promise<NextResponse> {
  if (isReviewInboxPilotRead(request)) {
    const access = await operatorAccess({ session: 'fresh' }).authorize(
      request as NextRequest
    );
    if (!access.ok) {
      return NextResponse.json(access.body, {
        status: access.status,
        headers,
      });
    }
    const principalId = await reviewPrincipalId();
    if (!principalId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers }
      );
    }
    try {
      const reviewCase = await reviewInboxLedger.readCase(
        pilotReviewInboxScope(principalId)
      );
      return NextResponse.json({ case: reviewCase }, { headers });
    } catch {
      return NextResponse.json(
        { error: 'inbox_unavailable' },
        { status: 503, headers }
      );
    }
  }

  let principal;
  try {
    principal = await resolveOviePrincipal(request);
  } catch {
    return NextResponse.json(
      { error: 'inbox_unavailable' },
      { status: 503, headers }
    );
  }
  const gate = authorizeSummerControl(principal);
  if (!gate.ok) {
    return NextResponse.json(
      { error: 'forbidden' },
      { status: gate.status, headers }
    );
  }

  try {
    return NextResponse.json(await readOvieInbox(), {
      headers,
    });
  } catch {
    return NextResponse.json(
      { error: 'inbox_unavailable' },
      { status: 503, headers }
    );
  }
}

async function postReviewInboxDecisionHandler({
  request,
  body,
}: OperatorRouteInput<z.infer<typeof reviewDecisionBodySchema>>) {
  if (request.headers.get('authorization')) {
    return NextResponse.json(
      {
        error: 'session_required',
        message: 'Founder decisions require a signed-in browser session.',
      },
      { status: 403, headers }
    );
  }

  const principalId = await reviewPrincipalId();
  if (!principalId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers }
    );
  }
  const scope = pilotReviewInboxScope(principalId);

  const existing = await reviewInboxLedger.receiptFor(scope, body.actionId);
  if (existing) {
    return NextResponse.json(
      { receipt: existing, duplicate: true },
      { status: 200, headers }
    );
  }

  const outcome = await reviewInboxLedger.apply(scope, body);
  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.error, message: outcome.message },
      { status: outcome.status, headers }
    );
  }
  return NextResponse.json(
    { receipt: outcome.receipt },
    { status: 200, headers }
  );
}

export const POST = defineRoute(
  {
    route: '/api/ovie/inbox',
    access: operatorAccess({ session: 'fresh' }),
    body: { schema: reviewDecisionBodySchema },
  },
  postReviewInboxDecisionHandler
);
