import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  findUnderEnrichedProfiles,
  reEnrichProfile,
  sweepUnderEnrichedProfiles,
} from '@/lib/discography/re-enrich';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for profile re-enrichment

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const reEnrichSchema = z
  .object({
    profileId: z.string().uuid().optional(),
    sweep: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  })
  .refine(data => data.profileId || data.sweep || data.dryRun, {
    message: 'Must provide profileId, sweep, or dryRun',
  });

export async function POST(request: Request) {
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

    const parsedBody = await parseJsonBody<unknown>(request, {
      route: 'POST /api/admin/re-enrich',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const parsed = reEnrichSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.issues },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { profileId, sweep, dryRun } = parsed.data;

    // Dry run: just show which profiles would be processed
    if (dryRun) {
      const profiles = await findUnderEnrichedProfiles();
      return NextResponse.json(
        {
          ok: true,
          mode: 'dry_run',
          profiles: profiles.map(p => ({
            id: p.creatorProfileId,
            name: p.displayName,
            releases: p.releaseCount,
            avgProviders: p.avgProviderCount,
          })),
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    // Sweep mode: re-enrich all under-enriched profiles
    if (sweep) {
      const result = await sweepUnderEnrichedProfiles();
      return NextResponse.json(
        { ok: true, mode: 'sweep', ...result },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    // Single profile mode
    if (profileId) {
      const result = await reEnrichProfile(profileId);
      return NextResponse.json(
        { ok: true, mode: 'single', ...result },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { error: 'No action specified' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Re-enrichment failed', error);
    await captureError('Admin re-enrich failed', error, {
      route: '/api/admin/re-enrich',
      method: 'POST',
    });
    return NextResponse.json(
      { error: 'Re-enrichment failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
