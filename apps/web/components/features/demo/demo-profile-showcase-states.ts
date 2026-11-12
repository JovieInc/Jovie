// @coverage-via apps/web/components/features/demo/demo-profile-showcase-states.test.ts
import type { ProfileShowcaseStateId } from '@/features/profile/contracts';

export const DEMO_TIM_WHITE_SHOWCASE_STATE_IDS = [
  'mock-home',
  'streams-latest',
  'streams-presave',
  'streams-release-day',
  'streams-video',
  'tour-nearby',
  'playlist-fallback',
  'listen-fallback',
  'alerts-fallback',
  'events-empty',
  'more-menu',
  'share',
  'fans-opt-in',
  'fans-confirmed',
  'fans-song-alert',
  'fans-show-alert',
  'subscribe-email',
  'subscribe-otp',
  'subscribe-otp-error',
  'subscribe-name',
  'subscribe-birthday',
  'subscribe-done',
  'tips-open',
  'tips-apple-pay',
  'tips-thank-you',
  'tips-followup',
  'tour',
  'contact',
  'catalog',
] as const satisfies readonly ProfileShowcaseStateId[];

export function isProfileShowcaseStateId(
  value: string | null
): value is ProfileShowcaseStateId {
  return DEMO_TIM_WHITE_SHOWCASE_STATE_IDS.includes(
    value as ProfileShowcaseStateId
  );
}
