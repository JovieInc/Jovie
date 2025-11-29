'use server';

import { auth } from '@clerk/nextjs/server';
import { and, asc, count, eq } from 'drizzle-orm';
import {
  unstable_noStore as noStore,
  revalidatePath,
  revalidateTag,
} from 'next/cache';
import { redirect } from 'next/navigation';
import { withDbSession, withDbSessionTx } from '@/lib/auth/session';
import { type DbType, db } from '@/lib/db';
import {
  type CreatorProfile,
  creatorProfiles,
  socialLinks,
  userSettings,
  users,
} from '@/lib/db/schema';

export interface DashboardData {
  user: { id: string } | null;
  creatorProfiles: CreatorProfile[];
  selectedProfile: CreatorProfile | null;
  needsOnboarding: boolean;
  sidebarCollapsed: boolean;
  hasSocialLinks: boolean;
}

function profileIsPublishable(profile: CreatorProfile | null): boolean {
  if (!profile) return false;

  // A minimum viable profile must have a claimed handle, a display name,
  // be public, and have completed onboarding at least once.
  const hasHandle =
    Boolean(profile.usernameNormalized) && Boolean(profile.username);
  const hasName = Boolean(profile.displayName && profile.displayName.trim());
  const isPublic = profile.isPublic !== false;
  const hasCompleted = Boolean(profile.onboardingCompletedAt);

  return hasHandle && hasName && isPublic && hasCompleted;
}

// Minimal link shape for initializing DashboardLinks client from the server
export interface ProfileSocialLink {
  id: string;
  platform: string;
  platformType?: string | null;
  url: string;
  sortOrder: number | null;
  isActive: boolean | null;
  displayText?: string | null;
}
async function fetchDashboardDataWithSession(
  dbClient: DbType,
  clerkUserId: string
): Promise<DashboardData> {
  // All queries run inside a transaction to keep the RLS session variable set
  try {
    // First check if user exists in users table
    const [userData] = await dbClient
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!userData?.id) {
      // No user row yet — send to onboarding to create user/artist
      return {
        user: null,
        creatorProfiles: [],
        selectedProfile: null,
        needsOnboarding: true,
        sidebarCollapsed: false,
        hasSocialLinks: false,
      };
    }

    // Now that we know user exists, get creator profiles
    const creatorData = await dbClient
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userData.id))
      .orderBy(asc(creatorProfiles.createdAt));

    if (!creatorData || creatorData.length === 0) {
      // No creator profiles yet — onboarding
      return {
        user: userData,
        creatorProfiles: [],
        selectedProfile: null,
        needsOnboarding: true,
        sidebarCollapsed: false,
        hasSocialLinks: false,
      };
    }

    const selected = creatorData[0];

    // Load user settings for UI preferences and social links presence in parallel;
    // tolerate missing user_settings column/table during migrations.
    const [settings, hasLinks] = await Promise.all([
      (async () => {
        try {
          const result = await dbClient
            .select()
            .from(userSettings)
            .where(eq(userSettings.userId, userData.id))
            .limit(1);
          return result?.[0] as { sidebarCollapsed: boolean } | undefined;
        } catch {
          console.warn(
            'user_settings not available yet, defaulting sidebarCollapsed=false'
          );
          return undefined;
        }
      })(),
      (async () => {
        try {
          const result = await dbClient
            .select({ c: count() })
            .from(socialLinks)
            .where(
              and(
                eq(socialLinks.creatorProfileId, selected.id),
                eq(socialLinks.isActive, true)
              )
            );
          const total = Number(result?.[0]?.c ?? 0);
          return total > 0;
        } catch {
          // On query error, default to false without failing dashboard load
          console.warn('Error counting social links, defaulting to false');
          return false;
        }
      })(),
    ]);

    // Return data with first profile selected by default
    return {
      user: userData,
      creatorProfiles: creatorData,
      selectedProfile: selected,
      needsOnboarding: !profileIsPublishable(selected),
      sidebarCollapsed: settings?.sidebarCollapsed ?? false,
      hasSocialLinks: hasLinks,
    };
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    // On error, treat as needs onboarding to be safe
    return {
      user: null,
      creatorProfiles: [],
      selectedProfile: null,
      needsOnboarding: true,
      sidebarCollapsed: false,
      hasSocialLinks: false,
    };
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  // Prevent caching of user-specific data
  noStore();

  const { userId } = await auth();

  if (!userId) {
    return {
      user: null,
      creatorProfiles: [],
      selectedProfile: null,
      needsOnboarding: true,
      sidebarCollapsed: false,
      hasSocialLinks: false,
    };
  }

  return await withDbSessionTx(async (tx, clerkUserId) => {
    return fetchDashboardDataWithSession(tx, clerkUserId);
  });
}

