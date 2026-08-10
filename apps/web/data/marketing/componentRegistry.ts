/** Server-safe canonical projection of marketing shells, sections, and recipes. */

import {
  MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH,
  MARKETING_PEN_CONTRACT_IDS,
  type MarketingPenContractId,
} from './penContracts';
import { MARKETING_RECIPES, type RecipeId, type RecipeStatus } from './recipes';
import {
  MARKETING_SECTIONS,
  type MarketingSectionId,
  type MarketingVariant,
} from './sections';

export type MarketingRegistryKind = 'shell' | 'section' | 'recipe';

interface MarketingPenRootResolution {
  readonly sourceBacked: boolean;
  readonly resolvedSource: string | null;
  readonly exportName: string | null;
  readonly penRootIds: readonly MarketingPenContractId[];
  readonly penVariantRoots?: Readonly<Record<string, MarketingPenContractId>>;
  readonly rootProofs: readonly MarketingPenRootProof[];
  readonly unresolvedReason?: string;
}

export interface MarketingPenRootProof {
  readonly source: string;
  readonly binding: string;
  readonly occurrences: number;
  readonly kind?: 'jsx-root' | 'source';
}

export interface MarketingShellRegistryEntry
  extends MarketingPenRootResolution {
  readonly id: `shell.${string}`;
  readonly kind: 'shell';
  readonly source: string;
  readonly storybookTitle: `Marketing/Shells/${string}`;
}

export interface MarketingSectionRegistryEntry
  extends MarketingPenRootResolution {
  readonly id: `section.${MarketingSectionId}`;
  readonly kind: 'section';
  readonly sectionId: MarketingSectionId;
  readonly source: string;
  readonly storybookTitle: `Marketing/Sections/${MarketingSectionId}`;
  readonly variants: readonly MarketingVariant['id'][];
  readonly defaultVariant: string;
  readonly maxPerComposition?: number;
}

export interface MarketingRecipeRegistryEntry
  extends MarketingPenRootResolution {
  readonly id: `recipe.${RecipeId}`;
  readonly kind: 'recipe';
  readonly recipeId: RecipeId;
  readonly status: RecipeStatus;
  readonly source: string | null;
  readonly referenceRoute: string | null;
  readonly storybookTitle: `Marketing/Recipes/${RecipeId}`;
}

export type MarketingRegistryEntry =
  | MarketingShellRegistryEntry
  | MarketingSectionRegistryEntry
  | MarketingRecipeRegistryEntry;

const shell = (
  id: MarketingShellRegistryEntry['id'],
  source: string,
  exportName: string,
  storybookTitle: MarketingShellRegistryEntry['storybookTitle'],
  penRootIds: readonly MarketingPenContractId[],
  rootBinding: string,
  delegatedProofs: readonly MarketingPenRootProof[] = [],
  penVariantRoots?: Readonly<Record<string, MarketingPenContractId>>
): MarketingShellRegistryEntry => ({
  id,
  kind: 'shell',
  source,
  storybookTitle,
  sourceBacked: true,
  resolvedSource: `${source}.tsx`,
  exportName,
  penRootIds,
  penVariantRoots,
  rootProofs: [
    { source: `${source}.tsx`, binding: rootBinding, occurrences: 1 },
    ...delegatedProofs,
  ],
});

