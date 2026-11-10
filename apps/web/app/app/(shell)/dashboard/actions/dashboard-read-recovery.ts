import * as Sentry from '@sentry/nextjs';
import { isRetryableError } from '@/lib/db/client/retry';
import { getDeepErrorMessage, unwrapPgError } from '@/lib/db/errors';
import {
  isPostgresTimeoutError,
  isQueryTimeoutError,
} from '@/lib/db/query-timeout';
import { isMissingCreatorDistributionEventsTableError } from '@/lib/distribution/instagram-activation';
import { handleMigrationErrors } from '@/lib/migrations/handleMigrationErrors';
import { isMissingTourDatesConfirmationStatusError } from '@/lib/tour-dates/queries';
import { isCommitTransportFailure } from './avatar-quality-degrade';

const { logger } = Sentry;

/**
 * Recovery admission shared by the dashboard's side-effect-free supplementary
 * reads (JOV-8837 family): idle-terminated setups, commit-wrapped transport
 * failures (the `Failed query: commit` wrapper proves the callback succeeded
 * and only the commit died — JOV-12096/JOV-12188), or a transient transport
 * failure that is not a PostgreSQL timeout (a statement timeout replaying
 * immediately would only double the wait). Callers bound admission with their
 * own retry deadline; each pure read gets one fresh attempt.
 */
export function isDashboardReadRecoveryAdmitted(error: unknown): boolean {
  return (
    isIdleTransactionTermination(error) ||
    ((isCommitTransportFailure(error) || isRetryableError(error)) &&
      !isPostgresTimeoutError(error))
  );
}

function isIdleTransactionTermination(error: unknown): boolean {
  const { code } = unwrapPgError(error);
  return code
    ? code === '25P03'
    : /terminating connection due to idle-in-transaction timeout/i.test(
        getDeepErrorMessage(error)
      );
}

export type SocialLinksExistence = {
  hasLinks: boolean;
  hasMusicLinks: boolean;
};

/**
 * Tolerate-and-degrade catch for the social-links existence read. A
 * commit-wrapped transport failure is connection-class on a side-effect-free
 * read (JOV-12188): the recovery either replayed it once or declined on the
 * caller's deadline, and the read already degrades to link-free defaults —
 * log-only, matching the JOV-8900 doctrine. Unexpected failures still report
 * so real data bugs stay visible.
 */
export function degradeSocialLinksRead(
  error: unknown,
  meta: { context: string; operation: string; userId: string }
): SocialLinksExistence {
  if (isCommitTransportFailure(error)) {
    logger.warn(
      '[social-links] transient commit failure after retry; degrading to link-free defaults',
      {
        context: meta.context,
        operation: meta.operation,
        userId: meta.userId,
        error: getDeepErrorMessage(error),
      }
    );
    return { hasLinks: false, hasMusicLinks: false };
  }

  const migrationResult = handleMigrationErrors(error, {
    userId: meta.userId,
    operation: meta.operation,
  });

  if (!migrationResult.shouldRetry) {
    return { hasLinks: false, hasMusicLinks: false };
  }

  Sentry.captureException(error, {
    level: 'warning',
    tags: {
      query: meta.operation,
      context: meta.context,
    },
  });
  return { hasLinks: false, hasMusicLinks: false };
}

/**
 * Tolerate-and-degrade catch for the creator_distribution_events read. A
 * commit-wrapped transport failure is connection-class on a side-effect-free
 * read (JOV-12188) — log-only, matching the JOV-8900 doctrine. Migration
 * drift keeps its existing fallbacks; unexpected failures still report.
 */
export function degradeDistributionEventsRead(
  error: unknown,
  profileId: string
): Array<{ createdAt: Date; eventType: string }> {
  if (isCommitTransportFailure(error)) {
    logger.warn(
      '[Dashboard] creator_distribution_events transient commit failure after retry; skipping activation lookup',
      { profileId }
    );
    return [];
  }

  if (isMissingCreatorDistributionEventsTableError(error)) {
    logger.warn(
      '[Dashboard] creator_distribution_events table missing; skipping activation lookup',
      { profileId }
    );
    return [];
  }

  const migrationResult = handleMigrationErrors(error, {
    userId: profileId,
    operation: 'creator_distribution_events',
  });

  if (!migrationResult.shouldRetry) {
    return (migrationResult.fallbackData ?? []) as Array<{
      createdAt: Date;
      eventType: string;
    }>;
  }

  const level =
    isQueryTimeoutError(error) || isPostgresTimeoutError(error)
      ? 'warning'
      : 'error';

  Sentry.captureException(error, {
    level,
    tags: {
      query: 'creator_distribution_events',
      context: 'dashboard_data_settled',
    },
    extra: { profileId },
  });
  return [];
}

/**
 * Tolerate-and-degrade catch for the settled Inbox tour-date count. Migration
 * drift (JOV-4857) degrades to 0 pending; everything else rethrows to the
 * outer catch. Unchanged behavior, moved beside the other read recovery.
 */
export function tolerateMissingTourDatesConfirmationStatus(
  error: unknown,
  profileId: string
): Array<{ count: number }> {
  if (!isMissingTourDatesConfirmationStatusError(error)) {
    throw error;
  }
  logger.warn(
    '[Dashboard] tour_dates.confirmation_status missing (migration drift); treating pending tour-date count as 0',
    { profileId }
  );
  return [{ count: 0 }];
}
