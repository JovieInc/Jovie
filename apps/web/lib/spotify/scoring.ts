/**
 * Spotify Algorithmic Neighbour Scoring
 *
 * Scores "Fans Also Like" artists relative to a target artist
 * to diagnose algorithmic positioning health.
 *
 * Scoring model:
 *   - popularity (0-100) is primary signal
 *   - followers is tiebreaker when popularity is within 5 points
 *   - genre overlap uses Jaccard index (intersection / union)
 *
 * Health score = % of neighbours that are BIGGER than target
 */

import type { SanitizedArtist } from './sanitize';

// ─── Types ───────────────────────────────────────────────

export type NeighbourSize = 'BIGGER' | 'SIMILAR' | 'SMALLER';

export type AuthenticityLevel = 'CLEAN' | 'CAUTION' | 'SUSPECT';
export type AlgorithmHealthStatus = 'ready' | 'empty' | 'unavailable';
export type AlgorithmHealthVerdictLabel =
  | 'Healthy'
  | 'Mixed'
  | 'Weak'
  | 'Unavailable';
export type AlgorithmHealthConfidence = 'High' | 'Medium' | 'Low';

export interface AuthenticityFlag {
  level: AuthenticityLevel;
  reasons: string[];
}

export interface AlgorithmHealthVerdict {
  label: AlgorithmHealthVerdictLabel;
  confidence: AlgorithmHealthConfidence;
  headline: string;
  detail: string;
}

export interface ScoredNeighbour {
  artist: SanitizedArtist;
  size: NeighbourSize;
  popularityDelta: number;
  followerDelta: number;
  genreOverlap: number;
  authenticity: AuthenticityFlag;
}

export interface AlgorithmHealthSummary {
  bigger: number;
  similar: number;
  smaller: number;
  total: number;
}

interface AlgorithmHealthReportBase {
  targetArtist: SanitizedArtist;
  status: AlgorithmHealthStatus;
  verdict: AlgorithmHealthVerdict;
  nextActions: string[];
  checkedAt: string;
  attemptedNeighbourCount: number;
  resolvedNeighbourCount: number;
  warnings: string[];
  neighbours: readonly ScoredNeighbour[];
  summary: AlgorithmHealthSummary;
}

export interface ReadyAlgorithmHealthReport extends AlgorithmHealthReportBase {
  status: 'ready';
  healthScore: number;
}

export interface EmptyAlgorithmHealthReport extends AlgorithmHealthReportBase {
  status: 'empty';
}

export interface UnavailableAlgorithmHealthReport
  extends AlgorithmHealthReportBase {
  status: 'unavailable';
}

export type AlgorithmHealthReport =
  | ReadyAlgorithmHealthReport
  | EmptyAlgorithmHealthReport
  | UnavailableAlgorithmHealthReport;

// ─── Scoring Functions ───────────────────────────────────

const POPULARITY_THRESHOLD = 5;
const HEALTHY_SCORE_THRESHOLD = 60;
const MIXED_SCORE_THRESHOLD = 30;

export interface GenerateHealthReportOptions {
  readonly checkedAt?: string;
  readonly attemptedNeighbourCount?: number;
  readonly warnings?: string[];
}

export interface GenerateUnavailableHealthReportOptions {
  readonly checkedAt?: string;
  readonly attemptedNeighbourCount?: number;
  readonly warnings?: string[];
  readonly detail?: string;
}

/**
 * Compare two artists and determine if the neighbour is bigger,
 * smaller, or similar to the target.
 *
 * Primary: popularity score (0-100)
 * Tiebreaker (within 5 points): follower count
 */
export function compareSize(
  targetPopularity: number,
  targetFollowers: number,
  neighbourPopularity: number,
  neighbourFollowers: number
): NeighbourSize {
  const popularityDelta = neighbourPopularity - targetPopularity;

  if (popularityDelta > POPULARITY_THRESHOLD) return 'BIGGER';
  if (popularityDelta < -POPULARITY_THRESHOLD) return 'SMALLER';

  // Within threshold: use followers as tiebreaker
  if (neighbourFollowers > targetFollowers) return 'BIGGER';
  if (neighbourFollowers < targetFollowers) return 'SMALLER';

  return 'SIMILAR';
}

/**
 * Compute genre overlap between two artists using Jaccard index.
 * Returns 0-1 (0 = no overlap, 1 = identical genres).
 */