/** One registry identity per reusable shell source concept (JOV-4940). */
export const MARKETING_SHELL_REGISTRY = [
  shell(
    'shell.public-page',
    'apps/web/components/site/PublicPageShell',
    'PublicPageShell',
    'Marketing/Shells/PublicPageShell',
    [MARKETING_PEN_CONTRACT_IDS.shell.publicPage],
    'data-pen-contract={MARKETING_PEN_CONTRACT_IDS.shell.publicPage}'
  ),
  shell(
    'shell.header',
    'apps/web/components/site/MarketingHeader',
    'MarketingHeader',
    'Marketing/Shells/MarketingHeader',
    [MARKETING_PEN_CONTRACT_IDS.shell.header],
    'penContractId={MARKETING_PEN_CONTRACT_IDS.shell.header}',
    [
      {
        source: 'apps/web/components/organisms/HeaderNav.tsx',
        binding: 'data-pen-contract={penContractId}',
        occurrences: 1,
      },
    ]
  ),
  shell(
    'shell.footer',
    'apps/web/components/site/MarketingFooter',
    'MarketingFooter',
    'Marketing/Shells/MarketingFooter',
    [MARKETING_PEN_CONTRACT_IDS.shell.footer],
    'data-pen-contract={MARKETING_PEN_CONTRACT_IDS.shell.footer}'
  ),
  shell(
    'shell.footer-cta',
    'apps/web/components/site/MarketingFooterCta',
    'MarketingFooterCta',
    'Marketing/Shells/MarketingFooterCta',
    [MARKETING_PEN_CONTRACT_IDS.shell.footerCta],
    'penContractId={MARKETING_PEN_CONTRACT_IDS.shell.footerCta}',
    [
      {
        source: 'apps/web/components/site/MarketingTerminalCta.tsx',
        binding: 'data-pen-contract={penContractId}',
        occurrences: 1,
      },
    ]
  ),
  shell(
    'shell.final-cta',
    'apps/web/components/site/MarketingFinalCTA',
    'MarketingFinalCTA',
    'Marketing/Shells/MarketingFinalCTA',
    [MARKETING_PEN_CONTRACT_IDS.shell.finalCta],
    'penContractId={MARKETING_PEN_CONTRACT_IDS.shell.finalCta}',
    [
      {
        source: 'apps/web/components/site/MarketingTerminalCta.tsx',
        binding: 'data-pen-contract={penContractId}',
        occurrences: 1,
      },
    ]
  ),
  shell(
    'shell.page',
    'apps/web/components/marketing/MarketingPageShell',
    'MarketingPageShell',
    'Marketing/Shells/MarketingPageShell',
    [MARKETING_PEN_CONTRACT_IDS.shell.page],
    'data-pen-contract={penContractId}',
    [
      {
        source: 'apps/web/components/marketing/MarketingPageShell.tsx',
        binding: 'penContractId = MARKETING_PEN_CONTRACT_IDS.shell.page',
        occurrences: 1,
        kind: 'source',
      },
    ]
  ),
  shell(
    'shell.container',
    'apps/web/components/marketing/MarketingContainer',
    'MarketingContainer',
    'Marketing/Shells/MarketingContainer/page',
    [MARKETING_PEN_CONTRACT_IDS.shell.container],
    'data-pen-contract={MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH[width]}',
    [],
    { prose: MARKETING_CONTAINER_PEN_CONTRACT_BY_WIDTH.prose }
  ),
  shell(
    'shell.prose',
    'apps/web/components/marketing/MarketingContentShell',
    'MarketingContentShell',
    'Marketing/Shells/MarketingContentShell',
    [MARKETING_PEN_CONTRACT_IDS.shell.prose],
    'data-pen-contract={MARKETING_PEN_CONTRACT_IDS.shell.prose}'
  ),
] as const satisfies readonly MarketingShellRegistryEntry[];

type SourceResolution = MarketingPenRootResolution & {
  readonly source?: string | null;
};

const unresolved = (reason: string): SourceResolution => ({
  sourceBacked: false,
  resolvedSource: null,
  exportName: null,
  penRootIds: [],
  rootProofs: [],
  unresolvedReason: reason,
});

const sourceRoot = (
  resolvedSource: string,
  exportName: string,
  penRootId: MarketingPenContractId,
  rootBinding: string,
  occurrences = 1,
  delegatedProofs: readonly MarketingPenRootProof[] = []
): SourceResolution => ({
  sourceBacked: true,
  resolvedSource,
  exportName,
  penRootIds: [penRootId],
  rootProofs: [
    { source: resolvedSource, binding: rootBinding, occurrences },
    ...delegatedProofs,
  ],
});

