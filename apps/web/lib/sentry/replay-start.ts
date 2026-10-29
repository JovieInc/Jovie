/**
 * Starts Session Replay for the activation funnel and reports the replay id
 * to the server so each signup can be linked to its recording.
 *
 * Loaded dynamically from instrumentation-client after Sentry initializes.
 *
 * @module lib/sentry/replay-start
 */

import { getClient } from '@sentry/nextjs';
import {
  getReplaySessionSampleRate,
  isAutomatedBrowser,
} from './replay-policy';

const LINK_ENDPOINT = '/api/onboarding/replay';
const MAX_LINK_POSTS = 3;
const FIRST_LINK_DELAY_MS = 3000;

let linkPosts = 0;
let linkScheduled = false;

type ReplayHandle = { getReplayId?: () => string | undefined };

/** The active replay id, or undefined when this session is not recording. */
export function getActiveReplayId(): string | undefined {
  const integration = getClient()?.getIntegrationByName?.('Replay') as
    | ReplayHandle
    | undefined;
  const id = integration?.getReplayId?.();
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

function postReplayId(useBeacon: boolean): void {
  if (linkPosts >= MAX_LINK_POSTS) return;
  const replayId = getActiveReplayId();
  if (!replayId) return;
  linkPosts += 1;
  const body = JSON.stringify({ replayId });
  try {
    if (useBeacon && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(
        LINK_ENDPOINT,
        new Blob([body], { type: 'application/json' })
      );
      return;
    }
    void fetch(LINK_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Linking is best effort and must never affect the page.
  }
}

/**
 * Report the replay id shortly after load, and again when the tab is hidden:
 * the anonymous onboarding cookie is minted mid-session at /start, so the
 * later post is the one that can carry it.
 */
export function scheduleReplayLink(): void {
  if (linkScheduled || typeof window === 'undefined') return;
  linkScheduled = true;
  setTimeout(() => postReplayId(false), FIRST_LINK_DELAY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') postReplayId(true);
  });
}

/**
 * Lite-SDK routes (/, /start, /claim, auth): add Replay for the funnel.
 * No-op for bots and for routes with a zero rate.
 */
export async function startFunnelReplay(pathname: string): Promise<void> {
  const rate = getReplaySessionSampleRate(pathname);
  if (rate <= 0 || isAutomatedBrowser(globalThis.navigator)) return;
  // Sample before loading so unsampled home visitors never download Replay.
  if (rate < 1 && Math.random() >= rate) return;
  const { addReplayIntegration } = await import('./client-full');
  await addReplayIntegration(1);
  scheduleReplayLink();
}
