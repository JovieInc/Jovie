import { NextResponse } from 'next/server';
import { getMarketingCertificationStore } from '@/lib/agent-os/certification-runtime-store';
import { authorizeSummerControl } from '@/lib/ovie/control';
import { resolveOviePrincipal } from '@/lib/ovie/mcp/principal';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' } as const;

/** Marketing is the first connected inventory, not a universal denominator. */
export async function GET(request: Request): Promise<NextResponse> {
  let principal;
  try {
    principal = await resolveOviePrincipal(request);
  } catch {
    return NextResponse.json(
      { error: 'certification_inventory_unavailable' },
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
    const projection = await getMarketingCertificationStore().inspectLedger();
    return NextResponse.json(
      {
        contract: projection.contract,
        scope: { domain: 'marketing_components', universal: false },
        registryIds: projection.registryIds,
        rows: projection.rows.map(row => ({
          identityId: row.identityId,
          kind: row.registryKind,
          subject: row.packet.subject,
          sourceBacked: row.sourceBacked,
          resolvedSource: row.resolvedSource,
          state: row.admission.state,
          decisionEvidenceDigest: row.admission.decisionEvidenceDigest,
          reviewReady: row.admission.tasteInboxCard !== null,
          blockers: row.admission.blockers,
          updatedAt: row.updatedAt,
        })),
      },
      { headers }
    );
  } catch {
    return NextResponse.json(
      { error: 'certification_inventory_unavailable' },
      { status: 503, headers }
    );
  }
}
