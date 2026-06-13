import 'server-only';

import {
  AUTH_SIGNUP_ONBOARDING_CANARY_REDIS_KEY,
  type CanaryReport as AuthSignupOnboardingCanaryReport,
} from '@/lib/canaries/auth-signup-onboarding';
import {
  CANARY_REDIS_KEY,
  type CanaryCheckResult,
  type CanaryReport,
} from '@/lib/canaries/public-profile';
import { captureError } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';
import {
  NIGHTLY_AGENT_REDIS_KEY,
  type NightlyAgentStatus,
  parseNightlyAgentStatus,
} from '@/lib/testing/nightly-agent-report';
import { logger } from '@/lib/utils/logger';

function isCanaryCheckResult(value: unknown): value is CanaryCheckResult {
  if (!value || typeof value !== 'object') return false;

  const check = value as Partial<CanaryCheckResult>;
  return (
    typeof check.name === 'string' &&
    typeof check.ok === 'boolean' &&
    typeof check.durationMs === 'number' &&
    (check.statusCode === undefined || typeof check.statusCode === 'number') &&
    (check.detail === undefined || typeof check.detail === 'string')
  );
}

function isCanaryReport(value: unknown): value is CanaryReport {
  if (!value || typeof value !== 'object') return false;

  const report = value as Partial<CanaryReport>;
  return (
    typeof report.runAt === 'string' &&
    typeof report.pass === 'boolean' &&
    Array.isArray(report.checks) &&
    report.checks.every(isCanaryCheckResult) &&
    typeof report.totalDurationMs === 'number'
  );
}

function parseCanaryReport(raw: unknown): CanaryReport | null {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return isCanaryReport(parsed) ? parsed : null;
}

/**
 * Fetch the latest public-profile canary run result from Redis.
 * Returns null if Redis is unavailable or the key has expired (> 26h since last run).
 */
async function loadCanaryReportFromRedis(
  key: string,
  context: string
): Promise<CanaryReport | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get<unknown>(key);
    if (!raw) return null;

    const report = parseCanaryReport(raw);
    if (!report) {
      logger.warn(
        `[admin/ops] Ignoring malformed canary status for ${context}`
      );
    }

    return report;
  } catch (err) {
    logger.warn(`[admin/ops] Failed to load canary status for ${context}`, err);
    await captureError(`Admin ops: ${context} canary status load failed`, err, {
      context: 'ops-queries',
    });
    return null;
  }
}

export async function getPublicProfileCanaryStatus(): Promise<CanaryReport | null> {
  return loadCanaryReportFromRedis(CANARY_REDIS_KEY, 'public-profile');
}

export async function getAuthSignupOnboardingCanaryStatus(): Promise<AuthSignupOnboardingCanaryReport | null> {
  return loadCanaryReportFromRedis(
    AUTH_SIGNUP_ONBOARDING_CANARY_REDIS_KEY,
    'auth-signup-onboarding'
  );
}

/**
 * Fetch the latest nightly testing agent run from Redis.
 * Returns null when Redis is unavailable or the key has expired.
 */
export async function getNightlyTestingAgentStatus(): Promise<NightlyAgentStatus | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get<unknown>(NIGHTLY_AGENT_REDIS_KEY);
    if (!raw) return null;

    const status = parseNightlyAgentStatus(raw);
    if (!status) {
      logger.warn(
        '[admin/ops] Ignoring malformed nightly testing agent status from Redis'
      );
    }

    return status;
  } catch (err) {
    logger.warn(
      '[admin/ops] Failed to load nightly testing agent status from Redis',
      err
    );
    await captureError(
      'Admin ops: nightly testing agent status load failed',
      err,
      {
        context: 'ops-queries',
      }
    );
    return null;
  }
}
