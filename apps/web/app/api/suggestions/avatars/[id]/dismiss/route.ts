/**
 * POST /api/suggestions/avatars/[id]/dismiss
 *
 * Dismisses an avatar candidate (user doesn't want this photo).
 * Deletes the candidate row to prevent re-suggestion.
 *
 * Body: { profileId: string }
 *
 * Authentication: Required (creator must own the profile)
 */

import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  creatorAvatarCandidates,
  creatorProfiles,
} from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';

const requestSchema = z.object({
  profileId: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { profileId } = parsed.data;

    // Verify ownership
    const [profile] = await db
      .select({ id: creatorProfiles.id, clerkId: users.clerkId })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);

    if (!profile || profile.clerkId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Fetch the candidate
    const [candidate] = await db
      .select({
        id: creatorAvatarCandidates.id,
        creatorProfileId: creatorAvatarCandidates.creatorProfileId,
      })
      .from(creatorAvatarCandidates)
      .where(eq(creatorAvatarCandidates.id, candidateId))
      .limit(1);

    if (!candidate) {
      return NextResponse.json(
        { success: false, error: 'Avatar candidate not found' },
        { status: 404 }
      );
    }

    if (candidate.creatorProfileId !== profileId) {
      return NextResponse.json(
        { success: false, error: 'Candidate does not belong to this profile' },
        { status: 403 }
      );
    }

    // Delete the candidate
    await db
      .delete(creatorAvatarCandidates)
      .where(eq(creatorAvatarCandidates.id, candidateId));

    return NextResponse.json({
      success: true,
      candidateId,
      message: 'Avatar candidate dismissed',
    });
  } catch (error) {
    await captureError('Avatar candidate dismissal failed', error, {
      route: '/api/suggestions/avatars/[id]/dismiss',
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
