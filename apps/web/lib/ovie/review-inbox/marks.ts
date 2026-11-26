import type {
  ReviewInboxCandidate,
  ReviewInboxMarks,
  ReviewInboxPilotCase,
  ReviewInboxPin,
  ReviewInboxPoint,
  ReviewInboxStroke,
} from './contract';
import { REVIEW_INBOX_MARK_LIMITS } from './contract';

/** Marks are keyed by immutable asset bytes plus the revision they were made on. */
export function marksForAsset(
  marks: ReviewInboxMarks,
  asset: Pick<ReviewInboxCandidate, 'contentDigest' | 'revision'>
): ReviewInboxMarks {
  const matches = (mark: { assetDigest: string; revision: string }) =>
    mark.assetDigest === asset.contentDigest &&
    mark.revision === asset.revision;
  return {
    pins: marks.pins.filter(matches),
    strokes: marks.strokes.filter(matches),
  };
}

/**
 * A mark is stale once a newer revision of the case exists: its feedback was
 * given on bytes the active revision has replaced.
 */
export function isMarkStale(
  mark: { readonly revision: string },
  reviewCase: Pick<ReviewInboxPilotCase, 'candidates' | 'activeRevision'>
): boolean {
  if (mark.revision === reviewCase.activeRevision) return false;
  const order = reviewCase.candidates.map(candidate => candidate.revision);
  const markIndex = order.indexOf(mark.revision);
  const activeIndex = order.indexOf(reviewCase.activeRevision);
  // Unknown revisions are treated as stale: they cannot match current bytes.
  return markIndex === -1 || activeIndex === -1 || activeIndex > markIndex;
}

function inUnit(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 1;
}

export function isReviewInboxPoint(value: unknown): value is ReviewInboxPoint {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    inUnit(value[0]) &&
    inUnit(value[1])
  );
}

export function isReviewInboxStrokeInput(
  value: unknown
): value is Omit<ReviewInboxStroke, 'author'> {
  if (!value || typeof value !== 'object') return false;
  const stroke = value as Partial<ReviewInboxStroke>;
  return (
    typeof stroke.id === 'string' &&
    typeof stroke.assetDigest === 'string' &&
    typeof stroke.revision === 'string' &&
    Array.isArray(stroke.points) &&
    stroke.points.length >= 2 &&
    stroke.points.length <= REVIEW_INBOX_MARK_LIMITS.pointsPerStroke &&
    stroke.points.every(isReviewInboxPoint)
  );
}

/** Round to 4 decimals (sub-pixel on a 4K asset) to keep stored strokes small. */
export function normalizePoint(x: number, y: number): ReviewInboxPoint {
  const clamp = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;
  return [clamp(x), clamp(y)];
}

export function withAuthor<T extends object>(
  marks: readonly T[],
  author: ReviewInboxPin['author']
): (T & { readonly author: ReviewInboxPin['author'] })[] {
  return marks.map(mark => ({ ...mark, author }));
}
