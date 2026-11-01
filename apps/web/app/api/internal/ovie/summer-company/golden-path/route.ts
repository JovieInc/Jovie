import { NextResponse } from 'next/server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { goldenPathStatus } from '@/lib/ovie/certifications/golden-path-status';
import { readProdGoldenPathLedger } from '@/lib/ovie/certifications/prod-golden-path-ledger';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read-only production golden-path status for Summer (authoritative prod-cert receipts, per surface). */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  try {
    const ledger = await readProdGoldenPathLedger(postgresRecordBackend());
    return NextResponse.json(goldenPathStatus(ledger, new Date()), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    await captureError('Summer golden-path status read failed', error, {
      route: '/api/internal/ovie/summer-company/golden-path',
    });
    return NextResponse.json(
      { error: 'golden_path_unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
