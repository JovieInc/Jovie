/**
 * Provider sending quota, read from the headers Resend returns on every send.
 *
 * Resend reports used quota in `x-resend-daily-quota` (Free plan only) and
 * `x-resend-monthly-quota`. The limits live in stream-registry.json
 * (providers.resend.quota) so the gateway, Summer and the capacity loop share
 * one number. Tonight's failure mode (2026-10-31): test sign-ins used the
 * whole 100/day Free quota and real sign-in codes stopped. This makes that
 * visible on every send instead of after the fact.
 */
import { EMAIL_STREAM_REGISTRY, type EmailProviderName } from '../streams';

export interface QuotaLimits {
  readonly plan: string;
  readonly daily: number | null;
  readonly monthly: number | null;
  /** Fraction of a limit at which the gateway warns. */
  readonly warnAt: number;
}

export type QuotaPressure = 'ok' | 'warn' | 'exhausted';

export interface QuotaReading {
  readonly dailyUsed: number | null;
  readonly monthlyUsed: number | null;
  readonly dailyLimit: number | null;
  readonly monthlyLimit: number | null;
  /** Highest used/limit fraction across known windows, or null if unknown. */
  readonly usedFrac: number | null;
  readonly pressure: QuotaPressure;
}

/** Resend error names that mean the quota, not the message, failed. */
export const QUOTA_ERROR_NAMES = new Set([
  'daily_quota_exceeded',
  'monthly_quota_exceeded',
]);

export function quotaLimitsFor(
  provider: EmailProviderName
): QuotaLimits | null {
  return EMAIL_STREAM_REGISTRY.providers[provider]?.quota ?? null;
}

function headerNumber(
  headers: Record<string, string> | null | undefined,
  name: string
): number | null {
  if (!headers) return null;
  const key = Object.keys(headers).find(k => k.toLowerCase() === name);
  if (key === undefined) return null;
  const value = Number.parseInt(String(headers[key]).trim(), 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function frac(used: number | null, limit: number | null): number | null {
  if (used === null || limit === null || limit <= 0) return null;
  return used / limit;
}

/**
 * Turn response headers into a quota reading. Returns null when the response
 * carries no quota header, so callers never log a guess.
 */
export function readQuota(
  headers: Record<string, string> | null | undefined,
  limits: QuotaLimits | null
): QuotaReading | null {
  const dailyUsed = headerNumber(headers, 'x-resend-daily-quota');
  const monthlyUsed = headerNumber(headers, 'x-resend-monthly-quota');
  if (dailyUsed === null && monthlyUsed === null) return null;
  const dailyLimit = limits?.daily ?? null;
  const monthlyLimit = limits?.monthly ?? null;
  const fracs = [
    frac(dailyUsed, dailyLimit),
    frac(monthlyUsed, monthlyLimit),
  ].filter((f): f is number => f !== null);
  const usedFrac = fracs.length > 0 ? Math.max(...fracs) : null;
  return {
    dailyUsed,
    monthlyUsed,
    dailyLimit,
    monthlyLimit,
    usedFrac,
    pressure: pressureOf(usedFrac, limits?.warnAt ?? 0.8),
  };
}

export function pressureOf(
  usedFrac: number | null,
  warnAt: number
): QuotaPressure {
  if (usedFrac === null) return 'ok';
  if (usedFrac >= 1) return 'exhausted';
  if (usedFrac >= warnAt) return 'warn';
  return 'ok';
}

/** The reading to report when the provider refused a send for quota. */
export function exhaustedQuota(limits: QuotaLimits | null): QuotaReading {
  return {
    dailyUsed: limits?.daily ?? null,
    monthlyUsed: null,
    dailyLimit: limits?.daily ?? null,
    monthlyLimit: limits?.monthly ?? null,
    usedFrac: 1,
    pressure: 'exhausted',
  };
}
