/**
 * ISRC extraction + release linkage resolution (JOV-5136)
 *
 * HARD RULE: an ISRC is NEVER inferred from a video title alone. Only ISRCs
 * extracted from the (distributor-provided) description text qualify for a
 * link. Title text is used only to enrich the human-review rationale.
 */

/** ISO 3901: 2-letter country + 3 alphanumeric registrant + 2-digit year + 5-digit designation. */
const ISRC_PATTERN = /\b[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}\b/g;

/**
 * Extract all ISRCs from free text (e.g. a YouTube description's
 * distributor block). Returns deduplicated codes in order of appearance.
 */
export function extractIsrcsFromText(
  text: string | null | undefined
): string[] {
  if (!text) return [];
  const matches = text.match(ISRC_PATTERN) ?? [];
  return [...new Set(matches)];
}

/** Minimal catalog recording shape needed for linkage resolution. */
export interface CatalogRecording {
  readonly id: string;
  readonly isrc: string | null;
  readonly releaseId: string | null;
  readonly title: string;
}

export interface ResolveReleaseLinkInput {
  readonly video: {
    readonly title: string;
    readonly description: string | null;
  };
  /** The creator's own catalog recordings (from discog_recordings). */
  readonly catalog: readonly CatalogRecording[];
}

export interface ResolvedReleaseLink {
  readonly status: 'approved' | 'pending_review';
  readonly matchSource: 'distributor_data';
  readonly confidence: number;
  readonly isrc: string;
  readonly recordingId: string | null;
  readonly releaseId: string | null;
  readonly rationale: string;
}

/**
 * Resolve a release link for a video from its description ISRCs.
 *
 * Outcomes:
 * - exactly one catalog recording matches an extracted ISRC → approved (auto),
 *   matchSource 'distributor_data', confidence 0.95
 * - extracted ISRC absent from catalog → pending_review, 0.5, ISRC recorded,
 *   no release/recording id
 * - multiple catalog matches → pending_review, 0.4
 * - no ISRC in the description → null (no link row should be written)
 */
export function resolveReleaseLink(
  input: ResolveReleaseLinkInput
): ResolvedReleaseLink | null {
  const isrcs = extractIsrcsFromText(input.video.description);
  if (isrcs.length === 0) return null;

  const catalogByIsrc = new Map<string, CatalogRecording[]>();
  for (const recording of input.catalog) {
    if (!recording.isrc) continue;
    const existing = catalogByIsrc.get(recording.isrc) ?? [];
    existing.push(recording);
    catalogByIsrc.set(recording.isrc, existing);
  }

  // Title is context for a human reviewer only — it never selects an ISRC.
  const titleContext = `video title: "${input.video.title}"`;

  for (const isrc of isrcs) {
    const matches = catalogByIsrc.get(isrc) ?? [];
    if (matches.length === 1) {
      const match = matches[0];
      return {
        status: 'approved',
        matchSource: 'distributor_data',
        confidence: 0.95,
        isrc,
        recordingId: match.id,
        releaseId: match.releaseId,
        rationale: `ISRC ${isrc} from description uniquely matched catalog recording "${match.title}" (${titleContext})`,
      };
    }
    if (matches.length > 1) {
      return {
        status: 'pending_review',
        matchSource: 'distributor_data',
        confidence: 0.4,
        isrc,
        recordingId: null,
        releaseId: null,
        rationale: `ISRC ${isrc} from description matched ${matches.length} catalog recordings; needs human review (${titleContext})`,
      };
    }
  }

  // No extracted ISRC exists in the catalog — record the first for review.
  const isrc = isrcs[0];
  return {
    status: 'pending_review',
    matchSource: 'distributor_data',
    confidence: 0.5,
    isrc,
    recordingId: null,
    releaseId: null,
    rationale: `ISRC ${isrc} from description not found in creator catalog; needs human review (${titleContext})`,
  };
}
