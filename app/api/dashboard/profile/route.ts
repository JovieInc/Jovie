import { clerkClient } from '@clerk/nextjs/server';
import { Buffer } from 'buffer';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { trackServerEvent } from '@/lib/analytics/runtime-aware';
import { withDbSession } from '@/lib/auth/session';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { db } from '@/lib/db';
import { creatorProfiles, users } from '@/lib/db/schema';
import {
  syncCanonicalUsernameFromApp,
  UsernameValidationError,
} from '@/lib/username/sync';
import { validateUsername } from '@/lib/validation/username';

// Use Node.js runtime for compatibility with PostHog Node client and DB libs
export const runtime = 'nodejs';

const allowedUrlProtocols = new Set(['http:', 'https:']);

const hasSafeHttpProtocol = (value: string) => {
  try {
    const url = new URL(value);
    return allowedUrlProtocols.has(url.protocol);
  } catch {
    return false;
  }
};

const httpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(hasSafeHttpProtocol, 'URL must start with http or https');

const settingsSchema = z
  .object({
    hide_branding: z.boolean().optional(),
    marketing_emails: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
    if (size > 1024) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Settings payload is too large',
      });
    }
  });

const themeSchema = z
  .union([
    z
      .object({
        preference: z.enum(['light', 'dark', 'system']),
      })
      .strict(),
    z
      .object({
        mode: z.enum(['light', 'dark', 'system']),
      })
      .strict(),
  ])
  .transform(value => {
    const preference = 'preference' in value ? value.preference : value.mode;
    return { preference, mode: preference };
  });

const ProfileUpdateSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .refine(
      value => validateUsername(value).isValid,
      'Username is invalid or reserved'
    )
    .optional(),
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name cannot be empty')
    .max(50)
    .optional(),
  bio: z.string().trim().max(512).optional(),
  creatorType: z
    .enum(['artist', 'podcaster', 'influencer', 'creator'])
    .optional(),
  avatarUrl: httpUrlSchema.optional(),
  spotifyUrl: httpUrlSchema.optional(),
  appleMusicUrl: httpUrlSchema.optional(),
  youtubeUrl: httpUrlSchema.optional(),
  isPublic: z.boolean().optional(),
  marketingOptOut: z.boolean().optional(),
  settings: settingsSchema.optional(),
  theme: themeSchema.optional(),
  venmo_handle: z
    .string()
    .trim()
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
        'marketingOptOut',
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
        const firstError = parsedUpdatesResult.error.issues[0]?.message;
        return NextResponse.json(
          { error: firstError || 'Invalid profile updates' },
          { status: 400 }
        );
      }

      const parsedUpdates: ProfileUpdateInput = parsedUpdatesResult.data;

      const { username: usernameFromUpdates, ...profileUpdates } =
        parsedUpdates;
      const sanitizedProfileUpdates = Object.fromEntries(
        Object.entries(profileUpdates).filter(
          ([, value]) => value !== undefined
        )
      );

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

      // Clerk sync - handle failures gracefully
      let clerkSyncFailed = false;
      try {
        if (Object.keys(clerkUpdates).length > 0) {
          const clerk = await clerkClient();
          await clerk.users.updateUser(clerkUserId, clerkUpdates);
        }

        if (avatarUrl) {
          // Add timeout for avatar fetch to prevent hanging
          const avatarResponse = await fetch(avatarUrl, {
            signal: AbortSignal.timeout(10000), // 10 second timeout
          });
          if (!avatarResponse.ok) {
            throw new Error(`Avatar fetch failed: ${avatarResponse.status}`);
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
        clerkSyncFailed = true;
        console.error('Failed to sync profile updates with Clerk:', {
          error: error instanceof Error ? error.message : error,
          userId: clerkUserId,
          hasAvatarUrl: !!avatarUrl,
        });
        // Don't fail the entire request - avatar is still stored in our DB
      }

      const [updatedProfile] = await db
        .update(creatorProfiles)
        .set({ ...sanitizedProfileUpdates, updatedAt: new Date() })
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

      // Cache invalidation - must complete before response
      await invalidateProfileCache(updatedProfile.usernameNormalized);

      // Analytics tracking (non-blocking)
      trackServerEvent(
        'dashboard_profile_updated',
        undefined,
        clerkUserId
      ).catch(error => console.warn('Analytics tracking failed:', error));

      // Add cache-busting query parameter to avatar URL if present
      const responseProfile = { ...updatedProfile };
      if (responseProfile.avatarUrl) {
        const url = new URL(responseProfile.avatarUrl);
        url.searchParams.set('v', Date.now().toString());
        responseProfile.avatarUrl = url.toString();
      }

      return NextResponse.json(
        {
          profile: responseProfile,
          warning: clerkSyncFailed
            ? 'Profile updated but avatar sync to Clerk failed. Your profile photo will still be visible on Jovie.'
            : undefined,
        },
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
