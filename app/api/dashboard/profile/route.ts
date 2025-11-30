import { clerkClient } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { trackServerEvent } from '@/lib/analytics/runtime-aware';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { creatorProfiles, users } from '@/lib/db/schema';
import {
  syncCanonicalUsernameFromApp,
  UsernameValidationError,
} from '@/lib/username/sync';

// Use Node.js runtime for compatibility with PostHog Node client and DB libs
export const runtime = 'nodejs';

const ProfileUpdateSchema = z.object({
  username: z.string().max(30).optional(),
  displayName: z.string().max(50).optional(),
  bio: z.string().max(512).optional(),
  creatorType: z
    .enum(['artist', 'podcaster', 'influencer', 'creator'])
    .optional(),
  avatarUrl: z.string().url().max(2048).optional(),
  spotifyUrl: z.string().url().max(2048).optional(),
  appleMusicUrl: z.string().url().max(2048).optional(),
  youtubeUrl: z.string().url().max(2048).optional(),
  isPublic: z.boolean().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  theme: z.record(z.string(), z.unknown()).optional(),
  venmo_handle: z
    .string()
    .regex(/^@[A-Za-z0-9_]{1,30}$/)
    .optional(),
});

type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;

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

      if (
        typeof updates !== 'object' ||
        updates === null ||
        Array.isArray(updates)
      ) {
        return NextResponse.json(
          { error: 'Invalid updates payload' },
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

      if (Object.keys(validUpdates).length === 0) {
        return NextResponse.json(
          { error: 'No supported changes detected' },
          { status: 400 }
        );
      }

      const parsedUpdatesResult = ProfileUpdateSchema.safeParse(validUpdates);

      if (!parsedUpdatesResult.success) {
        return NextResponse.json(
          { error: 'Invalid profile updates' },
          { status: 400 }
        );
      }

      const parsedUpdates: ProfileUpdateInput = parsedUpdatesResult.data;

      const { username: usernameFromUpdates, ...profileUpdates } =
        parsedUpdates;

      const clerkUpdates: Record<string, unknown> = {};

      const usernameUpdate =
        typeof usernameFromUpdates === 'string'
          ? usernameFromUpdates
          : undefined;

      if (usernameUpdate) {
        try {
          await syncCanonicalUsernameFromApp(clerkUserId, usernameUpdate);
        } catch (error) {
          if (error instanceof UsernameValidationError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
          }
          throw error;
        }

        delete (parsedUpdates as Record<string, unknown>).username;
      }

      if (typeof profileUpdates.displayName === 'string') {
        const displayName = profileUpdates.displayName.trim();
        if (displayName.length > 0) {
          const nameParts = displayName.split(' ');
          const firstName = nameParts.shift() ?? displayName;
          const lastName = nameParts.join(' ').trim();

          clerkUpdates.firstName = firstName;
          if (lastName) {
            clerkUpdates.lastName = lastName;
          } else {
            clerkUpdates.lastName = undefined;
          }
        }
      }

      const avatarUrl =
        typeof profileUpdates.avatarUrl === 'string'
          ? profileUpdates.avatarUrl
          : undefined;

      try {
        if (Object.keys(clerkUpdates).length > 0) {
          const clerk = await clerkClient();
          await clerk.users.updateUser(clerkUserId, clerkUpdates);
        }

        if (avatarUrl) {
          const avatarResponse = await fetch(avatarUrl);
          if (!avatarResponse.ok) {
            throw new Error('Unable to download uploaded avatar');
          }

          const contentType =
            avatarResponse.headers.get('content-type') || 'image/png';
          const arrayBuffer = await avatarResponse.arrayBuffer();
          const blob = new Blob([arrayBuffer], { type: contentType });

          const clerk = await clerkClient();
          await clerk.users.updateUserProfileImage(clerkUserId, {
            file: blob,
          });
        }
      } catch (error) {
        console.error('Failed to sync profile updates with Clerk:', error);
        return NextResponse.json(
          { error: 'Failed to sync profile updates' },
          { status: 502 }
        );
      }

      const [updatedProfile] = await db
        .update(creatorProfiles)
        .set({ ...profileUpdates, updatedAt: new Date() })
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
