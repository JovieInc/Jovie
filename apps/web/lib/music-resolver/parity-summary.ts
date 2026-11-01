/**
 * Per-family shadow parity from `music_resolver_receipts` (JOV-7323).
 *
 * Pure projection. A receipt compares Jovie's answer with an independent
 * official-DSP reference. Rules that keep the numbers honest:
 * - a reference link whose provenance is the caller's own input URL is not
 *   independent evidence, so it never counts as agreement or as a miss;
 * - two different URLs for one provider are a candidate false link unless they
 *   point at different entity granularities (album vs track), which is a
 *   granularity mismatch, not a wrong artist;
 * - every rate is null when its denominator is empty.
 */

export const PARITY_SUMMARY_VERSION = 1 as const;

/** Cutover bar per family (JOV-7323 preconditions), frozen before measuring. */
export const CUTOVER_BAR = {
  minIndependentObservations: 50,
  maxFalseLinkRate: 0.001,
  minCoverage: 0.95,
} as const;

interface ReceiptResult {
  readonly status?: string;
  readonly providers?: Readonly<Record<string, string>>;
  readonly provenance?: Readonly<Record<string, string>>;
  readonly entity?: {
    readonly isrc?: string | null;
    readonly upc?: string | null;
  };
}

export interface ShadowReceipt {
  readonly corpusSeedId?: string | null;
  readonly observedAt?: string;
  readonly territory?: string;
  readonly results?: {
    readonly jovie?: ReceiptResult;
    readonly reference?: ReceiptResult;
  };
}

export interface ProviderParity {
  readonly provider: string;
  /** Reference has an independent link for this provider. */
  readonly independentObservations: number;
  readonly agreements: number;
  readonly candidateFalseLinks: number;
  readonly granularityMismatches: number;
  readonly misses: number;
  /** Jovie link with no independent reference to check it against. */
  readonly unverifiedJovieLinks: number;
  readonly coverage: number | null;
  readonly falseLinkRate: number | null;
}

export interface FamilyVerdict {
  readonly family: 'provider_links' | 'release_facts';
  readonly meetsBar: boolean;
  readonly blockers: readonly string[];
}

export interface ParitySummary {
  readonly version: typeof PARITY_SUMMARY_VERSION;
  readonly receipts: number;
  readonly corpusReceipts: number;
  readonly organicReceipts: number;
  readonly firstObservedAt: string | null;
  readonly lastObservedAt: string | null;
  readonly providers: readonly ProviderParity[];
  readonly falseLinkAlarm: {
    readonly firing: boolean;
    readonly candidateFalseLinks: number;
    readonly rate: number | null;
  };
  readonly releaseFacts: {
    readonly isrcCompared: number;
    readonly isrcAgreements: number;
    readonly upcCompared: number;
    readonly upcAgreements: number;
  };
  readonly families: readonly FamilyVerdict[];
}

const rate = (num: number, den: number) =>
  den ? Math.round((num / den) * 10_000) / 10_000 : null;

/** Entity granularity encoded in a DSP URL path, when recognizable. */
export function urlEntityType(url: string): string | null {
  try {
    const { hostname, pathname, searchParams } = new URL(url);
    if (/youtube\.com$|youtu\.be$/.test(hostname)) {
      if (pathname.startsWith('/shorts/')) return 'short';
      if (pathname === '/watch' && searchParams.get('v')) return 'video';
      if (pathname.startsWith('/playlist')) return 'playlist';
    }
    if (searchParams.get('i')) return 'track';
    const segment = pathname
      .split('/')
      .filter(Boolean)
      .find(part => /^(track|album|artist|song|playlist|release)$/.test(part));
    return segment === 'song' ? 'track' : (segment ?? null);
  } catch {
    return null;
  }
}

