import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { reviewDesignProposal } from '@/lib/agent-os/design-lab/review';
import { DesignProposalReviewRequestSchema } from '@/lib/agent-os/design-lab/types';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import { getOrMaterializeCatalogProposal } from '../../catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const ProposalParamsSchema = z.object({
  proposalId: z.string().trim().min(1).max(120),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ proposalId: string }> }
): Promise<Response> {
  try {
    const entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    if (!entitlements.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const params = ProposalParamsSchema.parse(await context.params);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const parsedBody = DesignProposalReviewRequestSchema.parse(body);
    const reviewer =
      entitlements.email ?? entitlements.userId ?? 'admin@jovie.local';

    await getOrMaterializeCatalogProposal(
      parsedBody.dayBucket,
      params.proposalId
    );

    const result = await reviewDesignProposal({
      dayBucket: parsedBody.dayBucket,
      proposalId: params.proposalId,
      decision: parsedBody.decision,
      notes: parsedBody.notes ?? null,
      reviewer,
    });

    return NextResponse.json(
      {
        ok: true,
        result,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid design proposal review request',
          issues: error.issues,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (error instanceof Error) {
      if (error.message === 'Design proposal not found.') {
        return NextResponse.json(
          { error: error.message },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      if (error.message === 'Design proposal has already been reviewed.') {
        return NextResponse.json(
          { error: error.message },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }

      if (error.message === 'Design proposal review is already in progress.') {
        return NextResponse.json(
          { error: error.message },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }
    }

    logger.error(
      '[api/admin/design-lab/proposals/[proposalId]/review] Review failed',
      error
    );
    await captureError('Design Lab proposal review failed', error, {
      route: '/api/admin/design-lab/proposals/[proposalId]/review',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Failed to review design proposal' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
