/**
 * Certification walkthrough review contract (JOV-7151): timestamped founder
 * dictation bound to the exact certification revision + evidence digest.
 *
 * This is a pure client-safe projection. The review artifact never mutates
 * certification truth — completing a review feeds the existing
 * `OvieCertificationDecisionRequest` contract in `./types.ts`.
 */

import type { OvieCertificationEvidence, OvieCertificationRow } from './types';

export const CERTIFICATION_WALKTHROUGH_CONTRACT =
  'jovie.certification-walkthrough/v1' as const;

/** Decision notes are capped at 4000 chars server-side; keep headroom. */
export const WALKTHROUGH_NOTES_LIMIT = 3_900;

export type WalkthroughEvidenceKind = 'video' | 'image' | 'text' | 'receipt';

export interface WalkthroughArtifact {
  /** Evidence receipt id the founder is reviewing against. */
  readonly evidenceId: string;
  readonly kind: WalkthroughEvidenceKind;
  /** Navigable artifact URL; `null` when the receipt only carries a ref. */
  readonly href: string | null;
  readonly ref: string;
  readonly label: string;
}

export interface WalkthroughPlaybackAnchor {
  /** Media position in seconds when the segment was spoken (0 for non-media). */
  readonly playbackSeconds: number;
  readonly playbackRate: number;
  readonly playerState: 'playing' | 'paused' | 'static';
  /** Wall-clock time the observation was recorded. */
  readonly observedAt: string;
}

export interface WalkthroughTranscriptSegment {
  readonly id: string;
  readonly text: string;
  readonly anchor: WalkthroughPlaybackAnchor;
}

export interface WalkthroughFinding {
  readonly id: string;
  /** Founder's words, lightly normalized — never rewritten away. */
  readonly text: string;
  readonly playbackSeconds: number;
  readonly observedAt: string;
  /** Heuristic: hedged or question-form comments the worker should clarify. */
  readonly ambiguous: boolean;
  /** Source segments merged into this finding (dedupe keeps provenance). */
  readonly segmentIds: readonly string[];
}

export interface CertificationWalkthroughReview {
  readonly contract: typeof CERTIFICATION_WALKTHROUGH_CONTRACT;
  /** `${domain}:${subjectId}` — the inventory row the decision binds to. */
  readonly rowId: string;
  readonly subjectId: string;
  readonly subjectKind: string;
  readonly subjectTitle: string;
  readonly surface: string;
  /** Kernel evidence digest captured at review open; staleness compares it. */
  readonly evidenceDigest: string;
  readonly artifact: WalkthroughArtifact;
  readonly startedAt: string;
  readonly segments: readonly WalkthroughTranscriptSegment[];
}

const VIDEO_REF = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const IMAGE_REF = /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i;
const AMBIGUOUS_RE = /\?|\b(maybe|not sure|unsure|unclear|might)\b/i;

function artifactKind(ref: string): WalkthroughEvidenceKind | null {
  if (VIDEO_REF.test(ref)) return 'video';
  if (IMAGE_REF.test(ref)) return 'image';
  return null;
}

/** Accept explicit web URLs or same-origin public paths, never local files. */
export function walkthroughEvidenceHref(
  evidence: OvieCertificationEvidence
): string | null {
  const value = evidence.href ?? evidence.ref;
  if (!value || /[\\\s]/.test(value)) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password
      ? value
      : null;
  } catch {
    return null;
  }
}

function toArtifact(
  evidence: OvieCertificationEvidence,
  kind: WalkthroughEvidenceKind
): WalkthroughArtifact {
  return {
    evidenceId: evidence.id,
    kind,
    href: walkthroughEvidenceHref(evidence),
    ref: evidence.ref,
    label: evidence.summary || evidence.id,
  };
}

/**
 * Lightest evidence surface that proves the object: visual-proof media first
 * (video for flows, image for static states), then any media receipt, then
 * rendered text, then the first receipt as structured evidence.
 */
export function pickWalkthroughArtifact(
  row: OvieCertificationRow
): WalkthroughArtifact | null {
  const passed = row.evidence.filter(item => item.status === 'passed');
  const media = passed.filter(item => {
    const kind = artifactKind(item.href ?? item.ref);
    return kind !== null;
  });
  const visual = media.find(item => item.tier === 'visual_proof');
  const first = visual ?? media[0];
  if (first) {
    return toArtifact(
      first,
      artifactKind(first.href ?? first.ref) ?? 'receipt'
    );
  }
  // A failed media receipt cannot be replaced by an unrelated source/test summary.
  if (row.evidence.some(item => artifactKind(item.href ?? item.ref) !== null))
    return null;
  const text = passed.find(item => item.summary.trim().length > 0);
  if (text) return toArtifact(text, 'text');
  const receipt = passed[0];
  return receipt ? toArtifact(receipt, 'receipt') : null;
}

