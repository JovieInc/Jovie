'use server';

import { auth } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { and, asc, count, sql as drizzleSql, eq } from 'drizzle-orm';
import { unstable_noStore as noStore, revalidateTag } from 'next/cache';
import { isAdminEmail } from '@/lib/admin/roles';
import { withDbSession, withDbSessionTx } from '@/lib/auth/session';
import { invalidateProfileCache } from '@/lib/cache/profile';
import { type DbType, db } from '@/lib/db';
import {
  type CreatorProfile,
  clickEvents,
  creatorProfiles,
  socialLinks,
  tips,
  userSettings,
  users,
} from '@/lib/db/schema';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export interface DashboardData {
  user: { id: string } | null;
  creatorProfiles: CreatorProfile[];
  selectedProfile: CreatorProfile | null;
  needsOnboarding: boolean;
  sidebarCollapsed: boolean;
  hasSocialLinks: boolean;
  hasMusicLinks: boolean;
  isAdmin: boolean;
  tippingStats: {
    tipClicks: number;
    tipsSubmitted: number;
    totalReceivedCents: number;
    monthReceivedCents: number;
  };
}

const createEmptyTippingStats = () => ({
  tipClicks: 0,
  tipsSubmitted: 0,
  totalReceivedCents: 0,
  monthReceivedCents: 0,
});

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
  state?: 'active' | 'suggested' | 'rejected';
  confidence?: number | null;
  sourcePlatform?: string | null;
  sourceType?: 'manual' | 'admin' | 'ingested' | null;
  evidence?: {
    sources?: string[];
    signals?: string[];
    linkType?: string | null;
  } | null;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DSP_PLATFORMS = [
  'spotify',
  'apple_music',
  'youtube_music',
  'soundcloud',
  'bandcamp',
  'tidal',
  'deezer',
  'amazon_music',
  'pandora',
] as const;

