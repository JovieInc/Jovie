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
import { withDbSessionTx } from '@/lib/auth/session';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { type DbOrTransaction } from '@/lib/db';
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
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { handleMigrationErrors } from '@/lib/migrations/handleMigrationErrors';
import { calculateRequiredProfileCompletion } from '@/lib/profile/completion';
import { DSP_PLATFORMS } from '@/lib/services/social-links/types';
import { mapSocialLinkExistence } from './social-link-utils';

const { logger } = Sentry;

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
  /** Optional diagnostic payload when dashboard data loading partially fails */
  dashboardLoadError?: {
    stage: 'core_fetch' | 'core_cache';
    message: string;
    code: string | null;
    errorType: string;
  };
  /** Whether the user appears to be in their first chat session window */
  isFirstSession?: boolean;
}

export interface ProfileCompletionStep {
  id: 'name' | 'avatar' | 'email' | 'music-links';
  label: string;
  description: string;
  href: string;
}

export interface ProfileCompletion {
  percentage: number;
  completedCount: number;
  totalCount: number;
  steps: ProfileCompletionStep[];
  profileIsLive: boolean;
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function deriveIsFirstSession(
  selectedProfile: CreatorProfile | null,
  now = Date.now(),
  windowMs = 15 * 60 * 1000
): boolean {
  if (!selectedProfile?.createdAt) return false;
  const ageMs = now - selectedProfile.createdAt.getTime();
  return ageMs >= 0 && ageMs < windowMs;
}

function buildProfileCompletion(
  selectedProfile: CreatorProfile | null,
  email: string | null | undefined,
  hasMusicLinks: boolean
): ProfileCompletion {
  if (!selectedProfile) {
    return {
      percentage: 0,
      completedCount: 0,
      totalCount: 4,
      steps: [],
      profileIsLive: false,
    };
  }

  const hasConnectedDspProfile =
    hasText(selectedProfile.spotifyUrl) ||
    hasText(selectedProfile.appleMusicUrl) ||
    hasText(selectedProfile.youtubeUrl) ||
    hasText(selectedProfile.spotifyId) ||
    hasText(selectedProfile.appleMusicId) ||
    hasText(selectedProfile.youtubeMusicId);

  const hasMusicPresence = hasMusicLinks || hasConnectedDspProfile;

  const completion = calculateRequiredProfileCompletion({
    displayName: selectedProfile.displayName,
    avatarUrl: selectedProfile.avatarUrl,
    email,
    hasMusicLinks: hasMusicPresence,
  });

  const steps: ProfileCompletionStep[] = [];

  if (!completion.hasName) {
    steps.push({
      id: 'name',
      label: 'Add your artist name',
      description: 'A clear name helps fans recognize and trust your profile.',
      href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
    });
  }

  if (!completion.hasAvatar) {
    steps.push({
      id: 'avatar',
      label: 'Add a profile photo',
      description: 'A recognizable photo makes your page feel personal.',
      href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
    });
  }

  if (!completion.hasEmail) {
    steps.push({
      id: 'email',
      label: 'Add your account email',
      description: 'Email keeps your account recoverable and mission-critical.',
      href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
    });
  }

  if (!completion.hasMusicLinks) {
    steps.push({
      id: 'music-links',
      label: 'Add your music platforms',
      description:
        'Help listeners stream you on Spotify, Apple Music, and more.',
      href: APP_ROUTES.DASHBOARD_LINKS,
    });
  }

  const profileIsLive =
    completion.hasName &&
    completion.hasAvatar &&
    hasText(selectedProfile.username) &&
    hasMusicPresence;

  return {
    percentage: completion.percentage,
    completedCount: completion.completedCount,
    totalCount: completion.totalCount,
    steps,
    profileIsLive,
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
    return await withDbSessionTx(
      async (tx, sessionUserId) => {
        // First check if user exists in users table
        const [userData] = await dashboardQuery(
          () =>
            tx
              .select({ id: users.id, email: users.email })
              .from(users)
              .where(eq(users.clerkId, sessionUserId))
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
            profileCompletion: buildProfileCompletion(null, null, false),
            isFirstSession: false,
          };
        }

        // Now that we know user exists, get creator profiles
        const creatorData = await dashboardQuery(
          () =>
            tx
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
            profileCompletion: buildProfileCompletion(null, null, false),
            isFirstSession: false,
          };
        }

        const selected = selectDashboardProfile(creatorData);

        // Fetch settings, link counts, and tipping stats sequentially to
        // avoid exhausting the connection pool during high-concurrency requests.
        const settings = await dashboardQuery(
          () =>
            tx
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
              level: 'warning',
              tags: {
                query: 'user_settings',
                context: 'dashboard_data_settled',
              },
            });
            return undefined;
          });

        // Optimized existence query for link booleans.
        // Aggregate counts are scoped to the selected profile's active links.
        const linkCounts = await dashboardQuery(
          () =>
            tx
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
              operation: 'social_links_existence',
            });

            if (!migrationResult.shouldRetry) {
              return { hasLinks: false, hasMusicLinks: false };
            }

            Sentry.captureException(error, {
              level: 'warning',
              tags: {
                query: 'social_links_existence',
                context: 'dashboard_data_settled',
              },
            });
            return { hasLinks: false, hasMusicLinks: false };
          });

        const tippingStats = await fetchTippingStatsWithSession(
          tx,
          selected.id
        );

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
            userData.email,
            hasMusicLinks
          ),
          dashboardLoadError: undefined,
          isFirstSession: deriveIsFirstSession(selected),
        };
      },
      { clerkUserId }
    );
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
      profileCompletion: buildProfileCompletion(null, null, false),
      dashboardLoadError: {
        stage: 'core_fetch',
        message,
        code: code ?? null,
        errorType,
      },
      isFirstSession: false,
    };
  }
}