const SECTION_RESOLUTIONS = {
  hero: sourceRoot(
    'apps/web/components/marketing/MarketingHero.tsx',
    'MarketingHero',
    MARKETING_PEN_CONTRACT_IDS.section.hero,
    'data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.hero}',
    3
  ),
  'logo-cloud': sourceRoot(
    'apps/web/components/features/home/HomeTrustSection.tsx',
    'HomeTrustSection',
    MARKETING_PEN_CONTRACT_IDS.section.logoCloud,
    'data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.logoCloud}'
  ),
  'feature-grid': sourceRoot(
    'apps/web/components/marketing/artist-profile/ArtistProfileOutcomesCarousel.tsx',
    'ArtistProfileOutcomesCarousel',
    MARKETING_PEN_CONTRACT_IDS.section.featureGrid,
    'penContractId={MARKETING_PEN_CONTRACT_IDS.section.featureGrid}',
    1,
    [
      {
        source:
          'apps/web/components/marketing/artist-profile/ArtistProfileSectionShell.tsx',
        binding: 'data-pen-contract={penContractId}',
        occurrences: 1,
      },
    ]
  ),
  'feature-split': unresolved(
    'The registered ArtistProfileAdaptiveIntro export does not exist on current main.'
  ),
  'how-it-works': sourceRoot(
    'apps/web/components/marketing/artist-profile/ArtistProfileHowItWorks.tsx',
    'ArtistProfileHowItWorks',
    MARKETING_PEN_CONTRACT_IDS.section.howItWorks,
    'penContractId={MARKETING_PEN_CONTRACT_IDS.section.howItWorks}',
    1,
    [
      {
        source:
          'apps/web/components/marketing/artist-profile/ArtistProfileSectionShell.tsx',
        binding: 'data-pen-contract={penContractId}',
        occurrences: 1,
      },
    ]
  ),
  'social-proof': sourceRoot(
    'apps/web/components/marketing/artist-profile/ArtistProfileSocialProof.tsx',
    'ArtistProfileSocialProof',
    MARKETING_PEN_CONTRACT_IDS.section.socialProof,
    'penContractId={MARKETING_PEN_CONTRACT_IDS.section.socialProof}',
    1,
    [
      {
        source:
          'apps/web/components/marketing/artist-profile/ArtistProfileSectionShell.tsx',
        binding: 'data-pen-contract={penContractId}',
        occurrences: 1,
      },
    ]
  ),
  stats: sourceRoot(
    'apps/web/components/features/home/HomeStatQuoteSection.tsx',
    'HomeStatQuoteSection',
    MARKETING_PEN_CONTRACT_IDS.section.stats,
    'data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.stats}'
  ),
  pricing: sourceRoot(
    'apps/web/components/features/pricing/MarketingPricingPlans.tsx',
    'MarketingPricingPlans',
    MARKETING_PEN_CONTRACT_IDS.section.pricing,
    'data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.pricing}'
  ),
  comparison: unresolved(
    'ComparisonData is data-only and has no canonical renderer root.'
  ),
  faq: sourceRoot(
    'apps/web/components/marketing/FaqSection.tsx',
    'FaqSection',
    MARKETING_PEN_CONTRACT_IDS.section.faq,
    'data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.faq}'
  ),
  cta: unresolved(
    'A production shell root exists, but section.cta convergence is pending JOV-4954.'
  ),
  'spec-wall': sourceRoot(
    'apps/web/components/marketing/artist-profile/ArtistProfileSpecWall.tsx',
    'ArtistProfileSpecWall',
    MARKETING_PEN_CONTRACT_IDS.section.specWall,
    'penContractId={MARKETING_PEN_CONTRACT_IDS.section.specWall}',
    2,
    [
      {
        source:
          'apps/web/components/marketing/artist-profile/ArtistProfileSectionShell.tsx',
        binding: 'data-pen-contract={penContractId}',
        occurrences: 1,
      },
    ]
  ),
  capture: sourceRoot(
    'apps/web/components/marketing/artist-profile/ArtistProfileCaptureSection.tsx',
    'ArtistProfileCaptureSection',
    MARKETING_PEN_CONTRACT_IDS.section.capture,
    'penContractId={MARKETING_PEN_CONTRACT_IDS.section.capture}',
    2,
    [
      {
        source:
          'apps/web/components/marketing/artist-profile/ArtistProfileSectionShell.tsx',
        binding: 'data-pen-contract={penContractId}',
        occurrences: 1,
      },
    ]
  ),
  monetization: sourceRoot(
    'apps/web/components/marketing/artist-profile/ArtistProfileMonetizationSection.tsx',
    'ArtistProfileMonetizationSection',
    MARKETING_PEN_CONTRACT_IDS.section.monetization,
    'penContractId={MARKETING_PEN_CONTRACT_IDS.section.monetization}',
    1,
    [
      {
        source:
          'apps/web/components/marketing/artist-profile/ArtistProfileSectionShell.tsx',
        binding: 'data-pen-contract={penContractId}',
        occurrences: 1,
      },
    ]
  ),
  ownership: unresolved(
    'The registry explicitly names a future component and has no source export.'
  ),
  'content-prose': sourceRoot(
    'apps/web/components/marketing/MarketingContentProse.tsx',
    'MarketingContentProse',
    MARKETING_PEN_CONTRACT_IDS.section.contentProse,
    'data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.contentProse}'
  ),
  'blog-feed': unresolved(
    'The registered BlogCard path does not resolve to the shared BlogFeed root.'
  ),
} as const satisfies Record<MarketingSectionId, SourceResolution>;

