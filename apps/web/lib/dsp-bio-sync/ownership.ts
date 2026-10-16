import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';

export interface OwnedProfileResult {
  status: 'ok' | 'not_found' | 'forbidden';
  profile?: {
    id: string;
    userId: string | null;
    bio: string | null;
  };
}

export async function getOwnedProfile(
  profileId: string,
  userId: string
): Promise<OwnedProfileResult> {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      userId: creatorProfiles.userId,
      bio: creatorProfiles.bio,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  if (!profile) {
    return { status: 'not_found' };
  }

  if (profile.userId !== userId) {
    return { status: 'forbidden' };
  }

  return { status: 'ok', profile };
}
