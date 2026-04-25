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
  sql as drizzleSql,
  eq,
  inArray,
  isNull,
  ne,
  or,
} from 'drizzle-orm';
import { unstable_cache as unstableCache } from 'next/cache';
import { cache } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { resolveUserState } from '@/lib/auth/gate';
import { withDbSession, withDbSessionTx } from '@/lib/auth/session';
import { CACHE_TAGS, CACHE_TTL } from '@/lib/cache/tags';
import { type DbOrTransaction, db, doesTableExist } from '@/lib/db';
import { getAvatarQualityForProfile } from '@/lib/db/queries/avatar-quality';
import { dashboardQuery } from '@/lib/db/query-timeout';
import { clickEvents, tips } from '@/lib/db/schema/analytics';
import { userSettings, users } from '@/lib/db/schema/auth';
import { discogReleases } from '@/lib/db/schema/content';
import { socialLinks } from '@/lib/db/schema/links';
import {
  type CreatorProfile,
  creatorDistributionEvents,
  creatorProfiles,
} from '@/lib/db/schema/profiles';
import {
  createEmptyTippingStats,
  profileIsPublishable,
  selectDashboardProfile,
  type TippingStats,
} from '@/lib/db/server';
import { sqlAny } from '@/lib/db/sql-helpers';
import {
  type BioLinkActivation,
  getBioLinkActivationWindowEnd,
  INSTAGRAM_DISTRIBUTION_PLATFORM,
  resolveBioLinkActivationStatus,
} from '@/lib/distribution/instagram-activation';
import { isE2EFastOnboardingEnabled } from '@/lib/e2e/runtime';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { handleMigrationErrors } from '@/lib/migrations/handleMigrationErrors';
import {
  type AvatarQuality,
  UNKNOWN_AVATAR_QUALITY,
} from '@/lib/profile/avatar-quality';
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
  /** Derived avatar quality metadata for profile review surfaces */
  avatarQuality?: AvatarQuality;
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
  /** Instagram bio-link activation state for onboarding and dashboard nudges */
  bioLinkActivation?: BioLinkActivation | null;
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

function serializeNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

const BIO_LINK_ACTIVATION_EVENT_TYPES = [
  'activated',
  'link_copied',
  'platform_opened',
] as const;

type BioLinkActivationEventType =
  (typeof BIO_LINK_ACTIVATION_EVENT_TYPES)[number];

