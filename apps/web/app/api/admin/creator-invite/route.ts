import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { creatorClaimInvites, creatorProfiles } from '@/lib/db/schema/profiles';
import { enqueueClaimInviteJob } from '@/lib/email/jobs/enqueue';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { parseJsonBody } from '@/lib/http/parse-json';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const createInviteSchema = z.object({
  creatorProfileId: z.string().uuid(),
  email: z.string().email(),
  /** If true, immediately enqueue the email for sending. Default: true */
  sendImmediately: z.boolean().optional().default(true),
});

/**
 * Admin endpoint to create a claim invite for a creator profile.
 *
 * Creates a pending invite record and optionally enqueues it for
 * immediate email delivery via the background job queue.
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
      route: 'POST /api/admin/creator-invite',
      headers: NO_STORE_HEADERS,
    });
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const parsed = createInviteSchema.safeParse(parsedBody.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { creatorProfileId, email, sendImmediately } = parsed.data;

    // Verify the creator profile exists and is not claimed
    const [profile] = await db
      .select({
        id: creatorProfiles.id,
        username: creatorProfiles.username,
        displayName: creatorProfiles.displayName,
        isClaimed: creatorProfiles.isClaimed,
        claimToken: creatorProfiles.claimToken,
      })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, creatorProfileId))
      .limit(1);

    if (!profile) {
      return NextResponse.json(
        { error: 'Creator profile not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (profile.isClaimed) {
      return NextResponse.json(
        { error: 'Profile is already claimed' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!profile.claimToken) {
      return NextResponse.json(
        { error: 'Profile does not have a claim token' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Create the invite record and optionally enqueue for sending
    const result = await withSystemIngestionSession(async tx => {
      // Create the invite record
      const [invite] = await tx
        .insert(creatorClaimInvites)
        .values({
          creatorProfileId,
          email: email.toLowerCase().trim(),
          status: 'pending',
          meta: { source: 'admin_click' },
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({
          id: creatorClaimInvites.id,
          email: creatorClaimInvites.email,
          status: creatorClaimInvites.status,
          createdAt: creatorClaimInvites.createdAt,
        });

      if (!invite) {
        throw new Error('Failed to create invite');
      }

      let jobId: string | null = null;

      // Enqueue the email job if requested
      if (sendImmediately) {
        jobId = await enqueueClaimInviteJob(tx, {
          inviteId: invite.id,
          creatorProfileId,
        });
      }

      return { invite, jobId };
    });

    logger.info('Creator claim invite created', {
      inviteId: result.invite.id,
      profileId: creatorProfileId,
      profileUsername: profile.username,
      email: result.invite.email,
      jobEnqueued: !!result.jobId,
      jobId: result.jobId,
    });

    return NextResponse.json(
      {
        ok: true,
        invite: {
          id: result.invite.id,
          email: result.invite.email,
          status: result.invite.status,
          createdAt: result.invite.createdAt,
        },
        profile: {
          id: profile.id,
          username: profile.username,
          displayName: profile.displayName,
        },
        jobEnqueued: !!result.jobId,
        jobId: result.jobId,
      },
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    logger.error('Failed to create claim invite', {
      error: errorMessage,
      raw: error,
    });
    await captureError('Admin creator invite failed', error, {
      route: '/api/admin/creator-invite',
      method: 'POST',
    });

    return NextResponse.json(
      { error: 'Failed to create invite', details: errorMessage },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
