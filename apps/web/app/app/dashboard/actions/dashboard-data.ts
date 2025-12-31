'use server';

/**
 * Core dashboard data fetching logic.
 *
 * This module provides the DashboardData interface and server actions
 * for fetching and caching dashboard data. It coordinates data fetching
 * for user profiles, settings, social links, and tipping statistics.
 */

import * as Sentry from '@sentry/nextjs';
import {
  and,
  asc,
  count,
  sql as drizzleSql,
  eq,
  inArray,
  or,
} from 'drizzle-orm';
import { unstable_noStore as noStore } from 'next/cache';
import { cache } from 'react';
import { withDbSessionTx } from '@/lib/auth/session';
import { type DbType } from '@/lib/db';
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
import {
  profileIsPublishable,
  selectDashboardProfile,
} from './profile-selection';
import { DSP_PLATFORMS } from './social-links';
import { type TippingStats, createEmptyTippingStats } from './tipping-stats';

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
async function fetchDashboardDataWithSession(
  dbClient: DbType,
  clerkUserId: string
): Promise<Omit<DashboardData, 'isAdmin'>> {
  // All queries run inside a transaction to keep the RLS session variable set
  try {
    const emptyTippingStats = createEmptyTippingStats();

    // Tolerate missing tables/columns during migrations (PostgreSQL error codes:
    // 42703=undefined_column, 42P01=undefined_table, 42P02=undefined_parameter)
    const MIGRATION_ERROR_CODES = ['42703', '42P01', '42P02'];

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
      .orderBy(asc(creatorProfiles.createdAt))
      .catch((error: unknown) => {
        const e = error as {
          code?: string;
          message?: string;
          cause?: { code?: string; message?: string };
        };
        const code = e.code ?? e.cause?.code;
        const message = e.message ?? e.cause?.message ?? '';

        const isCreatorProfilesColumnMissing =
          message.includes('creator_profiles.') ||
          (message.includes('column') && message.includes('creator_profiles'));

        if (
          (code && MIGRATION_ERROR_CODES.includes(code)) ||
          isCreatorProfilesColumnMissing
        ) {
          console.warn(
            '[Dashboard] creator_profiles schema migration in progress; treating as needs onboarding'
          );
          return [];
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
        tippingStats: emptyTippingStats,
      };
    }

    const selected = selectDashboardProfile(creatorData);

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
            or(
              eq(socialLinks.platformType, 'dsp'),
              inArray(
                socialLinks.platform,
                DSP_PLATFORMS as unknown as string[]
              )
            )
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
                  WHEN ${tips.createdAt} >= ${startOfMonth}
                  THEN ${tips.amountCents}
                  ELSE 0
                END
              ),
              0
            )
          )`,
          tipsSubmitted: drizzleSql`
            COALESCE(COUNT(${tips.id}), 0)
          `,
        })
        .from(tips)
        .where(eq(tips.creatorProfileId, selected.id)),
      dbClient
        .select({
          total: drizzleSql<number>`count(*) filter (where (${clickEvents.metadata}->>'source') in ('qr', 'link'))`,
          qr: drizzleSql<number>`count(*) filter (where ${clickEvents.metadata}->>'source' = 'qr')`,
          link: drizzleSql<number>`count(*) filter (where ${clickEvents.metadata}->>'source' = 'link')`,
        })
        .from(clickEvents)
        .where(
          and(
            eq(clickEvents.creatorProfileId, selected.id),
            eq(clickEvents.linkType, 'tip')
          )
        ),
    ]);

    const tipTotalsRaw = tipTotalsRawResult?.[0];
    const clickStats = clickStatsResult?.[0];

    const tippingStats: TippingStats = {
      tipClicks: Number(clickStats?.total ?? 0),
      qrTipClicks: Number(clickStats?.qr ?? 0),
      linkTipClicks: Number(clickStats?.link ?? 0),
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
    const e = error as {
      code?: string;
      message?: string;
      cause?: { code?: string; message?: string };
    };
    const code = e.code ?? e.cause?.code;
    const message = e.message ?? e.cause?.message;
    console.error('Error fetching dashboard data:', { code, message, error });
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
    const base = await Sentry.startSpan(
      { op: 'task', name: 'dashboard.getDashboardData' },
      async () => {
        return withDbSessionTx(
          async (tx, clerkUserId) =>
            fetchDashboardDataWithSession(tx, clerkUserId),
          { clerkUserId: userId }
        );
      }
    );

    return {
      ...base,
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
