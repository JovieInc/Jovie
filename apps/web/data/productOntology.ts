import { APP_ROUTES } from '@/constants/routes';
import type {
  AppFlagName,
  PartialAppFlagSnapshot,
} from '@/lib/flags/contracts';

/** Bump when a shipped label, destination, or availability projection changes. */
export const PRODUCT_PROJECTION_VERSION = 1;
export const PRODUCT_PROJECTION_LOCALES = ['en'] as const;

export const TOP_LEVEL_PRODUCT_CONCEPTS = ['identity', 'work'] as const;

export type TopLevelProductConcept =
  (typeof TOP_LEVEL_PRODUCT_CONCEPTS)[number];

export const PRODUCT_ONTOLOGY = {
  identity: {
    label: 'Identity',
    previousLabels: ['Presence', 'Profiles'],
    requiredFlag: 'PROFILES_WORKSPACE',
    screenIds: ['web.presence'],
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
    previousLabels: ['Library'],
    screenIds: ['web.library'],
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
    readonly previousLabels: readonly string[];
    readonly requiredFlag?: AppFlagName;
    readonly screenIds: readonly string[];
    readonly definition: string;
    readonly canonicalRoute: `/app${string}`;
    readonly compatibilityRoutes: readonly `/app${string}`[];
    readonly contextualRoutes?: readonly `/app${string}`[];
    readonly capabilities: readonly string[];
  }
>;

/** Display references, never an authorization or tool-capability grant. */
export function getProductProjection(
  flags: PartialAppFlagSnapshot,
  locale = 'en'
) {
  if (!PRODUCT_PROJECTION_LOCALES.some(supported => supported === locale)) {
    throw new Error(`Product labels are not defined for locale ${locale}`);
  }
  return {
    schema: 'product-projection/v1' as const,
    version: PRODUCT_PROJECTION_VERSION,
    locale,
    flags: { PROFILES_WORKSPACE: flags.PROFILES_WORKSPACE === true },
    features: TOP_LEVEL_PRODUCT_CONCEPTS.flatMap(featureId => {
      const feature = PRODUCT_ONTOLOGY[featureId];
      if ('requiredFlag' in feature && flags[feature.requiredFlag] !== true) {
        return [];
      }
      return [
        {
          featureId,
          label: feature.label,
          destination: feature.canonicalRoute,
        },
      ];
    }),
  };
}

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
