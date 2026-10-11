import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  conversationInsightsQuerySchema,
  getConversationInsights,
} from '@/lib/ovie/conversation-insights.server';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/** Summer conversation-insights read (JOV-6784). */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return json({ error: 'unauthorized' }, 401);
  }

  const params = new URL(request.url).searchParams;
  const query = conversationInsightsQuerySchema.safeParse({
    weeks: params.get('weeks') ?? undefined,
  });
  if (!query.success) {
    return json({ error: 'invalid_query' }, 400);
  }

  try {
    return json(await getConversationInsights(), 200);
  } catch (error) {
    await captureError('Summer conversation insights read failed', error, {
      route: '/api/internal/ovie/summer-company/conversation-insights',
    });
    return json({ error: 'insights_unavailable' }, 503);
  }
}
