import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  decideConversationObjection,
  objectionDecisionSchema,
} from '@/lib/ovie/conversation-insights.server';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/** Inbox-card decision for an objection (JOV-6784). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return json({ error: 'unauthorized' }, 401);
  }

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }
  const input = objectionDecisionSchema.safeParse(body);
  if (!input.success) {
    return json({ error: 'invalid_body' }, 400);
  }

  try {
    const result = await decideConversationObjection(id, input.data);
    if (result.status === 'not_found') {
      return json({ error: 'not_found' }, 404);
    }
    if (result.status === 'invalid') {
      return json({ error: 'invalid_transition', reason: result.reason }, 409);
    }
    return json({ objection: result.objection }, 200);
  } catch (error) {
    await captureError('Objection decision failed', error, {
      route: '/api/internal/ovie/objections/[id]/decision',
    });
    return json({ error: 'decision_unavailable' }, 503);
  }
}
