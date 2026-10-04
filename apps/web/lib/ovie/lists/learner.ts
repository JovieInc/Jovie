import type { PreferenceExample } from './model';

/**
 * List auto-fill learner. Deliberately small and explainable: a weighted
 * naive-Bayes log-odds ranker over creator features that ingestion already
 * stores (genres, Spotify followers/popularity, location, active-since year,
 * claim/verify state). Each list trains its own model from its own labels,
 * so "Collab list" and "Press" learn different taste.
 *
 * Scope: proposes candidates for one list. It is not the lead-qualification
 * or outreach ranker (JOV-6650 owns commercial ranking) and never auto-adds;
 * the founder accepts or skips every suggestion.
 */

export interface CreatorFeatures {
  readonly id: string;
  readonly genres?: readonly string[] | null;
  readonly spotifyFollowers?: number | null;
  readonly spotifyPopularity?: number | null;
  readonly location?: string | null;
  readonly activeSinceYear?: number | null;
  readonly isVerified?: boolean | null;
  readonly isClaimed?: boolean | null;
}

export interface SuggestionReason {
  readonly feature: string;
  readonly text: string;
  readonly contribution: number;
}

export interface RankedCandidate {
  readonly creatorId: string;
  readonly score: number;
  readonly reasons: readonly SuggestionReason[];
}

export const MIN_POSITIVE_EXAMPLES = 2;
const SMOOTHING = 0.5;
const MAX_GENRE_TOKENS = 3;
const MAX_REASONS = 3;

const FOLLOWER_TIERS: readonly [number, string][] = [
  [1_000, 'under 1K'],
  [10_000, '1K-10K'],
  [100_000, '10K-100K'],
  [1_000_000, '100K-1M'],
];

function followerTier(followers: number): string {
  for (const [ceiling, label] of FOLLOWER_TIERS) {
    if (followers < ceiling) return label;
  }
  return '1M+';
}

