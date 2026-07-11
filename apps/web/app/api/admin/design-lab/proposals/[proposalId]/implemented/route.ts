import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  saveDesignProposal,
  transitionProposalToImplemented,
} from '@/lib/agent-os/design-lab/proposals';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { getOrMaterializeCatalogProposal } from '../../catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const ParamsSchema = z.object({
  proposalId: z.string().trim().min(1).max(120),
});
const BodySchema = z
  .object({
    dayBucket: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    evidenceRefs: z.array(z.string().trim().min(1).max(500)).min(1).max(50),
  })
  .strict();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ proposalId: string }> }
): Promise<Response> {
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!entitlements.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const params = ParamsSchema.parse(await context.params);
    const body = BodySchema.parse(await request.json());
    const proposal = await getOrMaterializeCatalogProposal(
      body.dayBucket,
      params.proposalId
    );
    if (!proposal) {
      return NextResponse.json(
        { error: 'Design proposal not found.' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    const updated = transitionProposalToImplemented(proposal, {
      implementedAt: new Date().toISOString(),
      evidenceRefs: body.evidenceRefs,
    });
    await saveDesignProposal(updated);
    return NextResponse.json(
      { ok: true, proposal: updated },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid implementation evidence request' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    if (error instanceof Error && error.message.startsWith('Only approved')) {
      return NextResponse.json(
        { error: error.message },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Failed to record implementation evidence' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
