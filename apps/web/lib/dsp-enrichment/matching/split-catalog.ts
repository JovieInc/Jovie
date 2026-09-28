/**
 * Split Catalog Detector
 *
 * Detects when one artist's catalog is fragmented across multiple
 * provider artist IDs (e.g. two Apple Music artist pages for the same
 * person). Pure, side-effect free, and reusable from onboarding scans,
 * explicit rescans, and recurring checks.
 *
 * Evidence rules (JOV-6527):
 * - A matching artist name alone is NEVER sufficient evidence.
 * - Only recordings from the artist's approved catalog that carry the
 *   artist's credit on a second provider artist page constitute split
 *   evidence. Unapproved recordings on a look-alike page indicate a
 *   namesake, not a split.
 * - Shared biography/public profile fields corroborate but cannot
 *   create a candidate on their own.
 * - Failed, stale, or inaccessible observations prevent a clean
 *   verdict: the result is 'unknown', never 'no_split'.
 * - Co-artist credits (e.g. a Lynx credit on a Tim White release) are
 *   preserved as evidence, never treated as split IDs for the artist.
 */

import { normalizeArtistName } from './name-similarity';

// ============================================================================
// Types
// ============================================================================

/** Provider-facing artist identifier scoping, e.g. 'apple_music'. */
export type SplitCatalogProvider = 'apple_music' | string;

/**
 * Observation of one provider artist page as seen by the checker.
 * `fetchStatus` reflects whether the page content was actually
 * retrieved and is current enough to reason about.
 */
export interface ProviderArtistObservation {
  provider: SplitCatalogProvider;
  providerArtistId: string;
  /** Displayed artist name on the provider page. */
  displayedName: string;
  url?: string;
  storefront?: string;
  /** When the page content was observed (ISO string or Date). */
  observedAt: string | Date;
  fetchStatus: 'ok' | 'failed' | 'stale';
  /** Public biography text shown on the page, if any. */
  bio?: string | null;
}

/**
 * One recording/release row used as detection evidence.
 * `credits` lists the artist credits the provider shows for the
 * release; the detector only counts the credit matching the scanned
 * artist's name, so collaborators never pollute the result.
 */
export interface CatalogRecordingEvidence {
  id: string;
  title: string;
  isrc?: string | null;
  upc?: string | null;
  /** Release URL on the provider, when known. */
  providerUrl?: string;
  /**
   * True only when the artist (or an approved catalog source) has
   * confirmed this recording belongs to them. Unapproved recordings
   * cannot create split evidence.
   */
  approvedForArtist: boolean;
  credits: Array<{
    /** Artist name as credited on the release. */
    name: string;
    /** Provider artist ID the credit links to, when resolved. */
    providerArtistId?: string | null;
  }>;
}

/** Input to the detector. */
export interface SplitCatalogScanInput {
  provider: SplitCatalogProvider;
  /** Canonical artist name being scanned (e.g. 'Tim White'). */
  artistName: string;
  /** The artist's confirmed primary provider artist ID, if known. */
  primaryProviderArtistId?: string | null;
  /** Approved/claimed catalog recordings to check. */
  recordings: CatalogRecordingEvidence[];
  /** Provider artist pages observed during the scan. */
  observations: ProviderArtistObservation[];
}

export type SplitCatalogDetectionState =
  | 'split_detected'
  | 'no_split'
  | 'unknown';

export type SplitCatalogConfidence = 'high' | 'medium' | 'low';

export type SplitEvidenceKind =
  | 'approved_recording'
  | 'shared_isrc'
  | 'shared_upc'
  | 'shared_co_artists'
  | 'shared_biography';

export interface SplitEvidence {
  kind: SplitEvidenceKind;
  /** Recording ID when the evidence is recording-scoped. */
  recordingId?: string;
  detail: string;
}