async function fetchTippingStatsWithSession(
  tx: DbOrTransaction,
  profileId: string
): Promise<TippingStats> {
  try {
    // Set a PostgreSQL-level statement timeout to prevent long-running queries
    // from holding Neon WebSocket connections open past the idle timeout.
    // This is a safety net in addition to the JS-level timeout.
    // Use SET (session-scoped) instead of SET LOCAL — SET LOCAL is a no-op
    // outside a transaction block and the Neon HTTP driver does not support
    // transactions. See lib/db/query-timeout.ts for documentation.
    await tx.execute(drizzleSql`SET statement_timeout = '5000ms'`);

    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const startOfMonthISO = startOfMonth.toISOString();

    // Use a 12-month lookback for click events to avoid full table scans.
    // This leverages the idx_tips_created_at index (creator_profile_id, created_at).
    // Tip totals (tipsSubmitted, totalReceivedCents) are lifetime values — no date filter.
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setUTCMonth(twelveMonthsAgo.getUTCMonth() - 12);
    twelveMonthsAgo.setUTCDate(1);
    twelveMonthsAgo.setUTCHours(0, 0, 0, 0);
    const twelveMonthsAgoISO = twelveMonthsAgo.toISOString();

    const tipTotalsRawResult = await dashboardQuery(
      () =>
        tx
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
    );

    // Limit click events query to last 12 months to leverage indexes
    const clickStatsResult = await dashboardQuery(
      () =>
        tx
          .select({
            qr: drizzleSql<number>`count(*) filter (where (${clickEvents.metadata}->>'source') = 'qr')`,
            link: drizzleSql<number>`count(*) filter (where (${clickEvents.metadata}->>'source') = 'link')`,
          })
          .from(clickEvents)
          .where(
            and(
              eq(clickEvents.creatorProfileId, profileId),
              eq(clickEvents.linkType, 'tip'),
              drizzleSql`${clickEvents.createdAt} >= ${twelveMonthsAgoISO}::timestamp`
            )
          ),
      'Click events query'
    );

    const tipTotalsRaw = tipTotalsRawResult?.[0];
    const clickStats = clickStatsResult?.[0];

    return {
      tipClicks: Number((clickStats?.qr ?? 0) + (clickStats?.link ?? 0)),
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
      error instanceof Error &&
      (error.name === 'QueryTimeoutError' ||
        error.message.includes('statement timeout'))
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

  // getCurrentUserEntitlements degrades gracefully on billing failure --
  // it returns free-tier defaults with admin status preserved, never throws.
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
      profileCompletion: buildProfileCompletion(null, null, false),
      isFirstSession: false,
    };
  }

  try {
    // Single cached fetch for all dashboard core data (profile, settings, links, tipping stats).
    // Queries are sequenced within the core fetch to reduce connection pool pressure.
    const coreData = await Sentry.startSpan(
      { op: 'task', name: 'dashboard.getCoreData' },
      async () => getCachedDashboardCore(userId)
    );

    return {
      ...coreData,
      isAdmin,
      dashboardLoadError: coreData.dashboardLoadError,
    };
  } catch (error) {
    const errorObj = error as
      | Error
      | { code?: string; message?: string; cause?: unknown };
    const message =
      (errorObj as Error).message ??
      (errorObj as { message?: string }).message ??
      'Unknown error';
    const code =
      (errorObj as { code?: string }).code ??
      (errorObj as { cause?: { code?: string } }).cause?.code;
    const errorType = errorObj?.constructor?.name ?? typeof errorObj;

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
      profileCompletion: buildProfileCompletion(null, null, false),
      dashboardLoadError: {
        stage: 'core_cache',
        message,
        code: code ?? null,
        errorType,
      },
      isFirstSession: false,
    };
  }
}

/**
 * Single consolidated cache for all dashboard core data.
 * Settings, link counts, and tipping stats are fetched sequentially
 * within fetchDashboardCoreWithSession to avoid pool exhaustion.
 */
const getCachedDashboardCore = unstableCache(
  async (clerkUserId: string) => fetchDashboardCoreWithSession(clerkUserId),
  ['dashboard-core'],
  {
    revalidate: 30,
    tags: [CACHE_TAGS.DASHBOARD_DATA],
  }
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
 * @deprecated Use getDashboardData() instead. This alias is planned for removal in a future major release; migrate to getDashboardData() to avoid breakage.
 */
export async function getDashboardDataCached(): Promise<DashboardData> {
  // Backwards-compatible alias; now shares the deduped loader.
  return getDashboardData();
}