/** Walkthrough is offered only when a founder decision can actually land. */
export function canStartWalkthrough(row: OvieCertificationRow): boolean {
  return row.decision.available && row.decision.evidenceDigest !== null;
}

export function createWalkthroughReview(
  row: OvieCertificationRow,
  startedAt: string = new Date().toISOString()
): CertificationWalkthroughReview | null {
  if (!canStartWalkthrough(row) || !row.decision.evidenceDigest) return null;
  const artifact = pickWalkthroughArtifact(row);
  if (!artifact) return null;
  return {
    contract: CERTIFICATION_WALKTHROUGH_CONTRACT,
    rowId: row.id,
    subjectId: row.subject.id,
    subjectKind: row.subject.kind,
    subjectTitle: row.subject.title,
    surface: row.surface,
    evidenceDigest: row.decision.evidenceDigest,
    artifact,
    startedAt,
    segments: [],
  };
}

/** A stale review can never certify newer work: digests must match exactly. */
export function isWalkthroughReviewStale(
  review: CertificationWalkthroughReview,
  row: OvieCertificationRow | null
): boolean {
  return (
    !row ||
    row.id !== review.rowId ||
    !row.decision.available ||
    row.decision.evidenceDigest !== review.evidenceDigest
  );
}

export function appendTranscriptSegment(
  review: CertificationWalkthroughReview,
  text: string,
  anchor: WalkthroughPlaybackAnchor,
  id: string
): CertificationWalkthroughReview {
  const trimmed = text.trim();
  if (trimmed.length === 0) return review;
  return {
    ...review,
    segments: [...review.segments, { id, text: trimmed, anchor }],
  };
}

function normalizeFindingText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Structure dictation into findings without losing the source: one finding
 * per distinct observation; exact-duplicate comments merge into one finding
 * that keeps every source segment id and earliest timestamp.
 */
export function structureWalkthroughFindings(
  review: CertificationWalkthroughReview
): readonly WalkthroughFinding[] {
  const byText = new Map<string, WalkthroughFinding>();
  for (const segment of review.segments) {
    const key = normalizeFindingText(segment.text);
    const existing = byText.get(key);
    if (existing) {
      byText.set(key, {
        ...existing,
        playbackSeconds: Math.min(
          existing.playbackSeconds,
          segment.anchor.playbackSeconds
        ),
        segmentIds: [...existing.segmentIds, segment.id],
      });
      continue;
    }
    byText.set(key, {
      id: `finding-${segment.id}`,
      text: segment.text,
      playbackSeconds: segment.anchor.playbackSeconds,
      observedAt: segment.anchor.observedAt,
      ambiguous: AMBIGUOUS_RE.test(segment.text),
      segmentIds: [segment.id],
    });
  }
  return [...byText.values()];
}

export function formatPlaybackTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/**
 * Render findings into the decision `notes` string a remediation worker can
 * act on. Raw timestamps stay in the text so the note is self-contained even
 * where the review artifact isn't reachable.
 */
export function buildWalkthroughNotes(
  review: CertificationWalkthroughReview,
  findings: readonly WalkthroughFinding[]
): string {
  const media =
    review.artifact.kind === 'video' || review.artifact.kind === 'image';
  const lines = findings.map(finding => {
    const at = media ? `[${formatPlaybackTime(finding.playbackSeconds)}] ` : '';
    const flag = finding.ambiguous
      ? ' (ambiguous — clarify before rework)'
      : '';
    return `- ${at}${finding.text}${flag}`;
  });
  const header = [
    `Walkthrough findings for ${review.subjectTitle} (${review.subjectId})`,
    `Evidence: ${review.artifact.ref}`,
  ];
  let notes = [...header, ...lines].join('\n');
  while (notes.length > WALKTHROUGH_NOTES_LIMIT && lines.length > 1) {
    lines.pop();
    notes = [...header, ...lines, '- …'].join('\n');
  }
  return notes.slice(0, WALKTHROUGH_NOTES_LIMIT);
}
