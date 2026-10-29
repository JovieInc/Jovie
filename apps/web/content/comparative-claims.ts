/**
 * Measured comparison claims: Jovie's public profile page against a Linktree
 * page (JOV-5037 published-claims pattern, external-metric receipts).
 *
 * Every number a visitor reads comes from this file. A claim's wording is a
 * template: the figure is derived from the stored measurement and rounded in
 * the conservative direction, so copy can never promise more than was measured.
 * `scripts/benchmarks/vs-linktree.mjs` re-measures both live pages and calls
 * `evaluateComparativeClaim`; a claim whose margin falls below `minMargin` is
 * flagged and the run fails. Keep this file erasable TypeScript (no enums or
 * parameter properties): the benchmark script imports it with Node's native
 * type stripping.
 */

export const COMPARATIVE_BENCHMARK = {
  jovieUrl: 'https://jov.ie/tim',
  competitorUrl: 'https://linktr.ee/timwhite',
  competitor: 'Linktree',
  measuredAt: '2026-10-26',
  reviewAfter: '2026-11-25',
  buildSha: '6aafe66105ffaa2bddf0b6267f84d403490efce9',
  runs: 5,
  /** Shown next to every claim. Must stay a complete, neutral description. */
  method:
    'Tim White’s own page on each service, loaded in headless Chromium with Lighthouse 13 mobile emulation (slow 4G, 4x CPU slowdown, 390 px wide), five alternating runs per page, median reported. Three measurements on 2026-10-26 (00:36Z, 01:03Z, 01:24Z) agreed; the lowest margin of the three is published. They ran on a shared 16-core test host (load 6 to 42) with simulated throttling, so absolute times differ from other setups; the weekly re-measure on a GitHub-hosted runner checks every claim against its floor. Linktree’s page is a free-plan page with the default consent banner. Network counts come from the same runs; zoom and markup checks read each page’s HTML. Results vary by page, device and day.',
  methodSource:
    'https://github.com/JovieInc/Jovie/blob/main/scripts/benchmarks/vs-linktree.mjs',
} as const;

export type ComparativeMetric =
  | 'lcp-ms'
  | 'fcp-ms'
  | 'tbt-ms'
  | 'total-bytes'
  | 'js-bytes'
  | 'performance-score'
  | 'third-party-hosts'
  | 'pinch-zoom'
  | 'music-markup';

export type ComparativeDirection = 'lower-is-better' | 'higher-is-better';

export interface ComparativeMeasurement {
  readonly jovie: number;
  readonly competitor: number;
}

export interface ComparativeClaim {
  readonly id: `benchmark.vs-linktree.${string}`;
  readonly metric: ComparativeMetric;
  readonly direction: ComparativeDirection;
  /** Tokens: {x} ratio, {pct} percent better, {n} competitor count, {jv} {cp} raw medians. */
  readonly wording: string;
  readonly baseline: ComparativeMeasurement;
  /** Observed range across runs, so fragility is visible, not asserted. */
  readonly spread: {
    readonly jovie: readonly [number, number];
    readonly competitor: readonly [number, number];
  };
  /** The claim holds while the live ratio stays at or above this margin. */
  readonly minMargin: number;
  /** When set, the Jovie side must equal this exactly (wording says "no"/"zero"). */
  readonly jovieExact?: number;
  readonly robustness: 'robust' | 'fragile';
}