export function summarizeShadowParity(
  receipts: readonly ShadowReceipt[]
): ParitySummary {
  const stats = new Map<
    string,
    {
      independent: number;
      agree: number;
      falseLinks: number;
      granularity: number;
      misses: number;
      unverified: number;
    }
  >();
  const stat = (provider: string) => {
    let entry = stats.get(provider);
    if (!entry) {
      entry = {
        independent: 0,
        agree: 0,
        falseLinks: 0,
        granularity: 0,
        misses: 0,
        unverified: 0,
      };
      stats.set(provider, entry);
    }
    return entry;
  };
  const facts = {
    isrcCompared: 0,
    isrcAgreements: 0,
    upcCompared: 0,
    upcAgreements: 0,
  };
  const times: string[] = [];
  let corpus = 0;
  for (const receipt of receipts) {
    if (receipt.corpusSeedId) corpus += 1;
    if (receipt.observedAt) times.push(receipt.observedAt);
    const jovie = receipt.results?.jovie ?? {};
    const reference = receipt.results?.reference ?? {};
    const jovieLinks = jovie.providers ?? {};
    const referenceLinks = reference.providers ?? {};
    const providers = new Set([
      ...Object.keys(jovieLinks),
      ...Object.keys(referenceLinks),
    ]);
    for (const provider of providers) {
      const mine = jovieLinks[provider];
      const theirs = referenceLinks[provider];
      const independent =
        theirs !== undefined &&
        reference.provenance?.[provider] !== 'input_url';
      const entry = stat(provider);
      if (!independent) {
        if (mine !== undefined) entry.unverified += 1;
        continue;
      }
      entry.independent += 1;
      if (mine === undefined) entry.misses += 1;
      else if (mine === theirs) entry.agree += 1;
      else if (urlEntityType(mine) !== urlEntityType(theirs))
        entry.granularity += 1;
      else entry.falseLinks += 1;
    }
    for (const field of ['isrc', 'upc'] as const) {
      const left = jovie.entity?.[field];
      const right = reference.entity?.[field];
      if (!left || !right) continue;
      facts[`${field}Compared`] += 1;
      if (left === right) facts[`${field}Agreements`] += 1;
    }
  }
  const providers = [...stats.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([provider, s]) => ({
      provider,
      independentObservations: s.independent,
      agreements: s.agree,
      candidateFalseLinks: s.falseLinks,
      granularityMismatches: s.granularity,
      misses: s.misses,
      unverifiedJovieLinks: s.unverified,
      coverage: rate(s.independent - s.misses, s.independent),
      falseLinkRate: rate(s.falseLinks, s.independent - s.misses),
    }));
  const independent = providers.reduce(
    (n, p) => n + p.independentObservations,
    0
  );
  const answered = providers.reduce(
    (n, p) => n + p.independentObservations - p.misses,
    0
  );
  const falseLinks = providers.reduce((n, p) => n + p.candidateFalseLinks, 0);
  const coverage = rate(answered, independent);
  const falseLinkRate = rate(falseLinks, answered);
  const linkBlockers: string[] = [];
  if (receipts.length - corpus < CUTOVER_BAR.minIndependentObservations)
    linkBlockers.push('not_representative:organic_receipts_below_minimum');
  if (independent < CUTOVER_BAR.minIndependentObservations)
    linkBlockers.push('insufficient_independent_observations');
  if (falseLinkRate === null || falseLinkRate > CUTOVER_BAR.maxFalseLinkRate)
    linkBlockers.push('false_link_rate_above_bar_or_unmeasured');
  if (coverage === null || coverage < CUTOVER_BAR.minCoverage)
    linkBlockers.push('coverage_below_bar_or_unmeasured');
  const factCompared = facts.isrcCompared + facts.upcCompared;
  const factAgree = facts.isrcAgreements + facts.upcAgreements;
  const factBlockers: string[] = [];
  if (factCompared < CUTOVER_BAR.minIndependentObservations)
    factBlockers.push('insufficient_identifier_comparisons');
  if (
    factCompared &&
    factAgree / factCompared < 1 - CUTOVER_BAR.maxFalseLinkRate
  )
    factBlockers.push('identifier_disagreement_above_bar');
  times.sort();
  return {
    version: PARITY_SUMMARY_VERSION,
    receipts: receipts.length,
    corpusReceipts: corpus,
    organicReceipts: receipts.length - corpus,
    firstObservedAt: times[0] ?? null,
    lastObservedAt: times.at(-1) ?? null,
    providers,
    falseLinkAlarm: {
      firing: falseLinks > 0,
      candidateFalseLinks: falseLinks,
      rate: falseLinkRate,
    },
    releaseFacts: facts,
    families: [
      {
        family: 'provider_links',
        meetsBar: linkBlockers.length === 0,
        blockers: linkBlockers,
      },
      {
        family: 'release_facts',
        meetsBar: factBlockers.length === 0,
        blockers: factBlockers,
      },
    ],
  };
}
