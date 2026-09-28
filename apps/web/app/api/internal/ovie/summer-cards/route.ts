import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import {
  SUMMER_CARD_MAX_BODY_BYTES,
  summerCardInputSchema,
  summerCardListQuerySchema,
} from '@/lib/ovie/summer-cards';
import {
  listSummerCards,
  submitSummerCard,
} from '@/lib/ovie/summer-cards.server';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/internal/ovie/summer-cards';

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/** Summer files an approval card; Jovie only records it for the Ovie inbox. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return json({ error: 'unauthorized' }, 401);
  }

  const body = await parseJsonBody<unknown>(request, {
    route: ROUTE,
    headers: NO_STORE_HEADERS,
    maxBodySize: SUMMER_CARD_MAX_BODY_BYTES,
  });
  if (!body.ok) return body.response;

  const parsed = summerCardInputSchema.safeParse(body.data);
  if (!parsed.success) {
    return json({ error: 'invalid_summer_card' }, 422);
  }

  try {
    const result = await submitSummerCard(parsed.data);
    if (result.outcome === 'conflict') {
      return json({ error: 'idempotency_key_conflict' }, 409);
    }
    return json(
      { card: result.card },
      result.outcome === 'created' ? 201 : 200
    );
  } catch (error) {
    await captureError('Summer card submit failed', error, { route: ROUTE });
    return json({ error: 'summer_cards_unavailable' }, 503);
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return json({ error: 'unauthorized' }, 401);
  }

  const params = new URL(request.url).searchParams;
  const query = summerCardListQuerySchema.safeParse({
    status: params.get('status') ?? undefined,
    since: params.get('since') ?? undefined,
    limit: params.get('limit') ?? undefined,
  });
  if (!query.success) {
    return json({ error: 'invalid_query' }, 400);
  }

  try {
    return json({ cards: await listSummerCards(query.data) }, 200);
  } catch (error) {
    await captureError('Summer card list failed', error, { route: ROUTE });
    return json({ error: 'summer_cards_unavailable' }, 503);
  }
}
