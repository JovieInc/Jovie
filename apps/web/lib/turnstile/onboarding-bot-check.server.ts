import 'server-only';
import {
  detectDevice,
  detectInAppBrowser,
} from '@/lib/profile/one-right-thing/visitor-signals';
import {
  anonymousOnboardingChatUnverifiedGlobalLimiter,
  anonymousOnboardingChatUnverifiedIpLimiter,
} from '@/lib/rate-limit/limiters';
import { trackServerEvent } from '@/lib/server-analytics';

/**
 * Fail-open /start bot check, server side.
 *
 * Turnstile sorts fresh chats into verified (normal budgets) and unverified
 * (tight budgets). It never decides alone whether a person may talk to
 * Jovie: a visitor whose widget cannot produce a token is admitted on the
 * unverified budget below, and the real abuse defense is the stack of rate
 * limits and per-session caps that every anonymous turn already passes.
 * Only when the unverified budget is spent (or its store is down) does the
 * visitor get the retryable security check.
 */

export type OnboardingBotCheckOutcome =
  | 'verified'
  | 'synthetic'
  | 'degraded'
  | 'denied';

export interface UnverifiedAdmission {
  readonly admitted: boolean;
  /** `admitted`, `ip_budget`, `global_budget` or `limiter_unavailable`. */
  readonly reason: string;
}

/**
 * Charge one unverified fresh chat against the per-IP budget, then the
 * global AI cost ceiling. A per-IP denial never spends the global budget.
 */
export async function admitUnverifiedOnboardingStart(
  ip: string
): Promise<UnverifiedAdmission> {
  const perIp = await anonymousOnboardingChatUnverifiedIpLimiter.limit(ip);
  if (!perIp.success) {
    return {
      admitted: false,
      reason: perIp.unavailable ? 'limiter_unavailable' : 'ip_budget',
    };
  }
  const global =
    await anonymousOnboardingChatUnverifiedGlobalLimiter.limit('all');
  if (!global.success) {
    return {
      admitted: false,
      reason: global.unavailable ? 'limiter_unavailable' : 'global_budget',
    };
  }
  return { admitted: true, reason: 'admitted' };
}

/**
 * Coarse client class for bot-check outcomes: in-app webview by host app,
 * headless automation, crawlers, otherwise device plus engine. Never the raw
 * user agent.
 */
export function classifyBotCheckClient(
  userAgent: string | null | undefined
): string {
  const ua = userAgent ?? '';
  if (!ua) return 'unknown';
  if (/HeadlessChrome|\bPlaywright\b|\bPuppeteer\b/u.test(ua)) {
    return 'headless';
  }
  if (/\b(bot|crawler|spider)\b|\bcurl\/|python-requests/iu.test(ua)) {
    return 'bot';
  }
  const inApp = detectInAppBrowser(ua);
  if (inApp) return `iab_${inApp}`;
  const device = detectDevice(ua);
  let engine = 'other';
  if (/Firefox\/|FxiOS\//u.test(ua)) engine = 'firefox';
  else if (/Chrome\/|CriOS\/|Edg\//u.test(ua)) engine = 'chromium';
  else if (/Safari\//u.test(ua)) engine = 'safari';
  return `${device}_${engine}`;
}

export interface OnboardingBotCheckRecord {
  readonly outcome: OnboardingBotCheckOutcome;
  readonly reason?: string;
  readonly clientStatus?: string | null;
  readonly userAgent?: string | null;
}

/** Fire-and-forget: telemetry never delays or breaks the first message. */
export function recordOnboardingBotCheck(
  record: OnboardingBotCheckRecord
): void {
  void trackServerEvent('onboarding_bot_check', {
    result: record.outcome,
    reason: record.reason ?? record.outcome,
    client_status: record.clientStatus ?? 'token',
    ua_class: classifyBotCheckClient(record.userAgent),
  }).catch(() => {
    // trackServerEvent reports its own delivery failures.
  });
}
