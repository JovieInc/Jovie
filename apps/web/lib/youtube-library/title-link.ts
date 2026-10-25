/**
 * Title + duration release linkage for videos with no ISRC in the description
 * (lyric videos, visualizers, self-uploaded videos).
 *
 * An ISRC is still never inferred from a title. This resolver only proposes a
 * release, confidence-scored:
 * - one same-title release AND a matching duration  -> approved (auto-link)
 * - several same-title releases, exactly one whose duration matches
 *                                                   -> approved, lower confidence
 * - same title but duration unknown / not matching / ambiguous
 *                                                   -> pending_review (artist confirms)
 * - no same-title release                           -> null (nothing to link)
 */

import type { CatalogRecording } from './isrc';

/** Seconds of tolerance between a video and a recording duration. */
export const DURATION_TOLERANCE_SECONDS = 3;

export interface TitleLinkInput {
  readonly video: {
    readonly title: string;
    readonly durationSeconds: number | null;
  };
  readonly catalog: readonly CatalogRecording[];
}

export interface TitleLinkResult {
  readonly status: 'approved' | 'pending_review';
  readonly matchSource: 'title_match';
  readonly confidence: number;
  readonly releaseId: string | null;
  readonly recordingId: string | null;
  readonly rationale: string;
}

const VIDEO_NOISE =
  /\b(official|lyrics?|lyric video|music video|audio|visuali[sz]er|video|hd|4k|remaster(?:ed)?)\b/gi;
const FEAT = /\b(?:feat|ft|featuring)\.?\s+[^)\]-]*/gi;

/** Reduce a video or recording title to its comparable song name. */
export function normalizeSongTitle(raw: string): string {
  let title = raw.normalize('NFKD');
  // "Artist - Song" keeps the song part.
  const dash = title.indexOf(' - ');
  if (dash >= 0) title = title.slice(dash + 3);
  title = title
    .replaceAll(
      /[([][^)\]]*(?:official|lyric|video|audio|visuali[sz]er)[^)\]]*[)\]]/gi,
      ' '
    )
    .replaceAll(FEAT, ' ')
    .replaceAll(VIDEO_NOISE, ' ');
  return title.replaceAll(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function durationMatches(
  videoSeconds: number | null,
  recordingMs: number | null | undefined
): boolean | null {
  if (videoSeconds === null || !recordingMs) return null;
  return (
    Math.abs(videoSeconds - recordingMs / 1000) <= DURATION_TOLERANCE_SECONDS
  );
}

export function resolveTitleReleaseLink(
  input: TitleLinkInput
): TitleLinkResult | null {
  const wanted = normalizeSongTitle(input.video.title);
  if (!wanted) return null;

  // One candidate per release; releaseless recordings cannot be linked.
  const byRelease = new Map<string, CatalogRecording>();
  for (const rec of input.catalog) {
    if (!rec.releaseId) continue;
    if (normalizeSongTitle(rec.title) !== wanted) continue;
    if (!byRelease.has(rec.releaseId)) byRelease.set(rec.releaseId, rec);
  }
  const candidates = [...byRelease.values()];
  if (candidates.length === 0) return null;

  const context = `video "${input.video.title}"`;
  const fits = candidates.filter(
    c => durationMatches(input.video.durationSeconds, c.durationMs) === true
  );

  if (candidates.length === 1 && fits.length === 1) {
    return approved(
      fits[0],
      0.85,
      `unique title and duration match (${context})`
    );
  }
  if (candidates.length > 1 && fits.length === 1) {
    return approved(
      fits[0],
      0.75,
      `${candidates.length} same-title releases; duration matched only this one (${context})`
    );
  }
  if (candidates.length === 1) {
    const [only] = candidates;
    return pending(
      only,
      0.5,
      `title matches but duration is unknown or differs; artist should confirm (${context})`
    );
  }
  return {
    status: 'pending_review',
    matchSource: 'title_match',
    confidence: 0.4,
    releaseId: null,
    recordingId: null,
    rationale: `${candidates.length} same-title releases (${candidates
      .map(c => c.releaseId)
      .join(
        ', '
      )}); duration cannot choose; artist should confirm (${context})`,
  };
}

function approved(
  rec: CatalogRecording,
  confidence: number,
  why: string
): TitleLinkResult {
  return {
    status: 'approved',
    matchSource: 'title_match',
    confidence,
    releaseId: rec.releaseId,
    recordingId: rec.id,
    rationale: `Title match to "${rec.title}": ${why}`,
  };
}

function pending(
  rec: CatalogRecording,
  confidence: number,
  why: string
): TitleLinkResult {
  return { ...approved(rec, confidence, why), status: 'pending_review' };
}
