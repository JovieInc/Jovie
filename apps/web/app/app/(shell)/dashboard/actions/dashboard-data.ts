'use server';

/**
 * Core dashboard data fetching logic.
 *
 * This module provides the DashboardData interface and server actions
 * for fetching and caching dashboard data. It coordinates data fetching
 * for user profiles, settings, social links, and tipping statistics.
 */

import * as Sentry from '@sentry/nextjs';
import { and, asc, sql as drizzleSql, eq, or } from 'drizzle-orm';
import {
  unstable_noStore as noStore,
  unstable_cache as unstableCache,
} from 'next/cache';
import { cache } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { setupDbSession, validateClerkUserId } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { dashboardQuery } from '@/lib/db/query-timeout';
import { clickEvents, tips } from '@/lib/db/schema/analytics';
import { userSettings, users } from '@/lib/db/schema/auth';
import { socialLinks } from '@/lib/db/schema/links';
import { type CreatorProfile, creatorProfiles } from '@/lib/db/schema/profiles';
import {
  createEmptyTippingStats,
  profileIsPublishable,
  selectDashboardProfile,
  type TippingStats,
} from '@/lib/db/server';
import { sqlAny } from '@/lib/db/sql-helpers';
import { getEntitlements } from '@/lib/entitlements/registry';
import {
  BillingUnavailableError,
  getCurrentUserEntitlements,
} from '@/lib/entitlements/server';
import { handleMigrationErrors } from '@/lib/migrations/handleMigrationErrors';
import { DSP_PLATFORMS } from '@/lib/services/social-links/types';
import { mapSocialLinkExistence } from './social-link-utils';

const { logger } = Sentry;

/**
 * Executes a query with RLS session setup before query execution.
 *
 * The session setup and query execution happen in sequence to avoid runtime
 * failures from batching raw SQL values with Neon HTTP's batch API.
 *
 * @param clerkUserId - The Clerk user ID for session setup
 * @param queryFn - Function that returns the Drizzle query builder (not executed yet)
 * @param context - Description for error messages (used for timeout wrapper)
 * @returns The query result with timeout wrapper
 */
