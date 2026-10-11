import { MARKETING_SECTION_IDS, type MarketingSectionId } from '../sections';

/**
 * Data-only projection of SOLUTIONS_SECTION_RENDERERS
 * (app/(marketing)/solutions/[audience]/sections.tsx): renderer key ->
 * canonical section id. Node scripts such as factory:run cannot import the
 * React renderer map, so they read this; a parity test fails on any drift.
 */
const ARTIST_SOLUTIONS_SECTION_KEYS = {
  'artist-hero-adaptive-intro': 'hero',
  'artist-outcomes': 'feature-grid',
  'artist-capture': 'capture',
  'artist-opinionated': 'feature-split',
  'artist-annotated-truth': 'feature-split',
  'shipped-sites-showcase': 'product-gallery',
  'platform-spec-bento': 'spec-wall',
  'artist-how-it-works': 'how-it-works',
  'artist-release-cycle': 'product-gallery',
  'artist-faq': 'faq',
  'artist-final-cta': 'cta',
} as const satisfies Readonly<Record<string, MarketingSectionId>>;

export type FactorySolutionsSectionKey = `factory-${MarketingSectionId}`;

const FACTORY_SOLUTIONS_SECTION_KEYS = Object.fromEntries(
  MARKETING_SECTION_IDS.map(sectionId => [`factory-${sectionId}`, sectionId])
) as Readonly<Record<FactorySolutionsSectionKey, MarketingSectionId>>;

export const SOLUTIONS_SECTION_KEYS = {
  ...ARTIST_SOLUTIONS_SECTION_KEYS,
  ...FACTORY_SOLUTIONS_SECTION_KEYS,
} as const satisfies Readonly<Record<string, MarketingSectionId>>;

export type SolutionsSectionKey = keyof typeof SOLUTIONS_SECTION_KEYS;

/**
 * Factory records name the reusable renderer for each canonical section.
 * Repeated section types intentionally reuse a key; `PageCompositionSection`
 * keeps their copy/media namespaces distinct through `instanceId`.
 */
export function assignSolutionsSectionKeys(
  sectionIds: readonly string[]
): (SolutionsSectionKey | null)[] {
  return sectionIds.map(sectionId => {
    const key = `factory-${sectionId}` as FactorySolutionsSectionKey;
    return Object.hasOwn(FACTORY_SOLUTIONS_SECTION_KEYS, key) ? key : null;
  });
}
