export const MARKETING_PEN_CONTRACT_IDS = {
  shell: {
    publicPage: 'C9drCF',
    header: 'KfGTq',
    footer: 'pctmZ',
    footerCta: 'LCLXI',
    finalCta: 'iY5Lp',
    page: 'sDFX1',
    container: 'x2TNM',
    containerProse: 'q24ow',
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
    faq: 'pAAhw',
    specWall: 'rWyLP',
    capture: 'Nqx7t',
    monetization: 'F3grtS',
    contentProse: 'hRysI',
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
