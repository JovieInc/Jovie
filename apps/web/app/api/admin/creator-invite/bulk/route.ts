import { and, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import {
  creatorClaimInvites,
  creatorContacts,
  creatorProfiles,
} from '@/lib/db/schema';
import { enqueueBulkClaimInviteJobs } from '@/lib/email/jobs/enqueue';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { parseJsonBody } from '@/lib/http/parse-json';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Mask an email address for preview display.
 * Preserves domain, masks local part with varying amounts based on length.
 */
function maskEmail(email: string | null | undefined): string | undefined {
  if (!email) return undefined;

  // Validate email contains exactly one '@'
  const atCount = (email.match(/@/g) || []).length;
  if (atCount !== 1) return undefined;

  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return undefined;

  // For very short local parts (1-2 chars), show first char + ***
  if (localPart.length <= 2) {
    return `${localPart[0]}***@${domain}`;
  }

  // For longer local parts, show first 2 chars + ***
  return `${localPart.slice(0, 2)}***@${domain}`;
}

const bulkInviteSchema = z
  .object({
    /**
     * Array of profile IDs to send invites to.
     * If not provided, will auto-select based on fitScoreThreshold.
     */
    creatorProfileIds: z.array(z.string().uuid()).optional(),

    /**
     * Minimum fit score for auto-selection (0-100).
     * Only used when creatorProfileIds is not provided.
     */
    fitScoreThreshold: z.number().min(0).max(100).optional().default(50),

    /**
     * Maximum number of invites to send in this batch.
     */
    limit: z.number().min(1).max(500).optional().default(50),

    /**
     * Minimum delay between emails in milliseconds.
     * Actual delay will be randomized between minDelayMs and maxDelayMs.
     */
    minDelayMs: z.number().min(1000).max(300000).optional().default(30000), // 30 sec min

    /**
     * Maximum delay between emails in milliseconds.
     * Actual delay will be randomized between minDelayMs and maxDelayMs.
     */
    maxDelayMs: z.number().min(1000).max(600000).optional().default(120000), // 2 min max

    /**
     * Maximum emails per hour (rate limiting).
     * Default is 30/hour to stay well under spam thresholds.
     */
    maxPerHour: z.number().min(1).max(100).optional().default(30),

    /**
     * If true, only return what would be sent without actually sending.
     */
    dryRun: z.boolean().optional().default(false),
  })
  .refine(data => data.minDelayMs <= data.maxDelayMs, {
    message: 'minDelayMs must be <= maxDelayMs',
    path: ['minDelayMs'],
  });

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

    // Cap batch size to 2 hours worth of emails to prevent excessively large batches
    // that could overload the queue or exceed daily sending limits.
    // For example: if maxPerHour=30, we cap at 60 emails per batch.
    // This prevents a misconfigured batch from queuing hundreds of emails at once.
    const effectiveLimit = Math.min(limit, maxPerHour * 2);

    if (effectiveLimit < limit) {
      logger.warn('Batch size capped by maxPerHour constraint', {
        requestedLimit: limit,
        maxPerHour,
        effectiveLimit,
      });
    }

    // Get eligible profiles
    let eligibleProfiles: {
      id: string;
      username: string;
      displayName: string | null;
      fitScore: number | null;
      contactEmail: string | null;
    }[];

    if (creatorProfileIds && creatorProfileIds.length > 0) {
      // Specific profiles requested
      eligibleProfiles = await db
        .select({
          id: creatorProfiles.id,
          username: creatorProfiles.username,
          displayName: creatorProfiles.displayName,
          fitScore: creatorProfiles.fitScore,
          contactEmail: creatorContacts.email,
        })
        .from(creatorProfiles)
        .leftJoin(
          creatorContacts,
          and(
            eq(creatorContacts.creatorProfileId, creatorProfiles.id),
            eq(creatorContacts.isActive, true)
          )
        )
        .where(
          and(
            inArray(creatorProfiles.id, creatorProfileIds),
            eq(creatorProfiles.isClaimed, false),
            isNotNull(creatorProfiles.claimToken)
          )
        )
        .limit(effectiveLimit);
    } else {
      // Auto-select based on fit score
      eligibleProfiles = await db
        .select({
          id: creatorProfiles.id,
          username: creatorProfiles.username,
          displayName: creatorProfiles.displayName,
          fitScore: creatorProfiles.fitScore,
          contactEmail: creatorContacts.email,
        })
        .from(creatorProfiles)
        .leftJoin(
          creatorContacts,
          and(
            eq(creatorContacts.creatorProfileId, creatorProfiles.id),
            eq(creatorContacts.isActive, true)
          )
        )
        .leftJoin(
          creatorClaimInvites,
          eq(creatorClaimInvites.creatorProfileId, creatorProfiles.id)
        )
        .where(
          and(
            eq(creatorProfiles.isClaimed, false),
            isNotNull(creatorProfiles.claimToken),
            gte(creatorProfiles.fitScore, fitScoreThreshold),
            isNull(creatorClaimInvites.id) // No existing invites
          )
        )
        .orderBy(sql`${creatorProfiles.fitScore} DESC`)
        .limit(effectiveLimit);
    }

    // Filter to profiles with valid emails
    const profilesWithEmails = eligibleProfiles.filter(p => p.contactEmail);
    const profilesWithoutEmails = eligibleProfiles.filter(p => !p.contactEmail);

    // Calculate estimated timing with randomized delays
    const avgDelayMs = (minDelayMs + maxDelayMs) / 2;
    const estimatedTotalMs = profilesWithEmails.length * avgDelayMs;
    const estimatedMinutes = Math.ceil(estimatedTotalMs / 60000);

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
            effectiveRate: Math.round(3600000 / avgDelayMs), // emails per hour
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
      let skippedDuplicates = 0;

      for (const profile of profilesWithEmails) {
        // Create invite record
        const [invite] = await tx
          .insert(creatorClaimInvites)
          .values({
            creatorProfileId: profile.id,
            email: profile.contactEmail!.toLowerCase().trim(),
            status: 'pending',
            meta: { source: 'bulk' },
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoNothing()
          .returning({ id: creatorClaimInvites.id });

        if (invite) {
          invitePayloads.push({
            inviteId: invite.id,
            creatorProfileId: profile.id,
          });
        } else {
          skippedDuplicates++;
        }
      }

      // Enqueue all jobs with randomized staggering
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
    // Strict number parsing to prevent NaN and Infinity injection
    const rawThreshold = searchParams.get('threshold');
    const rawLimit = searchParams.get('limit');

    const parsedThreshold = rawThreshold
      ? Number.parseInt(rawThreshold, 10)
      : 50;
    const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 50;

    // Validate parsed values are finite numbers within expected range
    const fitScoreThreshold =
      Number.isFinite(parsedThreshold) &&
      parsedThreshold >= 0 &&
      parsedThreshold <= 100
        ? parsedThreshold
        : 50;
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit >= 1
        ? Math.min(parsedLimit, 100)
        : 50;

    // Get eligible profiles count and sample
    const eligibleProfiles = await db
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        displayName: creatorProfiles.displayName,
        fitScore: creatorProfiles.fitScore,
        contactEmail: creatorContacts.email,
      })
      .from(creatorProfiles)
      .leftJoin(
        creatorContacts,
        and(
          eq(creatorContacts.creatorProfileId, creatorProfiles.id),
          eq(creatorContacts.isActive, true)
        )
      )
      .leftJoin(
        creatorClaimInvites,
        eq(creatorClaimInvites.creatorProfileId, creatorProfiles.id)
      )
      .where(
        and(
          eq(creatorProfiles.isClaimed, false),
          isNotNull(creatorProfiles.claimToken),
          gte(creatorProfiles.fitScore, fitScoreThreshold),
          isNull(creatorClaimInvites.id)
        )
      )
      .orderBy(sql`${creatorProfiles.fitScore} DESC`)
      .limit(limit);

    const withEmails = eligibleProfiles.filter(p => p.contactEmail);
    const withoutEmails = eligibleProfiles.filter(p => !p.contactEmail);

    // Get total count for this threshold
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(creatorProfiles)
      .leftJoin(
        creatorClaimInvites,
        eq(creatorClaimInvites.creatorProfileId, creatorProfiles.id)
      )
      .where(
        and(
          eq(creatorProfiles.isClaimed, false),
          isNotNull(creatorProfiles.claimToken),
          gte(creatorProfiles.fitScore, fitScoreThreshold),
          isNull(creatorClaimInvites.id)
        )
      );

    return NextResponse.json(
      {
        ok: true,
        threshold: fitScoreThreshold,
        totalEligible: Number(countResult?.count ?? 0),
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

    return NextResponse.json(
      { error: 'Failed to fetch eligible profiles' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
