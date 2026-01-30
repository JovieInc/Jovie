import { eq } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema';

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
    if (trimmed && !input.currentAvatarUrl) {
      updates.avatarUrl = trimmed;
    }
  }

  if (Object.keys(updates).length === 0) return;

  updates.updatedAt = new Date();

  await tx
    .update(creatorProfiles)
    .set(updates)
    .where(eq(creatorProfiles.id, input.profileId));
}
