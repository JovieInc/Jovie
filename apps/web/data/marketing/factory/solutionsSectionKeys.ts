import type { MarketingSectionId } from '../sections';

/**
 * Data-only projection of SOLUTIONS_SECTION_RENDERERS
 * (app/(marketing)/solutions/[audience]/sections.tsx): renderer key ->
 * canonical section id. Node scripts such as factory:run cannot import the
 * React renderer map, so they read this; a parity test fails on any drift.
 */
export const SOLUTIONS_SECTION_KEYS = {
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

export type SolutionsSectionKey = keyof typeof SOLUTIONS_SECTION_KEYS;

/**
 * Picks one renderer per section, in order, never reusing a key. Returns
 * null for a section id no renderer implements.
 */
export function assignSolutionsSectionKeys(
  sectionIds: readonly string[]
): (SolutionsSectionKey | null)[] {
  const used = new Set<string>();
  return sectionIds.map(sectionId => {
    const key = (
      Object.keys(SOLUTIONS_SECTION_KEYS) as SolutionsSectionKey[]
    ).find(
      candidate =>
        SOLUTIONS_SECTION_KEYS[candidate] === sectionId && !used.has(candidate)
    );
    if (!key) return null;
    used.add(key);
    return key;
  });
}
