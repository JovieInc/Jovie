import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
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

const bulkInviteSchema = z.object({
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
   * Delay between emails in milliseconds (for rate limiting).
   */
  staggerDelayMs: z.number().min(500).max(60000).optional().default(2000),

  /**
   * If true, only return what would be sent without actually sending.
   */
  dryRun: z.boolean().optional().default(false),
});

/**
 * Admin endpoint to send bulk claim invites.
 *
 * Can either:
 * 1. Send to specific profile IDs
 * 2. Auto-select profiles based on fit score threshold
 *
 * Emails are staggered to avoid rate limiting and improve deliverability.
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
      staggerDelayMs,
      dryRun,
    } = parsed.data;

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
            sql`${creatorProfiles.claimToken} IS NOT NULL`
          )
        )
        .limit(limit);
    } else {
      // Auto-select based on fit score
      // Get profiles that:
      // 1. Are not claimed
      // 2. Have a claim token
      // 3. Have fit score >= threshold
      // 4. Have not been invited yet (no pending/sent invites)
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
            sql`${creatorProfiles.claimToken} IS NOT NULL`,
            sql`${creatorProfiles.fitScore} >= ${fitScoreThreshold}`,
            isNull(creatorClaimInvites.id) // No existing invites
          )
        )
        .orderBy(sql`${creatorProfiles.fitScore} DESC`)
        .limit(limit);
    }

    // Filter to profiles with valid emails
    const profilesWithEmails = eligibleProfiles.filter(p => p.contactEmail);
    const profilesWithoutEmails = eligibleProfiles.filter(p => !p.contactEmail);

    if (dryRun) {
      return NextResponse.json(
        {
          ok: true,
          dryRun: true,
          wouldSend: profilesWithEmails.length,
          skippedNoEmail: profilesWithoutEmails.length,
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

    // Create invites and enqueue jobs
    const result = await withSystemIngestionSession(async tx => {
      const invitePayloads: { inviteId: string; creatorProfileId: string }[] =
        [];

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
        }
      }

      // Enqueue all jobs with staggering
      const { enqueued, skipped } = await enqueueBulkClaimInviteJobs(
        tx,
        invitePayloads,
        {
          staggerDelayMs,
          basePriority: 10,
          maxAttempts: 3,
        }
      );

      return {
        invitesCreated: invitePayloads.length,
        jobsEnqueued: enqueued,
        jobsSkipped: skipped,
      };
    });

    logger.info('Bulk claim invites created', {
      invitesCreated: result.invitesCreated,
      jobsEnqueued: result.jobsEnqueued,
      jobsSkipped: result.jobsSkipped,
      skippedNoEmail: profilesWithoutEmails.length,
      fitScoreThreshold,
      staggerDelayMs,
    });

    return NextResponse.json(
      {
        ok: true,
        sent: result.jobsEnqueued,
        invitesCreated: result.invitesCreated,
        jobsEnqueued: result.jobsEnqueued,
        skippedNoEmail: profilesWithoutEmails.length,
        staggerDelayMs,
        estimatedCompletionMinutes: Math.ceil(
          (result.jobsEnqueued * staggerDelayMs) / 60000
        ),
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
