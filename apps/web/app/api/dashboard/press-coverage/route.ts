import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withDbSessionTx } from '@/lib/auth/session';
import { verifyProfileOwnership } from '@/lib/db/queries/shared';
import { captureError } from '@/lib/error-tracking';
import {
  insertPressCoverage,
  inspectCoverageSource,
  loadCoverageInspectionProfile,
  logCoverageRejection,
  PRESS_COVERAGE_EXCERPT_MAX_LENGTH,
  type PressCoverageRejection,
} from '@/lib/press/coverage';
import { trackServerEvent } from '@/lib/server-analytics';
import { logger } from '@/lib/utils/logger';
import { NO_STORE_HEADERS } from '../audience/source-route-helpers';

export const runtime = 'nodejs';

const createCoverageSchema = z.object({
  profileId: z.string().uuid(),
  url: z.string().trim().min(1).max(2048),
  releaseId: z.string().uuid().optional(),
  excerptKind: z.enum(['excerpt', 'creator_summary']).default('excerpt'),
  creatorSummary: z
    .string()
    .trim()
    .min(1)
    .max(PRESS_COVERAGE_EXCERPT_MAX_LENGTH)
    .optional(),
  publisherName: z.string().trim().min(1).max(120).optional(),
});

const REJECTION_MESSAGES: Record<PressCoverageRejection, string> = {
  invalid_url: 'That is not a valid public https URL.',
  blocked_host: 'That URL points to a private or internal address.',
  auth_walled:
    'That article requires sign-in or is paywalled. Coverage needs a publicly readable page.',
  not_html: 'That URL did not return a readable article page.',
  too_large: 'That page was too large to inspect.',
  timeout: 'The page took too long to load. Try again.',
  fetch_failed: 'We could not read that URL.',
  no_source_evidence:
    'We loaded the page but could not find headline or article evidence.',
  self_published:
    'That URL is on a Jovie-owned domain. Coverage must be a third-party publication.',
  no_verified_mention:
    'We could not verify the article mentions this creator. Check the URL or profile display name.',
};

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Malformed JSON', 400);
    }

    const parsed = createCoverageSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Invalid press coverage payload', 400);
    }

    const input = parsed.data;
    if (input.excerptKind === 'creator_summary' && !input.creatorSummary) {
      return errorResponse(
        'creatorSummary is required for creator_summary',
        400
      );
    }

    // Phase 1: authenticate + verify tenant ownership inside the session tx.
    const profile = await withDbSessionTx(async (tx, clerkUserId) => {
      const owned = await verifyProfileOwnership(
        tx,
        input.profileId,
        clerkUserId
      );
      if (!owned) return null;
      return loadCoverageInspectionProfile(tx, input.profileId);
    });

    if (!profile) {
      return errorResponse('Profile not found', 404);
    }

    // Phase 2: provenance-bound source inspection — external I/O stays
    // outside any database transaction per repo transaction policy.
    const inspected = await inspectCoverageSource(input.url, profile);
    if (!inspected.ok) {
      logCoverageRejection(inspected.reason, {
        creatorProfileId: input.profileId,
        url: input.url,
      });
      return errorResponse(REJECTION_MESSAGES[inspected.reason], 422);
    }

    // Phase 3: persist coverage + tracked outbound link.
    const coverage = await withDbSessionTx(async (tx, clerkUserId) => {
      const owned = await verifyProfileOwnership(
        tx,
        input.profileId,
        clerkUserId
      );
      if (!owned) return null;
      return insertPressCoverage(tx, {
        creatorProfileId: input.profileId,
        releaseId: input.releaseId ?? null,
        inspected,
        excerptKind: input.excerptKind,
        creatorSummary: input.creatorSummary ?? null,
        publisherName: input.publisherName ?? null,
      });
    });

    if (!coverage) {
      return errorResponse('Profile not found', 404);
    }

    trackServerEvent('press_coverage_created', {
      profileId: input.profileId,
      coverageId: coverage.id,
      publisher_domain: coverage.publisherDomain,
      experiment_key: coverage.experimentKey,
      mention_verified: coverage.mentionVerified,
    }).catch(error => {
      logger.warn('press_coverage_created delivery failed', { error });
    });

    return NextResponse.json(
      {
        coverage: {
          id: coverage.id,
          slug: coverage.slug,
          sourceUrl: coverage.sourceUrl,
          publisherDomain: coverage.publisherDomain,
          headline: coverage.headline,
          publishedAt: coverage.publishedAt?.toISOString() ?? null,
          status: coverage.status,
        },
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Press coverage create failed', {
      route: '/api/dashboard/press-coverage',
      method: 'POST',
      error,
    });
    await captureError('Press coverage create failed', error, {
      route: '/api/dashboard/press-coverage',
      method: 'POST',
    });
    return errorResponse('Unable to create press coverage', 500);
  }
}
