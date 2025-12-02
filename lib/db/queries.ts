import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from './index';
import { creatorContacts, creatorProfiles, socialLinks, users } from './schema';

export async function getUserByClerkId(clerkId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  return user || null;
}

export async function getCreatorProfileByUsername(username: string) {
  const [profile] = await db
    .select()
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, username.toLowerCase()))
    .limit(1);
  return profile || null;
}

export async function getCreatorProfileWithLinks(username: string) {
  // First get the profile with only the columns needed for public rendering
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      userId: creatorProfiles.userId,
      creatorType: creatorProfiles.creatorType,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      bio: creatorProfiles.bio,
      avatarUrl: creatorProfiles.avatarUrl,
      spotifyUrl: creatorProfiles.spotifyUrl,
      appleMusicUrl: creatorProfiles.appleMusicUrl,
      youtubeUrl: creatorProfiles.youtubeUrl,
      spotifyId: creatorProfiles.spotifyId,
      isPublic: creatorProfiles.isPublic,
      isVerified: creatorProfiles.isVerified,
      isClaimed: creatorProfiles.isClaimed,
      claimToken: creatorProfiles.claimToken,
      claimedAt: creatorProfiles.claimedAt,
      lastLoginAt: creatorProfiles.lastLoginAt,
      isFeatured: creatorProfiles.isFeatured,
      marketingOptOut: creatorProfiles.marketingOptOut,
      settings: creatorProfiles.settings,
      theme: creatorProfiles.theme,
      profileViews: creatorProfiles.profileViews,
      usernameNormalized: creatorProfiles.usernameNormalized,
      onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
      createdAt: creatorProfiles.createdAt,
      updatedAt: creatorProfiles.updatedAt,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.usernameNormalized, username.toLowerCase()))
    .limit(1);

  if (!profile) return null;

  // Then get all social links for this profile
  const profileSocialLinks = await db
    .select({
      id: socialLinks.id,
      creatorProfileId: socialLinks.creatorProfileId,
      platform: socialLinks.platform,
      platformType: socialLinks.platformType,
      url: socialLinks.url,
      displayText: socialLinks.displayText,
      clicks: socialLinks.clicks,
      isActive: socialLinks.isActive,
      createdAt: socialLinks.createdAt,
      updatedAt: socialLinks.updatedAt,
      sortOrder: socialLinks.sortOrder,
    })
    .from(socialLinks)
    .where(eq(socialLinks.creatorProfileId, profile.id))
    .orderBy(socialLinks.sortOrder);

  const profileContacts = await db
    .select({
      id: creatorContacts.id,
      creatorProfileId: creatorContacts.creatorProfileId,
      role: creatorContacts.role,
      customLabel: creatorContacts.customLabel,
      personName: creatorContacts.personName,
      companyName: creatorContacts.companyName,
      territories: creatorContacts.territories,
      email: creatorContacts.email,
      phone: creatorContacts.phone,
      preferredChannel: creatorContacts.preferredChannel,
      isActive: creatorContacts.isActive,
      sortOrder: creatorContacts.sortOrder,
      createdAt: creatorContacts.createdAt,
      updatedAt: creatorContacts.updatedAt,
    })
    .from(creatorContacts)
    .where(
      and(
        eq(creatorContacts.creatorProfileId, profile.id),
        eq(creatorContacts.isActive, true)
      )
    )
    .orderBy(creatorContacts.sortOrder, creatorContacts.createdAt);

  return {
    ...profile,
    socialLinks: profileSocialLinks,
    contacts: profileContacts,
  };
}

export async function updateCreatorProfile(
  clerkUserId: string,
  updates: Partial<typeof creatorProfiles.$inferInsert>
) {
  // First get the user ID from clerk_id
  const user = await getUserByClerkId(clerkUserId);
  if (!user) {
    throw new Error('User not found');
  }

  const [updated] = await db
    .update(creatorProfiles)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.userId, user.id))
    .returning();

  return updated || null;
}

export async function createSocialLink(
  creatorProfileId: string,
  linkData: typeof socialLinks.$inferInsert
) {
  const [newLink] = await db
    .insert(socialLinks)
    .values({
      ...linkData,
      creatorProfileId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return newLink;
}

export async function deleteSocialLink(linkId: string) {
  const [deleted] = await db
    .delete(socialLinks)
    .where(eq(socialLinks.id, linkId))
    .returning();
  return deleted || null;
}

/**
 * Increment profile view count atomically
 * Used for analytics tracking on public profile pages
 */
export async function incrementProfileViews(username: string) {
  try {
    await db
      .update(creatorProfiles)
      .set({
        profileViews: drizzleSql`${creatorProfiles.profileViews} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.usernameNormalized, username.toLowerCase()));
  } catch (error) {
    // Fail silently to avoid blocking page load
    console.error('Failed to increment profile views:', error);
  }
}
