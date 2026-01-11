import { eq } from 'drizzle-orm';
import { type DbType, socialLinks } from '@/lib/db';
import { logger } from '@/lib/utils/logger';
import {
  canonicalIdentity,
  detectPlatform,
} from '@/lib/utils/platform-detection';
import { computeLinkConfidence } from './confidence';
import { copyExternalAvatarToStorage } from './magic-profile-avatar';
import { applyProfileEnrichment } from './profile';
import type { ExtractionResult } from './types';

type SocialLinkRow = typeof socialLinks.$inferSelect;

/**
 * Merge evidence from existing and incoming sources.
 */
export function mergeEvidence(
  existing: Record<string, unknown> | null,
  incoming?: { sources?: string[]; signals?: string[] }
): { sources: string[]; signals: string[] } {
  const baseSources =
    Array.isArray((existing as { sources?: string[] })?.sources) &&
    ((existing as { sources?: unknown[] }).sources ?? []).every(
      item => typeof item === 'string'
    )
      ? ((existing as { sources?: string[] }).sources as string[])
      : [];
  const baseSignals =
    Array.isArray((existing as { signals?: string[] })?.signals) &&
    ((existing as { signals?: unknown[] }).signals ?? []).every(
      item => typeof item === 'string'
    )
      ? ((existing as { signals?: string[] }).signals as string[])
      : [];

  const nextSources = new Set([...baseSources, ...(incoming?.sources ?? [])]);
  const nextSignals = new Set([...baseSignals, ...(incoming?.signals ?? [])]);

  return {
    sources: Array.from(nextSources),
    signals: Array.from(nextSignals),
  };
}

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
  const existingRows = await tx
    .select()
    .from(socialLinks)
    .where(eq(socialLinks.creatorProfileId, profile.id));

  const existingByCanonical = new Map<string, SocialLinkRow>();

  for (const row of existingRows) {
    try {
      const detected = detectPlatform(row.url);
      const canonical = canonicalIdentity({
        platform: detected.platform,
        normalizedUrl: detected.normalizedUrl,
      });
      existingByCanonical.set(canonical, row);
    } catch {
      // Skip rows with unparseable URLs; ingestion will not mutate them
    }
  }

  let inserted = 0;
  let updated = 0;
  const sortStart = existingRows.length;

  for (const link of extraction.links) {
    try {
      const detected = detectPlatform(link.url);
      if (!detected.isValid) continue;

      const canonical = canonicalIdentity({
        platform: detected.platform,
        normalizedUrl: detected.normalizedUrl,
      });
      const evidence = mergeEvidence(null, link.evidence);
      const { confidence, state } = computeLinkConfidence({
        sourceType: 'ingested',
        signals:
          evidence.signals && evidence.signals.length > 0
            ? (evidence.signals as string[])
            : ['ingestion_profile_link'],
        sources:
          evidence.sources && evidence.sources.length > 0
            ? (evidence.sources as string[])
            : ['ingestion'],
        usernameNormalized: profile.usernameNormalized,
        url: detected.normalizedUrl,
      });

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

  // Copy external avatar to Jovie storage before applying enrichment
  // This ensures we don't store third-party URLs in the database
  let hostedAvatarUrl: string | null = null;
  if (
    extraction.avatarUrl &&
    !profile.avatarUrl &&
    !profile.avatarLockedByUser &&
    profile.usernameNormalized
  ) {
    hostedAvatarUrl = await copyExternalAvatarToStorage({
      externalUrl: extraction.avatarUrl,
      handle: profile.usernameNormalized,
      sourcePlatform: 'ingestion',
    });
  }

  // Apply basic enrichment for display name and avatar (phase 3 rules: respect locks)
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
