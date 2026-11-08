/**
 * Session Replay policy: which routes buffer, which sample, and who is skipped.
 *
 * Cash is tight, so the funnel runs inside Sentry's free replay quota (50 a
 * month) using buffer mode: golden-path routes record into memory and send
 * nothing until a trigger flushes the buffer (see replay-start.ts), gated by a
 * server-side monthly cap. `/` is not recorded. Returning-user dashboard routes
 * keep the low shared session rate. Everything else loads no Replay code.
 *
 * @module lib/sentry/replay-policy
 */

import { REPLAY_SESSION_SAMPLE_RATE } from './config';
import { isDashboardRoute, normalizePathname } from './route-detector';

/** Route prefixes that buffer replays for the activation funnel. */
const GOLDEN_PATH_PREFIXES = [
  '/start',
  '/claim',
  '/signin',
  '/signup',
  '/auth',
  '/waitlist',
  '/onboarding', // includes /onboarding/checkout
  '/billing',
  '/pricing',
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
 * Replay session sample rate for a route. Golden-path routes are 0 because
 * they buffer instead of recording sessions (see isGoldenPathRoute).
 */
export function getReplaySessionSampleRate(pathname: string): number {
  const normalized = normalizePathname(pathname);
  if (isGoldenPathRoute(normalized)) return 0;
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