export const MARKETING_SECTION_REGISTRY: readonly MarketingSectionRegistryEntry[] =
  MARKETING_SECTIONS.map(section => ({
    id: `section.${section.id}` as const,
    kind: 'section' as const,
    sectionId: section.id,
    ...SECTION_RESOLUTIONS[section.id],
    source: section.component,
    storybookTitle: `Marketing/Sections/${section.id}` as const,
    variants: section.variants.map(variant => variant.id),
    defaultVariant: section.defaultVariant,
    ...(section.id === 'hero' ? { maxPerComposition: 1 } : {}),
  }));

const recipeSource = (
  source: string,
  exportName: string,
  penRootId: MarketingPenContractId,
  rootBinding: string
): SourceResolution => ({
  ...sourceRoot(source, exportName, penRootId, rootBinding, 1, [
    {
      source: 'apps/web/components/marketing/MarketingPageShell.tsx',
      binding: 'data-pen-contract={penContractId}',
      occurrences: 1,
    },
  ]),
  source,
});

const RECIPE_RESOLUTIONS = {
  homepage: recipeSource(
    'apps/web/components/marketing/homepage-v2/HomepageV2Route.tsx',
    'HomepageV2Route',
    MARKETING_PEN_CONTRACT_IDS.recipe.homepage,
    'penContractId={MARKETING_PEN_CONTRACT_IDS.recipe.homepage}'
  ),
  pricing: unresolved(
    'Route and canonical story do not share one complete recipe body.'
  ),
  'artist-lp': recipeSource(
    'apps/web/components/marketing/artist-profile/ArtistProfileLandingRoute.tsx',
    'ArtistProfileLandingRoute',
    MARKETING_PEN_CONTRACT_IDS.recipe.artistLp,
    'penContractId={MARKETING_PEN_CONTRACT_IDS.recipe.artistLp}'
  ),
  feature: recipeSource(
    'apps/web/components/marketing/artist-notifications/ArtistNotificationsLanding.tsx',
    'ArtistNotificationsLanding',
    MARKETING_PEN_CONTRACT_IDS.recipe.feature,
    'penContractId={MARKETING_PEN_CONTRACT_IDS.recipe.feature}'
  ),
  'agency-lp': unresolved('Proposal-only recipe with no production body.'),
  enterprise: unresolved('Proposal-only recipe with no production body.'),
  comparison: unresolved(
    'Route and story duplicate markup and have no shared recipe root.'
  ),
  launch: unresolved(
    'The production launch body is route-local and the story is an approximation.'
  ),
  waitlist: unresolved('Proposal-only recipe with no production body.'),
  seo: unresolved('The routes have no shared canonical SEO recipe body.'),
  'blog-landing': unresolved(
    'The shared BlogFeed is a section body, not the complete registered recipe.'
  ),
  'newsletter-signup': unresolved(
    'Proposal-only recipe with no production body.'
  ),
} as const satisfies Record<RecipeId, SourceResolution>;