/** A distinct extra provider artist ID holding catalog that is not the primary. */
export interface SplitCatalogCandidate {
  provider: SplitCatalogProvider;
  providerArtistId: string;
  displayedName?: string;
  url?: string;
  storefront?: string;
  observedAt?: string;
  confidence: SplitCatalogConfidence;
  evidence: SplitEvidence[];
  /** Approved recordings living under this provider artist ID. */
  affectedRecordings: Array<{
    recordingId: string;
    title: string;
    providerUrl?: string;
    /** Collaborator names preserved from the release credits. */
    coArtists: string[];
  }>;
}

export interface SplitCatalogDetectionResult {
  state: SplitCatalogDetectionState;
  provider: SplitCatalogProvider;
  /**
   * Stable dedupe key for one case: sorted provider artist IDs for the
   * same artist name. Two scans producing the same key are the same
   * case and must not spawn duplicate notifications/submissions.
   */
  caseKey: string;
  primaryProviderArtistId: string | null;
  candidates: SplitCatalogCandidate[];
  /**
   * True when at least one observation was failed or stale, so the
   * scan could not see the full catalog surface. A 'no_split' verdict
   * is never returned when this is true.
   */
  incompleteEvidence: boolean;
  reasons: string[];
}

// ============================================================================
// Internals
// ============================================================================

function normalizeName(name: string): string {
  return normalizeArtistName(name);
}

