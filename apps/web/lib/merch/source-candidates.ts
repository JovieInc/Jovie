import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogRecordings, discogReleases } from '@/lib/db/schema/content';

/**
 * A merch phrase must have a source Jovie can name back to the artist.  This
 * intentionally starts with catalog titles; lyrics are only eligible once they
 * are represented by a separate, rights-aware source record.
 */
export type MerchSourceType =
  | 'song_title'
  | 'album_title'
  | 'library_asset'
  | 'user_provided';

export interface MerchSource {
  readonly sourceType: MerchSourceType;
  readonly sourceText: string;
  readonly provenanceTitle: string;
  readonly rightsStatus: 'owned' | 'user_provided';
  /** Present only for an artist-owned Library asset selected by the artist. */
  readonly assetId?: string;
  /** A rendering reference, never a license to recreate the asset. */
  readonly assetUrl?: string;
}

export interface MerchSourceCandidate extends MerchSource {
  readonly merchScore: number;
  readonly whyItWorks: string;
}

function normalized(value: string): string {
  return value.trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase();
}

/**
 * Transparent, deterministic title scoring. This is deliberately modest: it
 * ranks confirmed catalog titles; it does not infer a lyric, a fan phrase, or
 * a claim about what fans know.
 */
export function scoreMerchTitle(title: string): number {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  const wordCountScore = words.length >= 2 && words.length <= 5 ? 45 : 25;
  const compactnessScore =
    title.length <= 28 ? 25 : title.length <= 42 ? 15 : 5;
  const readabilityScore = /^[\p{L}\p{N}'’&!?. -]+$/u.test(title) ? 15 : 5;
  const visualCueScore =
    /light|night|signal|deep|heart|fire|static|dream|shadow|electric|dark/i.test(
      title
    )
      ? 15
      : 5;

  return Math.min(
    100,
    wordCountScore + compactnessScore + readabilityScore + visualCueScore
  );
}

function whyTitleWorks(title: string, score: number): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const compact = words.length >= 2 && words.length <= 5;
  const visual =
    /light|night|signal|deep|heart|fire|static|dream|shadow|electric|dark/i.test(
      title
    );

  if (compact && visual) {
    return 'Short, readable, and it already suggests a visual system.';
  }
  if (compact) {
    return 'Short enough to read clearly on a garment from a distance.';
  }
  if (score >= 60) {
    return 'A confirmed catalog title with a clear type-first direction.';
  }
  return 'Confirmed catalog title; review the line breaks before printing.';
}

export function rankMerchSources(
  sources: readonly Omit<MerchSource, 'rightsStatus'>[]
): readonly MerchSourceCandidate[] {
  const seen = new Set<string>();

  return sources
    .map(source => ({
      ...source,
      sourceText: source.sourceText.trim(),
      provenanceTitle: source.provenanceTitle.trim(),
    }))
    .filter(source => source.sourceText.length > 0)
    .filter(source => {
      const key = normalized(source.sourceText);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(source => {
      const merchScore = scoreMerchTitle(source.sourceText);
      return {
        ...source,
        rightsStatus: 'owned' as const,
        merchScore,
        whyItWorks: whyTitleWorks(source.sourceText, merchScore),
      };
    })
    .sort(
      (left, right) =>
        right.merchScore - left.merchScore ||
        left.sourceText.localeCompare(right.sourceText)
    );
}

export async function getMerchSourceCandidates(
  profileId: string
): Promise<readonly MerchSourceCandidate[]> {
  const [recordings, releases] = await Promise.all([
    db
      .select({ title: discogRecordings.title })
      .from(discogRecordings)
      .where(eq(discogRecordings.creatorProfileId, profileId))
      .orderBy(desc(discogRecordings.updatedAt))
      .limit(20),
    db
      .select({ title: discogReleases.title })
      .from(discogReleases)
      .where(eq(discogReleases.creatorProfileId, profileId))
      .orderBy(desc(discogReleases.updatedAt))
      .limit(20),
  ]);

  return rankMerchSources([
    ...recordings.map(recording => ({
      sourceType: 'song_title' as const,
      sourceText: recording.title,
      provenanceTitle: recording.title,
    })),
    ...releases.map(release => ({
      sourceType: 'album_title' as const,
      sourceText: release.title,
      provenanceTitle: release.title,
    })),
  ]).slice(0, 6);
}

/** A user can provide a phrase only when it is visibly in the current request. */
export function isExplicitUserProvidedSource(
  prompt: string,
  source: MerchSource
): boolean {
  return (
    source.sourceType === 'user_provided' &&
    source.rightsStatus === 'user_provided' &&
    normalized(prompt).includes(normalized(source.sourceText))
  );
}

/**
 * Current image generation accepts text only. Asset-backed merch must stay
 * blocked until the render pipeline can pass the exact asset through as a
 * reference/composite. Recreating an uploaded logo from a description is not
 * an acceptable fallback.
 */
export function requiresAssetPreservingRender(source: MerchSource): boolean {
  return source.sourceType === 'library_asset';
}

export function hasHumanSafeMerchContract(input: {
  readonly forbiddenCliches?: readonly string[] | null;
  readonly source?: MerchSource | null;
}): boolean {
  const hasNoPeopleRule = (input.forbiddenCliches ?? []).some(rule =>
    /no (?:fake )?(?:people|faces|portraits|models|human figures)/i.test(rule)
  );

  return (
    hasNoPeopleRule &&
    Boolean(input.source) &&
    !requiresAssetPreservingRender(input.source as MerchSource)
  );
}

export function isMerchDirectionHelpRequest(
  prompt: string | undefined
): boolean {
  return /\b(idk|i don't know|help me pick|pick (?:one|a)|use (?:a|my) (?:song )?lyric|actual (?:catalog|lyrics)|no (?:fake )?(?:people|faces|models)|these suck)\b/i.test(
    prompt ?? ''
  );
}