export const MARKETING_RECIPE_REGISTRY: readonly MarketingRecipeRegistryEntry[] =
  MARKETING_RECIPES.map(recipe => {
    const resolution = RECIPE_RESOLUTIONS[recipe.id];
    return {
      id: `recipe.${recipe.id}` as const,
      kind: 'recipe' as const,
      recipeId: recipe.id,
      status: recipe.status,
      source: resolution.source ?? null,
      referenceRoute: recipe.referenceRoute ?? null,
      storybookTitle: `Marketing/Recipes/${recipe.id}` as const,
      ...resolution,
    };
  });

export const MARKETING_COMPONENT_REGISTRY: readonly MarketingRegistryEntry[] = [
  ...MARKETING_SHELL_REGISTRY,
  ...MARKETING_SECTION_REGISTRY,
  ...MARKETING_RECIPE_REGISTRY,
];

export type MarketingPenRegistryIssueCode =
  | 'duplicate-contract-id'
  | 'duplicate-pen-root'
  | 'unresolved-source-root'
  | 'unresolved-row-has-production-root';

export interface MarketingPenRegistryIssue {
  readonly code: MarketingPenRegistryIssueCode;
  readonly id: string;
}

export function validateMarketingPenRegistry(
  entries: readonly MarketingRegistryEntry[] = MARKETING_COMPONENT_REGISTRY
): readonly MarketingPenRegistryIssue[] {
  const issues: MarketingPenRegistryIssue[] = [];
  const ids = new Set<string>();
  const roots = new Set<string>();

  for (const entry of entries) {
    if (ids.has(entry.id)) {
      issues.push({ code: 'duplicate-contract-id', id: entry.id });
    }
    ids.add(entry.id);

    if (
      entry.sourceBacked &&
      (!entry.resolvedSource ||
        !entry.exportName ||
        entry.rootProofs.length === 0 ||
        entry.penRootIds.length !== 1)
    ) {
      issues.push({ code: 'unresolved-source-root', id: entry.id });
    }

    if (!entry.sourceBacked && entry.penRootIds.length > 0) {
      issues.push({
        code: 'unresolved-row-has-production-root',
        id: entry.id,
      });
    }

    const rootsForEntry = [
      ...entry.penRootIds,
      ...Object.values(entry.penVariantRoots ?? {}),
    ];
    for (const root of rootsForEntry) {
      if (roots.has(root)) {
        issues.push({ code: 'duplicate-pen-root', id: entry.id });
      }
      roots.add(root);
    }
  }

  return issues;
}

export const MARKETING_COMPOSITION_CONTRACT = {
  shell: 'shell.public-page',
  hero: { sectionId: 'hero', exactly: 1, first: true },
  sections: {
    source: 'MARKETING_SECTION_REGISTRY',
    unregisteredAllowed: false,
  },
} as const;

const REGISTRY_BY_ID: Readonly<Record<string, MarketingRegistryEntry>> =
  Object.fromEntries(
    MARKETING_COMPONENT_REGISTRY.map(entry => [entry.id, entry])
  );

export function getMarketingRegistryEntry(
  id: string
): MarketingRegistryEntry | null {
  return REGISTRY_BY_ID[id] ?? null;
}

export function getMarketingSectionRegistryEntry(
  sectionId: string
): MarketingSectionRegistryEntry | null {
  const entry = getMarketingRegistryEntry(`section.${sectionId}`);
  return entry?.kind === 'section' ? entry : null;
}
