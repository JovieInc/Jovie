import { and, eq, isNotNull, isNull, lt } from 'drizzle-orm';
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

const followUpSchema = z.object({
  /**
   * Which sequence step to send (1 = first follow-up, 2 = second follow-up).
   */
  sequenceStep: z.number().min(1).max(3).default(1),

  /**
   * Minimum days since the previous email was sent.
   * E.g., 3 means only send follow-up if it's been at least 3 days since step 0.
   */
  daysSincePrevious: z.number().min(1).max(30).default(3),

  /**
   * Maximum number of follow-ups to send in this batch.
   */
  limit: z.number().min(1).max(100).optional().default(20),

  /**
   * Minimum delay between emails in milliseconds.
   */
  minDelayMs: z.number().min(1000).max(300000).optional().default(30000),

  /**
   * Maximum delay between emails in milliseconds.
   */
  maxDelayMs: z.number().min(1000).max(600000).optional().default(120000),

  /**
   * If true, only return what would be sent without actually sending.
   */
  dryRun: z.boolean().optional().default(false),
});

interface EligibleProfile {
  creatorProfileId: string;
  username: string;
  displayName: string | null;
  email: string;
  previousInviteId: string;
  previousSentAt: Date;
  daysSinceSent: number;
}

/**
 * Find profiles that need a follow-up at the given sequence step.
 *
 * A profile needs follow-up step N if:
 * 1. It has been sent step N-1 (previous step) successfully
 * 2. The previous email was sent at least `daysSincePrevious` days ago
 * 3. The profile is still unclaimed
 * 4. There's no existing invite record for step N
 * 5. The profile has a valid email
 */
async function findProfilesNeedingFollowUp(
  sequenceStep: number,
  daysSincePrevious: number,
  limit: number
): Promise<EligibleProfile[]> {
  const previousStep = sequenceStep - 1;
  const cutoffDate = new Date(
    Date.now() - daysSincePrevious * 24 * 60 * 60 * 1000
  );

  // Find profiles that:
  // - Have a sent invite at the previous sequence step
  // - That invite was sent before the cutoff date
  // - Profile is not claimed
  // - Don't have an invite at the current sequence step yet
  const results = await db
    .select({
      creatorProfileId: creatorProfiles.id,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      email: creatorContacts.email,
      previousInviteId: creatorClaimInvites.id,
      previousSentAt: creatorClaimInvites.sentAt,
    })
    .from(creatorClaimInvites)
    .innerJoin(
      creatorProfiles,
      eq(creatorProfiles.id, creatorClaimInvites.creatorProfileId)
    )
    .innerJoin(
      creatorContacts,
      and(
        eq(creatorContacts.creatorProfileId, creatorProfiles.id),
        eq(creatorContacts.isActive, true),
        isNotNull(creatorContacts.email)
      )
    )
    .where(
      and(
        // Previous step was sent
        eq(creatorClaimInvites.sequenceStep, previousStep),
        eq(creatorClaimInvites.status, 'sent'),
        // Sent before cutoff (enough time has passed)
        lt(creatorClaimInvites.sentAt, cutoffDate),
        // Profile is not claimed
        eq(creatorProfiles.isClaimed, false),
        // Has valid claim token
        isNotNull(creatorProfiles.claimToken),
        // No existing invite at current step (using NOT EXISTS subquery)
        isNull(
          db
            .select({ id: creatorClaimInvites.id })
            .from(creatorClaimInvites)
            .where(
              and(
                eq(creatorClaimInvites.creatorProfileId, creatorProfiles.id),
                eq(creatorClaimInvites.sequenceStep, sequenceStep)
              )
            )
            .limit(1)
        )
      )
    )
    .limit(limit);

  return results
    .filter(
      (r): r is typeof r & { email: string; previousSentAt: Date } =>
        r.email !== null && r.previousSentAt !== null
    )
    .map(r => ({
      creatorProfileId: r.creatorProfileId,
      username: r.username,
      displayName: r.displayName,
      email: r.email,
      previousInviteId: r.previousInviteId,
      previousSentAt: r.previousSentAt,
      daysSinceSent: Math.floor(
        (Date.now() - r.previousSentAt.getTime()) / (1000 * 60 * 60 * 24)
      ),
    }));
}

