'use server';

import { auth } from '@clerk/nextjs/server';
import { and, asc, count, eq } from 'drizzle-orm';
import { unstable_noStore as noStore } from 'next/cache';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
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

  return await withDbSession(async clerkUserId => {
    try {
      // First check if user exists in users table
      const [userData] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkId, clerkUserId))
        .limit(1);

      if (!userData?.id) {
        // No user row yet → send to onboarding to create user/artist
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
      const creatorData = await db
        .select()
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, userData.id))
        .orderBy(asc(creatorProfiles.createdAt));

      if (!creatorData || creatorData.length === 0) {
        // No creator profiles yet → onboarding
        return {
          user: userData,
          creatorProfiles: [],
          selectedProfile: null,
          needsOnboarding: true,
          sidebarCollapsed: false,
          hasSocialLinks: false,
        };
      }

      // Load user settings for UI preferences; tolerate missing column/table during migrations
      let settings: { sidebarCollapsed: boolean } | undefined;
      try {
        const result = await db
          .select()
          .from(userSettings)
          .where(eq(userSettings.userId, userData.id))
          .limit(1);
        settings = result?.[0];
      } catch {
        console.warn(
          'user_settings not available yet, defaulting sidebarCollapsed=false'
        );
        settings = undefined;
      }

      // Compute presence of active social links for the selected profile
      const selected = creatorData[0];
      let hasLinks = false;
      try {
        const result = await db
          .select({ c: count() })
          .from(socialLinks)
          .where(
            and(
              eq(socialLinks.creatorProfileId, selected.id),
              eq(socialLinks.isActive, true)
            )
          );
        const total = Number(result?.[0]?.c ?? 0);
        hasLinks = total > 0;
      } catch {
        // On query error, default to false without failing dashboard load
        console.warn('Error counting social links, defaulting to false');
        hasLinks = false;
      }

      // Return data with first profile selected by default
      return {
        user: userData,
        creatorProfiles: creatorData,
        selectedProfile: selected,
        needsOnboarding: false,
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
}

export async function updateCreatorProfile(
  profileId: string,
  updates: Partial<{
    marketingOptOut: boolean;
    displayName: string;
    bio: string;
    avatarUrl: string;
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

      return updatedProfile;
    } catch (error) {
      console.error('Error updating creator profile:', error);
      throw error;
    }
  });
}
