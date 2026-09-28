import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  conversationInsightRunSchema,
  runConversationInsightPipeline,
} from '@/lib/ovie/conversation-insights.server';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/** Batch conversation-signal run (JOV-6784); invoked by the scheduler. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return json({ error: 'unauthorized' }, 401);
  }

  const params = new URL(request.url).searchParams;
  const query = conversationInsightRunSchema.safeParse({
    sampleRate: params.get('sampleRate') ?? undefined,
    windowDays: params.get('windowDays') ?? undefined,
    batchLimit: params.get('batchLimit') ?? undefined,
  });
  if (!query.success) {
    return json({ error: 'invalid_query' }, 400);
  }

  try {
    return json(await runConversationInsightPipeline(query.data), 200);
  } catch (error) {
    await captureError('Conversation insight pipeline run failed', error, {
      route: '/api/internal/ovie/summer-company/conversation-insights/run',
    });
    return json({ error: 'pipeline_unavailable' }, 503);
  }
}
