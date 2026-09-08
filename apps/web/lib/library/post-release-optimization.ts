export const LIBRARY_POST_RELEASE_OPTIMIZATION = {
  kind: 'product',
  variantIdentityPrefix: 'library-content-card',
  exposure:
    'audience-event impression/click or locked YouTube measurement window',
  outcome: 'attributed GMV or paid conversion for the same content context',
  attribution: 'release-to-revenue plus analytics session and decisionEvidence',
  eligibleContextDimensions: [
    'platform',
    'medium-or-channel',
    'country-or-locale',
    'genre-or-cohort',
    'artist-plus-career-era-or-lifecycle',
    'content-variant',
    'consented-audience-segment',
  ] as const,
  hypothesis:
    'Evidence-backed Library presence and packaging lift paid conversion',
  primaryMetric:
    'artist-business-outcome: paid conversion or attributed GMV per eligible exposure',
  guardrails: 'complaint, trust, brand',
  privacyAndConsent:
    'first-party consented behavior only; no sensitive demographic inference',
  optimizerOwner: 'Library product / Symphony',
  cadence: 'weekly decision with writeback after a locked measurement window',
  decisionWriteback:
    'optimization_experiments.decisionEvidence; never auto-promote gated classes',
  rollbackOrControl:
    'revert to control; no auto-promote of identity, legal, privacy, or spend',
  surfaces: {
    analytics: 'apps/web/lib/analytics/metrics.ts',
    modelExperiment: 'apps/web/lib/db/schema/model-experiments.ts',
    audienceEvent: 'apps/web/lib/audience/record-audience-event.ts',
    youtubeExperiment: 'apps/web/lib/youtube-library/thumbnail-experiments.ts',
    releaseToRevenue: 'apps/web/lib/release-to-revenue/gmv-attribution.ts',
    experimentLedger: 'apps/web/lib/db/schema/library-content-graph.ts',
  },
} as const;

export function libraryPostReleaseVariantIdentity(input: {
  readonly kind: string;
  readonly canonicalId: string;
  readonly experimentId: string;
  readonly variantKey: string;
}): string {
  return `${LIBRARY_POST_RELEASE_OPTIMIZATION.variantIdentityPrefix}:${input.kind}:${input.canonicalId}:${input.experimentId}:${input.variantKey}`;
}

export function parseOptimizationVariantKeys(
  variants: unknown
): readonly string[] {
  if (Array.isArray(variants)) {
    return variants.flatMap(item => {
      if (typeof item === 'string' && item.trim()) return [item];
      if (item && typeof item === 'object' && 'key' in item) {
        const key = (item as { readonly key?: unknown }).key;
        return typeof key === 'string' && key.trim() ? [key] : [];
      }
      return [];
    });
  }
  if (variants && typeof variants === 'object') {
    return Object.keys(variants as Record<string, unknown>).filter(
      key => key.trim().length > 0
    );
  }
  return [];
}

export function canAutoPromotePostReleaseVariant(input: {
  readonly findingKind: 'repair' | 'collision' | 'placement_opportunity';
  readonly involvesIdentityOrBrand: boolean;
  readonly involvesLegalOrPrivacy: boolean;
  readonly involvesExternalPublication: boolean;
  readonly involvesMaterialSpend: boolean;
}): boolean {
  return (
    input.findingKind === 'placement_opportunity' &&
    !input.involvesIdentityOrBrand &&
    !input.involvesLegalOrPrivacy &&
    !input.involvesExternalPublication &&
    !input.involvesMaterialSpend
  );
}
