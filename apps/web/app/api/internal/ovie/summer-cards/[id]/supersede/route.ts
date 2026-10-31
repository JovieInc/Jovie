import { NextResponse } from 'next/server';
import { z } from 'zod';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { SUMMER_CARD_ID_PATTERN } from '@/lib/ovie/summer-cards';
import { supersedeSummerCard } from '@/lib/ovie/summer-cards.server';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/internal/ovie/summer-cards/[id]/supersede';
const bodySchema = z
  .object({ reason: z.string().trim().min(8).max(300) })
  .strict();

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/**
 * Summer reports that a pending ask's premise is gone. Jovie, not Summer, closes it: a recorded
 * reject with the reason, no action taken. Spend, outbound and founder-required cards are refused.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return json({ error: 'unauthorized' }, 401);
  }
  const { id } = await context.params;
  if (!SUMMER_CARD_ID_PATTERN.test(id))
    return json({ error: 'not_found' }, 404);
  const body = await parseJsonBody<unknown>(request, {
    route: ROUTE,
    headers: NO_STORE_HEADERS,
    maxBodySize: 2048,
  });
  if (!body.ok) return body.response;
  const parsed = bodySchema.safeParse(body.data);
  if (!parsed.success) return json({ error: 'invalid_request' }, 400);
  try {
    const result = await supersedeSummerCard({
      id,
      reason: parsed.data.reason,
    });
    if (result.outcome === 'not_found')
      return json({ error: 'not_found' }, 404);
    if (result.outcome === 'reserved')
      return json({ error: 'reserved_kind', kind: result.kind }, 409);
    return json({ outcome: result.outcome, card: result.card }, 200);
  } catch (error) {
    await captureError('Summer card supersede failed', error, { route: ROUTE });
    return json({ error: 'summer_cards_unavailable' }, 503);
  }
}
