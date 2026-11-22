import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  type OperatorRouteInput,
  operatorAccess,
} from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';
import {
  REVIEW_INBOX_DECISION_CONTRACT,
  REVIEW_INBOX_PILOT_TENANT,
} from '@/lib/ovie/review-inbox/contract';
import {
  applyReviewInboxDecision,
  reviewInboxPilotReceiptForAction,
} from '@/lib/ovie/review-inbox/pilot-ledger';

const pinSchema = z.object({
  id: z.string(),
  assetDigest: z.string(),
  revision: z.string(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  note: z.string(),
});

const bodySchema = z.object({
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
  pins: z.array(pinSchema).optional(),
  notes: z.string().optional(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function postHandler({
  request,
  body,
}: OperatorRouteInput<z.infer<typeof bodySchema>>) {
  if (request.headers.get('authorization')) {
    return NextResponse.json(
      {
        error: 'session_required',
        message: 'Founder decisions require a signed-in browser session.',
      },
      { status: 403 }
    );
  }

  const existing = reviewInboxPilotReceiptForAction(body.actionId);
  if (existing) {
    return NextResponse.json(
      { receipt: existing, duplicate: true },
      { status: 200 }
    );
  }

  const outcome = applyReviewInboxDecision(body);
  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.error, message: outcome.message },
      { status: outcome.status }
    );
  }
  return NextResponse.json({ receipt: outcome.receipt }, { status: 200 });
}

export const POST = defineRoute(
  {
    route: '/api/ovie/review-inbox/pilot/decisions',
    access: operatorAccess({ session: 'fresh' }),
    body: { schema: bodySchema },
  },
  postHandler
);