export async function getDashboardDataCached(): Promise<DashboardData> {
  // Disable caching for now to follow YC "do things that don't scale" principle
  // The unstable_cache API was causing issues with server components and auth()
  // We'll add proper caching (e.g., Redis) when performance becomes a bottleneck
  return getDashboardData();
}

// Fetch social links for a given profile owned by the current user
export async function getProfileSocialLinks(
  profileId: string
): Promise<ProfileSocialLink[]> {
  // Prevent caching of user-specific data
  noStore();

  const { userId } = await auth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  return await withDbSession(async clerkUserId => {
    // Query against creatorProfiles with ownership check and left-join links
    const rows = await db
      .select({
        profileId: creatorProfiles.id,
        linkId: socialLinks.id,
        platform: socialLinks.platform,
        platformType: socialLinks.platformType,
        url: socialLinks.url,
        sortOrder: socialLinks.sortOrder,
        isActive: socialLinks.isActive,
        displayText: socialLinks.displayText,
      })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .leftJoin(
        socialLinks,
        eq(socialLinks.creatorProfileId, creatorProfiles.id)
      )
      .where(
        and(eq(creatorProfiles.id, profileId), eq(users.clerkId, clerkUserId))
      )
      .orderBy(socialLinks.sortOrder);

    // If the profile does not belong to the user, rows will be empty
    // Map only existing link rows (filter out null linkId from left join)
    const links: ProfileSocialLink[] = rows
      .filter(r => r.linkId !== null)
      .map(r => ({
        id: r.linkId!,
        platform: r.platform!,
        platformType: r.platformType ?? null,
        url: r.url!,
        sortOrder: r.sortOrder ?? 0,
        isActive: r.isActive ?? true,
        displayText: r.displayText ?? null,
      }));

    return links;
  });
}

export async function setSidebarCollapsed(collapsed: boolean): Promise<void> {
  'use server';
  noStore();
  const { userId } = await auth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  await withDbSession(async clerkUserId => {
    // Get DB user id
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!user?.id) throw new Error('User not found');

    // Upsert into user_settings
    await db
      .insert(userSettings)
      .values({
        userId: user.id,
        sidebarCollapsed: collapsed,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { sidebarCollapsed: collapsed, updatedAt: new Date() },
      });
  });
  revalidateTag('dashboard-data');
}

export async function updateCreatorProfile(
  profileId: string,
  updates: Partial<{
    marketingOptOut: boolean;
    displayName: string;
    bio: string;
    avatarUrl: string;
    onboardingCompletedAt: Date | null;
    isPublic: boolean;
    username: string;
    usernameNormalized: string;
    // Add other updatable fields as needed
  }>
): Promise<CreatorProfile> {
  // Prevent caching of mutations
  noStore();

  const { userId } = await auth();

  if (!userId) {
    throw new Error('Unauthorized');
  }

  return await withDbSession(async clerkUserId => {
    try {
      // First get the user's database ID
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkId, clerkUserId))
        .limit(1);

      if (!user) {
        throw new Error('User not found');
      }

      // Update the creator profile
      const [updatedProfile] = await db
        .update(creatorProfiles)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(creatorProfiles.id, profileId),
            eq(creatorProfiles.userId, user.id)
          )
        )
        .returning();

      if (!updatedProfile) {
        throw new Error('Profile not found or unauthorized');
      }

      revalidateTag('dashboard-data');

      return updatedProfile;
    } catch (error) {
      console.error('Error updating creator profile:', error);
      throw error;
    }
  });
}

export async function publishProfileBasics(formData: FormData): Promise<void> {
  'use server';
  noStore();

  const profileId = formData.get('profileId');
  const displayNameRaw = formData.get('displayName');
  const bioRaw = formData.get('bio');

  if (!profileId || typeof profileId !== 'string') {
    throw new Error('Profile ID is required');
  }

  const displayName =
    typeof displayNameRaw === 'string' ? displayNameRaw.trim() : '';
  if (!displayName) {
    throw new Error('Display name is required');
  }

  const bio =
    typeof bioRaw === 'string' && bioRaw.trim().length > 0
      ? bioRaw.trim()
      : undefined;

  await updateCreatorProfile(profileId, {
    displayName,
    bio,
    onboardingCompletedAt: new Date(),
    isPublic: true,
  });

  revalidateTag('dashboard-data');
  revalidatePath('/dashboard/overview');

  // Ensure the page reflects the latest data after publishing
  redirect('/dashboard/overview?published=1');
}
