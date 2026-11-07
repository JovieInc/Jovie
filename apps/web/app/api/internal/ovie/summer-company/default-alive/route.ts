import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { getDefaultAliveEvidence } from '@/lib/ovie/default-alive/default-alive.server';
import {
  type AttestedFinance,
  attestedFinanceSchema,
} from '@/lib/ovie/default-alive/inputs';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';

const ROUTE = '/api/internal/ovie/summer-company/default-alive';
const MAX_BODY_BYTES = 16_384;

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

async function evaluate(attested: AttestedFinance | null, method: string) {
  try {
    return json(await getDefaultAliveEvidence(attested));
  } catch (error) {
    await captureError('Default-alive evaluation failed', error, {
      route: ROUTE,
      method,
    });
    return json({ error: 'default_alive_unavailable' }, 503);
  }
}

/** Live evidence with no attestation: cash and fixed burn show as gaps. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return json({ error: 'unauthorized' }, 401);
  }
  return evaluate(null, 'GET');
}

/**
 * Summer posts the founder attestations it holds (cash, fixed burn, growth).
 * Read-only: nothing is stored; the result is computed and returned.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return json({ error: 'unauthorized' }, 401);
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const parsed = attestedFinanceSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'invalid_attestation' }, 400);
  }
  return evaluate(parsed.data, 'POST');
}
