import { type TrackingVisitor, trackingEligibility } from '../eligibility';
import { readTrackingProfile } from '../eligibility.server';
import { forwardToFacebook } from './facebook';
import { forwardToGoogle } from './google';
import { forwardToTikTok } from './tiktok';
import type {
  ForwardingResult,
  NormalizedEvent,
  PlatformConfig,
} from './types';

const forwarders = {
  facebook: forwardToFacebook,
  google: forwardToGoogle,
  tiktok: forwardToTikTok,
};

/** Only entry to vendor transports, including dashboard tests and cron retries. */
export async function dispatchToVendor(
  platform: keyof typeof forwarders,
  event: NormalizedEvent,
  config: PlatformConfig,
  artistId: string,
  visitor: TrackingVisitor
): Promise<ForwardingResult> {
  // Never trust an event's historic profile snapshot or a batch config cache.
  const profile = await readTrackingProfile(artistId);
  if (!trackingEligibility({ profile, visitor })[platform]) {
    return {
      platform,
      success: true,
      skipped: true,
      error: 'tracking_ineligible',
    };
  }
  return forwarders[platform](event, config);
}