function normalizeToken(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Feature tokens, each `kind:value`. Missing data yields no token. */
export function creatorFeatureTokens(creator: CreatorFeatures): string[] {
  const tokens: string[] = [];
  const genres = [
    ...new Set((creator.genres ?? []).map(normalizeToken).filter(Boolean)),
  ];
  for (const genre of genres) tokens.push(`genre:${genre}`);
  if (typeof creator.spotifyFollowers === 'number') {
    tokens.push(`followers:${followerTier(creator.spotifyFollowers)}`);
  }
  if (typeof creator.spotifyPopularity === 'number') {
    const band = Math.min(4, Math.floor(creator.spotifyPopularity / 20));
    tokens.push(`popularity:${band * 20}-${band * 20 + 20}`);
  }
  if (creator.location) {
    // "Los Angeles, CA" and "los angeles" should agree: key on the city.
    const city = normalizeToken(creator.location.split(',')[0] ?? '');
    if (city) tokens.push(`location:${city}`);
  }
  if (typeof creator.activeSinceYear === 'number') {
    tokens.push(`era:${Math.floor(creator.activeSinceYear / 5) * 5}`);
  }
  if (creator.isVerified) tokens.push('verified:yes');
  if (creator.isClaimed !== undefined && creator.isClaimed !== null) {
    tokens.push(`claimed:${creator.isClaimed ? 'yes' : 'no'}`);
  }
  return tokens;
}

interface TokenStats {
  positiveWeight: number;
  negativeWeight: number;
  positiveCount: number;
}

export interface ListPreferenceModel {
  readonly positiveExamples: number;
  readonly negativeExamples: number;
  readonly totalPositiveWeight: number;
  readonly totalNegativeWeight: number;
  readonly tokens: ReadonlyMap<string, TokenStats>;
}

export function trainListModel(
  examples: readonly PreferenceExample[],
  creatorsById: ReadonlyMap<string, CreatorFeatures>
): ListPreferenceModel {
  const tokens = new Map<string, TokenStats>();
  let positiveExamples = 0;
  let negativeExamples = 0;
  let totalPositiveWeight = 0;
  let totalNegativeWeight = 0;

  for (const example of examples) {
    const creator = creatorsById.get(example.creatorId);
    if (!creator) continue;
    if (example.label === 1) {
      positiveExamples += 1;
      totalPositiveWeight += example.weight;
    } else {
      negativeExamples += 1;
      totalNegativeWeight += example.weight;
    }
    for (const token of creatorFeatureTokens(creator)) {
      const stats = tokens.get(token) ?? {
        positiveWeight: 0,
        negativeWeight: 0,
        positiveCount: 0,
      };
      if (example.label === 1) {
        stats.positiveWeight += example.weight;
        stats.positiveCount += 1;
      } else {
        stats.negativeWeight += example.weight;
      }
      tokens.set(token, stats);
    }
  }

  return {
    positiveExamples,
    negativeExamples,
    totalPositiveWeight,
    totalNegativeWeight,
    tokens,
  };
}

function tokenLogOdds(model: ListPreferenceModel, stats: TokenStats): number {
  const pPositive =
    (stats.positiveWeight + SMOOTHING) /
    (model.totalPositiveWeight + 2 * SMOOTHING);
  const pNegative =
    (stats.negativeWeight + SMOOTHING) /
    (model.totalNegativeWeight + 2 * SMOOTHING);
  return Math.log(pPositive / pNegative);
}

function describeToken(
  token: string,
  stats: TokenStats,
  positives: number
): string {
  const [kind, ...rest] = token.split(':');
  const value = rest.join(':');
  const share = `${stats.positiveCount} of ${positives} picks`;
  switch (kind) {
    case 'genre':
      return `Shares ${value} with ${share}`;
    case 'followers':
      return `${value} Spotify followers, like ${share}`;
    case 'popularity':
      return `Spotify popularity ${value}, like ${share}`;
    case 'location':
      return `Based in ${value}, like ${share}`;
    case 'era':
      return `Active since ${value}s, like ${share}`;
    case 'verified':
      return `Verified, like ${share}`;
    case 'claimed':
      return `${value === 'yes' ? 'Claimed' : 'Unclaimed'} profile, like ${share}`;
    default:
      return `Matches ${share}`;
  }
}

export function scoreCandidate(
  model: ListPreferenceModel,
  creator: CreatorFeatures
): RankedCandidate {
  const contributions: SuggestionReason[] = [];
  let genreTokens = 0;
  for (const token of creatorFeatureTokens(creator)) {
    const stats = model.tokens.get(token);
    // Unseen tokens carry no evidence either way.
    if (!stats) continue;
    if (token.startsWith('genre:')) {
      if (genreTokens >= MAX_GENRE_TOKENS) continue;
      genreTokens += 1;
    }
    contributions.push({
      feature: token,
      text: describeToken(token, stats, model.positiveExamples),
      contribution: tokenLogOdds(model, stats),
    });
  }
  const score = contributions.reduce((sum, c) => sum + c.contribution, 0);
  const reasons = contributions
    .filter(
      c =>
        c.contribution > 0 &&
        (model.tokens.get(c.feature)?.positiveCount ?? 0) > 0
    )
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, MAX_REASONS);
  return { creatorId: creator.id, score, reasons };
}

/**
 * Rank candidates for one list. Returns nothing until the list has enough
 * positive examples to say why; every returned candidate has a positive
 * score and at least one reason.
 */
export function rankListCandidates(input: {
  readonly examples: readonly PreferenceExample[];
  readonly creatorsById: ReadonlyMap<string, CreatorFeatures>;
  readonly candidates: readonly CreatorFeatures[];
  /** Creators already on, passed from, or suggested for the list. */
  readonly excludeIds: ReadonlySet<string>;
  readonly limit: number;
}): RankedCandidate[] {
  const model = trainListModel(input.examples, input.creatorsById);
  if (model.positiveExamples < MIN_POSITIVE_EXAMPLES) return [];

  return input.candidates
    .filter(candidate => !input.excludeIds.has(candidate.id))
    .map(candidate => scoreCandidate(model, candidate))
    .filter(ranked => ranked.score > 0 && ranked.reasons.length > 0)
    .sort((a, b) => b.score - a.score || a.creatorId.localeCompare(b.creatorId))
    .slice(0, input.limit);
}