async function buildBioLinkActivation(
  tx: DbOrTransaction,
  profile: CreatorProfile
): Promise<BioLinkActivation | null> {
  const windowEndsAt = getBioLinkActivationWindowEnd(
    profile.onboardingCompletedAt
  );
  if (!windowEndsAt) {
    return null;
  }

  const timestamps: Record<
    'activated' | 'link_copied' | 'platform_opened',
    Date | null
  > = {
    activated: null,
    link_copied: null,
    platform_opened: null,
  };

  const hasDistributionEventsTable = await doesTableExist(
    'creator_distribution_events'
  );

  if (hasDistributionEventsTable) {
    const eventRows = await dashboardQuery(
      () =>
        tx
          .select({
            createdAt: creatorDistributionEvents.createdAt,
            eventType: creatorDistributionEvents.eventType,
          })
          .from(creatorDistributionEvents)
          .where(
            and(
              eq(creatorDistributionEvents.creatorProfileId, profile.id),
              eq(
                creatorDistributionEvents.platform,
                INSTAGRAM_DISTRIBUTION_PLATFORM
              ),
              inArray(
                creatorDistributionEvents.eventType,
                BIO_LINK_ACTIVATION_EVENT_TYPES
              )
            )
          )
          .orderBy(asc(creatorDistributionEvents.createdAt)),
      'Creator distribution events query'
    ).catch((error: unknown) => {
      Sentry.captureException(error, {
        level: 'warning',
        tags: {
          query: 'creator_distribution_events',
          context: 'dashboard_data_settled',
        },
      });
      return [];
    });

    for (const eventRow of eventRows) {
      const eventType = eventRow.eventType as BioLinkActivationEventType;
      timestamps[eventType] ??= eventRow.createdAt;
    }
  }

  return {
    activatedAt: serializeNullableDate(timestamps.activated),
    copiedAt: serializeNullableDate(timestamps.link_copied),
    openedAt: serializeNullableDate(timestamps.platform_opened),
    platform: INSTAGRAM_DISTRIBUTION_PLATFORM,
    status: resolveBioLinkActivationStatus({
      activatedAt: timestamps.activated,
      windowEndsAt,
    }),
    windowEndsAt: serializeNullableDate(windowEndsAt),
  };
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
      href: APP_ROUTES.CHAT_PROFILE_PANEL,
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

function shouldBypassDashboardCache(): boolean {
  return isE2EFastOnboardingEnabled();
}

function applyAdminOnboardingBypass(
  coreData: CoreData,
  isAdmin: boolean
): CoreData {
  if (!isAdmin || !coreData.needsOnboarding) {
    return coreData;
  }

  return {
    ...coreData,
    needsOnboarding: false,
  };
}

/** Default empty CoreData used when user/profile is missing or on error. */
function createEmptyCoreData(overrides?: Partial<CoreData>): CoreData {
  return {
    user: null,
    creatorProfiles: [],
    selectedProfile: null,
    avatarQuality: UNKNOWN_AVATAR_QUALITY,
    needsOnboarding: true,
    sidebarCollapsed: false,
    hasSocialLinks: false,
    hasMusicLinks: false,
    tippingStats: createEmptyTippingStats(),
    profileCompletion: buildProfileCompletion(null, null, false),
    bioLinkActivation: null,
    isFirstSession: false,
    ...overrides,
  };
}

/**
 * Fetches the essential dashboard data within a transaction: user, profiles, settings.
 * This is the fast path (~3 single-row queries). Used directly by the shell layout
 * and as the foundation for the full fetch which augments with slow queries.
 */
async function fetchDashboardBaseWithSession(
  tx: DbOrTransaction,
  sessionUserId: string,
  options?: {
    readonly includeSettings?: boolean;
  }
): Promise<CoreData> {
  const selectUser = () =>
    tx
      .select({
        id: users.id,
        email: users.email,
        activeProfileId: users.activeProfileId,
      })
      .from(users)
      .where(eq(users.clerkId, sessionUserId))
      .limit(1);

  let [userData] = await dashboardQuery(selectUser, 'User lookup query');

  if (!userData?.id) {
    try {
      const resolvedUserState = await resolveUserState({
        createDbUserIfMissing: true,
      });

      if (
        resolvedUserState.clerkUserId === sessionUserId &&
        resolvedUserState.dbUserId
      ) {
        [userData] = await dashboardQuery(
          selectUser,
          'User lookup query after auth reconciliation'
        );
      }
    } catch (error) {
      Sentry.captureException(error, {
        level: 'warning',
        tags: { context: 'dashboard_auth_reconciliation' },
        extra: { sessionUserId },
      });
    }
  }

  if (!userData?.id) {
    return createEmptyCoreData();
  }

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
    return createEmptyCoreData({ user: userData });
  }

  const visibleReleaseCounts = await dashboardQuery(
    () =>
      tx
        .select({
          creatorProfileId: discogReleases.creatorProfileId,
          count: drizzleSql<number>`count(*)::int`,
        })
        .from(discogReleases)
        .where(
          and(
            inArray(
              discogReleases.creatorProfileId,
              creatorData.map(profile => profile.id)
            ),
            isNull(discogReleases.deletedAt),
            ne(discogReleases.status, 'draft'),
            drizzleSql`(${discogReleases.revealDate} IS NULL OR ${discogReleases.revealDate} <= NOW())`
          )
        )
        .groupBy(discogReleases.creatorProfileId),
    'Visible release counts query'
  ).catch((error: unknown) => {
    Sentry.captureException(error, {
      level: 'warning',
      tags: {
        query: 'visible_release_counts',
        context: 'dashboard_data_settled',
      },
    });
    return [];
  });

  const visibleReleaseCountByProfileId = new Map(
    visibleReleaseCounts.map(row => [
      row.creatorProfileId,
      Number(row.count ?? 0),
    ])
  );

  const isLaunchReadyProfile = (profile: CreatorProfile | null) =>
    Boolean(
      profile &&
        profileIsPublishable(profile) &&
        (visibleReleaseCountByProfileId.get(profile.id) ?? 0) > 0
    );

  const selected = userData.activeProfileId
    ? (creatorData.find(p => p.id === userData.activeProfileId) ??
      creatorData.find(isLaunchReadyProfile) ??
      selectDashboardProfile(creatorData))
    : (creatorData.find(isLaunchReadyProfile) ??
      selectDashboardProfile(creatorData));

  const settings =
    options?.includeSettings === false
      ? undefined
      : await dashboardQuery(
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

  return {
    user: userData,
    creatorProfiles: creatorData,
    selectedProfile: selected,
    avatarQuality: UNKNOWN_AVATAR_QUALITY,
    needsOnboarding: !isLaunchReadyProfile(selected),
    sidebarCollapsed: settings?.sidebarCollapsed ?? false,
    hasSocialLinks: false,
    hasMusicLinks: false,
    tippingStats: createEmptyTippingStats(),
    profileCompletion: buildProfileCompletion(selected, userData.email, false),
    bioLinkActivation: null,
    dashboardLoadError: undefined,
    isFirstSession: deriveIsFirstSession(selected),
  };
}

/**
 * Full dashboard data fetch. Calls the base fetch for user/profiles/settings,
 * then augments with slow supplementary queries (links, avatar, tipping).
 */
async function fetchDashboardCoreWithSession(
  clerkUserId: string
): Promise<CoreData> {
  try {
    return await withDbSessionTx(
      async (tx, sessionUserId) => {
        const base = await fetchDashboardBaseWithSession(tx, sessionUserId);

        // If no profile resolved, return the base result (onboarding/error state)
        if (!base.selectedProfile) {
          return base;
        }

        const selected = base.selectedProfile;
        const userId = base.user?.id;
        if (!userId) return base;

        // Fetch supplementary data sequentially.
        // These share a single transaction connection (pg serializes queries
        // on one connection), so parallel dispatch would just queue them
        // while starting all timeout timers simultaneously.
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
              .where(eq(users.id, userId))
              .limit(1),
          'Social links existence query'
        )
          .then(result => mapSocialLinkExistence(result?.[0]))
          .catch((error: unknown) => {
            const migrationResult = handleMigrationErrors(error, {
              userId,
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

        const avatarQuality = await getAvatarQualityForProfile(
          selected.id,
          tx
        ).catch((error: unknown) => {
          Sentry.captureException(error, {
            level: 'warning',
            tags: {
              query: 'avatar_quality',
              context: 'dashboard_data_settled',
            },
          });
          return UNKNOWN_AVATAR_QUALITY;
        });

        const tippingStats = await fetchTippingStatsWithSession(
          tx,
          selected.id
        );
        const bioLinkActivation = await buildBioLinkActivation(tx, selected);

        const hasMusicLinks = linkCounts.hasMusicLinks;

        // base.user contains { id, email, activeProfileId } at runtime,
        // but CoreData.user is typed as { id: string }. Cast to access email
        // for profileCompletion without an extra DB query.
        const userEmail =
          (base.user as { id: string; email?: string | null } | null)?.email ??
          null;

        return {
          ...base,
          avatarQuality,
          hasSocialLinks: linkCounts.hasLinks,
          hasMusicLinks,
          tippingStats,
          profileCompletion: buildProfileCompletion(
            selected,
            userEmail,
            hasMusicLinks
          ),
          bioLinkActivation,
        };
      },
      { clerkUserId }
    );
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

    logger.error('Error fetching dashboard data', {
      message,
      code,
      errorType,
      errorString: String(error),
      errorJson: truncateString(safeSerializeError(errorObj), 1000),
      stack: (errorObj as Error).stack?.split('\n').slice(0, 3).join('\n'),
    });

    logger.error('Raw error object', { error });

    return createEmptyCoreData({
      dashboardLoadError: {
        stage: 'core_fetch',
        message,
        code: code ?? null,
        errorType,
      },
    });
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
            total: drizzleSql<number>`count(*)`,
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

/** Resolves full dashboard data (all queries including slow supplementary). */
async function resolveDashboardData(): Promise<DashboardData> {
  return resolveDashboardDataWith(
    'dashboard.getCoreData',
    getCachedDashboardCore,
    fetchDashboardCoreWithSession,
    'get_dashboard_data'
  );
}

/**
 * Fast-path fetch for the dashboard shell.
 *
 * Returns ONLY the data needed to render the shell + chat input:
 * user, profiles, selected profile, settings, and sidebar state.
 *
 * Skips slow queries (tipping stats, social links existence, avatar quality)
 * that are only needed by secondary dashboard pages. Those fields get safe
 * defaults so the DashboardData interface stays compatible.
 *
 * ~3 fast single-row queries vs ~6 sequential queries in the full fetch.
 */
async function fetchDashboardEssentialWithSession(
  clerkUserId: string
): Promise<CoreData> {
  try {
    return await withDbSessionTx(
      async (tx, sessionUserId) =>
        fetchDashboardBaseWithSession(tx, sessionUserId),
      { clerkUserId }
    );
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

    logger.error('Error fetching essential dashboard data', {
      message,
      code,
      errorType,
    });

    return createEmptyCoreData({
      dashboardLoadError: {
        stage: 'core_fetch',
        message,
        code: code ?? null,
        errorType,
      },
    });
  }
}

/**
 * Shell-specific fast path.
 *
 * Uses the already-authenticated Clerk user id from the app shell so the
 * request can skip the entitlements + billing path entirely. This keeps
 * `/app`, `/app/chat`, and releases on the narrowest data path that still
 * provides selectedProfile + creatorProfiles for the sidebar shell.
 */
async function fetchDashboardShellWithSession(
  clerkUserId: string
): Promise<CoreData> {
  try {
    // Use withDbSession (no transaction) instead of withDbSessionTx.
    // The shell path only reads user + profiles — no writes, no atomicity needed.
    // This skips BEGIN/COMMIT overhead (~50-150ms on cold Neon connections) while
    // still setting the RLS session variable via connection-scoped set_config.
    return await withDbSession(
      async sessionUserId =>
        fetchDashboardBaseWithSession(db, sessionUserId, {
          includeSettings: false,
        }),
      { clerkUserId }
    );
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

    logger.error('Error fetching shell dashboard data', {
      message,
      code,
      errorType,
    });

    return createEmptyCoreData({
      dashboardLoadError: {
        stage: 'core_fetch',
        message,
        code: code ?? null,
        errorType,
      },
    });
  }
}

/**
 * Cached essential dashboard data (fast path).
 * Only user + profiles + settings. No tipping/links/avatar.
 */
const getCachedDashboardEssential = unstableCache(
  async (clerkUserId: string) =>
    fetchDashboardEssentialWithSession(clerkUserId),
  ['dashboard-essential'],
  {
    revalidate: CACHE_TTL.MEDIUM,
    tags: [CACHE_TAGS.DASHBOARD_DATA],
  }
);

const getCachedDashboardShell = unstableCache(
  async (clerkUserId: string) => fetchDashboardShellWithSession(clerkUserId),
  ['dashboard-shell'],
  {
    revalidate: CACHE_TTL.MEDIUM,
    tags: [CACHE_TAGS.DASHBOARD_DATA],
  }
);

/**
 * Single consolidated cache for all dashboard core data.
 * Settings, link counts, and tipping stats are fetched sequentially
 * within fetchDashboardCoreWithSession to avoid pool exhaustion.
 */
const getCachedDashboardCore = unstableCache(
  async (clerkUserId: string) => fetchDashboardCoreWithSession(clerkUserId),
  ['dashboard-core'],
  {
    revalidate: CACHE_TTL.MEDIUM,
    tags: [CACHE_TAGS.DASHBOARD_DATA],
  }
);

function shouldRefreshUnstableDashboardState(data: CoreData): boolean {
  return Boolean(data.dashboardLoadError) || !data.selectedProfile;
}

/**
 * Shared resolver: fetches entitlements, calls the provided cache function,
 * and handles the no-userId / error fallback. Used by both full and essential paths.
 */
async function resolveDashboardDataWith(
  spanName: string,
  fetchFn: (userId: string) => Promise<CoreData>,
  fetchFreshFn: (userId: string) => Promise<CoreData>,
  context: string
): Promise<DashboardData> {
  const bypassCache = shouldBypassDashboardCache();
  const entitlements = await getCurrentUserEntitlements();
  const isAdmin = entitlements.isAdmin;
  const userId = entitlements.userId;

  if (!userId) {
    return { ...createEmptyCoreData(), isAdmin };
  }

  try {
    let coreData = bypassCache
      ? await fetchFreshFn(userId)
      : await Sentry.startSpan({ op: 'task', name: spanName }, async () =>
          fetchFn(userId)
        );

    if (!bypassCache && shouldRefreshUnstableDashboardState(coreData)) {
      coreData = await fetchFreshFn(userId);
    }

    return {
      ...applyAdminOnboardingBypass(coreData, isAdmin),
      isAdmin,
      dashboardLoadError: coreData.dashboardLoadError,
    };
  } catch (error) {
    Sentry.captureException(error, { tags: { context } });
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      ...createEmptyCoreData({
        dashboardLoadError: {
          stage: 'core_cache',
          message: errorMessage,
          code: null,
          errorType: error?.constructor?.name ?? typeof error,
        },
      }),
      isAdmin,
    };
  }
}

/** Resolves essential dashboard data (fast path for shell rendering). */
async function resolveDashboardDataEssential(): Promise<DashboardData> {
  return resolveDashboardDataWith(
    'dashboard.getEssentialData',
    getCachedDashboardEssential,
    fetchDashboardEssentialWithSession,
    'get_dashboard_data_essential'
  );
}

async function resolveDashboardShellData(
  clerkUserId: string
): Promise<DashboardData> {
  const bypassCache = shouldBypassDashboardCache();
  // noStore() removed: the inner getCachedDashboardShell() uses unstable_cache
  // with a 5-minute TTL. Calling noStore() here was preventing the Data Cache
  // from serving cached results on subsequent requests.

  try {
    const [adminResult, cachedCoreData] = await Promise.allSettled([
      checkAdminRole(clerkUserId),
      bypassCache
        ? fetchDashboardShellWithSession(clerkUserId)
        : Sentry.startSpan(
            { op: 'task', name: 'dashboard.getShellData' },
            async () => getCachedDashboardShell(clerkUserId)
          ),
    ]);

    if (cachedCoreData.status === 'rejected') throw cachedCoreData.reason;

    const isAdmin =
      adminResult.status === 'fulfilled' ? adminResult.value : false;
    const coreData =
      !bypassCache && shouldRefreshUnstableDashboardState(cachedCoreData.value)
        ? await fetchDashboardShellWithSession(clerkUserId)
        : cachedCoreData.value;

    return {
      ...applyAdminOnboardingBypass(coreData, isAdmin),
      isAdmin,
      dashboardLoadError: coreData.dashboardLoadError,
    };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { context: 'get_dashboard_shell_data' },
    });
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      ...createEmptyCoreData({
        dashboardLoadError: {
          stage: 'core_cache',
          message: errorMessage,
          code: null,
          errorType: error?.constructor?.name ?? typeof error,
        },
      }),
      isAdmin: false,
    };
  }
}

/**
 * Cached loader for dashboard data.
 * Uses React's cache() for request-level deduplication.
 */
const loadDashboardData = cache(resolveDashboardData);
const loadDashboardDataEssential = cache(resolveDashboardDataEssential);
const loadDashboardShellData = cache(resolveDashboardShellData);

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
 * Gets essential dashboard data (fast path).
 *
 * Returns user + profiles + settings with safe defaults for
 * tipping stats, social links, and avatar quality. Use this
 * when you need to render the shell fast and don't need the
 * slow supplementary queries.
 *
 * @returns DashboardData with essential fields populated, others defaulted
 */
export async function getDashboardDataEssential(): Promise<DashboardData> {
  return loadDashboardDataEssential();
}

/**
 * Gets the shell-optimized dashboard data for an already-authenticated user.
 *
 * This path intentionally skips entitlements/billing resolution and the
 * `user_settings` query so app-shell routes can render their visible surface
 * before the rest of the workspace metadata is needed.
 */
export async function getDashboardShellData(
  clerkUserId: string
): Promise<DashboardData> {
  return loadDashboardShellData(clerkUserId);
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