export const COMPARATIVE_CLAIMS = [
  {
    id: 'benchmark.vs-linktree.lcp',
    metric: 'lcp-ms',
    direction: 'lower-is-better',
    wording: 'Main content appears {x}x faster than on Linktree.',
    baseline: { jovie: 1864, competitor: 11672 },
    spread: { jovie: [1722, 2580], competitor: [11601, 15295] },
    minMargin: 3,
    robustness: 'robust',
  },
  {
    id: 'benchmark.vs-linktree.fcp',
    metric: 'fcp-ms',
    direction: 'lower-is-better',
    wording: 'First paint is faster than Linktree.',
    baseline: { jovie: 1567, competitor: 2426 },
    spread: { jovie: [1567, 1701], competitor: [2426, 6832] },
    minMargin: 1.3,
    robustness: 'robust',
  },
  {
    id: 'benchmark.vs-linktree.tbt',
    metric: 'tbt-ms',
    direction: 'lower-is-better',
    wording: 'The main thread is blocked {x}x less than on Linktree.',
    baseline: { jovie: 305, competitor: 1134 },
    spread: { jovie: [223, 341], competitor: [1049, 2671] },
    minMargin: 2,
    robustness: 'robust',
  },
  {
    id: 'benchmark.vs-linktree.weight',
    metric: 'total-bytes',
    direction: 'lower-is-better',
    wording: '{pct}% lighter than Linktree.',
    baseline: { jovie: 1228847, competitor: 2138728 },
    spread: { jovie: [1228644, 1229124], competitor: [2138600, 2139101] },
    minMargin: 1.3,
    robustness: 'robust',
  },
  {
    id: 'benchmark.vs-linktree.javascript',
    metric: 'js-bytes',
    direction: 'lower-is-better',
    wording: '{pct}% less JavaScript than Linktree.',
    baseline: { jovie: 999716, competitor: 1550370 },
    spread: { jovie: [999521, 999755], competitor: [1550186, 1550603] },
    minMargin: 1.2,
    robustness: 'robust',
  },
  {
    id: 'benchmark.vs-linktree.third-party',
    metric: 'third-party-hosts',
    direction: 'lower-is-better',
    wording:
      'No third-party requests on load. Linktree’s page contacts {n} third-party hosts.',
    baseline: { jovie: 0, competitor: 5 },
    spread: { jovie: [0, 0], competitor: [5, 5] },
    minMargin: 2,
    jovieExact: 0,
    robustness: 'robust',
  },
  {
    id: 'benchmark.vs-linktree.performance-score',
    metric: 'performance-score',
    direction: 'higher-is-better',
    wording:
      'Lighthouse mobile performance score of {jv}, against {cp} for Linktree.',
    baseline: { jovie: 91, competitor: 43 },
    spread: { jovie: [81, 93], competitor: [30, 43] },
    minMargin: 1.5,
    robustness: 'robust',
  },
  {
    id: 'benchmark.vs-linktree.pinch-zoom',
    metric: 'pinch-zoom',
    direction: 'higher-is-better',
    wording: 'Pinch to zoom works. Linktree’s page turns it off.',
    baseline: { jovie: 1, competitor: 0 },
    spread: { jovie: [1, 1], competitor: [0, 0] },
    minMargin: 1.01,
    robustness: 'robust',
  },
  {
    id: 'benchmark.vs-linktree.music-markup',
    metric: 'music-markup',
    direction: 'higher-is-better',
    wording:
      'Search engines can read structured data about releases and recordings.',
    baseline: { jovie: 1, competitor: 0 },
    spread: { jovie: [1, 1], competitor: [0, 0] },
    minMargin: 1.01,
    robustness: 'robust',
  },
] as const satisfies readonly ComparativeClaim[];

export type ComparativeClaimId = (typeof COMPARATIVE_CLAIMS)[number]['id'];

export interface ComparativeEvaluation {
  readonly claimId: string;
  readonly holds: boolean;
  /** How many times better Jovie is; Infinity when the competitor-worse side is a clean zero. */
  readonly ratio: number;
  readonly reason: string;
}

/** Times better Jovie is than the competitor, direction-aware. */
export function comparativeRatio(
  direction: ComparativeDirection,
  measurement: ComparativeMeasurement
): number {
  const { jovie, competitor } = measurement;
  if (direction === 'lower-is-better') {
    if (jovie <= 0) return competitor > 0 ? Number.POSITIVE_INFINITY : 1;
    return competitor / jovie;
  }
  if (competitor <= 0) return jovie > 0 ? Number.POSITIVE_INFINITY : 1;
  return jovie / competitor;
}

export function evaluateComparativeClaim(
  claim: Pick<ComparativeClaim, 'id' | 'direction' | 'minMargin'> & {
    readonly jovieExact?: number;
  },
  live: ComparativeMeasurement
): ComparativeEvaluation {
  const values = [live.jovie, live.competitor];
  if (values.some(value => !Number.isFinite(value) || value < 0)) {
    return {
      claimId: claim.id,
      holds: false,
      ratio: Number.NaN,
      reason: 'measurement is not a finite non-negative number',
    };
  }
  const ratio = comparativeRatio(claim.direction, live);
  if (claim.jovieExact !== undefined && live.jovie !== claim.jovieExact) {
    return {
      claimId: claim.id,
      holds: false,
      ratio,
      reason: `Jovie measured ${live.jovie} where the wording requires exactly ${claim.jovieExact}`,
    };
  }
  const holds = ratio >= claim.minMargin;
  return {
    claimId: claim.id,
    holds,
    ratio,
    reason: holds
      ? `margin ${formatRatio(ratio)} meets the ${claim.minMargin}x floor`
      : `margin ${formatRatio(ratio)} is below the ${claim.minMargin}x floor`,
  };
}

