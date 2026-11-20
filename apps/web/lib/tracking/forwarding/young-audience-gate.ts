import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  type PixelForwardingStatus,
  pixelEvents,
} from '@/lib/db/schema/pixels';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { isYoungAudienceProfile } from '@/lib/profile/public-profile-access';
import { logger } from '@/lib/utils/logger';

/** TRK-6: true when the profile owner opted into young-audience pixel suppress. */
export async function profileHasYoungAudienceSuppress(
  profileId: string
): Promise<boolean> {
  const [row] = await db
    .select({ settings: creatorProfiles.settings })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);
  return isYoungAudienceProfile(row?.settings);
}

export async function markEventSkipped(
  eventId: string,
  reason: string
): Promise<void> {
  const skippedStatus: PixelForwardingStatus = {
    skipped: {
      status: 'skipped',
      sentAt: new Date().toISOString(),
      error: reason,
    },
  };
  await db
    .update(pixelEvents)
    .set({ forwardingStatus: skippedStatus })
    .where(eq(pixelEvents.id, eventId));
}

/**
 * Skip ad-platform forwarding when the profile is young-audience.
 * Returns true when the caller should return without forwarding.
 */
export async function skipForwardingForYoungAudience(
  eventId: string,
  profileId: string
): Promise<boolean> {
  if (!(await profileHasYoungAudienceSuppress(profileId))) return false;
  logger.info('[Pixel Forwarding] Skipping young-audience profile', {
    eventId,
    profileId,
  });
  await markEventSkipped(eventId, 'young_audience');
  return true;
}
