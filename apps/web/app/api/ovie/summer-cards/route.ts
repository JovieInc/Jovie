import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { authorizeSummerControl } from '@/lib/ovie/control';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';
import { summerCardListQuerySchema } from '@/lib/ovie/summer-cards';
import { listSummerCards } from '@/lib/ovie/summer-cards.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/ovie/summer-cards';
const headers = { 'Cache-Control': 'private, no-store' } as const;

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers });
}

/**
 * Founder-facing card list for the Ovie inbox (web). Summer's own service
 * surface stays on /api/internal/ovie/summer-cards (OIDC); this door is the
 * same admin gate as the decision route.
 */
export async function GET(request: Request): Promise<NextResponse> {
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
    const cards = await listSummerCards(query.data);
    const pendingCount =
      query.data.status === 'pending'
        ? cards.length
        : cards.filter(card => card.status === 'pending').length;
    return json({ cards, pendingCount }, 200);
  } catch (error) {
    await captureError('Summer card list failed', error, { route: ROUTE });
    return json({ error: 'summer_cards_unavailable' }, 503);
  }
}
