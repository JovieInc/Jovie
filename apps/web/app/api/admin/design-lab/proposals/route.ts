import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listDesignProposals } from '@/lib/agent-os/design-lab/proposals';
import {
  DESIGN_PROPOSAL_KINDS,
  DESIGN_PROPOSAL_STATUSES,
} from '@/lib/agent-os/design-lab/types';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import { mergeCatalogDesignProposals } from './catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const QuerySchema = z.object({
  status: z.enum(DESIGN_PROPOSAL_STATUSES).optional(),
  kind: z.enum(DESIGN_PROPOSAL_KINDS).optional(),
  sectionType: z.string().trim().max(120).optional(),
  affectedRoute: z.string().trim().max(500).optional(),
});

export async function GET(request: NextRequest): Promise<Response> {
  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!entitlements.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const query = QuerySchema.parse({
      status: request.nextUrl.searchParams.get('status') || undefined,
      kind: request.nextUrl.searchParams.get('kind') || undefined,
      sectionType: request.nextUrl.searchParams.get('sectionType') || undefined,
      affectedRoute:
        request.nextUrl.searchParams.get('affectedRoute') || undefined,
    });
    const persisted = await listDesignProposals();
    const proposals = mergeCatalogDesignProposals(persisted).filter(
      proposal => {
        if (query.status && proposal.status !== query.status) return false;
        if (query.kind && proposal.kind !== query.kind) return false;
        if (
          query.sectionType &&
          proposal.designGap?.sectionType !== query.sectionType
        ) {
          return false;
        }
        return (
          !query.affectedRoute ||
          proposal.designGap?.affectedRoutes.includes(query.affectedRoute) ===
            true
        );
      }
    );

    return NextResponse.json(
      {
        proposals,
        fetchedAt: new Date().toISOString(),
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid Design Lab filters', issues: error.issues },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    logger.error(
      '[api/admin/design-lab/proposals] Failed to list proposals',
      error
    );
    await captureError('Design Lab proposals fetch failed', error, {
      route: '/api/admin/design-lab/proposals',
      method: 'GET',
    });
    return NextResponse.json(
      { error: 'Failed to fetch design proposals' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
