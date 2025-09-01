import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { creatorProfiles, users } from '@/lib/db/schema';
import { trackServerEvent } from '@/lib/server-analytics';

// Use Edge runtime for better performance
export const runtime = 'edge';

export async function GET() {
  try {
    return await withDbSession(async clerkUserId => {
      const [row] = await db
        .select({ profile: creatorProfiles })
        .from(creatorProfiles)
        .innerJoin(users, eq(users.id, creatorProfiles.userId))
        .where(eq(users.clerkId, clerkUserId))
        .limit(1);

      const profile = row?.profile;

      if (!profile) {
        return NextResponse.json(
          { error: "We couldn't find your profile." },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { profile },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Unable to load your profile right now.' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    return await withDbSession(async clerkUserId => {
      const body = (await req.json().catch(() => null)) as {
        updates?: Record<string, unknown>;
      } | null;

      const updates = body?.updates ?? {};
      if (Object.keys(updates).length === 0) {
        return NextResponse.json(
          { error: 'No changes detected' },
          { status: 400 }
        );
      }

      const validUpdates: Record<string, unknown> = {};
      const allowedFields = [
        'username',
        'displayName',
        'bio',
        'creatorType',
        'avatarUrl',
        'spotifyUrl',
        'appleMusicUrl',
        'youtubeUrl',
        'isPublic',
        'settings',
        'theme',
        'venmo_handle',
      ];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          validUpdates[key] = value;
        }
      }

      const [updatedProfile] = await db
        .update(creatorProfiles)
        .set({ ...validUpdates, updatedAt: new Date() })
        .from(users)
        .where(
          and(
            eq(creatorProfiles.userId, users.id),
            eq(users.clerkId, clerkUserId)
          )
        )
        .returning();

      if (!updatedProfile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          { status: 404 }
        );
      }

      // Cache invalidation and analytics tracking in parallel (non-blocking)
      const backgroundTasks = [
        trackServerEvent(
          'dashboard_profile_updated',
          undefined,
          clerkUserId
        ).catch(error => console.warn('Analytics tracking failed:', error)),
      ];

      // Run background tasks in parallel without blocking the response
      Promise.all(backgroundTasks);

      return NextResponse.json(
        { profile: updatedProfile },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
