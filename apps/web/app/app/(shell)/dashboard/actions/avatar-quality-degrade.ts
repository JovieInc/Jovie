import * as Sentry from '@sentry/nextjs';
import { isRetryableError } from '@/lib/db/client/retry';
import { getDeepErrorMessage, unwrapPgError } from '@/lib/db/errors';
import {
  isPostgresTimeoutError,
  isQueryTimeoutError,
} from '@/lib/db/query-timeout';
import {
  type AvatarQuality,
  UNKNOWN_AVATAR_QUALITY,
} from '@/lib/profile/avatar-quality';

const { logger } = Sentry;

export function isIdleTransactionTermination(error: unknown): boolean {
  const { code } = unwrapPgError(error);
  return code
    ? code === '25P03'
    : /terminating connection due to idle-in-transaction timeout/i.test(
        getDeepErrorMessage(error)
      );
}

/**
 * Fail-soft avatar reads degrade log-only for infrastructure conditions
 * (JOV-5754). Timeouts and idle terminations keep the JOV-8864 message:
 * Drizzle names set_config, and reporting that fingerprint pages Sentry
 * for a degradation that already returned UNKNOWN. Connection-class
 * failures (JOV-8900 / JOVIE-WEB-YK) are the same doctrine. Unexpected
 * failures still report so real data bugs stay visible.
 */
export function degradeAvatarQualityRead(
  error: unknown,
  profileId: string
): AvatarQuality {
  const timedOut = isQueryTimeoutError(error) || isPostgresTimeoutError(error);
  if (
    timedOut ||
    isIdleTransactionTermination(error) ||
    isRetryableError(error)
  ) {
    logger.warn(
      timedOut
        ? '[avatar-quality] avatar read timed out; degrading to unknown quality'
        : '[avatar-quality] transient DB condition after retry; degrading to unknown quality',
      {
        profileId,
        error: getDeepErrorMessage(error),
      }
    );
    return UNKNOWN_AVATAR_QUALITY;
  }

  Sentry.captureException(error, {
    level: 'warning',
    tags: {
      query: 'avatar_quality',
      context: 'dashboard_data_settled',
    },
  });
  return UNKNOWN_AVATAR_QUALITY;
}
