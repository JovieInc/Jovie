import { NextResponse } from 'next/server';
import { z } from 'zod';
import { profileIdFromClaimCardKey } from '@/lib/claim/claim-verification-review.server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { SUMMER_CARD_ID_PATTERN } from '@/lib/ovie/summer-cards';
import {
  decideSummerCard,
  getSummerCard,
  supersedeSummerCard,
} from '@/lib/ovie/summer-cards.server';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';

const ROUTE = '/api/internal/ovie/summer-cards/[id]/supersede';

/**
 * Summer closes a pending card without Tim. A reason-only close records a
 * system reject and takes no action. An approve default is the fleet's
 * declared default, never spend, outbound, or a founder-required card.
 * The reason is kept on the card. A card moves at most once.
 */
export const supersedeSchema = z
  .object({
    reason: z.string().trim().min(8).max(300),
    decision: z.enum(['approve', 'reject']).default('reject'),
  })
  .strict();

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/**
 * Claim-verification cards carry side effects Jovie applies in Ovie. Neither
 * Summer path may close them. 409, and Summer keeps them out of iMessage.
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
  if (!SUMMER_CARD_ID_PATTERN.test(id)) {
    return json({ error: 'not_found' }, 404);
  }
  const body = await parseJsonBody<unknown>(request, {
    route: ROUTE,
    headers: NO_STORE_HEADERS,
    maxBodySize: 2048,
  });
  if (!body.ok) return body.response;
  const parsed = supersedeSchema.safeParse(body.data);
  if (!parsed.success) return json({ error: 'invalid_request' }, 400);

  try {
    const claimGuard = await claimVerificationGuard(id);
    if (claimGuard) return claimGuard;
    if (parsed.data.decision === 'approve') {
      const card = await getSummerCard(id);
      if (!card) return json({ error: 'not_found' }, 404);
      if (card.kind === 'spend' || card.kind === 'outbound') {
        return json({ error: 'founder_only' }, 403);
      }
      if (card.defaultDecision === 'none') {
        return json({ error: 'reserved_kind', kind: card.kind }, 409);
      }
      const result = await decideSummerCard({
        id,
        decision: 'approve',
        comment: `fleet: ${parsed.data.reason}`,
        decidedBy: 'summer:fleet',
        resolution: 'default',
      });
      if (result.outcome === 'not_found') {
        return json({ error: 'not_found' }, 404);
      }
      return json(
        {
          outcome:
            result.outcome === 'decided' ? 'superseded' : 'already_decided',
          card: result.card,
        },
        200
      );
    }
    const result = await supersedeSummerCard({
      id,
      reason: parsed.data.reason,
    });
    if (result.outcome === 'not_found') {
      return json({ error: 'not_found' }, 404);
    }
    if (result.outcome === 'reserved') {
      return json({ error: 'reserved_kind', kind: result.kind }, 409);
    }
    return json({ outcome: result.outcome, card: result.card }, 200);
  } catch (error) {
    await captureError('Summer card supersede failed', error, { route: ROUTE });
    return json({ error: 'summer_cards_unavailable' }, 503);
  }
}
