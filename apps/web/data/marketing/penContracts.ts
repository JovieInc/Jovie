/**
 * Production Pen contract IDs for marketing shells, sections, and recipes.
 *
 * Header `GTcgO` and footer `jhV4a` are founder-locked (Tim 2026-09-11
 * ~9:21 PT, JOV-6179). Shared `PublicPageShell` chrome must emit these
 * selectors. Do not remap without a new lock.
 */
export const MARKETING_PEN_CONTRACT_IDS = {
  shell: {
    publicPage: 'C9drCF',
    header: 'GTcgO',
    footer: 'jhV4a',
    footerCta: 'DiH2U',
    finalCta: 'DKVHD',
    page: 'sDFX1',
    container: 'x2TNM',
    containerProse: 'ZVDFa',
    prose: 'ND9fM',
  },
  section: {
    hero: 'SijpA',
    logoCloud: 'bKvfJ',
    featureGrid: 'pM23w',
    featureSplit: 'kQ4vN',
    howItWorks: 'rsv9G',
    socialProof: 'RVUME',
    stats: 'fkRn8',
    pricing: 'D34VIr',
    /** Registry index read natively 2026-09-29. Visual import/owner approval remains pending. */
    comparison: 'x5gKwl',
    faq: 'pAAhw',
    specWall: 'rWyLP',
    /** Native existing demonstration gallery owners read 2026-09-29; not adoption proof. */
    productGallery: 'NGW0P',
    productGalleryReleaseRail: 'EnK3s',
    capture: 'Nqx7t',
    monetization: 'F3grtS',
    contentProse: 'hRysI',
    /**
     * Pen registry entry `y8oKXI` ("Registry Entry / CTA") points at design
     * owner `K4ar1`. The footer/final CTA shells stay adapters under it.
     */
    cta: 'y8oKXI',
  },
  recipe: {
    homepage: 'oPZHQ',
    artistLp: 'DRJv9',
    feature: 'aYlGH',
  },
} as const;

type NestedValues<T> = T extends string
  ? T
  : T extends object
    ? { [K in keyof T]: NestedValues<T[K]> }[keyof T]
    : never;

export type MarketingPenContractId = NestedValues<
  typeof MARKETING_PEN_CONTRACT_IDS
>;

export const MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH = {
  landing: MARKETING_PEN_CONTRACT_IDS.shell.container,
  page: MARKETING_PEN_CONTRACT_IDS.shell.container,
  prose: MARKETING_PEN_CONTRACT_IDS.shell.containerProse,
} as const;

export function marketingPenSelector(
  id: MarketingPenContractId
): `[data-pen-contract="${MarketingPenContractId}"]` {
  return `[data-pen-contract="${id}"]`;
}
