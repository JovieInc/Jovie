import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { authorizeSummerControl } from '@/lib/ovie/control';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';
import {
  SUMMER_CARD_ID_PATTERN,
  summerCardFeedbackSchema,
} from '@/lib/ovie/summer-cards';
import { recordSummerCardFeedback } from '@/lib/ovie/summer-cards.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/ovie/summer-cards/[id]/feedback';
const headers = { 'Cache-Control': 'private, no-store' } as const;

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers });
}

/**
 * Post-ship feedback on a decided card, including one settled by its default
 * at the deadline. The decision stands; Summer reads the feedback and revises.
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
  const parsed = summerCardFeedbackSchema.safeParse(body.data);
  if (!parsed.success) {
    return json({ error: 'invalid_feedback' }, 422);
  }

  try {
    const result = await recordSummerCardFeedback({
      id,
      comment: parsed.data.comment,
    });
    switch (result.outcome) {
      case 'not_found':
        return json({ error: 'not_found' }, 404);
      case 'pending':
        return json({ error: 'decide_first', card: result.card }, 409);
      case 'conflict':
        return json({ error: 'busy_retry' }, 409);
      case 'recorded':
        return json({ card: result.card }, 200);
    }
  } catch (error) {
    await captureError('Summer card feedback failed', error, { route: ROUTE });
    return json({ error: 'summer_cards_unavailable' }, 503);
  }
}