function asIso(value: string | Date | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Resolve the provider artist ID that carries this artist's credit on a
 * recording. Returns null when the recording does not credit the scanned
 * artist at all — those rows are evidence about namesakes/collaborators,
 * not about this artist's placement.
 */
function creditedProviderArtistId(
  recording: CatalogRecordingEvidence,
  artistName: string
): string | null {
  const target = normalizeName(artistName);
  for (const credit of recording.credits) {
    if (normalizeName(credit.name) === target && credit.providerArtistId) {
      return credit.providerArtistId;
    }
  }
  return null;
}

function collaboratorNames(
  recording: CatalogRecordingEvidence,
  artistName: string
): string[] {
  const target = normalizeName(artistName);
  return recording.credits
    .filter(c => normalizeName(c.name) !== target)
    .map(c => c.name);
}

// ============================================================================
// Detector
// ============================================================================

/**
 * Detect a catalog split for one artist on one provider.
 *
 * Grouping rule: every approved recording that credits the artist maps
 * to exactly one provider artist ID. More than one distinct ID holding
 * approved catalog is a split. Name-similar pages without approved
 * recordings are namesake noise and are ignored (but reported as
 * `unknown` context only when their pages could not be fetched).
 */
export function detectCatalogSplit(
  input: SplitCatalogScanInput
): SplitCatalogDetectionResult {
  const reasons: string[] = [];

  const observations = input.observations.filter(
    o => o.provider === input.provider
  );
  const observationById = new Map(
    observations.map(o => [o.providerArtistId, o])
  );

  const incompleteEvidence = observations.some(o => o.fetchStatus !== 'ok');
  if (incompleteEvidence) {
    reasons.push(
      'one or more provider artist pages were failed or stale; result cannot be treated as clean'
    );
  }

  // Map each approved recording to the provider artist ID carrying the
  // artist's own credit.
  const placements = new Map<
    string,
    { recording: CatalogRecordingEvidence; evidence: SplitEvidence[] }[]
  >();

  for (const recording of input.recordings) {
    if (!recording.approvedForArtist) continue;
    const artistPageId = creditedProviderArtistId(recording, input.artistName);
    if (!artistPageId) continue;

    const evidence: SplitEvidence[] = [
      {
        kind: 'approved_recording',
        recordingId: recording.id,
        detail: `approved recording "${recording.title}" credits ${input.artistName} on provider artist ${artistPageId}`,
      },
    ];
    if (recording.isrc) {
      evidence.push({
        kind: 'shared_isrc',
        recordingId: recording.id,
        detail: `ISRC ${recording.isrc} ties the recording to the artist's catalog`,
      });
    }
    if (recording.upc) {
      evidence.push({
        kind: 'shared_upc',
        recordingId: recording.id,
        detail: `UPC ${recording.upc} ties the release to the artist's catalog`,
      });
    }
    if (collaboratorNames(recording, input.artistName).length > 0) {
      evidence.push({
        kind: 'shared_co_artists',
        recordingId: recording.id,
        detail: `co-artist credits preserved: ${collaboratorNames(
          recording,
          input.artistName
        ).join(', ')}`,
      });
    }

    const list = placements.get(artistPageId) ?? [];
    list.push({ recording, evidence });
    placements.set(artistPageId, list);
  }

  const placedIds = [...placements.keys()];
  if (placedIds.length === 0) {
    reasons.push(
      'no approved recordings credit this artist on the provider; nothing to reconcile'
    );
    return {
      state: 'unknown',
      provider: input.provider,
      caseKey: buildCaseKey(input, placedIds),
      primaryProviderArtistId: input.primaryProviderArtistId ?? null,
      candidates: [],
      incompleteEvidence,
      reasons,
    };
  }

  // Choose the anchor page: the confirmed primary if it holds approved
  // catalog, otherwise the page holding the most recordings.
  const primaryId =
    input.primaryProviderArtistId &&
    placements.has(input.primaryProviderArtistId)
      ? input.primaryProviderArtistId
      : [...placements.entries()].sort(
          (a, b) => b[1].length - a[1].length
        )[0][0];

  const primaryBio = observationById.get(primaryId)?.bio;

  const candidates: SplitCatalogCandidate[] = [];
  for (const [providerArtistId, rows] of placements) {
    if (providerArtistId === primaryId) continue;

    const observation = observationById.get(providerArtistId);
    const evidence = rows.flatMap(r => r.evidence);

    if (
      primaryBio &&
      observation?.bio &&
      normalizeName(primaryBio) === normalizeName(observation.bio)
    ) {
      evidence.push({
        kind: 'shared_biography',
        detail:
          'both artist pages display identical public biography text (corroboration only)',
      });
    }

    candidates.push({
      provider: input.provider,
      providerArtistId,
      displayedName: observation?.displayedName,
      url: observation?.url,
      storefront: observation?.storefront,
      observedAt: asIso(observation?.observedAt),
      confidence: confidenceFor(rows.map(r => r.recording)),
      evidence,
      affectedRecordings: rows.map(({ recording }) => ({
        recordingId: recording.id,
        title: recording.title,
        providerUrl: recording.providerUrl,
        coArtists: collaboratorNames(recording, input.artistName),
      })),
    });
  }

  if (candidates.length === 0) {
    if (incompleteEvidence) {
      return {
        state: 'unknown',
        provider: input.provider,
        caseKey: buildCaseKey(input, placedIds),
        primaryProviderArtistId: primaryId,
        candidates: [],
        incompleteEvidence,
        reasons,
      };
    }
    reasons.push(
      `all ${placedIds.length === 1 ? 'approved recordings live under one provider artist ID' : 'observed placements resolve to the primary ID'}`
    );
    return {
      state: 'no_split',
      provider: input.provider,
      caseKey: buildCaseKey(input, placedIds),
      primaryProviderArtistId: primaryId,
      candidates: [],
      incompleteEvidence: false,
      reasons,
    };
  }

  reasons.push(
    `approved catalog credits resolve to ${placedIds.length} distinct provider artist IDs`
  );
  return {
    state: 'split_detected',
    provider: input.provider,
    caseKey: buildCaseKey(input, placedIds),
    primaryProviderArtistId: primaryId,
    candidates: candidates.sort((a, b) =>
      a.providerArtistId.localeCompare(b.providerArtistId)
    ),
    incompleteEvidence,
    reasons,
  };
}

function confidenceFor(
  recordings: CatalogRecordingEvidence[]
): SplitCatalogConfidence {
  const hasIsrc = recordings.some(r => r.isrc);
  const hasUpc = recordings.some(r => r.upc);
  if (hasIsrc || hasUpc) return 'high';
  if (recordings.some(r => r.credits.length > 1)) return 'medium';
  return 'low';
}

function buildCaseKey(
  input: SplitCatalogScanInput,
  placedIds: string[]
): string {
  const ids = [...placedIds].sort();
  return [
    input.provider,
    normalizeName(input.artistName),
    ids.join('+') || 'unplaced',
  ].join(':');
}
