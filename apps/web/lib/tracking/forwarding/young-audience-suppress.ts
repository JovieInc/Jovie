import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { isYoungAudienceProfile } from '@/lib/profile/public-profile-access';

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
