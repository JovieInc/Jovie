/**
 * AEO Citation Monitoring
 *
 * Tracks whether Jovie artist profile URLs are cited by answer engines
 * (Perplexity, ChatGPT/SearchGPT, Gemini, Bing Copilot, etc.) when users
 * ask canonical questions about an artist.
 *
 * Pure logic — no DB access. Storage is caller's responsibility.
 */

import { computeRatePercent } from '@/lib/analytics/metrics';

/** Known answer engines to query */
export type CitationEngine =
  | 'perplexity'
  | 'chatgpt'
  | 'gemini'
  | 'bing_copilot'
  | 'claude'
  | 'you';

/** A single citation check result */
export interface CitationResult {
  readonly engine: CitationEngine;
  readonly question: string;
  readonly profileUrl: string;
  /** Whether the profile URL (or its domain) appeared in the engine's response */
  readonly cited: boolean;
  /** The specific URL fragment that matched, if any */
  readonly matchedUrl: string | null;
  /** ISO timestamp of when the check was run */
  readonly checkedAt: string;
}

/** Aggregated citation statistics across engines and questions */
export interface CitationStats {
  /** Total checks performed */
  readonly totalChecks: number;
  /** How many checks resulted in a citation */
  readonly citedCount: number;
  /** Share-of-citation (0–1) across all checks */
  readonly shareOfCitation: number;
  /** Per-engine breakdown */
  readonly byEngine: ReadonlyArray<{
    readonly engine: CitationEngine;
    readonly totalChecks: number;
    readonly citedCount: number;
    readonly shareOfCitation: number;
  }>;
}

/** Canonical question templates for an artist */
export interface CanonicalQuestion {
  readonly question: string;
  /** Category helps prioritize which questions matter most for AEO */
  readonly category: 'identity' | 'release' | 'touring' | 'merch';
}

/**
 * Generate canonical questions an AI user might ask about an artist.
 * These are the exact queries to submit to answer engines when monitoring
 * citations.
 */
export function buildCanonicalQuestions(
  artistName: string
): CanonicalQuestion[] {
  return [
    {
      question: `Who is ${artistName}?`,
      category: 'identity',
    },
    {
      question: `Where is ${artistName} from?`,
      category: 'identity',
    },
    {
      question: `What is ${artistName}'s latest release?`,
      category: 'release',
    },
    {
      question: `Is ${artistName} touring?`,
      category: 'touring',
    },
    {
      question: `Where can I buy ${artistName} merch?`,
      category: 'merch',
    },
    {
      question: `What genre is ${artistName}?`,
      category: 'identity',
    },
  ];
}

/**
 * Extract all URLs mentioned in an engine's response text.
 * Handles markdown link syntax, bare URLs, and citation footnotes.
 */
function extractUrlsFromText(text: string): string[] {
  const urls: string[] = [];

  // Bare URLs and markdown links: [text](url) and plain https://...
  const urlPattern = /https?:\/\/[^\s<>")\]]+/gi;
  const matches = text.match(urlPattern);
  if (matches) {
    urls.push(...matches.map(u => u.replace(/[.,;:!?]+$/, '')));
  }

  return [...new Set(urls)];
}

/**
 * Check whether a response text cites the given profile URL.
 *
 * A citation is counted when any URL in the response matches the profile URL
 * (exact) or the Jovie profile path (/handle pattern).
 */
export function parseCitationResponse(
  responseText: string,
  profileUrl: string
): { cited: boolean; matchedUrl: string | null } {
  if (!responseText || !profileUrl) {
    return { cited: false, matchedUrl: null };
  }

  const extractedUrls = extractUrlsFromText(responseText);

  // Normalize both sides for comparison
  const normalizeUrl = (url: string) =>
    url
      .toLowerCase()
      .replace(/\/?$/, '')
      .replace(/^https?:\/\//, '');

  const normalizedProfile = normalizeUrl(profileUrl);

  for (const url of extractedUrls) {
    const normalized = normalizeUrl(url);
    if (
      normalized === normalizedProfile ||
      normalized.startsWith(`${normalizedProfile}/`) ||
      // Also match the base jov.ie domain + handle path
      (normalizedProfile.startsWith('jov.ie/') &&
        normalized === normalizedProfile)
    ) {
      return { cited: true, matchedUrl: url };
    }
  }

  return { cited: false, matchedUrl: null };
}

/**
 * Compute aggregated citation statistics from a list of results.
 *
 * Call this after collecting results from multiple engine queries to get
 * the share-of-citation metric suitable for the dashboard tile.
 */
export function computeCitationStats(results: CitationResult[]): CitationStats {
  if (results.length === 0) {
    return {
      totalChecks: 0,
      citedCount: 0,
      shareOfCitation: 0,
      byEngine: [],
    };
  }

  const totalChecks = results.length;
  const citedCount = results.filter(r => r.cited).length;

  // Group by engine
  const engineMap = new Map<CitationEngine, { total: number; cited: number }>();
  for (const result of results) {
    const existing = engineMap.get(result.engine) ?? { total: 0, cited: 0 };
    engineMap.set(result.engine, {
      total: existing.total + 1,
      cited: existing.cited + (result.cited ? 1 : 0),
    });
  }

  const byEngine = [...engineMap.entries()].map(([engine, counts]) => ({
    engine,
    totalChecks: counts.total,
    citedCount: counts.cited,
    shareOfCitation:
      counts.total > 0
        ? Math.round((counts.cited / counts.total) * 1000) / 1000
        : 0,
  }));

  return {
    totalChecks,
    citedCount,
    shareOfCitation: Math.round((citedCount / totalChecks) * 1000) / 1000,
    byEngine,
  };
}

/**
 * Format share-of-citation as a percentage string for display.
 * e.g. 0.667 → "66.7%"
 */
export function formatShareOfCitation(share: number): string {
  if (!Number.isFinite(share) || share < 0) return '0%';
  // share is a 0–1 fraction; render as a 1-decimal percentage via the
  // canonical derivation helper (denominator 1 → share * 100).
  return `${computeRatePercent(share, 1, 1)}%`;
}

/**
 * Determine whether a citation score represents improvement, decline, or steady.
 * Used for dashboard trend badges.
 */
export function classifyCitationTrend(
  current: number,
  previous: number
): 'up' | 'down' | 'steady' {
  const delta = current - previous;
  if (Math.abs(delta) <= 0.05) return 'steady'; // ≤ 5pp change = steady
  return delta > 0 ? 'up' : 'down';
}
