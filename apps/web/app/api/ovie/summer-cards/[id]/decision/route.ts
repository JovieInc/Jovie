import { NextResponse } from 'next/server';
import { claimDecisionResponse } from '@/lib/claim/claim-verification-http';
import {
  decideClaimVerification,
  profileIdFromClaimCardKey,
} from '@/lib/claim/claim-verification-review.server';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { authorizeSummerControl } from '@/lib/ovie/control';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';
import {
  SUMMER_CARD_ID_PATTERN,
  summerCardDecisionSchema,
} from '@/lib/ovie/summer-cards';
import {
  decideSummerCard,
  getSummerCard,
} from '@/lib/ovie/summer-cards.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/ovie/summer-cards/[id]/decision';
const headers = { 'Cache-Control': 'private, no-store' } as const;

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers });
}

/**
 * Founder decision on a Summer card. Recording is the whole effect: Jovie never
 * sends outbound or spends from here; Summer reads the decision and acts.
 *
 * One exception, owned by Jovie itself: claim-verification cards
 * (`claim-verification_<profileId>`). The founder's explicit click applies the
 * decision first (approve links the artist; reject refunds the first month and
 * cancels), and the card is only marked decided after that succeeds, so a
 * failure leaves the card pending and retryable.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  let principal;
  try {
    principal = await resolveOviePrincipal(request);
  } catch {
    return json({ error: 'summer_cards_unavailable' }, 503);
  }
  const gate = authorizeSummerControl(principal);
  if (!gate.ok) {
    return json(
      { error: gate.status === 401 ? 'unauthorized' : 'forbidden' },
      gate.status
    );
  }

  const { id } = await context.params;
  if (!SUMMER_CARD_ID_PATTERN.test(id)) {
    return json({ error: 'not_found' }, 404);
  }

  const body = await parseJsonBody<unknown>(request, {
    route: ROUTE,
    headers,
    maxBodySize: 8 * 1024,
  });
  if (!body.ok) return body.response;
  const parsed = summerCardDecisionSchema.safeParse(body.data);
  if (!parsed.success) {
    return json({ error: 'invalid_decision' }, 422);
  }

  try {
    const existing = await getSummerCard(id);
    const claimProfileId =
      existing?.status === 'pending'
        ? profileIdFromClaimCardKey(existing.idempotencyKey)
        : null;
    if (claimProfileId) {
      const claim = await decideClaimVerification({
        profileId: claimProfileId,
        decision: parsed.data.decision,
        reason: parsed.data.comment || null,
        decidedBy: principal.email ?? principal.subject ?? null,
        fromCard: true,
      });
      // Already decided elsewhere still closes the card; real failures don't.
      if (claim.outcome !== 'decided' && claim.outcome !== 'not_pending') {
        return claimDecisionResponse(claim);
      }
    }

    const result = await decideSummerCard({
      id,
      decision: parsed.data.decision,
      comment: parsed.data.comment || null,
      decidedBy: principal.email ?? principal.subject ?? null,
    });
    if (result.outcome === 'not_found') {
      return json({ error: 'not_found' }, 404);
    }
    if (result.outcome === 'already_decided') {
      return json({ error: 'already_decided', card: result.card }, 409);
    }
    return json({ card: result.card }, 200);
  } catch (error) {
    await captureError('Summer card decision failed', error, { route: ROUTE });
    return json({ error: 'summer_cards_unavailable' }, 503);
  }
}