async function executeWithSession<T>(
  clerkUserId: string,
  queryFn: () => { execute: () => Promise<T> },
  context?: string
): Promise<T> {
  validateClerkUserId(clerkUserId);

  const query = queryFn();

  // Neon HTTP batch currently requires runnable Drizzle queries only.
  // setupDbSession() avoids runtime failures from batching db.execute(SQL).
  return dashboardQuery(async () => {
    await setupDbSession(clerkUserId);
    return query.execute();
  }, context ?? 'Query with session');
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function trySerialize(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function safeSerializeError(error: unknown): string {
  if (error instanceof Error) {
    return (
      trySerialize({
        name: error.name,
        message: error.message,
        stack: error.stack,
      }) ??
      trySerialize({ message: String(error.message), name: error.name }) ??
      String(error)
    );
  }

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    return (
      trySerialize({
        message: typeof obj.message === 'string' ? obj.message : undefined,
        code: typeof obj.code === 'string' ? obj.code : undefined,
        name: typeof obj.name === 'string' ? obj.name : undefined,
        cause: obj.cause,
      }) ??
      trySerialize({
        message: typeof obj.message === 'string' ? obj.message : String(error),
        name: typeof obj.name === 'string' ? obj.name : undefined,
      }) ??
      String(error)
    );
  }

  return trySerialize({ value: String(error) }) ?? String(error);
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
  /** Profile setup completion percentage and recommended next steps */
  profileCompletion: ProfileCompletion;
}

export interface ProfileCompletionStep {
  id: 'avatar' | 'bio' | 'social-links' | 'music-links' | 'tip-jar';
  label: string;
  description: string;
  href: string;
}

export interface ProfileCompletion {
  percentage: number;
  completedCount: number;
  totalCount: number;
  steps: ProfileCompletionStep[];
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildProfileCompletion(
  selectedProfile: CreatorProfile | null,
  hasSocialLinks: boolean,
  hasMusicLinks: boolean
): ProfileCompletion {
  const totalCount = 7;

  if (!selectedProfile) {
    return {
      percentage: 0,
      completedCount: 0,
      totalCount,
      steps: [],
    };
  }

  const checks = {
    handle: hasText(selectedProfile.username),
    name: hasText(selectedProfile.displayName),
    avatar: hasText(selectedProfile.avatarUrl),
    bio: hasText(selectedProfile.bio),
    socialLinks: hasSocialLinks,
    musicLinks: hasMusicLinks,
    tipJar: hasText(selectedProfile.venmoHandle),
  };

  const completedCount = Object.values(checks).filter(Boolean).length;
  const percentage = Math.round((completedCount / totalCount) * 100);

  const steps: ProfileCompletionStep[] = [];

  if (!checks.avatar) {
    steps.push({
      id: 'avatar',
      label: 'Add a profile photo',
      description: 'A recognizable photo makes your page feel personal.',
      href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
    });
  }

  if (!checks.bio) {
    steps.push({
      id: 'bio',
      label: 'Write a short bio',
      description: 'Tell new fans who you are in one or two lines.',
      href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
    });
  }

  if (!checks.socialLinks) {
    steps.push({
      id: 'social-links',
      label: 'Connect your social links',
      description: 'Give fans one-tap access to your social presence.',
      href: APP_ROUTES.DASHBOARD_LINKS,
    });
  }

  if (!checks.musicLinks) {
    steps.push({
      id: 'music-links',
      label: 'Add your music platforms',
      description:
        'Help listeners stream you on Spotify, Apple Music, and more.',
      href: APP_ROUTES.DASHBOARD_LINKS,
    });
  }

  if (!checks.tipJar) {
    steps.push({
      id: 'tip-jar',
      label: 'Set up your tip jar',
      description: 'Turn attention into support with a fast tipping link.',
      href: APP_ROUTES.DASHBOARD_EARNINGS,
    });
  }

  return {
    percentage,
    completedCount,
    totalCount,
    steps,
  };
}

/**
 * Fetches dashboard data within a database session context.
 *
 * This internal function performs all database queries needed to assemble
 * dashboard data, including user lookup, profile selection, settings,
 * link counts, and tipping statistics. It handles migration-related errors
 * gracefully by treating them as "needs onboarding" states.
 *
 * @param clerkUserId - Clerk user ID for the current user
 * @returns Dashboard data without isAdmin (added by caller)
 */
type CoreData = Omit<DashboardData, 'isAdmin'>;

async function fetchDashboardCoreWithSession(
  clerkUserId: string
): Promise<CoreData> {
  try {
    // First check if user exists in users table
    // Use batch API to ensure RLS session variables are set on the same connection
    const [userData] = await executeWithSession(
      clerkUserId,
      () =>
        db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clerkId, clerkUserId))
          .limit(1),
      'User lookup query'
    );

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
        tippingStats: createEmptyTippingStats(),
        profileCompletion: buildProfileCompletion(null, false, false),
      };
    }

    // Now that we know user exists, get creator profiles
    // Use batch API to ensure RLS session variables are set on the same connection
    const creatorData = await executeWithSession(
      clerkUserId,
      () =>
        db
          .select()
          .from(creatorProfiles)
          .where(eq(creatorProfiles.userId, userData.id))
          .orderBy(asc(creatorProfiles.createdAt)),
      'Creator profiles query'
    ).catch((error: unknown) => {
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
        tippingStats: createEmptyTippingStats(),
        profileCompletion: buildProfileCompletion(null, false, false),
      };
    }

    const selected = selectDashboardProfile(creatorData);

    // Performance optimization: Fetch settings, link counts, AND tipping stats in parallel.
    // This eliminates the waterfall where tipping stats had to wait for chrome data to finish.
    // Each query in Promise.all uses batch API to ensure RLS session on same connection.
    const [settings, linkCounts, tippingStats] = await Promise.all([
      executeWithSession(
        clerkUserId,
        () =>
          db
            .select()
            .from(userSettings)
            .where(eq(userSettings.userId, userData.id))
            .limit(1),
        'User settings query'
      )
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
      // Optimized existence query for link booleans.
      // Aggregate counts are scoped to the selected profile's active links.
      // Both queries share the same RLS session context set by executeWithSession.
      executeWithSession(
        clerkUserId,
        () =>
          db
            .select({
              hasLinks: drizzleSql<boolean>`
              exists (
                select 1
                from ${socialLinks}
                where ${and(
                  eq(socialLinks.creatorProfileId, selected.id),
                  eq(socialLinks.state, 'active'),
                  eq(socialLinks.isActive, true)
                )}
              )
            `,
              hasMusicLinks: drizzleSql<boolean>`
              exists (
                select 1
                from ${socialLinks}
                where ${and(
                  eq(socialLinks.creatorProfileId, selected.id),
                  eq(socialLinks.state, 'active'),
                  eq(socialLinks.isActive, true),
                  or(
                    eq(socialLinks.platformType, 'dsp'),
                    eq(socialLinks.platform, sqlAny(DSP_PLATFORMS))
                  )
                )}
              )
            `,
            })
            .from(users)
            .where(eq(users.id, userData.id))
            .limit(1),
        'Social links existence query'
      )
        .then(result => {
          return mapSocialLinkExistence(result?.[0]);
        })
        .catch((error: unknown) => {
          const migrationResult = handleMigrationErrors(error, {
            userId: userData.id,
            operation: 'social_links_count',
          });

          if (!migrationResult.shouldRetry) {
            return { hasLinks: false, hasMusicLinks: false };
          }
          Sentry.captureException(error, {
            tags: {
              query: 'social_links_existence',
              context: 'dashboard_data',
            },
          });
          throw error;
        }),
      // Tipping stats now run in parallel with settings and link counts,
      // eliminating the previous waterfall where they waited for chrome data
      fetchTippingStatsWithSession(selected.id, clerkUserId),
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
      tippingStats,
      profileCompletion: buildProfileCompletion(
        selected,
        hasLinks,
        hasMusicLinks
      ),
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
      tippingStats: createEmptyTippingStats(),
      profileCompletion: buildProfileCompletion(null, false, false),
    };
  }
}

