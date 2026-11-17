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
 * Drizzle wraps a post-callback transaction COMMIT transport failure as
 * `Failed query: commit` (JOV-8837). That wrapper shape alone proves the
 * SQL work already succeeded and only the commit died on the wire — the
 * underlying cause text (undici `fetch failed`, a bare WebSocket close, a
 * generic Neon proxy error) can match none of the retryable transport
 * patterns. The wrapper is therefore classified directly instead of by
 * cause text; PostgreSQL timeout errors remain non-replayable at the
 * recovery sites.
 */
export function isCommitTransportFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (/^Failed query: commit\b/i.test(error.message)) return true;
  return error.cause instanceof Error && isCommitTransportFailure(error.cause);
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
    isCommitTransportFailure(error) ||
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
