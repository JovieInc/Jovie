import { NextResponse } from 'next/server';
import type { ClaimVerificationDecisionResult } from './claim-verification-review.server';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/** HTTP mapping shared by the admin decision route and the Summer card route. */
export function claimDecisionResponse(
  result: ClaimVerificationDecisionResult
): NextResponse {
  switch (result.outcome) {
    case 'decided':
      return json({ record: result.record }, 200);
    case 'not_found':
      return json({ error: 'not_found' }, 404);
    case 'not_pending':
      return json({ error: 'not_pending', record: result.record }, 409);
    case 'identity_conflict':
      return json({ error: 'identity_conflict' }, 409);
    case 'no_subscription':
      return json({ error: 'no_subscription' }, 409);
  }
}