async function fetchTippingStatsWithSession(
  profileId: string,
  clerkUserId: string
): Promise<TippingStats> {
  try {
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const startOfMonthISO = startOfMonth.toISOString();

    // Execute queries in parallel, each using batch API to ensure RLS session
    // on the same connection. This is critical because the Neon HTTP driver is
    // stateless - each query may hit a different connection.
    const [tipTotalsRawResult, clickStatsResult] = await Promise.all([
      executeWithSession(
        clerkUserId,
        () =>
          db
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
        'Tipping stats query'
      ),
      executeWithSession(
        clerkUserId,
        () =>
          db
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
        'Click events query'
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
    // Query timeouts are expected during Neon cold starts — downgrade to warning.
    // The dashboard degrades gracefully by showing empty tipping stats.
    const level =
      error instanceof Error && error.name === 'QueryTimeoutError'
        ? 'warning'
        : 'error';
    Sentry.captureException(error, {
      level,
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

  let entitlements;
  try {
    entitlements = await getCurrentUserEntitlements();
  } catch (error) {
    if (error instanceof BillingUnavailableError) {
      // Billing DB is down — degrade gracefully instead of crashing dashboard.
      // Admin status is still available from the error since it's fetched independently.
      // Note: Not reporting to Sentry here — the underlying DB failure is already
      // captured upstream in fetchUserBillingData. Duplicate reporting was creating
      // thousands of Sentry events (JOVIE-WEB-AD/AE/AF/AC/9Y/9C).
      logger.warn('Billing unavailable, degrading to free tier', {
        userId: error.userId,
        isAdmin: error.isAdmin,
      });
      const freeDefaults = getEntitlements('free');
      entitlements = {
        userId: error.userId,
        isAdmin: error.isAdmin,
        isAuthenticated: true,
        email: null,
        plan: 'free' as const,
        isPro: false,
        hasAdvancedFeatures: false,
        ...freeDefaults.booleans,
        ...freeDefaults.limits,
      };
    } else {
      throw error;
    }
  }
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
      profileCompletion: buildProfileCompletion(null, false, false),
    };
  }

  try {
    // Single cached fetch for all dashboard core data (profile, settings, links, tipping stats).
    // Tipping stats now run in parallel with settings and link counts inside the core fetch,
    // eliminating the previous waterfall where they waited for chrome data to complete.
    const coreData = await Sentry.startSpan(
      { op: 'task', name: 'dashboard.getCoreData' },
      async () => getCachedDashboardCore(userId)
    );

    return {
      ...coreData,
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
      profileCompletion: buildProfileCompletion(null, false, false),
    };
  }
}

/**
 * Single consolidated cache for all dashboard core data.
 * Settings, link counts, and tipping stats are fetched in parallel
 * within fetchDashboardCoreWithSession, eliminating the previous
 * waterfall where tipping stats waited for chrome data.
 */
const getCachedDashboardCore = unstableCache(
  async (clerkUserId: string) => fetchDashboardCoreWithSession(clerkUserId),
  ['dashboard-core'],
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
