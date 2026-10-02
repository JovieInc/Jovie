import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  listConversationObjections,
  objectionListQuerySchema,
} from '@/lib/ovie/conversation-insights.server';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/** Ovie objections table read (JOV-6784). */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return json({ error: 'unauthorized' }, 401);
  }

  const params = new URL(request.url).searchParams;
  const query = objectionListQuerySchema.safeParse({
    status: params.get('status') ?? undefined,
    stage: params.get('stage') ?? undefined,
    limit: params.get('limit') ?? undefined,
  });
  if (!query.success) {
    return json({ error: 'invalid_query' }, 400);
  }

  try {
    const rows = await listConversationObjections(query.data);
    return json({ total: rows.length, rows }, 200);
  } catch (error) {
    await captureError('Objection list read failed', error, {
      route: '/api/internal/ovie/objections',
    });
    return json({ error: 'objections_unavailable' }, 503);
  }
}
