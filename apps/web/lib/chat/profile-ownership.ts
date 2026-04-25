import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';

export interface OwnedChatProfile {
  readonly id: string;
  readonly internalUserId: string;
  readonly displayName: string | null;
  readonly bio: string | null;
  readonly username: string | null;
}

export async function getOwnedChatProfile(params: {
  readonly profileId: string;
  readonly clerkUserId: string;
}): Promise<OwnedChatProfile | null> {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      internalUserId: creatorProfiles.userId,
      displayName: creatorProfiles.displayName,
      bio: creatorProfiles.bio,
      username: creatorProfiles.username,
      clerkId: users.clerkId,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.id, params.profileId))
    .limit(1);

  if (
    !profile ||
    profile.clerkId !== params.clerkUserId ||
    !profile.internalUserId
  ) {
    return null;
  }

  return {
    id: profile.id,
    internalUserId: profile.internalUserId,
    displayName: profile.displayName,
    bio: profile.bio,
    username: profile.username,
  };
}
