import { NextResponse } from 'next/server';
import { readCertificationMetrics } from '@/lib/ovie/certifications/metrics.server';
import { authorizeSummerControl } from '@/lib/ovie/control';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' } as const;

/**
 * Certification v2 section 8 metrics, computed from the same stores as
 * `GET /api/ovie/certifications` (packet files, decision ledger, Summer
 * cards). Admin-only and never cached; metrics with no data report `null`
 * rather than zero.
 */
export async function GET(request: Request): Promise<NextResponse> {
  let principal;
  try {
    principal = await resolveOviePrincipal(request);
  } catch {
    return NextResponse.json(
      { error: 'certification_metrics_unavailable' },
      { status: 503, headers }
    );
  }
  const gate = authorizeSummerControl(principal);
  if (!gate.ok) {
    return NextResponse.json(
      { error: 'forbidden' },
      { status: gate.status, headers }
    );
  }

  try {
    return NextResponse.json(await readCertificationMetrics(), { headers });
  } catch {
    return NextResponse.json(
      { error: 'certification_metrics_unavailable' },
      { status: 503, headers }
    );
  }
}
