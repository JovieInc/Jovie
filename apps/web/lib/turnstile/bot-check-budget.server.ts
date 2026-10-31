import 'server-only';
import {
  onboardingBotCheckGlobalLimiter,
  onboardingBotCheckIpLimiter,
} from '@/lib/rate-limit/limiters';
import { trackServerEvent } from '@/lib/server-analytics';
import type { OnboardingBotCheckClientStatus } from './marker-token';

/**
 * Unverified-budget admission for the /start bot check (JOV-10194).
 *
 * A visitor whose invisible Turnstile widget cannot run (headless Chrome,
 * Instagram's iOS webview, script blockers, privacy browsers) sends the
 * fail-open marker token instead of a real one. This module decides whether
 * that unverified request may start a chat:
 *
 *   - per-IP budget: 4 unverified first messages per hour;
 *   - global budget: 120 unverified first messages per hour;
 *   - Redis only — both limiters `requireRedis`, so a limiter outage denies
 *     the marker and the caller falls back to the existing retryable check.
 *
 * Every decision emits one `onboarding_bot_check` server analytics event
 * (result, reason, client_status, ua_class). Sanctioned agents never use this
 * path: they mint canary passage tokens (scripts/synthetic-passage-mint.mjs)
 * and verify in Cloudflare's test mode.
 */

export type OnboardingBotCheckUaClass =
  | 'instagram_ios_webview'
  | 'headless_chrome'
  | 'desktop_chrome'
  | 'mobile_safari'
  | 'other';

export type OnboardingBotCheckReason =
  | 'within_budget'
  | 'ip_budget_exhausted'
  | 'global_budget_exhausted'
  | 'budget_unavailable';

export interface OnboardingBotCheckAdmission {
  readonly admitted: boolean;
  readonly reason: OnboardingBotCheckReason;
}

export interface OnboardingBotCheckInput {
  readonly ip: string;
  readonly clientStatus: OnboardingBotCheckClientStatus | null;
  readonly userAgent: string | null;
  readonly requestId?: string;
}

/** Coarse UA classes named by the JOV-10194 incident classes. */
export function classifyOnboardingUserAgent(
  userAgent: string | null | undefined
): OnboardingBotCheckUaClass {
  const ua = userAgent?.toLowerCase() ?? '';
  if (!ua) return 'other';
  if (ua.includes('instagram')) {
    // The incident class is Instagram's iOS webview specifically; other
    // Instagram surfaces stay `other` rather than a misleading label.
    return ua.includes('iphone') || ua.includes('ipad')
      ? 'instagram_ios_webview'
      : 'other';
  }
  if (ua.includes('headlesschrome')) return 'headless_chrome';
  if (
    ua.includes('chrome') &&
    !ua.includes('chromium') &&
    !ua.includes('android')
  ) {
    return 'desktop_chrome';
  }
  if (ua.includes('iphone') || ua.includes('ipad')) return 'mobile_safari';
  return 'other';
}

export async function admitOnboardingUnverifiedFirstTouch(
  input: OnboardingBotCheckInput
): Promise<OnboardingBotCheckAdmission> {
  const uaClass = classifyOnboardingUserAgent(input.userAgent);
  const clientStatus = input.clientStatus ?? 'unknown';
  const record = (result: 'admitted' | 'denied', reason: string) => {
    void trackServerEvent('onboarding_bot_check', {
      result,
      reason,
      client_status: clientStatus,
      ua_class: uaClass,
    }).catch(() => undefined);
  };

  const ipResult = await onboardingBotCheckIpLimiter.limit(`ip:${input.ip}`);
  if (!ipResult.success) {
    const reason: OnboardingBotCheckReason =
      ipResult.unavailable === true || ipResult.backend === 'unavailable'
        ? 'budget_unavailable'
        : 'ip_budget_exhausted';
    record('denied', reason);
    return { admitted: false, reason };
  }

  const globalResult = await onboardingBotCheckGlobalLimiter.limit('global');
  if (!globalResult.success) {
    const reason: OnboardingBotCheckReason =
      globalResult.unavailable === true ||
      globalResult.backend === 'unavailable'
        ? 'budget_unavailable'
        : 'global_budget_exhausted';
    record('denied', reason);
    return { admitted: false, reason };
  }

  record('admitted', 'within_budget');
  return { admitted: true, reason: 'within_budget' };
}
