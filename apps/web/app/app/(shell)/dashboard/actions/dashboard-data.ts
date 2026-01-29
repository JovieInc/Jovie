'use server';

/**
 * Core dashboard data fetching logic.
 *
 * This module provides the DashboardData interface and server actions
 * for fetching and caching dashboard data. It coordinates data fetching
 * for user profiles, settings, social links, and tipping statistics.
 */

import * as Sentry from '@sentry/nextjs';
import { and, asc, count, sql as drizzleSql, eq } from 'drizzle-orm';
import {
  unstable_noStore as noStore,
  unstable_cache as unstableCache,
} from 'next/cache';
import { cache } from 'react';
import { withDbSessionTx } from '@/lib/auth/session';
import { type DbType, sqlAny } from '@/lib/db';
import {
  type CreatorProfile,
  clickEvents,
  creatorProfiles,
  socialLinks,
  tips,
  userSettings,
  users,
} from '@/lib/db/schema';
import {
  createEmptyTippingStats,
  profileIsPublishable,
  selectDashboardProfile,
  type TippingStats,
} from '@/lib/db/server';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { handleMigrationErrors } from '@/lib/migrations/handleMigrationErrors';
import { DSP_PLATFORMS } from '@/lib/services/social-links/types';

const { logger } = Sentry;

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function safeSerializeError(error: unknown): string {
  if (error instanceof Error) {
    try {
      return JSON.stringify({
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    } catch {
      return JSON.stringify({
        message: String(error.message),
        name: error.name,
      });
    }
  }

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    try {
      return JSON.stringify({
        message: typeof obj.message === 'string' ? obj.message : undefined,
        code: typeof obj.code === 'string' ? obj.code : undefined,
        name: typeof obj.name === 'string' ? obj.name : undefined,
        cause: obj.cause,
      });
    } catch {
      return JSON.stringify({
        message: typeof obj.message === 'string' ? obj.message : String(error),
        name: typeof obj.name === 'string' ? obj.name : undefined,
      });
    }
  }

  try {
    return JSON.stringify({ value: String(error) });
  } catch {
    return String(error);
  }
}

/**
 * Complete dashboard data structure containing all information
 * needed to render the dashboard UI.
 */
export interface DashboardData {
  /** Current user object or null if not authenticated */
  user: { id: string } | null;
  /** All creator profiles owned by the user */
  creatorProfiles: CreatorProfile[];
  /** The currently selected/active creator profile */
  selectedProfile: CreatorProfile | null;
  /** Whether the user needs to complete onboarding */
  needsOnboarding: boolean;
  /** User preference for sidebar collapsed state */
  sidebarCollapsed: boolean;
  /** Whether the selected profile has any active social links */
  hasSocialLinks: boolean;
  /** Whether the selected profile has any active music/DSP links */
  hasMusicLinks: boolean;
  /** Whether the current user has admin privileges */
  isAdmin: boolean;
  /** Tipping statistics for the selected profile */
  tippingStats: TippingStats;
}

/**
 * Fetches dashboard data within a database session context.
 *
 * This internal function performs all database queries needed to assemble
 * dashboard data, including user lookup, profile selection, settings,
 * link counts, and tipping statistics. It handles migration-related errors
 * gracefully by treating them as "needs onboarding" states.
 *
 * @param dbClient - Database client (transaction) to use for queries
 * @param clerkUserId - Clerk user ID for the current user
 * @returns Dashboard data without isAdmin (added by caller)
 */
type ChromeData = Omit<DashboardData, 'isAdmin' | 'tippingStats'>;

async function fetchChromeDataWithSession(
  dbClient: DbType,
  clerkUserId: string
): Promise<ChromeData> {
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
        hasMusicLinks: false,
      };
    }

    // Now that we know user exists, get creator profiles
    const creatorData = await dbClient
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userData.id))
      .orderBy(asc(creatorProfiles.createdAt))
      .catch((error: unknown) => {
        const migrationResult = handleMigrationErrors(error, {
          userId: userData.id,
          operation: 'creator_profiles',
        });

        if (!migrationResult.shouldRetry) {
          return migrationResult.fallbackData as CreatorProfile[];
        }

        Sentry.captureException(error, {
          tags: { query: 'creator_profiles', context: 'dashboard_data' },
        });
        throw error;
      });

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
      };
    }

    const selected = selectDashboardProfile(creatorData);

    // Performance optimization: Single query for both link counts using conditional aggregation
    // This reduces database round trips from 3 to 2 (33% reduction)
    const [settings, linkCounts] = await Promise.all([
      dbClient
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userData.id))
        .limit(1)
        .then(
          result => result?.[0] as { sidebarCollapsed: boolean } | undefined
        )
        .catch((error: unknown) => {
          const migrationResult = handleMigrationErrors(error, {
            userId: userData.id,
            operation: 'user_settings',
          });

          if (!migrationResult.shouldRetry) {
            return migrationResult.fallbackData as
              | { sidebarCollapsed: boolean }
              | undefined;
          }
          Sentry.captureException(error, {
            tags: { query: 'user_settings', context: 'dashboard_data' },
          });
          throw error;
        }),
      // Consolidated link count query - counts all active links and music links in one query
      dbClient
        .select({
          totalActive: count(),
          musicActive: drizzleSql<number>`count(*) filter (where ${socialLinks.platformType} = 'dsp' OR ${socialLinks.platform} = ${sqlAny(DSP_PLATFORMS)})`,
        })
        .from(socialLinks)
        .where(
          and(
            eq(socialLinks.creatorProfileId, selected.id),
            eq(socialLinks.state, 'active')
          )
        )
        .then(result => ({
          hasLinks: Number(result?.[0]?.totalActive ?? 0) > 0,
          hasMusicLinks: Number(result?.[0]?.musicActive ?? 0) > 0,
        }))
        .catch((error: unknown) => {
          const migrationResult = handleMigrationErrors(error, {
            userId: userData.id,
            operation: 'social_links_count',
          });

          if (!migrationResult.shouldRetry) {
            return { hasLinks: false, hasMusicLinks: false };
          }
          Sentry.captureException(error, {
            tags: { query: 'social_links_count', context: 'dashboard_data' },
          });
          throw error;
        }),
    ]);

    const hasLinks = linkCounts.hasLinks;
    const hasMusicLinks = linkCounts.hasMusicLinks;

    // Return data with first profile selected by default
    return {
      user: userData,
      creatorProfiles: creatorData,
      selectedProfile: selected,
      needsOnboarding: !profileIsPublishable(selected),
      sidebarCollapsed: settings?.sidebarCollapsed ?? false,
      hasSocialLinks: hasLinks,
      hasMusicLinks,
    };
  } catch (error) {
    // Handle both standard and non-standard error objects
    const errorObj = error as
      | Error
      | { code?: string; message?: string; cause?: unknown };

    // Extract error details with multiple fallbacks
    const message =
      (errorObj as Error).message ??
      (errorObj as { message?: string }).message ??
      'Unknown error';

    const code =
      (errorObj as { code?: string }).code ??
      (errorObj as { cause?: { code?: string } }).cause?.code;

    const errorType = errorObj?.constructor?.name ?? typeof errorObj;

    // Log with full context for debugging - serialize everything to avoid empty objects
    logger.error('Error fetching dashboard data', {
      message,
      code,
      errorType,
      errorString: String(error),
      errorJson: truncateString(safeSerializeError(errorObj), 1000),
      stack: (errorObj as Error).stack?.split('\n').slice(0, 3).join('\n'),
    });

    // Also log the raw error for server-side debugging
    logger.error('Raw error object', { error });

    // On error, treat as needs onboarding to be safe
    return {
      user: null,
      creatorProfiles: [],
      selectedProfile: null,
      needsOnboarding: true,
      sidebarCollapsed: false,
      hasSocialLinks: false,
      hasMusicLinks: false,
    };
  }
}

