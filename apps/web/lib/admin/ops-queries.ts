import 'server-only';

import {
  CANARY_REDIS_KEY,
  type CanaryCheckResult,
  type CanaryReport,
} from '@/lib/canaries/public-profile';
import { captureError } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';
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
export async function getPublicProfileCanaryStatus(): Promise<CanaryReport | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get<unknown>(CANARY_REDIS_KEY);
    if (!raw) return null;

    const report = parseCanaryReport(raw);
    if (!report) {
      logger.warn('[admin/ops] Ignoring malformed canary status from Redis');
    }

    return report;
  } catch (err) {
    logger.warn('[admin/ops] Failed to load canary status from Redis', err);
    await captureError('Admin ops: canary status load failed', err, {
      context: 'ops-queries',
    });
    return null;
  }
}