export function computeGenreOverlap(
  genresA: string[],
  genresB: string[]
): number {
  if (genresA.length === 0 && genresB.length === 0) return 0;
  if (genresA.length === 0 || genresB.length === 0) return 0;

  const setA = new Set(genresA.map(g => g.toLowerCase()));
  const setB = new Set(genresB.map(g => g.toLowerCase()));

  let intersection = 0;
  for (const genre of setA) {
    if (setB.has(genre)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Assess authenticity of an artist based on available signals.
 *
 * Do No Harm: we must flag artists that may have botted followers/streams
 * so we don't recommend them for container playlists.
 *
 * Signals:
 * - High followers + near-zero popularity = likely botted
 * - No genres assigned despite significant followers = suspicious
 * - Extreme follower/popularity ratio = inflated metrics
 */
export function assessAuthenticity(artist: SanitizedArtist): AuthenticityFlag {
  const reasons: string[] = [];

  // Flag 1: High followers but near-zero popularity
  // A real artist with 5K+ followers should have at least popularity 5
  if (artist.followerCount > 5000 && artist.popularity < 5) {
    reasons.push('High followers but near-zero popularity');
  }

  // Flag 2: No genres despite significant following
  // Spotify assigns genres algorithmically from listener overlap.
  // No genres on an artist with 1K+ followers suggests artificial growth.
  if (artist.genres.length === 0 && artist.followerCount > 1000) {
    reasons.push('No genres despite significant followers');
  }

  // Flag 3: Extreme follower/popularity ratio (only when popularity >= 5
  // to avoid double-counting with Flag 1's near-zero popularity check)
  // Normal ratio: ~500-2000 followers per popularity point
  // Botted: 5000+ followers per popularity point
  if (artist.popularity >= 5) {
    const ratio = artist.followerCount / artist.popularity;
    if (ratio > 5000 && artist.followerCount > 2000) {
      reasons.push('Follower count vastly exceeds popularity signal');
    }
  }

  if (reasons.length >= 2) return { level: 'SUSPECT', reasons };
  if (reasons.length === 1) return { level: 'CAUTION', reasons };
  return { level: 'CLEAN', reasons: [] };
}

/**
 * Score a single neighbour relative to the target artist.
 */
export function scoreNeighbour(
  target: SanitizedArtist,
  neighbour: SanitizedArtist
): ScoredNeighbour {
  return {
    artist: neighbour,
    size: compareSize(
      target.popularity,
      target.followerCount,
      neighbour.popularity,
      neighbour.followerCount
    ),
    popularityDelta: neighbour.popularity - target.popularity,
    followerDelta: neighbour.followerCount - target.followerCount,
    genreOverlap: computeGenreOverlap(target.genres, neighbour.genres),
    authenticity: assessAuthenticity(neighbour),
  };
}

/**
 * Compute the Algorithm Health Score.
 * = (count of BIGGER neighbours / total neighbours) * 100
 *
 * Higher = more of your FAL is bigger artists = better algorithmic position.
 * Lower = you're stuck in a small-artist loop.
 */
export function computeHealthScore(neighbours: ScoredNeighbour[]): number {
  if (neighbours.length === 0) return 0;

  const bigger = neighbours.filter(n => n.size === 'BIGGER').length;
  return Math.round((bigger / neighbours.length) * 100);
}

function buildSummary(
  neighbours: readonly ScoredNeighbour[]
): AlgorithmHealthSummary {
  return {
    bigger: neighbours.filter(n => n.size === 'BIGGER').length,
    similar: neighbours.filter(n => n.size === 'SIMILAR').length,
    smaller: neighbours.filter(n => n.size === 'SMALLER').length,
    total: neighbours.length,
  };
}

function buildCheckedAt(checkedAt?: string): string {
  return checkedAt ?? new Date().toISOString();
}

function deriveConfidence(
  attemptedNeighbourCount: number,
  resolvedNeighbourCount: number,
  warnings: readonly string[]
): AlgorithmHealthConfidence {
  if (attemptedNeighbourCount === 0 || resolvedNeighbourCount === 0) {
    return 'Low';
  }

  const resolutionRate = resolvedNeighbourCount / attemptedNeighbourCount;
  if (
    resolvedNeighbourCount >= 4 &&
    resolutionRate >= 0.75 &&
    warnings.length === 0
  ) {
    return 'High';
  }

  if (resolvedNeighbourCount >= 2 && resolutionRate >= 0.4) {
    return 'Medium';
  }

  return 'Low';
}

function buildReadyVerdict(
  healthScore: number,
  confidence: AlgorithmHealthConfidence,
  summary: AlgorithmHealthSummary
): AlgorithmHealthVerdict {
  if (healthScore >= HEALTHY_SCORE_THRESHOLD) {
    return {
      label: 'Healthy',
      confidence,
      headline: 'Spotify places this creator near stronger adjacent artists.',
      detail: `${summary.bigger} of ${summary.total} compared artists are bigger than the target.`,
    };
  }

  if (healthScore >= MIXED_SCORE_THRESHOLD) {
    return {
      label: 'Mixed',
      confidence,
      headline: 'Adjacency is uneven and may be limiting discovery quality.',
      detail: `${summary.bigger} bigger, ${summary.similar} similar, and ${summary.smaller} smaller neighbours were resolved.`,
    };
  }

  return {
    label: 'Weak',
    confidence,
    headline: 'This creator appears stuck in a smaller-neighbour loop.',
    detail: `${summary.smaller} of ${summary.total} compared artists are smaller than the target.`,
  };
}

function buildEmptyVerdict(
  confidence: AlgorithmHealthConfidence
): AlgorithmHealthVerdict {
  return {
    label: 'Weak',
    confidence,
    headline: 'No comparable artists were available for a meaningful read.',
    detail:
      'Spotify did not provide enough usable related artists to judge adjacency health.',
  };
}

function buildUnavailableVerdict(
  detail: string,
  _warnings: readonly string[]
): AlgorithmHealthVerdict {
  return {
    label: 'Unavailable',
    confidence: 'Low',
    headline: 'Algorithm health is temporarily unavailable.',
    detail,
  };
}

function buildReadyNextActions(
  verdict: AlgorithmHealthVerdict,
  confidence: AlgorithmHealthConfidence
): string[] {
  const actions: string[] = [];

  if (verdict.label === 'Healthy') {
    actions.push(
      'Use these stronger neighbours as playlist, collab, and audience targeting references.',
      'Re-check after major releases or marketing spikes to confirm adjacency holds.'
    );
  } else if (verdict.label === 'Mixed') {
    actions.push(
      'Aim for placement near slightly larger artists in the same genre lane.',
      'Audit recent releases and metadata for sharper genre signaling.'
    );
  } else {
    actions.push(
      'Prioritize adjacency with slightly larger artists instead of broad genre reach.',
      'Treat the current neighbourhood as a warning that discovery quality may be compounding downward.'
    );
  }

  if (confidence !== 'High') {
    actions.push(
      'Avoid over-reading this result because source confidence is not high.'
    );
  }

  return actions;
}

function buildEmptyNextActions(): string[] {
  return [
    'Check that the creator has an active Spotify artist profile with usable related-artist data.',
    'Avoid making positioning decisions from this result until Spotify yields comparable artists.',
  ];
}

function buildUnavailableNextActions(): string[] {
  return [
    'Retry later because Spotify did not expose a usable related-artists source this time.',
    'Avoid making adjacency decisions from this result until the source is available again.',
  ];
}

function sortNeighbours(neighbours: ScoredNeighbour[]): ScoredNeighbour[] {
  const sizeOrder: Record<NeighbourSize, number> = {
    BIGGER: 0,
    SIMILAR: 1,
    SMALLER: 2,
  };

  return [...neighbours].sort((a, b) => {
    const orderDiff = sizeOrder[a.size] - sizeOrder[b.size];
    if (orderDiff !== 0) return orderDiff;
    return b.popularityDelta - a.popularityDelta;
  });
}

/**
 * Generate a full Algorithm Health Report for an artist.
 */
export function generateHealthReport(
  targetArtist: SanitizedArtist,
  relatedArtists: SanitizedArtist[],
  options: GenerateHealthReportOptions = {}
): AlgorithmHealthReport {
  const checkedAt = buildCheckedAt(options.checkedAt);
  const warnings = [...(options.warnings ?? [])];
  const attemptedNeighbourCount =
    options.attemptedNeighbourCount ?? relatedArtists.length;
  const neighbours = sortNeighbours(
    relatedArtists.map(artist => scoreNeighbour(targetArtist, artist))
  );
  const summary = buildSummary(neighbours);
  const resolvedNeighbourCount = neighbours.length;
  const confidence = deriveConfidence(
    attemptedNeighbourCount,
    resolvedNeighbourCount,
    warnings
  );

  if (neighbours.length === 0) {
    return {
      targetArtist,
      status: 'empty',
      verdict: buildEmptyVerdict(confidence),
      nextActions: buildEmptyNextActions(),
      checkedAt,
      attemptedNeighbourCount,
      resolvedNeighbourCount,
      warnings,
      neighbours,
      summary,
    };
  }

  const healthScore = computeHealthScore(neighbours);
  const verdict = buildReadyVerdict(healthScore, confidence, summary);

  return {
    targetArtist,
    status: 'ready',
    verdict,
    nextActions: buildReadyNextActions(verdict, confidence),
    checkedAt,
    attemptedNeighbourCount,
    resolvedNeighbourCount,
    warnings,
    neighbours,
    summary,
    healthScore,
  };
}

export function generateUnavailableHealthReport(
  targetArtist: SanitizedArtist,
  options: GenerateUnavailableHealthReportOptions = {}
): UnavailableAlgorithmHealthReport {
  const checkedAt = buildCheckedAt(options.checkedAt);
  const warnings = [...(options.warnings ?? [])];
  const attemptedNeighbourCount = options.attemptedNeighbourCount ?? 0;
  const detail =
    options.detail ??
    'Spotify did not expose a usable related-artists response for this creator.';

  return {
    targetArtist,
    status: 'unavailable',
    verdict: buildUnavailableVerdict(detail, warnings),
    nextActions: buildUnavailableNextActions(),
    checkedAt,
    attemptedNeighbourCount,
    resolvedNeighbourCount: 0,
    warnings,
    neighbours: [],
    summary: buildSummary([]),
  };
}

export function isSpotifyErrorPageHtml(html: string): boolean {
  const normalizedHtml = html.toLowerCase();
  return (
    normalizedHtml.includes('<title>page not available</title>') ||
    normalizedHtml.includes('<h1>page not available</h1>') ||
    normalizedHtml.includes('something went wrong, please try again later.')
  );
}
