import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  appendDesignProposalComment,
  mutateDesignProposal,
  parseCompactFeedback,
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
    compactFeedback: z.string().trim().min(1).max(4050),
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
    const feedback = parseCompactFeedback(body.compactFeedback);
    if (!feedback || feedback.reviewId !== params.proposalId) {
      return NextResponse.json(
        { error: `Feedback must start with ${params.proposalId}:` },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const materialized = await getOrMaterializeCatalogProposal(
      body.dayBucket,
      params.proposalId
    );
    if (!materialized) {
      return NextResponse.json(
        { error: 'Design proposal not found.' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    const updated = await mutateDesignProposal({
      dayBucket: body.dayBucket,
      proposalId: params.proposalId,
      mutate: async proposal => {
        const next = appendDesignProposalComment(proposal, {
          author:
            entitlements.email ?? entitlements.userId ?? 'admin@jovie.local',
          body: feedback.body,
          date: new Date().toISOString(),
        });
        return { proposal: next, result: next };
      },
    });
    return NextResponse.json(
      { ok: true, proposal: updated },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid comment request' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: 'Failed to append comment' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
