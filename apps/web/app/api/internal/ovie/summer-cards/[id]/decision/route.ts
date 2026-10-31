import { NextResponse } from 'next/server';
import { z } from 'zod';
import { profileIdFromClaimCardKey } from '@/lib/claim/claim-verification-review.server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  decideSummerCard,
  getSummerCard,
} from '@/lib/ovie/summer-cards.server';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';

const ROUTE = '/api/internal/ovie/summer-cards/[id]/decision';
const CARD_ID = /^sc_[0-9a-f]{32}$/;

/**
 * Tim's decision on a card, made over iMessage (Tim 2026-10-31: "Ovie isn't usable yet; send
 * approvals one at a time, 👍 means approved"). Summer relays the founder's reply with its receipt
 * (Photon message id, the short card code, the time). Only pending cards move, only once, and only
 * to approve or reject; a replay of the same decision is a 200, a different one a 409.
 */
export const imessageDecisionSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    receipt: z
      .object({
        channel: z.literal('imessage'),
        messageId: z.string().trim().min(1).max(200),
        code: z.string().regex(/^[A-Z0-9]{4}$/),
        at: z.iso.datetime({ offset: true }),
      })
      .strict(),
    comment: z.string().trim().max(500).nullable().default(null),
  })
  .strict();

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/**
 * Claim-verification cards (`claim-verification_<profileId>`) carry side effects Jovie applies
 * itself (link the artist, or refund and cancel) behind a privileged step-up in Ovie. Neither
 * Summer path may close them: they would skip those effects. 409, and Summer keeps them out of
 * its iMessage queue.
 */
async function claimVerificationGuard(id: string) {
  const card = await getSummerCard(id);
  return card?.status === 'pending' &&
    profileIdFromClaimCardKey(card.idempotencyKey)
    ? json({ error: 'claim_verification_requires_ovie' }, 409)
    : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return json({ error: 'unauthorized' }, 401);
  }
  const { id } = await context.params;
  if (!CARD_ID.test(id)) return json({ error: 'invalid_id' }, 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  const input = imessageDecisionSchema.safeParse(body);
  if (!input.success) return json({ error: 'invalid_body' }, 400);

  try {
    const claimGuard = await claimVerificationGuard(id);
    if (claimGuard) return claimGuard;
    const { decision, receipt, comment } = input.data;
    const result = await decideSummerCard({
      id,
      decision,
      comment: [
        `imessage ${receipt.code} ${receipt.messageId} ${receipt.at}`,
        comment,
      ]
        .filter(Boolean)
        .join(' | ')
        .slice(0, 1000),
      decidedBy: 'founder:imessage',
      resolution: 'founder',
    });
    if (result.outcome === 'not_found')
      return json({ error: 'not_found' }, 404);
    if (result.outcome === 'already_decided') {
      const same =
        result.card.status ===
        (decision === 'approve' ? 'approved' : 'rejected');
      return json(
        { outcome: 'already_decided', card: result.card },
        same ? 200 : 409
      );
    }
    return json({ outcome: 'decided', card: result.card }, 200);
  } catch (error) {
    await captureError('Summer card iMessage decision failed', error, {
      route: ROUTE,
    });
    return json({ error: 'summer_cards_unavailable' }, 503);
  }
}
