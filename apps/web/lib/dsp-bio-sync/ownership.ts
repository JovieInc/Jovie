import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';

export interface OwnedProfileResult {
  status: 'ok' | 'not_found' | 'forbidden';
  profile?: {
    id: string;
    clerkId: string;
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
      clerkId: users.clerkId,
      bio: creatorProfiles.bio,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  if (!profile) {
    return { status: 'not_found' };
  }

  if (profile.clerkId !== userId) {
    return { status: 'forbidden' };
  }

  return { status: 'ok', profile };
}
