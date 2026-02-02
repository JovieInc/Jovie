import type { DbOrTransaction } from '@/lib/db';
import {
  creatorAvatarCandidates,
  creatorProfileAttributes,
} from '@/lib/db/schema';
import { logger } from '@/lib/utils/logger';

const DEFAULT_CONFIDENCE = '0.700';

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

export async function storeAvatarCandidate(params: {
  tx: DbOrTransaction;
  profileId: string;
  avatarUrl: string | null | undefined;
  sourcePlatform: string;
  sourceUrl?: string | null;
  confidenceScore?: string;
}): Promise<void> {
  const { tx, profileId, avatarUrl, sourcePlatform, sourceUrl } = params;
  const normalizedAvatarUrl = normalizeText(avatarUrl);
  if (!normalizedAvatarUrl) return;

  try {
    await tx
      .insert(creatorAvatarCandidates)
      .values({
        creatorProfileId: profileId,
        sourcePlatform,
        sourceUrl: sourceUrl ?? null,
        avatarUrl: normalizedAvatarUrl,
        confidenceScore: params.confidenceScore ?? DEFAULT_CONFIDENCE,
      })
      .onConflictDoNothing({
        target: [
          creatorAvatarCandidates.creatorProfileId,
          creatorAvatarCandidates.avatarUrl,
        ],
      });
  } catch (error) {
    logger.debug('Failed to store avatar candidate', {
      profileId,
      sourcePlatform,
      avatarUrl: normalizedAvatarUrl,
      error,
    });
  }
}

export async function storeProfileAttributes(params: {
  tx: DbOrTransaction;
  profileId: string;
  sourcePlatform: string;
  sourceUrl?: string | null;
  displayName?: string | null;
  bio?: string | null;
  confidenceScore?: string;
}): Promise<void> {
  const { tx, profileId, sourcePlatform, sourceUrl } = params;
  const displayName = normalizeText(params.displayName);
  const bio = normalizeText(params.bio);

  if (!displayName && !bio) return;

  try {
    await tx.insert(creatorProfileAttributes).values({
      creatorProfileId: profileId,
      sourcePlatform,
      sourceUrl: sourceUrl ?? null,
      displayName,
      bio,
      confidenceScore: params.confidenceScore ?? DEFAULT_CONFIDENCE,
    });
  } catch (error) {
    logger.debug('Failed to store profile attributes', {
      profileId,
      sourcePlatform,
      error,
    });
  }
}
