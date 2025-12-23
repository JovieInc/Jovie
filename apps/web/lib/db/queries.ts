import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from './index';
import {
  CreatorContact,
  creatorContacts,
  creatorProfiles,
  socialLinks,
  users,
} from './schema';

// Bounded data retrieval limits to prevent OOM on profiles with many links
const MAX_SOCIAL_LINKS = 100;
const MAX_CONTACTS = 50;

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
      userIsPro: users.isPro,
      userClerkId: users.clerkId,
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
      isFeatured: creatorProfiles.isFeatured,
      marketingOptOut: creatorProfiles.marketingOptOut,
      settings: creatorProfiles.settings,
      theme: creatorProfiles.theme,
      profileViews: creatorProfiles.profileViews,
      usernameNormalized: creatorProfiles.usernameNormalized,
      createdAt: creatorProfiles.createdAt,
      updatedAt: creatorProfiles.updatedAt,
    })
    .from(creatorProfiles)
    .leftJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.usernameNormalized, username.toLowerCase()))
    .limit(1);

  if (!profile) return null;

  // Fetch socials and contacts in parallel to reduce tail latency
  // Both queries are bounded to prevent OOM on profiles with many links
  const socialsPromise = db
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
    .orderBy(socialLinks.sortOrder)
    .limit(MAX_SOCIAL_LINKS);

  const contactsPromise: Promise<CreatorContact[]> = (async () => {
    try {
      return await db
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
        .orderBy(creatorContacts.sortOrder, creatorContacts.createdAt)
        .limit(MAX_CONTACTS);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const causeMessage =
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : '';
      if (
        errorMessage.includes('does not exist') ||
        causeMessage.includes('does not exist')
      ) {
        console.warn(
          'creator_contacts table does not exist, returning empty contacts'
        );
        return [];
      }
      throw error;
    }
  })();

  const [profileSocialLinks, profileContacts] = await Promise.all([
    socialsPromise,
    contactsPromise,
  ]);

  // Log if query limits are hit (possible data truncation)
  if (profileSocialLinks.length === MAX_SOCIAL_LINKS) {
    console.warn(
      '[db-queries] MAX_SOCIAL_LINKS limit hit - possible data truncation',
      { profileId: profile.id, count: profileSocialLinks.length }
    );
  }

  if (profileContacts.length === MAX_CONTACTS) {
    console.warn(
      '[db-queries] MAX_CONTACTS limit hit - possible data truncation',
      { profileId: profile.id, count: profileContacts.length }
    );
  }

  return {
    ...profile,
    socialLinks: profileSocialLinks,
    contacts: profileContacts,
  };
}

export async function isClaimTokenValidForProfile(params: {
  username: string;
  claimToken: string;
}): Promise<boolean> {
  const normalizedUsername = params.username.toLowerCase();
  const token = params.claimToken;

  const [row] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(
      and(
        eq(creatorProfiles.usernameNormalized, normalizedUsername),
        eq(creatorProfiles.claimToken, token),
        eq(creatorProfiles.isPublic, true),
        eq(creatorProfiles.isClaimed, false)
      )
    )
    .limit(1);

  return Boolean(row);
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
 * Increment profile view count atomically with retry logic
 * Used for analytics tracking on public profile pages
 *
 * @param username - The username to increment views for
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 */
export async function incrementProfileViews(
  username: string,
  maxRetries = 3
): Promise<void> {
  const normalizedUsername = username.toLowerCase();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await db
        .update(creatorProfiles)
        .set({
          profileViews: drizzleSql`${creatorProfiles.profileViews} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.usernameNormalized, normalizedUsername));

      // Success - exit the retry loop
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Log retry attempt
      console.warn(
        `[Profile Views] Retry ${attempt}/${maxRetries} for ${normalizedUsername}:`,
        lastError.message
      );

      // If not the last attempt, wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise(resolve =>
          setTimeout(resolve, Math.pow(2, attempt) * 100)
        );
      }
    }
  }

  // All retries exhausted - log error and report to Sentry
  console.error(
    `[Profile Views] Failed after ${maxRetries} attempts for ${normalizedUsername}:`,
    lastError
  );

  // Report to Sentry for monitoring (fire-and-forget)
  // Use dynamic import to avoid blocking and circular dependencies
  import('@/lib/error-tracking')
    .then(({ captureError }) => {
      captureError('Profile view increment failed after retries', lastError, {
        username: normalizedUsername,
        maxRetries,
      });
    })
    .catch(() => {
      // Silently ignore if error tracking fails
    });
}