async function fetchDashboardDataWithSession(
  dbClient: DbType,
  clerkUserId: string
): Promise<Omit<DashboardData, 'isAdmin'>> {
  // All queries run inside a transaction to keep the RLS session variable set
  try {
    const emptyTippingStats = createEmptyTippingStats();

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
        hasMusicLinks: false,
        tippingStats: emptyTippingStats,
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
        hasMusicLinks: false,
        tippingStats: emptyTippingStats,
      };
    }

    const selected = creatorData[0];

    // Load user settings for UI preferences and social/music links presence in parallel.
    // Tolerate missing tables/columns during migrations (PostgreSQL error codes:
    // 42703=undefined_column, 42P01=undefined_table, 42P02=undefined_parameter)
    const MIGRATION_ERROR_CODES = ['42703', '42P01', '42P02'];

    const [settings, hasLinks, hasMusicLinks] = await Promise.all([
      dbClient
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userData.id))
        .limit(1)
        .then(
          result => result?.[0] as { sidebarCollapsed: boolean } | undefined
        )
        .catch((error: unknown) => {
          const code = (error as { code?: string })?.code;
          if (code && MIGRATION_ERROR_CODES.includes(code)) {
            console.warn('[Dashboard] user_settings migration in progress');
            return undefined;
          }
          Sentry.captureException(error, {
            tags: { query: 'user_settings', context: 'dashboard_data' },
          });
          throw error;
        }),
      dbClient
        .select({ c: count() })
        .from(socialLinks)
        .where(
          and(
            eq(socialLinks.creatorProfileId, selected.id),
            eq(socialLinks.state, 'active')
          )
        )
        .then(result => Number(result?.[0]?.c ?? 0) > 0)
        .catch((error: unknown) => {
          const code = (error as { code?: string })?.code;
          const message = (error as { message?: string })?.message ?? '';
          const isMissingColumn =
            message.includes('social_links.state') ||
            (message.includes('column') && message.includes('social_links'));
          if (code && MIGRATION_ERROR_CODES.includes(code)) {
            console.warn('[Dashboard] social_links migration in progress');
            return false;
          }
          if (isMissingColumn) {
            console.warn(
              '[Dashboard] social_links.state column missing; treating as no links'
            );
            return false;
          }
          Sentry.captureException(error, {
            tags: { query: 'social_links_count', context: 'dashboard_data' },
          });
          throw error;
        }),
      dbClient
        .select({ c: count() })
        .from(socialLinks)
        .where(
          and(
            eq(socialLinks.creatorProfileId, selected.id),
            eq(socialLinks.state, 'active'),
            eq(socialLinks.platformType, 'dsp')
          )
        )
        .then(result => Number(result?.[0]?.c ?? 0) > 0)
        .catch((error: unknown) => {
          const code = (error as { code?: string })?.code;
          const message = (error as { message?: string })?.message ?? '';
          const isMissingColumn =
            message.includes('social_links.state') ||
            (message.includes('column') && message.includes('social_links'));
          if (code && MIGRATION_ERROR_CODES.includes(code)) {
            console.warn('[Dashboard] social_links migration in progress');
            return false;
          }
          if (isMissingColumn) {
            console.warn(
              '[Dashboard] social_links.state column missing; treating as no music links'
            );
            return false;
          }
          Sentry.captureException(error, {
            tags: { query: 'music_links_count', context: 'dashboard_data' },
          });
          throw error;
        }),
    ]);

    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const [tipTotalsRaw] = await dbClient
      .select({
        totalReceived: drizzleSql`
          COALESCE(SUM(${tips.amountCents}), 0)
        `,
        monthReceived: drizzleSql`
          COALESCE(
            SUM(
              CASE
                WHEN ${tips.createdAt} >= ${startOfMonth}
                THEN ${tips.amountCents}
                ELSE 0
              END
            ),
            0
          )
        `,
        tipsSubmitted: drizzleSql`
          COALESCE(COUNT(${tips.id}), 0)
        `,
      })
      .from(tips)
      .where(eq(tips.creatorProfileId, selected.id));

    const [clickStats] = await dbClient
      .select({ c: count() })
      .from(clickEvents)
      .where(
        and(
          eq(clickEvents.creatorProfileId, selected.id),
          eq(clickEvents.linkType, 'tip')
        )
      );

    const tippingStats = {
      tipClicks: Number(clickStats?.c ?? 0),
      tipsSubmitted: Number(tipTotalsRaw?.tipsSubmitted ?? 0),
      totalReceivedCents: Number(tipTotalsRaw?.totalReceived ?? 0),
      monthReceivedCents: Number(tipTotalsRaw?.monthReceived ?? 0),
    };

    // Return data with first profile selected by default
    return {
      user: userData,
      creatorProfiles: creatorData,
      selectedProfile: selected,
      needsOnboarding: !profileIsPublishable(selected),
      sidebarCollapsed: settings?.sidebarCollapsed ?? false,
      hasSocialLinks: hasLinks,
      hasMusicLinks,
      tippingStats,
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
      hasMusicLinks: false,
      tippingStats: createEmptyTippingStats(),
    };
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  // Prevent caching of user-specific data
  noStore();

  const entitlements = await getCurrentUserEntitlements();
  const isAdmin = isAdminEmail(entitlements.email);

  const { userId } = await auth();

  if (!userId) {
    return {
      user: null,
      creatorProfiles: [],
      selectedProfile: null,
      needsOnboarding: true,
      sidebarCollapsed: false,
      hasSocialLinks: false,
      hasMusicLinks: false,
      isAdmin,
      tippingStats: createEmptyTippingStats(),
    };
  }

  const base = await withDbSessionTx(async (tx, clerkUserId) => {
    return fetchDashboardDataWithSession(tx, clerkUserId);
  });

  return {
    ...base,
    isAdmin,
  };
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
        state: socialLinks.state,
        confidence: socialLinks.confidence,
        sourcePlatform: socialLinks.sourcePlatform,
        sourceType: socialLinks.sourceType,
        evidence: socialLinks.evidence,
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
      .map(r => {
        const state =
          (r.state as 'active' | 'suggested' | 'rejected' | null) ??
          (r.isActive ? 'active' : 'suggested');
        if (state === 'rejected') return null;
        const parsedConfidence =
          typeof r.confidence === 'number'
            ? r.confidence
            : Number.parseFloat(String(r.confidence ?? '0'));

        return {
          id: r.linkId!,
          platform: r.platform!,
          platformType: r.platformType ?? null,
          url: r.url!,
          sortOrder: r.sortOrder ?? 0,
          isActive: state === 'active',
          displayText: r.displayText ?? null,
          state,
          confidence: Number.isFinite(parsedConfidence) ? parsedConfidence : 0,
          sourcePlatform: r.sourcePlatform,
          sourceType: r.sourceType ?? null,
          evidence: r.evidence as {
            sources?: string[];
            signals?: string[];
          } | null,
        };
      })
      .filter((link): link is NonNullable<typeof link> => Boolean(link));

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
  revalidateTag('dashboard-data', 'default');
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

      // Use centralized cache invalidation
      await invalidateProfileCache(updatedProfile.usernameNormalized);

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

  // updateCreatorProfile already handles cache invalidation via invalidateProfileCache
  await updateCreatorProfile(profileId, {
    displayName,
    bio,
    onboardingCompletedAt: new Date(),
    isPublic: true,
  });
}