async function fetchTippingStatsWithSession(
  dbClient: DbType,
  profileId: string
): Promise<TippingStats> {
  try {
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const startOfMonthISO = startOfMonth.toISOString();

    const [tipTotalsRawResult, clickStatsResult] = await Promise.all([
      dbClient
        .select({
          totalReceived: drizzleSql`
            COALESCE(SUM(${tips.amountCents}), 0)
          `,
          monthReceived: drizzleSql`
            COALESCE(
              SUM(
                CASE
                  WHEN ${tips.createdAt} >= ${startOfMonthISO}::timestamp
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
        .where(eq(tips.creatorProfileId, profileId)),
      dbClient
        .select({
          total: drizzleSql<number>`count(*) filter (where (${clickEvents.metadata}->>'source') in ('qr', 'link'))`,
          qr: drizzleSql<number>`count(*) filter (where ${clickEvents.metadata}->>'source' = 'qr')`,
          link: drizzleSql<number>`count(*) filter (where ${clickEvents.metadata}->>'source' = 'link')`,
        })
        .from(clickEvents)
        .where(
          and(
            eq(clickEvents.creatorProfileId, profileId),
            eq(clickEvents.linkType, 'tip')
          )
        ),
    ]);

    const tipTotalsRaw = tipTotalsRawResult?.[0];
    const clickStats = clickStatsResult?.[0];

    return {
      tipClicks: Number(clickStats?.total ?? 0),
      qrTipClicks: Number(clickStats?.qr ?? 0),
      linkTipClicks: Number(clickStats?.link ?? 0),
      tipsSubmitted: Number(tipTotalsRaw?.tipsSubmitted ?? 0),
      totalReceivedCents: Number(tipTotalsRaw?.totalReceived ?? 0),
      monthReceivedCents: Number(tipTotalsRaw?.monthReceived ?? 0),
    };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { query: 'tipping_stats', context: 'dashboard_data' },
    });
    return createEmptyTippingStats();
  }
}

/**
 * Resolves dashboard data for the current user.
 *
 * This function handles user entitlements lookup, session management,
 * and error handling. It wraps fetchDashboardDataWithSession with
 * Sentry tracing and proper error recovery.
 *
 * @returns Complete DashboardData including admin status
 */
async function resolveDashboardData(): Promise<DashboardData> {
  // Prevent caching of user-specific data
  noStore();

  const entitlements = await getCurrentUserEntitlements();
  const isAdmin = entitlements.isAdmin;
  const userId = entitlements.userId;

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

  try {
    const chromeData = await Sentry.startSpan(
      { op: 'task', name: 'dashboard.getChromeData' },
      async () => getCachedChromeData(userId)
    );

    let tippingStats = createEmptyTippingStats();
    if (chromeData.selectedProfile) {
      tippingStats = await Sentry.startSpan(
        { op: 'task', name: 'dashboard.getTippingStats' },
        async () =>
          withDbSessionTx(
            async tx =>
              fetchTippingStatsWithSession(tx, chromeData.selectedProfile!.id),
            { clerkUserId: userId }
          )
      );
    }

    return {
      ...chromeData,
      tippingStats,
      isAdmin,
    };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { context: 'get_dashboard_data' },
    });

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
}

const getCachedChromeData = unstableCache(
  async (clerkUserId: string) =>
    withDbSessionTx(async tx => fetchChromeDataWithSession(tx, clerkUserId), {
      clerkUserId,
    }),
  ['dashboard-chrome'],
  { revalidate: 30 }
);

/**
 * Cached loader for dashboard data.
 * Uses React's cache() for request-level deduplication.
 */
const loadDashboardData = cache(resolveDashboardData);

/**
 * Prefetches dashboard data for the current request.
 *
 * Call this early in a page or layout to warm the cache
 * before components need the data.
 */
export async function prefetchDashboardData(): Promise<void> {
  await loadDashboardData();
}

/**
 * Gets dashboard data using the cached loader.
 *
 * Multiple calls within the same request will reuse the same data.
 * This is the primary function for fetching dashboard data.
 *
 * @returns Complete DashboardData for the current user
 */
export async function getDashboardData(): Promise<DashboardData> {
  return loadDashboardData();
}

/**
 * Gets fresh dashboard data, bypassing the request cache.
 *
 * Use this when you need guaranteed fresh data, such as after
 * a mutation that affects dashboard state.
 *
 * @returns Fresh DashboardData for the current user
 */
export async function getDashboardDataFresh(): Promise<DashboardData> {
  return resolveDashboardData();
}

/**
 * Gets dashboard data using the cached loader.
 *
 * This is a backwards-compatible alias for getDashboardData().
 * Both functions now share the same deduped loader.
 *
 * @returns Complete DashboardData for the current user
 * @deprecated Use getDashboardData() instead
 */
export async function getDashboardDataCached(): Promise<DashboardData> {
  // Backwards-compatible alias; now shares the deduped loader.
  return getDashboardData();
}
