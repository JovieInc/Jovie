import { APP_ROUTES } from '@/constants/routes';

export const TOP_LEVEL_PRODUCT_CONCEPTS = ['identity', 'work'] as const;

export type TopLevelProductConcept =
  (typeof TOP_LEVEL_PRODUCT_CONCEPTS)[number];

export const PRODUCT_ONTOLOGY = {
  identity: {
    label: 'Identity',
    definition: 'Who you are and how you are represented.',
    canonicalRoute: APP_ROUTES.PRESENCE,
    compatibilityRoutes: [
      APP_ROUTES.PROFILES,
      APP_ROUTES.DASHBOARD_PROFILE,
      APP_ROUTES.DASHBOARD_LINKS,
    ],
    contextualRoutes: [APP_ROUTES.CHAT_PROFILE_PANEL, APP_ROUTES.LINKS],
    capabilities: ['bio', 'profile', 'social', 'contact', 'search'],
  },
  work: {
    label: 'Work',
    definition: 'What you make and put into the world.',
    canonicalRoute: APP_ROUTES.LIBRARY,
    compatibilityRoutes: [
      APP_ROUTES.LEGACY_DASHBOARD_LIBRARY,
      APP_ROUTES.RELEASES,
      APP_ROUTES.DASHBOARD_RELEASES,
    ],
    capabilities: [
      'music',
      'releases',
      'videos',
      'merch',
      'products',
      'events',
      'writing',
      'campaigns',
      'shareable links',
    ],
  },
} as const satisfies Record<
  TopLevelProductConcept,
  {
    readonly label: string;
    readonly definition: string;
    readonly canonicalRoute: `/app${string}`;
    readonly compatibilityRoutes: readonly `/app${string}`[];
    readonly contextualRoutes?: readonly `/app${string}`[];
    readonly capabilities: readonly string[];
  }
>;

export const PRODUCT_REPRESENTATIONS = {
  links: {
    definition:
      'A distribution mechanism that can represent Identity or point to Work.',
    targets: TOP_LEVEL_PRODUCT_CONCEPTS,
  },
} as const;

export const WORK_AMBIGUITY_GUARDRAILS = {
  excludedMeanings: ['task', 'project', 'workspace'],
  taskLabel: 'Tasks',
  activityFeedLabel: 'Jovie Did This',
} as const;

export const PRODUCT_ONTOLOGY_FIXTURES = [
  {
    icp: 'musician',
    identity: ['artist bio', 'DSP profiles', 'social handles'],
    work: ['songs', 'releases', 'tour dates', 'merch'],
  },
  {
    icp: 'founder',
    identity: ['founder bio', 'company role', 'contact presence'],
    work: ['products', 'launches', 'campaigns', 'updates'],
  },
  {
    icp: 'author',
    identity: ['author bio', 'bylines', 'social presence'],
    work: ['books', 'essays', 'newsletters', 'events'],
  },
  {
    icp: 'creator',
    identity: ['creator profile', 'channels', 'contact details'],
    work: ['videos', 'posts', 'merch', 'brand campaigns'],
  },
  {
    icp: 'expert',
    identity: ['credentials', 'bio', 'search presence'],
    work: ['courses', 'research', 'talks', 'advisory products'],
  },
] as const satisfies readonly {
  readonly icp: string;
  readonly identity: readonly string[];
  readonly work: readonly string[];
}[];
