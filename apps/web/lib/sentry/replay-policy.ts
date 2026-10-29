/**
 * Session Replay policy: which routes record, at what rate, and who is skipped.
 *
 * Golden-path routes (the activation funnel) record every non-bot session so
 * each new user can be watched. `/` is the widest and noisiest entry, so it
 * keeps a sampled rate until the Sentry replay quota covers its traffic (see
 * REPLAY_HOME_SAMPLE_RATE). Returning-user dashboard routes keep the low
 * shared rate. Everything else (profiles and other public pages) loads no
 * Replay code at all.
 *
 * @module lib/sentry/replay-policy
 */

import { isProduction, REPLAY_SESSION_SAMPLE_RATE } from './config';
import { isDashboardRoute, normalizePathname } from './route-detector';

/** Record every session on the activation funnel. */
export const REPLAY_GOLDEN_PATH_SAMPLE_RATE = 1.0;

/**
 * `/` sees ~4k landing views per 30 days against a 50 replays/month Sentry
 * quota (2026-10-28). At 100% it would exhaust the quota in about a day and
 * starve /start and /claim, which are the sessions that explain activation.
 * Raise to 1.0 together with the replay quota.
 */
export const REPLAY_HOME_SAMPLE_RATE = isProduction ? 0.1 : 1.0;

/** Route prefixes that are the activation funnel, excluding `/`. */
const GOLDEN_PATH_PREFIXES = [
  '/start',
  '/claim',
  '/signin',
  '/signup',
  '/auth',
  '/waitlist',
  '/onboarding', // includes /onboarding/checkout
  '/billing',
] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** True for the activation funnel (anonymous and new-user routes). */
export function isGoldenPathRoute(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return GOLDEN_PATH_PREFIXES.some(prefix => matchesPrefix(normalized, prefix));
}

/**
 * Replay session sample rate for a route. 0 means Replay is not loaded.
 */
export function getReplaySessionSampleRate(pathname: string): number {
  const normalized = normalizePathname(pathname);
  if (isGoldenPathRoute(normalized)) return REPLAY_GOLDEN_PATH_SAMPLE_RATE;
  if (normalized === '/') return REPLAY_HOME_SAMPLE_RATE;
  if (isDashboardRoute(normalized)) return REPLAY_SESSION_SAMPLE_RATE;
  return 0;
}

const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor/i;

/** Automated browsers burn replay quota and teach us nothing about users. */
export function isAutomatedBrowser(
  nav: Pick<Navigator, 'userAgent' | 'webdriver'> | undefined
): boolean {
  if (!nav) return true;
  return nav.webdriver === true || BOT_UA.test(nav.userAgent ?? '');
}
