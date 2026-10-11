import { NextResponse } from 'next/server';
import { readCertificationMetrics } from '@/lib/ovie/certifications/metrics.server';
import { authorizeSummerControl } from '@/lib/ovie/control';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' } as const;

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers });
}

/**
 * Certification v2 section 8 metrics, computed from the same stores as
 * `GET /api/ovie/certifications` (packet files, decision ledger, Summer
 * cards). Admin-only and never cached; metrics with no data report `null`
 * rather than zero.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const principal = await resolveOviePrincipal(request).catch(() => null);
  if (!principal) {
    return json({ error: 'certification_metrics_unavailable' }, 503);
  }
  const gate = authorizeSummerControl(principal);
  if (!gate.ok) return json({ error: 'forbidden' }, gate.status);

  try {
    return NextResponse.json(await readCertificationMetrics(), { headers });
  } catch {
    return json({ error: 'certification_metrics_unavailable' }, 503);
  }
}
