/**
 * UniversalLinkInput Utilities
 *
 * Shared utility functions for link input components.
 */

import {
  CATEGORY_ORDER,
  type PLATFORM_OPTIONS,
  type PlatformCategory,
} from '../universalLinkInput.constants';

type PlatformOption = (typeof PLATFORM_OPTIONS)[number];

/** Minimum query length required for fuzzy search */
const MIN_FUZZY_QUERY_LENGTH = 2;

/**
 * Normalize a query string for comparison.
 */
export function normalizeQuery(value: string): string {
  return value.toLowerCase().replaceAll(/\s+/g, ' ').trim();
}

/**
 * Check if a value looks like a URL or domain.
 */
export function looksLikeUrlOrDomain(value: string): boolean {
  const v = normalizeQuery(value);
  if (!v) return false;
  if (v.startsWith('http://') || v.startsWith('https://')) return true;
  if (v.includes('/') || v.includes('?') || v.includes('#')) return true;
  // "x.com", "instagram.com/tim" should be treated as URL intent.
  if (v.includes('.')) return true;
  return false;
}

interface FuzzyMatchState {
  score: number;
  lastMatchIdx: number;
  targetIdx: number;
  matchIndices: number[];
}

/**
 * Find the next match for a character in the target string.
 * Returns updated state if found, null if not found.
 */
function findNextMatch(
  char: string,
  target: string,
  state: FuzzyMatchState
): FuzzyMatchState | null {
  let { targetIdx } = state;

  while (targetIdx < target.length) {
    if (target[targetIdx] === char) {
      const consecutive = state.lastMatchIdx === targetIdx - 1;
      const pointsAdded = consecutive ? 3 : 1;

      return {
        score: state.score + pointsAdded,
        lastMatchIdx: targetIdx,
        targetIdx: targetIdx + 1,
        matchIndices: [...state.matchIndices, targetIdx],
      };
    }
    targetIdx += 1;
  }

  return null;
}

/**
 * Apply bonus scoring based on match quality.
 */
function applyBonusScoring(
  baseScore: number,
  query: string,
  target: string
): number {
  let score = baseScore;

  // Bonus for exact prefix match
  if (target.startsWith(query)) {
    score += 6;
  }

  // Penalty for longer targets (prefer "x" over "twitter")
  score -= Math.min(target.length, 40) * 0.05;

  return score;
}

export interface FuzzyMatchResult {
  score: number;
  matchIndices: number[];
}

/**
 * Calculate a fuzzy match score between a query and target string.
 * Returns null if no match, otherwise a score and match indices.
 */
export function fuzzyMatch(
  queryRaw: string,
  targetRaw: string
): FuzzyMatchResult | null {
  const query = normalizeQuery(queryRaw);
  const target = normalizeQuery(targetRaw);
  if (!query) return null;

  let state: FuzzyMatchState = {
    score: 0,
    lastMatchIdx: -1,
    targetIdx: 0,
    matchIndices: [],
  };

  for (let qIdx = 0; qIdx < query.length; qIdx += 1) {
    const qChar = query[qIdx];
    if (qChar === ' ') continue;

    const nextState = findNextMatch(qChar, target, state);
    if (!nextState) return null;

    state = nextState;
  }

  return {
    score: applyBonusScoring(state.score, query, target),
    matchIndices: state.matchIndices,
  };
}

/**
 * Calculate a fuzzy match score between a query and target string.
 * Returns null if no match, otherwise a score (higher is better).
 * @deprecated Use fuzzyMatch instead to get match indices for highlighting
 */
export function fuzzyScore(queryRaw: string, targetRaw: string): number | null {
  const result = fuzzyMatch(queryRaw, targetRaw);
  return result?.score ?? null;
}

/**
 * Get the best match indices for highlighting a platform name.
 * Tries matching against both name and id, returns indices for the name.
 */
export function getMatchIndices(query: string, name: string): number[] {
  const result = fuzzyMatch(query, name);
  return result?.matchIndices ?? [];
}

export type RankedPlatformOption = PlatformOption & {
  matchIndices: number[];
};

/**
 * Get popular platforms filtered by existing platforms, grouped by category.
 * Used when query is too short for meaningful fuzzy search.
 */
export function getPopularPlatforms(
  options: readonly PlatformOption[],
  existingPlatforms: readonly string[]
): RankedPlatformOption[] {
  const existing = new Set(existingPlatforms);

  return options
    .filter(option => {
      if (option.id === 'youtube') return true;
      return !existing.has(option.id) && option.popular;
    })
    .map(option => ({ ...option, matchIndices: [] }));
}

/**
 * Group platforms by category in a specified order.
 */
export function groupByCategory(options: RankedPlatformOption[]): {
  category: PlatformCategory;
  label: string;
  options: RankedPlatformOption[];
}[] {
  const groups = new Map<PlatformCategory, RankedPlatformOption[]>();

  for (const option of options) {
    const existing = groups.get(option.category) ?? [];
    existing.push(option);
    groups.set(option.category, existing);
  }

  const categoryLabels: Record<PlatformCategory, string> = {
    music: 'Music',
    social: 'Social',
    video: 'Video',
    other: 'Other',
  };

  return CATEGORY_ORDER.filter(cat => groups.has(cat)).map(cat => ({
    category: cat,
    label: categoryLabels[cat],
    options: groups.get(cat) ?? [],
  }));
}

/**
 * Rank platform options by fuzzy match score against a query.
 * Filters out platforms that already exist (except YouTube which can appear multiple times).
 * For short queries (< 2 chars), returns popular platforms instead.
 */
export function rankPlatformOptions(
  query: string,
  options: readonly PlatformOption[],
  existingPlatforms: readonly string[]
): RankedPlatformOption[] {
  const trimmed = normalizeQuery(query);
  const existing = new Set(existingPlatforms);

  // For very short queries, return popular platforms (no fuzzy matching)
  if (trimmed.length < MIN_FUZZY_QUERY_LENGTH) {
    return getPopularPlatforms(options, existingPlatforms);
  }

  const scored = options
    .filter(option => {
      // Allow YouTube selection even if present (it can live in multiple sections).
      if (option.id === 'youtube') return true;
      return !existing.has(option.id);
    })
    .map(option => {
      const byName = fuzzyMatch(query, option.name);
      const byId = fuzzyMatch(query, option.id.replaceAll('-', ' '));

      // Pick the best score, but always use name's match indices for highlighting
      const nameScore = byName?.score ?? -Infinity;
      const idScore = byId?.score ?? -Infinity;
      const bestScore = Math.max(nameScore, idScore);

      // Use name match indices if available, otherwise derive from id match
      const matchIndices = byName?.matchIndices ?? [];

      return {
        option,
        score: Number.isFinite(bestScore) ? bestScore : null,
        matchIndices,
      };
    })
    .filter(
      (
        entry
      ): entry is {
        option: PlatformOption;
        score: number;
        matchIndices: number[];
      } => typeof entry.score === 'number'
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(entry => ({ ...entry.option, matchIndices: entry.matchIndices }));

  return scored;
}

/**
 * List of unsafe URL prefixes that should be blocked.
 */
export const UNSAFE_URL_PREFIXES = [
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'mailto:',
] as const;

/**
 * Check if a URL contains potentially dangerous content.
 */
export function isUnsafeUrl(url: string): boolean {
  const lowered = url.toLowerCase();
  const hasEncodedControl = /%(0a|0d|09|00)/i.test(lowered);
  return (
    UNSAFE_URL_PREFIXES.some(prefix => lowered.startsWith(prefix)) ||
    hasEncodedControl
  );
}
