import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/middleware';
import { getCachedAuth } from '@/lib/auth/cached';
import { copyVerdictInputSchema } from '@/lib/copy-jam/verdicts';
import { recordCopyVerdict } from '@/lib/copy-jam/verdicts.server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = '/api/admin/copy-jam/verdict';

/** Tim taps sucks / meh / great on one line in Ovie. */
export async function POST(request: Request): Promise<NextResponse> {
  const authError = await requireAdmin({ session: 'fresh' });
  if (authError) return authError;

  const body = await parseJsonBody<unknown>(request, {
    route: ROUTE,
    headers: NO_STORE_HEADERS,
  });
  if (!body.ok) return body.response as NextResponse;

  const parsed = copyVerdictInputSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_verdict' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const auth = await getCachedAuth();
  const record = await recordCopyVerdict({
    ...parsed.data,
    by: auth.actorUserId ?? auth.userId ?? 'admin',
    source: 'ovie-tap',
  });
  if (!record) {
    return NextResponse.json(
      { error: 'unknown_copy_id' },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }
  return NextResponse.json({ record }, { headers: NO_STORE_HEADERS });
}
