/**
 * UniversalLinkInput Utilities
 *
 * Shared utility functions for link input components.
 */

import type { PLATFORM_OPTIONS } from '../universalLinkInput.constants';

type PlatformOption = (typeof PLATFORM_OPTIONS)[number];

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

/**
 * Calculate a fuzzy match score between a query and target string.
 * Returns null if no match, otherwise a score (higher is better).
 */
export function fuzzyScore(queryRaw: string, targetRaw: string): number | null {
  const query = normalizeQuery(queryRaw);
  const target = normalizeQuery(targetRaw);
  if (!query) return null;

  let state: FuzzyMatchState = {
    score: 0,
    lastMatchIdx: -1,
    targetIdx: 0,
  };

  for (let qIdx = 0; qIdx < query.length; qIdx += 1) {
    const qChar = query[qIdx];
    if (qChar === ' ') continue;

    const nextState = findNextMatch(qChar, target, state);
    if (!nextState) return null;

    state = nextState;
  }

  return applyBonusScoring(state.score, query, target);
}

/**
 * Rank platform options by fuzzy match score against a query.
 * Filters out platforms that already exist (except YouTube which can appear multiple times).
 */
export function rankPlatformOptions(
  query: string,
  options: readonly PlatformOption[],
  existingPlatforms: readonly string[]
): PlatformOption[] {
  const existing = new Set(existingPlatforms);
  const scored = options
    .filter(option => {
      // Allow YouTube selection even if present (it can live in multiple sections).
      if (option.id === 'youtube') return true;
      return !existing.has(option.id);
    })
    .map(option => {
      const byName = fuzzyScore(query, option.name);
      const byId = fuzzyScore(query, option.id.replaceAll('-', ' '));
      const best = Math.max(byName ?? -Infinity, byId ?? -Infinity);
      return { option, score: Number.isFinite(best) ? best : null };
    })
    .filter(
      (entry): entry is { option: PlatformOption; score: number } =>
        typeof entry.score === 'number'
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(entry => entry.option);

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
