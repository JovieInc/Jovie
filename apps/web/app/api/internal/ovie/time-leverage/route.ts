import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/middleware';
import { verifyCronRequest } from '@/lib/cron/auth';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { parseJsonBody } from '@/lib/http/parse-json';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';
import {
  TIME_LEVERAGE_MAX_BYTES,
  timeLeverageSchema,
} from '@/lib/ovie/time-leverage';
import {
  loadTimeLeverage,
  writeTimeLeverage,
} from '@/lib/ovie/time-leverage.server';

const ROUTE = '/api/internal/ovie/time-leverage';

/** Admins read it on the ops HUD; Summer reads it with its OIDC token for the morning brief. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    if (!(await verifySummerOidcRequest(request))) {
      const denied = await requireAdmin();
      if (denied) {
        denied.headers.set('Cache-Control', 'no-store');
        return denied;
      }
    }
    return NextResponse.json(await loadTimeLeverage(), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Time leverage read failed', error);
    return NextResponse.json(
      { error: 'Time leverage unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}

/** The weekly driver (scripts/timewaste/run.sh) posts the aggregate with the cron secret. */
export async function POST(request: Request): Promise<NextResponse> {
  const denied = verifyCronRequest(request, { route: ROUTE });
  if (denied) return denied;
  try {
    const body = await parseJsonBody<unknown>(request, {
      route: ROUTE,
      maxBodySize: TIME_LEVERAGE_MAX_BYTES,
      headers: NO_STORE_HEADERS,
      redactParseErrors: true,
    });
    if (!body.ok) return body.response;
    const parsed = timeLeverageSchema.safeParse(body.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid aggregate' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    await writeTimeLeverage(parsed.data);
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    await captureError('Time leverage write failed', error);
    return NextResponse.json(
      { error: 'Time leverage unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