function formatRatio(ratio: number): string {
  return Number.isFinite(ratio) ? `${ratio.toFixed(2)}x` : 'unbounded';
}

/** Round down so a published figure never exceeds the measurement. */
function floorTo(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

export function renderComparativeClaim(
  claim: Pick<ComparativeClaim, 'wording' | 'direction' | 'baseline'>
): string {
  const ratio = comparativeRatio(claim.direction, claim.baseline);
  const whole = Number.isFinite(ratio) ? Math.max(1, floorTo(ratio, 1)) : 0;
  const pct = Number.isFinite(ratio) ? Math.floor((1 - 1 / ratio) * 100) : 100;
  return claim.wording
    .replaceAll('{x}', String(whole))
    .replaceAll('{pct}', String(pct))
    .replaceAll('{n}', String(claim.baseline.competitor))
    .replaceAll('{jv}', String(claim.baseline.jovie))
    .replaceAll('{cp}', String(claim.baseline.competitor));
}

export function renderedComparativeClaims(): readonly string[] {
  return COMPARATIVE_CLAIMS.map(renderComparativeClaim);
}

/** The scoped answer shown on /compare/linktree, built only from receipts. */
export function comparativeAnswer(): string {
  const lines = renderedComparativeClaims().join(' ');
  return `${lines} Measured ${COMPARATIVE_BENCHMARK.measuredAt} on jov.ie build ${COMPARATIVE_BENCHMARK.buildSha.slice(0, 10)}. Method: ${COMPARATIVE_BENCHMARK.method}`;
}

// The Node benchmark loads this producer; the web registry checks its inferred
// receipts against PublishedClaimReceipt without a reverse import.
function receiptFor(claim: ComparativeClaim) {
  return {
    id: claim.id,
    statement: `${renderComparativeClaim(claim)} (${claim.metric}: Jovie ${claim.baseline.jovie}, ${COMPARATIVE_BENCHMARK.competitor} ${claim.baseline.competitor}; ${claim.robustness}).`,
    evidence: [
      COMPARATIVE_BENCHMARK.jovieUrl,
      COMPARATIVE_BENCHMARK.competitorUrl,
      COMPARATIVE_BENCHMARK.methodSource,
    ],
    owner: 'marketing-architecture',
    verifiedAt: COMPARATIVE_BENCHMARK.measuredAt,
    reviewAfter: COMPARATIVE_BENCHMARK.reviewAfter,
  } as const;
}

export const COMPARATIVE_CLAIM_RECEIPTS = Object.fromEntries(
  COMPARATIVE_CLAIMS.map(claim => [claim.id, receiptFor(claim)])
) as Readonly<Record<ComparativeClaimId, ReturnType<typeof receiptFor>>>;

export const COMPARATIVE_CLAIM_IDS = COMPARATIVE_CLAIMS.map(
  claim => claim.id
) as readonly ComparativeClaimId[];

/** Registrable-domain approximation: last two labels, three for common second-level TLDs. */
export function registrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const secondLevel = new Set(['co', 'com', 'org', 'net', 'ac', 'gov']);
  const keep = secondLevel.has(labels[labels.length - 2] ?? '') ? 3 : 2;
  return labels.slice(-keep).join('.');
}

export function thirdPartyHosts(
  pageUrl: string,
  requestUrls: readonly string[]
): readonly string[] {
  const first = registrableDomain(new URL(pageUrl).hostname);
  const hosts = new Set<string>();
  for (const raw of requestUrls) {
    let hostname: string;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
      hostname = url.hostname;
    } catch {
      continue;
    }
    if (registrableDomain(hostname) !== first) hosts.add(hostname);
  }
  return [...hosts].sort();
}

/** WCAG 1.4.4: a page that blocks scaling or caps it below 2x fails pinch zoom. */
export function allowsPinchZoom(viewportContent: string | null): boolean {
  if (!viewportContent) return true;
  const directives = new Map<string, string>();
  for (const part of viewportContent.split(/[,;]/u)) {
    const [key, value] = part.split('=').map(item => item.trim().toLowerCase());
    if (key && value !== undefined) directives.set(key, value);
  }
  const scalable = directives.get('user-scalable');
  if (scalable === 'no' || scalable === '0') return false;
  const max = Number.parseFloat(directives.get('maximum-scale') ?? '');
  return !(Number.isFinite(max) && max < 2);
}

export function hasMusicMarkup(jsonLdBlocks: readonly string[]): boolean {
  return jsonLdBlocks.some(block =>
    /"@type"\s*:\s*(\[[^\]]*)?"Music(Group|Recording|Album)"/u.test(block)
  );
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}
