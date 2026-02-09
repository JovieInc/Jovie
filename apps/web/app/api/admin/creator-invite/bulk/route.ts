import { NextResponse } from 'next/server';
import { creatorClaimInvites } from '@/lib/db/schema/profiles';
import { enqueueBulkClaimInviteJobs } from '@/lib/email/jobs/enqueue';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { parseJsonBody } from '@/lib/http/parse-json';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import {
  bulkInviteSchema,
  calculateEffectiveLimit,
  calculateEstimatedTiming,
  fetchProfilesByFitScore,
  fetchProfilesById,
  getEligibleProfileCount,
  maskEmail,
  NO_STORE_HEADERS,
  parsePreviewParams,
} from './lib';

export const runtime = 'nodejs';

/**
 * Admin endpoint to send bulk claim invites.
 *
 * Can either:
 * 1. Send to specific profile IDs
 * 2. Auto-select profiles based on fit score threshold
 *
 * Emails are staggered with randomized delays to:
 * - Avoid rate limiting
 * - Appear more human-like to spam filters
 * - Improve deliverability
 */
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
      route: 'POST /api/admin/creator-invite/bulk',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const parsed = bulkInviteSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const {
      creatorProfileIds,
      fitScoreThreshold,
      limit,
      minDelayMs,
      maxDelayMs,
      maxPerHour,
      dryRun,
    } = parsed.data;

    const effectiveLimit = calculateEffectiveLimit(limit, maxPerHour);

    if (effectiveLimit < limit) {
      logger.warn('Batch size capped by maxPerHour constraint', {
        requestedLimit: limit,
        maxPerHour,
        effectiveLimit,
      });
    }

    // Get eligible profiles
    const eligibleProfiles =
      creatorProfileIds && creatorProfileIds.length > 0
        ? await fetchProfilesById(creatorProfileIds, effectiveLimit)
        : await fetchProfilesByFitScore(fitScoreThreshold, effectiveLimit);

    // Filter to profiles with valid emails
    const profilesWithEmails = eligibleProfiles.filter(p => p.contactEmail);
    const profilesWithoutEmails = eligibleProfiles.filter(p => !p.contactEmail);

    // Calculate estimated timing
    const { avgDelayMs, estimatedMinutes } = calculateEstimatedTiming(
      profilesWithEmails.length,
      minDelayMs,
      maxDelayMs
    );

    if (dryRun) {
      return NextResponse.json(
        {
          ok: true,
          dryRun: true,
          wouldSend: profilesWithEmails.length,
          skippedNoEmail: profilesWithoutEmails.length,
          estimatedMinutes,
          throttling: {
            minDelayMs,
            maxDelayMs,
            avgDelayMs: Math.round(avgDelayMs),
            maxPerHour,
            effectiveRate: Math.round(3600000 / avgDelayMs),
          },
          profiles: profilesWithEmails.map(p => ({
            id: p.id,
            username: p.username,
            displayName: p.displayName,
            fitScore: p.fitScore,
            email: p.contactEmail,
          })),
          skipped: profilesWithoutEmails.map(p => ({
            id: p.id,
            username: p.username,
            reason: 'no_contact_email',
          })),
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    if (profilesWithEmails.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          sent: 0,
          skipped: profilesWithoutEmails.length,
          message: 'No eligible profiles with contact emails found',
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    // Create invites and enqueue jobs with randomized delays
    const result = await withSystemIngestionSession(async tx => {
      const invitePayloads: { inviteId: string; creatorProfileId: string }[] =
        [];

      // Batch all values at once for N->1 database roundtrip
      const now = new Date();
      const inviteValues = profilesWithEmails.map(profile => ({
        creatorProfileId: profile.id,
        email: profile.contactEmail!.toLowerCase().trim(),
        status: 'pending' as const,
        meta: { source: 'bulk' as const },
        createdAt: now,
        updatedAt: now,
      }));

      const insertedInvites = await tx
        .insert(creatorClaimInvites)
        .values(inviteValues)
        .onConflictDoNothing()
        .returning({
          id: creatorClaimInvites.id,
          creatorProfileId: creatorClaimInvites.creatorProfileId,
        });

      // Track which profiles were inserted vs skipped
      const insertedProfileIds = new Set(
        insertedInvites.map(inv => inv.creatorProfileId)
      );
      for (const invite of insertedInvites) {
        invitePayloads.push({
          inviteId: invite.id,
          creatorProfileId: invite.creatorProfileId,
        });
      }
      const skippedDuplicates =
        profilesWithEmails.length - insertedProfileIds.size;

      const { enqueued, skipped } = await enqueueBulkClaimInviteJobs(
        tx,
        invitePayloads,
        {
          minDelayMs,
          maxDelayMs,
          basePriority: 10,
          maxAttempts: 3,
        }
      );

      return {
        invitesCreated: invitePayloads.length,
        jobsEnqueued: enqueued,
        jobsSkipped: skipped,
        skippedDuplicates,
      };
    });

    logger.info('Bulk claim invites created', {
      invitesCreated: result.invitesCreated,
      jobsEnqueued: result.jobsEnqueued,
      jobsSkipped: result.jobsSkipped,
      skippedDuplicates: result.skippedDuplicates,
      skippedNoEmail: profilesWithoutEmails.length,
      fitScoreThreshold,
      minDelayMs,
      maxDelayMs,
      maxPerHour,
    });

    return NextResponse.json(
      {
        ok: true,
        sent: result.jobsEnqueued,
        invitesCreated: result.invitesCreated,
        jobsEnqueued: result.jobsEnqueued,
        skippedDuplicates: result.skippedDuplicates,
        skippedNoEmail: profilesWithoutEmails.length,
        throttling: {
          minDelayMs,
          maxDelayMs,
          maxPerHour,
        },
        estimatedMinutes,
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    logger.error('Failed to create bulk claim invites', {
      error: errorMessage,
      raw: error,
    });
    await captureError('Admin bulk invite failed', error, { route: '/api/admin/creator-invite/bulk', method: 'POST' });

    return NextResponse.json(
      { error: 'Failed to create bulk invites', details: errorMessage },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * GET endpoint to preview eligible profiles without sending.
 */
export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const { fitScoreThreshold, limit } = parsePreviewParams(searchParams);

    const [eligibleProfiles, totalEligible] = await Promise.all([
      fetchProfilesByFitScore(fitScoreThreshold, limit),
      getEligibleProfileCount(fitScoreThreshold),
    ]);

    const withEmails = eligibleProfiles.filter(p => p.contactEmail);
    const withoutEmails = eligibleProfiles.filter(p => !p.contactEmail);

    return NextResponse.json(
      {
        ok: true,
        threshold: fitScoreThreshold,
        totalEligible,
        sample: {
          withEmails: withEmails.length,
          withoutEmails: withoutEmails.length,
          profiles: withEmails.slice(0, 10).map(p => ({
            id: p.id,
            username: p.username,
            displayName: p.displayName,
            fitScore: p.fitScore,
            email: maskEmail(p.contactEmail),
          })),
        },
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    logger.error('Failed to fetch eligible profiles for preview', {
      error: errorMessage,
      raw: error,
    });
    await captureError('Admin bulk invite failed', error, { route: '/api/admin/creator-invite/bulk', method: 'GET' });

    return NextResponse.json(
      { error: 'Failed to fetch eligible profiles' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