/**
 * POST /api/admin/creator-invite/followup
 *
 * Send follow-up emails to creators who haven't claimed their profile.
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
      route: 'POST /api/admin/creator-invite/followup',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const parsed = followUpSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const {
      sequenceStep,
      daysSincePrevious,
      limit,
      minDelayMs,
      maxDelayMs,
      dryRun,
    } = parsed.data;

    // Find profiles needing follow-up
    const eligibleProfiles = await findProfilesNeedingFollowUp(
      sequenceStep,
      daysSincePrevious,
      limit
    );

    if (eligibleProfiles.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          message: 'No profiles need follow-up at this time',
          sequenceStep,
          daysSincePrevious,
          eligible: 0,
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    if (dryRun) {
      return NextResponse.json(
        {
          ok: true,
          dryRun: true,
          sequenceStep,
          daysSincePrevious,
          eligible: eligibleProfiles.length,
          profiles: eligibleProfiles.slice(0, 10).map(p => ({
            username: p.username,
            email: p.email.replace(/(.{2}).*@/, '$1***@'),
            daysSinceSent: p.daysSinceSent,
          })),
        },
        { status: 200, headers: NO_STORE_HEADERS }
      );
    }

    // Create invite records and enqueue jobs
    const result = await withSystemIngestionSession(async tx => {
      const inviteRecords: Array<{
        inviteId: string;
        creatorProfileId: string;
        email: string;
      }> = [];

      // Create invite records for each profile
      for (const profile of eligibleProfiles) {
        const [invite] = await tx
          .insert(creatorClaimInvites)
          .values({
            creatorProfileId: profile.creatorProfileId,
            email: profile.email,
            status: 'scheduled',
            sequenceStep,
            meta: { source: 'followup' },
          })
          .returning({ id: creatorClaimInvites.id });

        if (invite) {
          inviteRecords.push({
            inviteId: invite.id,
            creatorProfileId: profile.creatorProfileId,
            email: profile.email,
          });
        }
      }

      // Enqueue the jobs with randomized delays
      const { enqueued } = await enqueueBulkClaimInviteJobs(tx, inviteRecords, {
        minDelayMs,
        maxDelayMs,
      });

      return {
        inviteRecords,
        enqueued,
      };
    });

    const avgDelaySeconds = (minDelayMs + maxDelayMs) / 2 / 1000;
    const estimatedMinutes = Math.ceil(
      (result.enqueued * avgDelaySeconds) / 60
    );

    logger.info('Follow-up emails scheduled', {
      sequenceStep,
      daysSincePrevious,
      count: result.enqueued,
      estimatedMinutes,
    });

    return NextResponse.json(
      {
        ok: true,
        sequenceStep,
        jobsEnqueued: result.enqueued,
        estimatedMinutes,
        profiles: result.inviteRecords.slice(0, 5).map(p => ({
          email: p.email.replace(/(.{2}).*@/, '$1***@'),
        })),
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('Error sending follow-up invites', { error });
    return NextResponse.json(
      { error: 'Failed to send follow-up invites' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * GET /api/admin/creator-invite/followup
 *
 * Preview how many profiles need follow-ups.
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
    const sequenceStep = Number(searchParams.get('sequenceStep') || '1');
    const daysSincePrevious = Number(
      searchParams.get('daysSincePrevious') || '3'
    );
    const limit = Number(searchParams.get('limit') || '50');

    // Find profiles needing follow-up
    const eligibleProfiles = await findProfilesNeedingFollowUp(
      sequenceStep,
      daysSincePrevious,
      limit
    );

    return NextResponse.json(
      {
        ok: true,
        sequenceStep,
        daysSincePrevious,
        eligible: eligibleProfiles.length,
        profiles: eligibleProfiles.slice(0, 10).map(p => ({
          username: p.username,
          displayName: p.displayName,
          email: p.email.replace(/(.{2}).*@/, '$1***@'),
          daysSinceSent: p.daysSinceSent,
        })),
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch follow-up preview' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
