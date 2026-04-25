import { eq } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { buildThemeWithProfileAccent } from '@/lib/profile/profile-theme.server';

interface EnrichmentInput {
  profileId: string;
  displayNameLocked?: boolean | null;
  avatarLockedByUser?: boolean | null;
  currentDisplayName?: string | null;
  currentAvatarUrl?: string | null;
  extractedDisplayName?: string | null;
  extractedAvatarUrl?: string | null;
}

export async function applyProfileEnrichment(
  tx: DbOrTransaction,
  input: EnrichmentInput
): Promise<void> {
  const updates: Partial<typeof creatorProfiles.$inferInsert> = {};

  if (!input.displayNameLocked && input.extractedDisplayName) {
    const trimmed = input.extractedDisplayName.trim();
    if (trimmed && !input.currentDisplayName) {
      updates.displayName = trimmed;
    }
  }

  if (!input.avatarLockedByUser && input.extractedAvatarUrl) {
    const trimmed = input.extractedAvatarUrl.trim();
    // Skip if the profile already has a blob-hosted avatar — don't replace
    // a stable, optimized URL with a raw external CDN URL.
    const alreadyBlobHosted = input.currentAvatarUrl?.includes(
      'blob.vercel-storage.com'
    );
    if (trimmed && !alreadyBlobHosted) {
      updates.avatarUrl = trimmed;
    }
  }

  if (Object.keys(updates).length === 0) return;

  if (updates.avatarUrl) {
    const [profile] = await tx
      .select({ theme: creatorProfiles.theme })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, input.profileId))
      .limit(1);

    updates.theme = await buildThemeWithProfileAccent({
      existingTheme: profile?.theme,
      sourceUrl: updates.avatarUrl,
    });
  }

  updates.updatedAt = new Date();

  await tx
    .update(creatorProfiles)
    .set(updates)
    .where(eq(creatorProfiles.id, input.profileId));
}
