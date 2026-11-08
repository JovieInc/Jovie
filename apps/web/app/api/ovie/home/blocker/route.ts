import { NextResponse } from 'next/server';
import { readCompanyStateCache } from '@/lib/ovie/company-state.server';
import { authorizeSummerControl } from '@/lib/ovie/control';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' } as const;

/**
 * The revenue blocker Ovie Home leads with, read from the cached company
 * snapshot (zero third-party calls). Summer's brief reads the same field from
 * `/api/internal/ovie/summer-company/state`, so both name the same blocker.
 * `blocker: null` with a snapshot means nothing is blocking revenue; a missing
 * snapshot is a 503 so Home never shows "clear" on no data.
 */
export async function GET(request: Request): Promise<NextResponse> {
  let principal;
  try {
    principal = await resolveOviePrincipal(request);
  } catch {
    return NextResponse.json(
      { error: 'home_blocker_unavailable' },
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
    const readback = await readCompanyStateCache({ track: false });
    if (!readback) {
      return NextResponse.json(
        { error: 'company_state_not_cached' },
        { status: 503, headers }
      );
    }
    return NextResponse.json(
      {
        blocker: readback.answer.blocker,
        generatedAt: readback.snapshot.generatedAt,
      },
      { headers }
    );
  } catch {
    return NextResponse.json(
      { error: 'home_blocker_unavailable' },
      { status: 503, headers }
    );
  }
}
