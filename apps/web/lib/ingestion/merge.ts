import { eq } from 'drizzle-orm';
import { type DbType, socialLinks } from '@/lib/db';
import { logger } from '@/lib/utils/logger';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { computeLinkConfidence } from './confidence';
import { applyProfileEnrichment } from './profile';
import { processAvatarIfNeeded } from './services/avatar-processor';
import {
  ensureEvidenceDefaults,
  mergeEvidence,
} from './services/evidence-merger';
import {
  buildCanonicalIndex,
  getCanonicalIdentity,
} from './services/link-deduplication';
import type { ExtractionResult } from './types';

type SocialLinkRow = typeof socialLinks.$inferSelect;

// Re-export for backward compatibility
export { mergeEvidence } from './services/evidence-merger';

/**
 * Create an in-memory social link row for tracking during merge.
 */
export function createInMemorySocialLinkRow({
  profileId,
  platformId,
  platformCategory,
  url,
  displayText,
  sortOrder,
  isActive,
  state,
  confidence,
  sourcePlatform,
  evidence,
}: {
  profileId: string;
  platformId: string;
  platformCategory: string;
  url: string;
  displayText?: string | null;
  sortOrder: number;
  isActive: boolean;
  state: SocialLinkRow['state'];
  confidence: number;
  sourcePlatform?: string | null;
  evidence?: SocialLinkRow['evidence'];
}): SocialLinkRow {
  return {
    id: '',
    creatorProfileId: profileId,
    platform: platformId,
    platformType: platformCategory,
    url,
    displayText: displayText ?? null,
    sortOrder,
    isActive,
    state,
    confidence,
    sourcePlatform: sourcePlatform ?? 'linktree',
    sourceType: 'ingested',
    evidence: evidence ?? {},
    clicks: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as SocialLinkRow;
}

/**
 * Normalize extracted links and merge them with existing social links.
 * Uses modular services to reduce cognitive complexity.
 */
export async function normalizeAndMergeExtraction(
  tx: DbType,
  profile: {
    id: string;
    usernameNormalized: string | null;
    avatarUrl: string | null;
    displayName: string | null;
    avatarLockedByUser: boolean | null;
    displayNameLocked: boolean | null;
  },
  extraction: ExtractionResult
): Promise<{ inserted: number; updated: number }> {
  // Step 1: Load existing links and build canonical index
  const existingRows = await tx
    .select()
    .from(socialLinks)
    .where(eq(socialLinks.creatorProfileId, profile.id));

  const existingByCanonical = buildCanonicalIndex(existingRows);

  // Step 2: Process each extracted link
  let inserted = 0;
  let updated = 0;
  const sortStart = existingRows.length;

  for (const link of extraction.links) {
    try {
      const detected = detectPlatform(link.url);
      if (!detected.isValid) continue;

      const canonical = getCanonicalIdentity(link.url);
      if (!canonical) continue;

      // Prepare evidence with defaults
      const evidence = ensureEvidenceDefaults(
        mergeEvidence(null, link.evidence),
        {
          sources: ['ingestion'],
          signals: ['ingestion_profile_link'],
        }
      );

      const { confidence, state } = computeLinkConfidence({
        sourceType: 'ingested',
        signals: evidence.signals,
        sources: evidence.sources,
        usernameNormalized: profile.usernameNormalized,
        url: detected.normalizedUrl,
      });

      // Check if link already exists
      const existing = existingByCanonical.get(canonical);
      if (existing) {
        const existingState =
          (existing.state as 'active' | 'suggested' | 'rejected' | null) ||
          (existing.isActive ? 'active' : 'suggested');
        const mergedEvidence = mergeEvidence(
          (existing.evidence as Record<string, unknown>) ?? null,
          link.evidence
        );
        const merged = computeLinkConfidence({
          sourceType: existing.sourceType ?? 'ingested',
          signals: mergedEvidence.signals as string[] | undefined,
          sources: mergedEvidence.sources as string[] | undefined,
          usernameNormalized: profile.usernameNormalized,
          url: detected.normalizedUrl,
          existingConfidence:
            typeof existing.confidence === 'number'
              ? existing.confidence
              : null,
        });

        await tx
          .update(socialLinks)
          .set({
            url: detected.normalizedUrl,
            displayText: link.title ?? existing.displayText,
            sourcePlatform: existing.sourcePlatform ?? link.sourcePlatform,
            sourceType: existing.sourceType ?? 'manual',
            evidence: mergedEvidence,
            confidence: merged.confidence.toFixed(2),
            state:
              existing.sourceType === 'ingested' ? merged.state : existingState,
            isActive:
              (existing.sourceType === 'ingested'
                ? merged.state
                : existingState) === 'active',
            updatedAt: new Date(),
          })
          .where(eq(socialLinks.id, existing.id));
        updated += 1;
        continue;
      }

      const insertPayload: typeof socialLinks.$inferInsert = {
        creatorProfileId: profile.id,
        platform: detected.platform.id,
        platformType: detected.platform.category,
        url: detected.normalizedUrl,
        displayText: link.title,
        sortOrder: sortStart + inserted,
        isActive: state === 'active',
        state,
        confidence: confidence.toFixed(2),
        sourcePlatform: link.sourcePlatform ?? 'ingestion',
        sourceType: 'ingested',
        evidence,
      };

      await tx.insert(socialLinks).values(insertPayload);
      existingByCanonical.set(
        canonical,
        createInMemorySocialLinkRow({
          profileId: profile.id,
          platformId: detected.platform.id,
          platformCategory: detected.platform.category,
          url: detected.normalizedUrl,
          displayText: link.title,
          sortOrder: sortStart + inserted,
          isActive: state === 'active',
          state,
          confidence,
          sourcePlatform: link.sourcePlatform,
          evidence,
        })
      );
      inserted += 1;
    } catch (error) {
      logger.warn('normalizeAndMergeExtraction failed for link', {
        error,
        link,
      });
    }
  }

  // Step 3: Process avatar if needed
  const hostedAvatarUrl = await processAvatarIfNeeded(
    profile,
    extraction.avatarUrl
  );

  // Step 4: Apply profile enrichment (respects user locks)
  await applyProfileEnrichment(tx, {
    profileId: profile.id,
    displayNameLocked: profile.displayNameLocked,
    avatarLockedByUser: profile.avatarLockedByUser,
    currentDisplayName: profile.displayName,
    currentAvatarUrl: profile.avatarUrl,
    extractedDisplayName: extraction.displayName ?? null,
    // Use the Jovie-hosted URL if available, otherwise fall back to external URL
    // (applyProfileEnrichment will skip if current avatar exists or is locked)
    extractedAvatarUrl: hostedAvatarUrl ?? extraction.avatarUrl ?? null,
  });

  return { inserted, updated };
}
