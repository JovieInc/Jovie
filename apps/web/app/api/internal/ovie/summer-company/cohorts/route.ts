import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  getSummerCohort,
  summerCohortQuerySchema,
} from '@/lib/ovie/summer-company.server';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/** Jovie outreach cohorts for Summer. Never LYB health data. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return json({ error: 'unauthorized' }, 401);
  }

  const params = new URL(request.url).searchParams;
  const query = summerCohortQuerySchema.safeParse({
    kind: params.get('kind') ?? undefined,
    limit: params.get('limit') ?? undefined,
  });
  if (!query.success) {
    return json({ error: 'invalid_query' }, 400);
  }

  const observedAt = new Date();
  try {
    const cohort = await getSummerCohort(
      query.data.kind,
      query.data.limit,
      observedAt
    );
    return json(
      {
        kind: query.data.kind,
        observedAt: observedAt.toISOString(),
        ...cohort,
      },
      200
    );
  } catch (error) {
    await captureError('Summer cohort read failed', error, {
      route: '/api/internal/ovie/summer-company/cohorts',
      kind: query.data.kind,
    });
    return json({ error: 'cohort_unavailable' }, 503);
  }
}
