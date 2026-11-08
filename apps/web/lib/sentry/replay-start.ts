/**
 * Buffered Session Replay for the activation funnel.
 *
 * Funnel routes record into Sentry's in-memory buffer and send nothing. A
 * trigger calls `replay.flush()` for the sessions worth watching, and only
 * while the server says the monthly replay budget has room (the free plan
 * includes 50 a month). The server also records which trigger fired and links
 * the replay to the signup.
 *
 * Triggers:
 * - claim_idle / claim_left: on /claim, /pricing, /billing the visitor sat
 *   idle for IDLE_MS or left without claiming.
 * - onboarding_stalled / onboarding_abandoned: same, on /start, /onboarding
 *   and the auth pages.
 * - client_error: an uncaught error or unhandled rejection.
 * - signup / profile_claimed: the server saw a new account or a claimed
 *   profile for this replay, so successful paths get watched too.
 *
 * @module lib/sentry/replay-start
 */

import { getClient } from '@sentry/nextjs';
import {
  getReplaySessionSampleRate,
  isAutomatedBrowser,
  isGoldenPathRoute,
} from './replay-policy';

const LINK_ENDPOINT = '/api/onboarding/replay';
const MAX_LINK_POSTS = 3;
const FIRST_LINK_DELAY_MS = 3000;
/** Idle time before a claim or onboarding session counts as stalled. */
export const REPLAY_IDLE_MS = 5 * 60 * 1000;

export type ReplayFlushTrigger =
  | 'claim_idle'
  | 'claim_left'
  | 'onboarding_stalled'
  | 'onboarding_abandoned'
  | 'client_error'
  | 'signup'
  | 'profile_claimed';

type ReplayHandle = {
  getReplayId?: () => string | undefined;
  flush?: () => Promise<void>;
};

let linkPosts = 0;
let linkScheduled = false;
let canFlush = false;
let flushed = false;

function getReplayHandle(): ReplayHandle | undefined {
  return getClient()?.getIntegrationByName?.('Replay') as
    | ReplayHandle
    | undefined;
}

/** The active replay id, or undefined when there is no replay session. */
export function getActiveReplayId(): string | undefined {
  const id = getReplayHandle()?.getReplayId?.();
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function send(
  payload: { replayId: string; trigger?: ReplayFlushTrigger },
  useBeacon: boolean
): Promise<Response | undefined> {
  const body = JSON.stringify(payload);
  try {
    if (useBeacon && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(
        LINK_ENDPOINT,
        new Blob([body], { type: 'application/json' })
      );
      return Promise.resolve(undefined);
    }
    return fetch(LINK_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Linking is best effort and must never affect the page.
    return Promise.resolve(undefined);
  }
}

/**
 * Flush the buffer for a trigger. At most once per page load, and only while
 * the server last reported budget. The server records the trigger.
 */
export function flushReplay(trigger: ReplayFlushTrigger): void {
  if (flushed || !canFlush) return;
  const handle = getReplayHandle();
  const replayId = getActiveReplayId();
  if (!handle?.flush || !replayId) return;
  flushed = true;
  void handle.flush().catch(() => undefined);
  void send({ replayId, trigger }, true);
}

async function postLink(): Promise<void> {
  if (linkPosts >= MAX_LINK_POSTS) return;
  const replayId = getActiveReplayId();
  if (!replayId) return;
  linkPosts += 1;
  const res = await send({ replayId }, false);
  if (!res?.ok) return;
  try {
    const data = (await res.json()) as {
      canFlush?: boolean;
      flush?: ReplayFlushTrigger | null;
    };
    canFlush = data.canFlush === true;
    if (data.flush) flushReplay(data.flush);
  } catch {
    // Keep the previous budget answer.
  }
}

type RouteKind = 'claim' | 'onboarding';

function routeKind(pathname: string): RouteKind {
  const p = pathname.toLowerCase();
  const claimish =
    p.startsWith('/claim') ||
    p.startsWith('/pricing') ||
    p.startsWith('/billing') ||
    p.startsWith('/onboarding/checkout');
  return claimish ? 'claim' : 'onboarding';
}

function armTriggers(pathname: string): void {
  const kind = routeKind(pathname);
  const idle: ReplayFlushTrigger =
    kind === 'claim' ? 'claim_idle' : 'onboarding_stalled';
  const left: ReplayFlushTrigger =
    kind === 'claim' ? 'claim_left' : 'onboarding_abandoned';

  let timer: ReturnType<typeof setTimeout> | undefined;
  const resetIdle = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => flushReplay(idle), REPLAY_IDLE_MS);
  };
  resetIdle();
  for (const event of ['pointerdown', 'keydown', 'scroll'] as const) {
    document.addEventListener(event, resetIdle, { passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushReplay(left);
      void postLink();
    }
  });
  globalThis.addEventListener('error', () => flushReplay('client_error'));
  globalThis.addEventListener('unhandledrejection', () =>
    flushReplay('client_error')
  );
}

/**
 * Report the replay id shortly after load (the answer tells us whether the
 * budget has room and whether the server saw a signup), and arm the triggers.
 */
export function scheduleReplayLink(pathname: string): void {
  if (linkScheduled || typeof window === 'undefined') return;
  if (!isGoldenPathRoute(pathname)) return;
  linkScheduled = true;
  setTimeout(() => void postLink(), FIRST_LINK_DELAY_MS);
  armTriggers(pathname);
}

/**
 * Lite-SDK routes (/start, /claim, auth, /pricing): add Replay in buffer
 * mode. `/`, profiles and other public pages load nothing.
 */
export async function startFunnelReplay(pathname: string): Promise<void> {
  if (
    !isGoldenPathRoute(pathname) ||
    isAutomatedBrowser(globalThis.navigator)
  ) {
    return;
  }
  const { addReplayIntegration } = await import('./client-full');
  await addReplayIntegration(getReplaySessionSampleRate(pathname), true);
  scheduleReplayLink(pathname);
}
