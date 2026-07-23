import { APP_ROUTES, buildLyricsRoute } from '../constants/routes';
import {
  resolveActiveProfileOnboardingPath,
  resolveChatConversationPerfPath,
  resolveReleaseTasksPerfPath,
  resolveSeededProfileModePath,
  resolveSeededProfilePath,
  resolveSeededPublicCatchAllPath,
  resolveSeededPublicReleasePath,
  resolveSeededPublicTrackPath,
} from './performance-route-resolvers';

export type PerfTimingMetricName =
  | 'first-contentful-paint'
  | 'largest-contentful-paint'
  | 'cumulative-layout-shift'
  | 'first-input-delay'
  | 'interactive-shell-ready'
  | 'time-to-first-byte'
  | 'skeleton-to-content'
  | 'warm-shell-response'
  | 'redirect-complete';

export type PerfResourceMetricName =
  | 'script'
  | 'image'
  | 'font'
  | 'stylesheet'
  | 'total';

export type PerfRouteGroup =
  | 'home'
  | 'marketing-public'
  | 'legal-public'
  | 'public-profile-core'
  | 'public-profile-mode-shell'
  | 'public-profile-detail'
  | 'creator-shell'
  | 'creator-alias'
  | 'account-billing'
  | 'onboarding'
  | 'auth';

export type PerfRouteSurface =
  | 'homepage'
  | 'marketing'
  | 'legal'
  | 'public-profile'
  | 'creator-app'
  | 'account-billing'
  | 'onboarding'
  | 'auth';

export type PerfWarmupStrategy =
  | 'none'
  | 'public-route'
  | 'authenticated-route'
  | 'authenticated-shell';

export type PerfMeasureMode =
  | 'page-load'
  | 'interactive-shell'
  | 'redirect'
  | 'same-route-interaction'
  | 'warm-navigation';

export interface PerfTimingBudget {
  readonly metric: PerfTimingMetricName;
  readonly budget: number;
}

export interface PerfResourceBudget {
  readonly resourceType: PerfResourceMetricName;
  readonly budget: number;
}

export interface PerfReadySelectors {
  readonly shell?: readonly string[];
  readonly content?: readonly string[];
  readonly loading?: readonly string[];
  readonly navTrigger?: readonly string[];
  readonly redirectDestinations?: readonly string[];
}

export interface PerfAuthCookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
}

export interface PerfResolveContext {
  readonly authCookies: readonly PerfAuthCookie[];
  readonly baseUrl: string;
}

export interface PerfRouteDefinition {
  readonly id: string;
  readonly group: PerfRouteGroup;
  readonly surface: PerfRouteSurface;
  readonly path: string;
  readonly navigationItemId?: string;
  readonly interactionStartPath?: string;
  readonly warmNavigationStartPath?: string;
  readonly resolvePath?: (
    route: PerfRouteDefinition,
    context: PerfResolveContext
  ) => Promise<string>;
  readonly requiresAuth: boolean;
  readonly warmupStrategy: PerfWarmupStrategy;
  readonly measureMode: PerfMeasureMode;
  readonly readySelectors: PerfReadySelectors;
  readonly timingBudgets?: readonly PerfTimingBudget[];
  readonly resourceBudgets?: readonly PerfResourceBudget[];
  readonly timings?: readonly PerfTimingBudget[];
  readonly resourceSizes?: readonly PerfResourceBudget[];
  readonly priority: number;
  readonly seedProfile?: string;
}

export function getRouteTimingBudgets(route: PerfRouteDefinition) {
  return route.timingBudgets ?? route.timings ?? [];
}

export function getRouteResourceBudgets(route: PerfRouteDefinition) {
  return route.resourceBudgets ?? route.resourceSizes ?? [];
}

function normalizeRouteDefinition(
  route: PerfRouteDefinition
): PerfRouteDefinition {
  return {
    ...route,
    timingBudgets: getRouteTimingBudgets(route),
    resourceBudgets: getRouteResourceBudgets(route),
  };
}

const DYNAMIC_ROUTE_TOKEN_PATTERN = /\[[^[\]/]+\]/;

function assertNonemptySelectors(
  route: PerfRouteDefinition,
  selectorGroup: keyof PerfReadySelectors,
  selectors: readonly string[] | undefined
) {
  if (!selectors) return;

  const emptyIndex = selectors.findIndex(
    selector => selector.trim().length === 0
  );
  if (emptyIndex >= 0) {
    throw new TypeError(
      `Performance route "${route.id}" has an empty ${selectorGroup} selector at index ${emptyIndex}.`
    );
  }
}

export function assertValidPerfRouteDefinition(route: PerfRouteDefinition) {
  if (!route.id.trim()) {
    throw new TypeError('Performance route ids must not be empty.');
  }
  if (!route.path.trim() || !route.path.startsWith('/')) {
    throw new TypeError(
      `Performance route "${route.id}" must define an absolute path beginning with "/".`
    );
  }

  for (const selectorGroup of Object.keys(
    route.readySelectors
  ) as (keyof PerfReadySelectors)[]) {
    assertNonemptySelectors(
      route,
      selectorGroup,
      route.readySelectors[selectorGroup]
    );
  }

  const readySelectors = [
    ...(route.readySelectors.shell ?? []),
    ...(route.readySelectors.content ?? []),
  ];
  if (readySelectors.length === 0) {
    throw new TypeError(
      `Performance route "${route.id}" must define at least one shell or content ready selector.`
    );
  }

  if (route.measureMode === 'warm-navigation') {
    if (!route.readySelectors.content?.length) {
      throw new TypeError(
        `Warm-navigation route "${route.id}" must define destination-specific content readiness.`
      );
    }
    if (!route.readySelectors.navTrigger?.length) {
      throw new TypeError(
        `Warm-navigation route "${route.id}" must define at least one navTrigger selector.`
      );
    }
    if (!route.warmNavigationStartPath?.startsWith('/')) {
      throw new TypeError(
        `Warm-navigation route "${route.id}" must define warmNavigationStartPath as an absolute app path.`
      );
    }
    if (route.warmNavigationStartPath === route.path) {
      throw new TypeError(
        `Warm-navigation route "${route.id}" cannot start from its destination path "${route.path}".`
      );
    }
  }

  if (route.measureMode === 'same-route-interaction') {
    if (!route.readySelectors.shell?.length) {
      throw new TypeError(
        `Same-route interaction "${route.id}" must define interaction response readiness.`
      );
    }
    if (!route.readySelectors.content?.length) {
      throw new TypeError(
        `Same-route interaction "${route.id}" must define content readiness.`
      );
    }
    if (!route.readySelectors.navTrigger?.length) {
      throw new TypeError(
        `Same-route interaction "${route.id}" must define at least one navTrigger selector.`
      );
    }
    if (!route.interactionStartPath?.startsWith('/')) {
      throw new TypeError(
        `Same-route interaction "${route.id}" must define interactionStartPath as an absolute app path.`
      );
    }
    if (route.interactionStartPath !== route.path) {
      throw new TypeError(
        `Same-route interaction "${route.id}" must start and finish on its configured path "${route.path}".`
      );
    }
  }

  if (route.measureMode === 'redirect') {
    const destinations = route.readySelectors.redirectDestinations;
    if (!destinations?.length) {
      throw new TypeError(
        `Redirect route "${route.id}" must define at least one redirect destination.`
      );
    }
    if (destinations.includes(route.path)) {
      throw new TypeError(
        `Redirect route "${route.id}" loops back to its configured path "${route.path}".`
      );
    }
  }

  if (DYNAMIC_ROUTE_TOKEN_PATTERN.test(route.path) && !route.resolvePath) {
    throw new TypeError(
      `Dynamic performance route "${route.id}" must define resolvePath for "${route.path}".`
    );
  }
}

export function assertResolvedPerfRoutePath(
  route: PerfRouteDefinition,
  resolvedPath: string
) {
  if (!resolvedPath.trim() || !resolvedPath.startsWith('/')) {
    throw new TypeError(
      `Performance route "${route.id}" resolved to invalid path "${resolvedPath}". Expected an absolute app path.`
    );
  }
  if (DYNAMIC_ROUTE_TOKEN_PATTERN.test(resolvedPath)) {
    throw new TypeError(
      `Performance route "${route.id}" left dynamic tokens unresolved: "${resolvedPath}".`
    );
  }
}

export function assertValidPerfRouteManifest(
  routes: readonly PerfRouteDefinition[]
) {
  const routeIds = new Set<string>();
  const navigationItemIds = new Set<string>();
  for (const route of routes) {
    assertValidPerfRouteDefinition(route);
    if (routeIds.has(route.id)) {
      throw new TypeError(
        `Performance route manifest contains duplicate id "${route.id}".`
      );
    }
    routeIds.add(route.id);

    if (route.measureMode === 'warm-navigation' && route.navigationItemId) {
      if (navigationItemIds.has(route.navigationItemId)) {
        throw new TypeError(
          `Performance route manifest contains duplicate warm-navigation item "${route.navigationItemId}".`
        );
      }
      navigationItemIds.add(route.navigationItemId);
    }
  }
}

const RELEASE_TASKS_ROUTE_TEMPLATE = `${APP_ROUTES.RELEASES}/[releaseId]/tasks`;

function extractReleaseIdFromReleaseTasksPath(path: string) {
  const pathname = path.split('?')[0];
  const releaseTasksPrefix = [
    APP_ROUTES.RELEASES,
    APP_ROUTES.DASHBOARD_RELEASES,
  ]
    .map(prefix => `${prefix}/`)
    .find(prefix => pathname.startsWith(prefix));

  if (!releaseTasksPrefix || !pathname.endsWith('/tasks')) {
    throw new Error(
      `Could not derive a lyrics route from release tasks path: ${path}`
    );
  }

  const releaseId = pathname
    .slice(releaseTasksPrefix.length, -'/tasks'.length)
    .replace(/^\/+|\/+$/g, '');

  if (!releaseId) {
    throw new Error(
      `Could not derive a release id from release tasks path: ${path}`
    );
  }

  return releaseId;
}

async function resolveCreatorLyricsPerfPath(
  route: PerfRouteDefinition,
  context: PerfResolveContext
) {
  const releaseTasksPath = await resolveReleaseTasksPerfPath(
    {
      ...route,
      path: RELEASE_TASKS_ROUTE_TEMPLATE,
    },
    context
  );
  return buildLyricsRoute(
    extractReleaseIdFromReleaseTasksPath(releaseTasksPath)
  );
}

const DEFAULT_PUBLIC_RESOURCE_BUDGETS = [
  { resourceType: 'script', budget: 1050 },
  { resourceType: 'image', budget: 500 },
  { resourceType: 'font', budget: 100 },
  { resourceType: 'stylesheet', budget: 100 },
  { resourceType: 'total', budget: 1200 },
] as const satisfies readonly PerfResourceBudget[];

const BRAND_RESOURCE_BUDGETS = [
  { resourceType: 'script', budget: 700 },
  { resourceType: 'image', budget: 10 },
  { resourceType: 'font', budget: 75 },
  { resourceType: 'stylesheet', budget: 130 },
  { resourceType: 'total', budget: 900 },
] as const satisfies readonly PerfResourceBudget[];

const AUTH_RESOURCE_BUDGETS = [
  { resourceType: 'script', budget: 1450 },
  { resourceType: 'image', budget: 250 },
  { resourceType: 'font', budget: 100 },
  { resourceType: 'stylesheet', budget: 160 },
  { resourceType: 'total', budget: 1700 },
] as const satisfies readonly PerfResourceBudget[];

const CHAT_RESOURCE_BUDGETS = [
  { resourceType: 'script', budget: 2750 },
  { resourceType: 'image', budget: 500 },
  { resourceType: 'font', budget: 100 },
  { resourceType: 'stylesheet', budget: 500 },
  { resourceType: 'total', budget: 3100 },
] as const satisfies readonly PerfResourceBudget[];

const RELEASES_RESOURCE_BUDGETS = [
  { resourceType: 'script', budget: 2200 },
  { resourceType: 'image', budget: 500 },
  { resourceType: 'font', budget: 100 },
  { resourceType: 'stylesheet', budget: 500 },
  { resourceType: 'total', budget: 2800 },
] as const satisfies readonly PerfResourceBudget[];

const ACCOUNT_BILLING_RESOURCE_BUDGETS = [
  { resourceType: 'script', budget: 2600 },
  { resourceType: 'image', budget: 700 },
  { resourceType: 'font', budget: 100 },
  { resourceType: 'stylesheet', budget: 550 },
  { resourceType: 'total', budget: 3300 },
] as const satisfies readonly PerfResourceBudget[];

const ARTIST_PROFILE_SETTINGS_RESOURCE_BUDGETS = [
  { resourceType: 'script', budget: 3000 },
  { resourceType: 'image', budget: 700 },
  { resourceType: 'font', budget: 100 },
  { resourceType: 'stylesheet', budget: 850 },
  { resourceType: 'total', budget: 3900 },
] as const satisfies readonly PerfResourceBudget[];

const ONBOARDING_RESOURCE_BUDGETS = [
  { resourceType: 'script', budget: 2400 },
  { resourceType: 'image', budget: 700 },
  { resourceType: 'font', budget: 100 },
  { resourceType: 'stylesheet', budget: 500 },
  { resourceType: 'total', budget: 3000 },
] as const satisfies readonly PerfResourceBudget[];

const GROUP_PRIORITY: Record<PerfRouteGroup, number> = {
  home: 1,
  'marketing-public': 2,
  'legal-public': 3,
  'public-profile-core': 4,
  'public-profile-mode-shell': 5,
  'public-profile-detail': 6,
  'creator-shell': 7,
  'creator-alias': 8,
  'account-billing': 9,
  onboarding: 10,
  auth: 11,
};

const HOME_ROUTE = {
  id: 'home',
  group: 'home',
  surface: 'homepage',
  path: '/',
  requiresAuth: false,
  warmupStrategy: 'public-route',
  measureMode: 'interactive-shell',
  readySelectors: {
    // The primary CTA is now the chat-intake composer (not a /signup link).
    // Sign-in is behind a modal triggered from the header. The input id is
    // stable from HomepageIntent (`INPUT_ID = 'homepage-intent-input'`).
    shell: ['#home-hero-heading'],
    content: ['#home-hero-heading', 'input#homepage-intent-input'],
  },
  timings: [
    { metric: 'first-contentful-paint', budget: 2000 },
    { metric: 'largest-contentful-paint', budget: 2500 },
    { metric: 'cumulative-layout-shift', budget: 0.1 },
    { metric: 'first-input-delay', budget: 100 },
    { metric: 'interactive-shell-ready', budget: 100 },
    { metric: 'time-to-first-byte', budget: 1800 },
  ],
  resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
  priority: 1,
  seedProfile: 'tim',
} as const satisfies PerfRouteDefinition;

const PUBLIC_PROFILE_CORE_ROUTES = [
  {
    id: 'public-profile-main',
    group: 'public-profile-core',
    surface: 'public-profile',
    path: '/[username]',
    resolvePath: resolveSeededProfilePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'interactive-shell',
    readySelectors: {
      shell: ['[data-testid="profile-header"]'],
      content: ['main h1', '[data-testid="profile-header"]'],
    },
    timings: [
      { metric: 'interactive-shell-ready', budget: 100 },
      // Gmail rule targets: 100ms perceived, 500ms hard budget
      { metric: 'first-contentful-paint', budget: 800 },
      { metric: 'largest-contentful-paint', budget: 1500 },
      { metric: 'cumulative-layout-shift', budget: 0.05 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 200 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 1,
    seedProfile: 'tim',
  },
  {
    id: 'public-profile-about',
    group: 'public-profile-core',
    surface: 'public-profile',
    path: '/[username]/about',
    resolvePath: resolveSeededProfilePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['[data-testid="profile-header"]'],
      redirectDestinations: ['/[username]?mode=about'],
    },
    timings: [
      { metric: 'redirect-complete', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2200 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 2,
    seedProfile: 'tim',
  },
  {
    id: 'public-profile-contact',
    group: 'public-profile-core',
    surface: 'public-profile',
    path: '/[username]/contact',
    resolvePath: resolveSeededProfilePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['[data-testid="profile-header"]'],
      redirectDestinations: ['/[username]?mode=contact'],
    },
    timings: [
      { metric: 'redirect-complete', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2200 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 3,
    seedProfile: 'tim',
  },
  {
    id: 'public-profile-listen',
    group: 'public-profile-core',
    surface: 'public-profile',
    path: '/[username]/listen',
    resolvePath: resolveSeededProfilePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['[data-testid="profile-header"]'],
      redirectDestinations: ['/[username]?mode=listen'],
    },
    timings: [
      { metric: 'redirect-complete', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2400 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 4,
    seedProfile: 'dualipa',
  },
  {
    id: 'public-profile-notifications',
    group: 'public-profile-core',
    surface: 'public-profile',
    path: '/[username]/notifications',
    resolvePath: resolveSeededProfilePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: { content: ['main', 'form', 'button'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 2800 },
      { metric: 'largest-contentful-paint', budget: 3300 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2400 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 5,
    seedProfile: 'testartist',
  },
  {
    id: 'public-profile-shop',
    group: 'public-profile-core',
    surface: 'public-profile',
    path: '/[username]/shop',
    resolvePath: resolveSeededProfilePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: { content: ['main'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 2800 },
      { metric: 'largest-contentful-paint', budget: 3300 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2400 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 6,
    seedProfile: 'dualipa',
  },
  {
    id: 'public-profile-subscribe',
    group: 'public-profile-core',
    surface: 'public-profile',
    path: '/[username]/subscribe',
    resolvePath: resolveSeededProfilePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['[data-testid="profile-header"]'],
      redirectDestinations: ['/[username]?mode=subscribe'],
    },
    timings: [
      { metric: 'redirect-complete', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2400 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 7,
    seedProfile: 'dualipa',
  },
  {
    id: 'public-profile-tip',
    group: 'public-profile-core',
    surface: 'public-profile',
    path: '/[username]/tip',
    resolvePath: resolveSeededProfilePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['[data-testid="profile-header"]'],
      redirectDestinations: ['/[username]?mode=pay'],
    },
    timings: [
      { metric: 'redirect-complete', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2400 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 8,
    seedProfile: 'testartist',
  },
  {
    id: 'public-profile-tour',
    group: 'public-profile-core',
    surface: 'public-profile',
    path: '/[username]/tour',
    resolvePath: resolveSeededProfilePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['[data-testid="profile-header"]'],
      redirectDestinations: ['/[username]?mode=tour'],
    },
    timings: [
      { metric: 'redirect-complete', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2400 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 9,
    seedProfile: 'dualipa',
  },
  {
    id: 'public-profile-releases',
    group: 'public-profile-core',
    surface: 'public-profile',
    path: '/[username]/releases',
    resolvePath: resolveSeededProfilePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['[data-testid="profile-header"]'],
      redirectDestinations: ['/[username]?mode=releases'],
    },
    timings: [
      { metric: 'redirect-complete', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2400 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 9,
    seedProfile: 'dualipa',
  },
] as const satisfies readonly PerfRouteDefinition[];

const PUBLIC_PROFILE_MODE_SHELL_ROUTES = [
  {
    id: 'public-profile-mode-listen',
    group: 'public-profile-mode-shell',
    surface: 'public-profile',
    path: '/[username]?mode=listen',
    resolvePath: resolveSeededProfileModePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'interactive-shell',
    readySelectors: {
      shell: ['[data-testid="profile-header"]'],
      content: [
        '[data-testid="profile-primary-tab-releases"]',
        '[data-testid="profile-primary-tab-listen"]',
        '[data-testid="profile-mode-drawer-listen"]',
        '[data-testid="profile-header"]',
      ],
    },
    timings: [
      { metric: 'interactive-shell-ready', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2400 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 1,
    seedProfile: 'dualipa',
  },
  {
    id: 'public-profile-mode-pay',
    group: 'public-profile-mode-shell',
    surface: 'public-profile',
    path: '/[username]?mode=pay',
    resolvePath: resolveSeededProfileModePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'interactive-shell',
    readySelectors: {
      shell: ['[data-testid="profile-header"]'],
      content: [
        '[data-testid="profile-mode-drawer-pay"]',
        '[data-testid="profile-header"]',
      ],
    },
    timings: [
      { metric: 'interactive-shell-ready', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2400 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 2,
    seedProfile: 'testartist',
  },
  {
    id: 'public-profile-mode-subscribe',
    group: 'public-profile-mode-shell',
    surface: 'public-profile',
    path: '/[username]?mode=subscribe',
    resolvePath: resolveSeededProfileModePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'interactive-shell',
    readySelectors: {
      shell: ['[data-testid="profile-header"]'],
      content: [
        '[data-testid="profile-primary-tab-subscribe"]',
        '[data-testid="notifications-page"]',
        '[data-testid="notifications-flow"]',
        '[data-testid="profile-mode-drawer-subscribe"]',
        '[data-testid="profile-header"]',
      ],
    },
    timings: [
      { metric: 'interactive-shell-ready', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2400 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 3,
    seedProfile: 'dualipa',
  },
  {
    id: 'public-profile-mode-about',
    group: 'public-profile-mode-shell',
    surface: 'public-profile',
    path: '/[username]?mode=about',
    resolvePath: resolveSeededProfileModePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'interactive-shell',
    readySelectors: {
      shell: ['[data-testid="profile-header"]'],
      content: [
        '[data-testid="profile-primary-tab-about"]',
        '[data-testid="profile-mode-drawer-about"]',
        '[data-testid="profile-header"]',
      ],
    },
    timings: [
      { metric: 'interactive-shell-ready', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2400 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 4,
    seedProfile: 'dualipa',
  },
  {
    id: 'public-profile-mode-contact',
    group: 'public-profile-mode-shell',
    surface: 'public-profile',
    path: '/[username]?mode=contact',
    resolvePath: resolveSeededProfileModePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'interactive-shell',
    readySelectors: {
      shell: ['[data-testid="profile-header"]'],
      content: [
        '[data-testid="profile-mode-drawer-contact"]',
        '[data-testid="profile-header"]',
      ],
    },
    timings: [
      { metric: 'interactive-shell-ready', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2400 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 5,
    seedProfile: 'dualipa',
  },
  {
    id: 'public-profile-mode-tour',
    group: 'public-profile-mode-shell',
    surface: 'public-profile',
    path: '/[username]?mode=tour',
    resolvePath: resolveSeededProfileModePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'interactive-shell',
    readySelectors: {
      shell: ['[data-testid="profile-header"]'],
      content: [
        '[data-testid="profile-primary-tab-tour"]',
        '[data-testid="profile-mode-drawer-tour"]',
        '[data-testid="profile-header"]',
      ],
    },
    timings: [
      { metric: 'interactive-shell-ready', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2400 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 6,
    seedProfile: 'dualipa',
  },
  {
    id: 'public-profile-mode-releases',
    group: 'public-profile-mode-shell',
    surface: 'public-profile',
    path: '/[username]?mode=releases',
    resolvePath: resolveSeededProfileModePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'interactive-shell',
    readySelectors: {
      shell: ['[data-testid="profile-header"]'],
      content: [
        '[data-testid="profile-mode-drawer-releases"]',
        '[data-testid="profile-header"]',
      ],
    },
    timings: [
      { metric: 'interactive-shell-ready', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2400 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 6,
    seedProfile: 'dualipa',
  },
] as const satisfies readonly PerfRouteDefinition[];

const PUBLIC_PROFILE_DETAIL_ROUTES = [
  {
    id: 'public-release',
    group: 'public-profile-detail',
    surface: 'public-profile',
    path: '/[username]/[slug]',
    resolvePath: resolveSeededPublicReleasePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: { content: ['main', 'a[href*="spotify"]'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 2600 },
      { metric: 'largest-contentful-paint', budget: 3200 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2200 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 1,
    seedProfile: 'dualipa',
  },
  {
    id: 'public-release-track',
    group: 'public-profile-detail',
    surface: 'public-profile',
    path: '/[username]/[slug]/[trackSlug]',
    resolvePath: resolveSeededPublicTrackPath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: { content: ['main', 'a[href*="spotify"]'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 2600 },
      { metric: 'largest-contentful-paint', budget: 3200 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2200 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 2,
    seedProfile: 'dualipa',
  },
  {
    id: 'public-release-sounds',
    group: 'public-profile-detail',
    surface: 'public-profile',
    path: '/[username]/[slug]/sounds',
    resolvePath: resolveSeededPublicReleasePath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: { content: ['main', 'audio', 'button'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 2600 },
      { metric: 'largest-contentful-paint', budget: 3200 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2200 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 3,
    seedProfile: 'dualipa',
  },
  {
    id: 'public-profile-catchall',
    group: 'public-profile-detail',
    surface: 'public-profile',
    path: '/[username]/performance-extra-path',
    resolvePath: resolveSeededPublicCatchAllPath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['main h1', '[data-testid="profile-header"]'],
      redirectDestinations: ['/[username]'],
    },
    timings: [
      { metric: 'redirect-complete', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2200 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 4,
    seedProfile: 'dualipa',
  },
] as const satisfies readonly PerfRouteDefinition[];

const MARKETING_PUBLIC_ROUTES = [
  {
    id: 'marketing-pricing',
    group: 'marketing-public',
    surface: 'marketing',
    path: APP_ROUTES.PRICING,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: { content: ['main', 'h1'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 2600 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1500 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 1,
  },
  {
    id: 'marketing-support',
    group: 'marketing-public',
    surface: 'marketing',
    path: APP_ROUTES.SUPPORT,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: { content: ['main', 'h1'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 2600 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1500 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 2,
  },
  {
    id: 'marketing-brand',
    group: 'marketing-public',
    surface: 'marketing',
    path: APP_ROUTES.BRAND,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'interactive-shell',
    readySelectors: {
      shell: ['main h1'],
      content: ['main h1'],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 100 },
      { metric: 'largest-contentful-paint', budget: 300 },
      { metric: 'cumulative-layout-shift', budget: 0.05 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 50 },
    ],
    resourceSizes: BRAND_RESOURCE_BUDGETS,
    priority: 2,
  },
] as const satisfies readonly PerfRouteDefinition[];

const LEGAL_PUBLIC_ROUTES = [
  {
    id: 'legal-privacy',
    group: 'legal-public',
    surface: 'legal',
    path: APP_ROUTES.LEGAL_PRIVACY,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: { content: ['main', 'h1'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 2000 },
      { metric: 'largest-contentful-paint', budget: 2800 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1700 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 1,
  },
  {
    id: 'legal-terms',
    group: 'legal-public',
    surface: 'legal',
    path: APP_ROUTES.LEGAL_TERMS,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: { content: ['main', 'h1'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 2000 },
      { metric: 'largest-contentful-paint', budget: 2800 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1700 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 2,
  },
] as const satisfies readonly PerfRouteDefinition[];

const CREATOR_SHELL_ROUTES = [
  {
    id: 'creator-app-home',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.DASHBOARD,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: {
      content: ['[data-testid="opportunity-inbox-page"]'],
      loading: ['[data-testid="dashboard-segment-skeleton"]'],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1500 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.05 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1500 },
      { metric: 'skeleton-to-content', budget: 750 },
    ],
    resourceSizes: CHAT_RESOURCE_BUDGETS,
    priority: 1,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-inbox-nav',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.DASHBOARD,
    navigationItemId: 'inbox',
    warmNavigationStartPath: APP_ROUTES.CHAT,
    requiresAuth: true,
    warmupStrategy: 'authenticated-shell',
    measureMode: 'warm-navigation',
    readySelectors: {
      shell: ['[data-app-shell-frame="true"]'],
      content: ['[data-testid="opportunity-inbox-page"]'],
      loading: ['[data-testid="dashboard-segment-skeleton"]'],
      navTrigger: [
        `a[href="${APP_ROUTES.DASHBOARD}"]`,
        `a[href^="${APP_ROUTES.DASHBOARD}?"]`,
      ],
    },
    timings: [
      { metric: 'warm-shell-response', budget: 100 },
      { metric: 'skeleton-to-content', budget: 750 },
    ],
    resourceSizes: CHAT_RESOURCE_BUDGETS,
    priority: 2,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-chat',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.CHAT,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: {
      content: ['[data-testid="chat-content"]'],
      loading: ['[data-testid="chat-loading"]'],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1500 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.02 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1500 },
      { metric: 'skeleton-to-content', budget: 1200 },
    ],
    resourceSizes: CHAT_RESOURCE_BUDGETS,
    priority: 3,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-chat-nav',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.CHAT,
    navigationItemId: 'chat',
    warmNavigationStartPath: APP_ROUTES.DASHBOARD,
    requiresAuth: true,
    warmupStrategy: 'authenticated-shell',
    measureMode: 'warm-navigation',
    readySelectors: {
      shell: ['[data-app-shell-frame="true"]'],
      content: ['[data-testid="chat-content"]'],
      loading: ['[data-testid="chat-loading"]'],
      navTrigger: [
        `a[href="${APP_ROUTES.CHAT}"]`,
        `a[href^="${APP_ROUTES.CHAT}?"]`,
      ],
    },
    timings: [
      { metric: 'warm-shell-response', budget: 100 },
      { metric: 'skeleton-to-content', budget: 1200 },
    ],
    resourceSizes: CHAT_RESOURCE_BUDGETS,
    priority: 4,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-chat-thread',
    group: 'creator-shell',
    surface: 'creator-app',
    path: '/app/chat/[id]',
    resolvePath: resolveChatConversationPerfPath,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: {
      content: ['a[href="/app/chat"]', '[placeholder*="ask jovie" i]'],
      loading: ['[data-testid="chat-loading"]'],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1500 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.02 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1500 },
      { metric: 'skeleton-to-content', budget: 1200 },
    ],
    resourceSizes: CHAT_RESOURCE_BUDGETS,
    priority: 5,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-audience',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.AUDIENCE,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: {
      content: [
        '[data-testid="dashboard-audience-client"]',
        '[data-testid="dashboard-audience-empty-state"]',
      ],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1600 },
      { metric: 'skeleton-to-content', budget: 600 },
    ],
    resourceSizes: CHAT_RESOURCE_BUDGETS,
    priority: 6,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-earnings',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.DASHBOARD_EARNINGS,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['section#artist-profile'],
      redirectDestinations: [`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn`],
    },
    timings: [
      { metric: 'redirect-complete', budget: 700 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: ACCOUNT_BILLING_RESOURCE_BUDGETS,
    priority: 7,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-insights',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.INSIGHTS,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: {
      content: [
        'h2:has-text("AI Insights")',
        'button[aria-label*="Generate insights" i]',
      ],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1600 },
      { metric: 'skeleton-to-content', budget: 600 },
    ],
    resourceSizes: CHAT_RESOURCE_BUDGETS,
    priority: 8,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-presence',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.PRESENCE,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['section#artist-profile'],
      redirectDestinations: [`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=music`],
    },
    timings: [
      // This alias lands on the heavier artist-profile music settings surface.
      { metric: 'redirect-complete', budget: 1500 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: ARTIST_PROFILE_SETTINGS_RESOURCE_BUDGETS,
    priority: 9,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-releases',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.RELEASES,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['[data-testid="library-surface"]'],
      redirectDestinations: [`${APP_ROUTES.LIBRARY}?view=releases`],
    },
    timings: [
      { metric: 'redirect-complete', budget: 700 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: RELEASES_RESOURCE_BUDGETS,
    priority: 10,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-library-cold',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.LIBRARY,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: {
      content: ['[data-testid="library-surface"]'],
      loading: ['main[aria-label="Loading Library"]'],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.05 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1600 },
      { metric: 'skeleton-to-content', budget: 1000 },
    ],
    resourceSizes: RELEASES_RESOURCE_BUDGETS,
    priority: 11,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-library',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.LIBRARY,
    navigationItemId: 'library',
    warmNavigationStartPath: APP_ROUTES.DASHBOARD,
    requiresAuth: true,
    warmupStrategy: 'authenticated-shell',
    measureMode: 'warm-navigation',
    readySelectors: {
      shell: ['[data-testid="library-surface"]'],
      content: ['[data-testid="library-surface"]'],
      loading: ['main[aria-label="Loading Library"]'],
      navTrigger: [
        `a[href="${APP_ROUTES.LIBRARY}"]`,
        `a[href^="${APP_ROUTES.LIBRARY}?"]`,
      ],
    },
    timings: [
      { metric: 'warm-shell-response', budget: 100 },
      { metric: 'skeleton-to-content', budget: 1000 },
    ],
    resourceSizes: RELEASES_RESOURCE_BUDGETS,
    priority: 11,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-contacts-cold',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.CONTACTS,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: {
      content: ['[data-testid="contacts-table"]'],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.05 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1600 },
      { metric: 'skeleton-to-content', budget: 1000 },
    ],
    resourceSizes: ACCOUNT_BILLING_RESOURCE_BUDGETS,
    priority: 12,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-contacts',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.CONTACTS,
    navigationItemId: 'contacts',
    warmNavigationStartPath: APP_ROUTES.DASHBOARD,
    requiresAuth: true,
    warmupStrategy: 'authenticated-shell',
    measureMode: 'warm-navigation',
    readySelectors: {
      shell: ['[data-app-shell-frame="true"]'],
      content: ['[data-testid="contacts-table"]'],
      navTrigger: [
        `a[href="${APP_ROUTES.CONTACTS}"]`,
        `a[href^="${APP_ROUTES.CONTACTS}?"]`,
      ],
    },
    timings: [
      { metric: 'warm-shell-response', budget: 100 },
      { metric: 'skeleton-to-content', budget: 1000 },
    ],
    resourceSizes: ACCOUNT_BILLING_RESOURCE_BUDGETS,
    priority: 12,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-calendar-cold',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.CALENDAR,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: {
      content: ['[data-testid="calendar-workspace"]'],
      loading: ['[aria-label="Loading Calendar"]'],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.05 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1600 },
      { metric: 'skeleton-to-content', budget: 1000 },
    ],
    resourceSizes: ACCOUNT_BILLING_RESOURCE_BUDGETS,
    priority: 13,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-calendar',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.CALENDAR,
    navigationItemId: 'calendar',
    warmNavigationStartPath: APP_ROUTES.DASHBOARD,
    requiresAuth: true,
    warmupStrategy: 'authenticated-shell',
    measureMode: 'warm-navigation',
    readySelectors: {
      shell: ['[data-app-shell-frame="true"]'],
      content: ['[data-testid="calendar-workspace"]'],
      loading: ['[aria-label="Loading Calendar"]'],
      navTrigger: [
        `a[href="${APP_ROUTES.CALENDAR}"]`,
        `a[href^="${APP_ROUTES.CALENDAR}?"]`,
      ],
    },
    timings: [
      { metric: 'warm-shell-response', budget: 100 },
      { metric: 'skeleton-to-content', budget: 1000 },
    ],
    resourceSizes: ACCOUNT_BILLING_RESOURCE_BUDGETS,
    priority: 13,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-tasks-cold',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.TASKS,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: {
      content: [
        '[data-testid="tasks-workspace"]',
        '[data-testid="tasks-upgrade-interstitial"]',
        '[data-testid="release-plan-upgrade-interstitial"]',
      ],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.05 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1600 },
      { metric: 'skeleton-to-content', budget: 1000 },
    ],
    resourceSizes: RELEASES_RESOURCE_BUDGETS,
    priority: 14,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-tasks',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.TASKS,
    navigationItemId: 'tasks',
    warmNavigationStartPath: APP_ROUTES.DASHBOARD,
    requiresAuth: true,
    warmupStrategy: 'authenticated-shell',
    measureMode: 'warm-navigation',
    readySelectors: {
      shell: [
        '[data-testid="tasks-workspace"]',
        '[data-testid="tasks-upgrade-interstitial"]',
      ],
      content: [
        '[data-testid="tasks-workspace"]',
        '[data-testid="tasks-upgrade-interstitial"]',
        '[data-testid="release-plan-upgrade-interstitial"]',
      ],
      navTrigger: [
        `a[href="${APP_ROUTES.TASKS}"]`,
        `a[href^="${APP_ROUTES.TASKS}?"]`,
      ],
    },
    timings: [
      { metric: 'warm-shell-response', budget: 100 },
      { metric: 'skeleton-to-content', budget: 1000 },
    ],
    resourceSizes: RELEASES_RESOURCE_BUDGETS,
    priority: 14,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-profile-rail',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.DASHBOARD,
    navigationItemId: 'profile',
    interactionStartPath: APP_ROUTES.DASHBOARD,
    requiresAuth: true,
    warmupStrategy: 'authenticated-shell',
    measureMode: 'same-route-interaction',
    readySelectors: {
      shell: [
        '[data-testid="artist-profile-rail-toggle"][aria-pressed="true"]',
      ],
      content: ['[data-testid="profile-contact-sidebar"]'],
      navTrigger: ['[data-testid="artist-profile-rail-toggle"]'],
    },
    timings: [
      { metric: 'warm-shell-response', budget: 100 },
      { metric: 'skeleton-to-content', budget: 1200 },
    ],
    resourceSizes: CHAT_RESOURCE_BUDGETS,
    priority: 15,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-lyrics',
    group: 'creator-shell',
    surface: 'creator-app',
    path: `${APP_ROUTES.LYRICS}/[trackId]`,
    resolvePath: resolveCreatorLyricsPerfPath,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: {
      content: ['section[aria-label="Lyrics"]', 'h2:has-text("No lyrics yet")'],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1600 },
    ],
    resourceSizes: RELEASES_RESOURCE_BUDGETS,
    priority: 16,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-release-tasks',
    group: 'creator-shell',
    surface: 'creator-app',
    path: RELEASE_TASKS_ROUTE_TEMPLATE,
    resolvePath: resolveReleaseTasksPerfPath,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: {
      content: [
        '[data-testid="release-task-page"]',
        '[data-testid="release-plan-upgrade-interstitial"]',
      ],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1600 },
      { metric: 'skeleton-to-content', budget: 600 },
    ],
    resourceSizes: RELEASES_RESOURCE_BUDGETS,
    priority: 17,
    seedProfile: 'active-user',
  },
] as const satisfies readonly PerfRouteDefinition[];

const CREATOR_ALIAS_ROUTES = [
  {
    id: 'creator-alias-dashboard-overview',
    group: 'creator-alias',
    surface: 'creator-app',
    path: APP_ROUTES.LEGACY_DASHBOARD,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['a[href="/app/chat"]', '[placeholder*="ask jovie" i]'],
      redirectDestinations: [APP_ROUTES.DASHBOARD],
    },
    timings: [
      { metric: 'redirect-complete', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: CHAT_RESOURCE_BUDGETS,
    priority: 1,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-alias-dashboard-profile',
    group: 'creator-alias',
    surface: 'creator-app',
    path: APP_ROUTES.DASHBOARD_PROFILE,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['a[href="/app/chat"]', '[placeholder*="ask jovie" i]'],
      redirectDestinations: [APP_ROUTES.CHAT, APP_ROUTES.CHAT_PROFILE_PANEL],
    },
    timings: [
      { metric: 'redirect-complete', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: CHAT_RESOURCE_BUDGETS,
    priority: 2,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-alias-dashboard-links',
    group: 'creator-alias',
    surface: 'creator-app',
    path: APP_ROUTES.DASHBOARD_LINKS,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['a[href="/app/chat"]', '[placeholder*="ask jovie" i]'],
      redirectDestinations: [APP_ROUTES.CHAT, APP_ROUTES.CHAT_PROFILE_PANEL],
    },
    timings: [
      { metric: 'redirect-complete', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: CHAT_RESOURCE_BUDGETS,
    priority: 3,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-alias-tour-dates',
    group: 'creator-alias',
    surface: 'creator-app',
    path: APP_ROUTES.TOUR_DATES,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: {
      content: ['[data-testid="tour-dates-page"]'],
    },
    timings: [{ metric: 'time-to-first-byte', budget: 1200 }],
    resourceSizes: ACCOUNT_BILLING_RESOURCE_BUDGETS,
    priority: 5,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-alias-dashboard-tipping',
    group: 'creator-alias',
    surface: 'creator-app',
    path: APP_ROUTES.DASHBOARD_TIPPING,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['section#artist-profile'],
      redirectDestinations: [`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn`],
    },
    timings: [
      { metric: 'redirect-complete', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: ACCOUNT_BILLING_RESOURCE_BUDGETS,
    priority: 6,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-alias-dashboard-contacts',
    group: 'creator-alias',
    surface: 'creator-app',
    path: APP_ROUTES.DASHBOARD_CONTACTS,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['section#contacts'],
      redirectDestinations: [APP_ROUTES.SETTINGS_CONTACTS],
    },
    timings: [
      { metric: 'redirect-complete', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: ACCOUNT_BILLING_RESOURCE_BUDGETS,
    priority: 7,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-alias-dashboard-tour-dates',
    group: 'creator-alias',
    surface: 'creator-app',
    path: APP_ROUTES.DASHBOARD_TOUR_DATES,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['[data-testid="tour-dates-page"]'],
      redirectDestinations: [APP_ROUTES.TOUR_DATES],
    },
    timings: [
      { metric: 'redirect-complete', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: ACCOUNT_BILLING_RESOURCE_BUDGETS,
    priority: 8,
    seedProfile: 'active-user',
  },
] as const satisfies readonly PerfRouteDefinition[];

const ACCOUNT_BILLING_ROUTES = [
  {
    id: 'account',
    group: 'account-billing',
    surface: 'account-billing',
    path: '/account',
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['main h1', 'main h2'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 2800 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1500 },
    ],
    resourceSizes: ACCOUNT_BILLING_RESOURCE_BUDGETS,
    priority: 1,
    seedProfile: 'active-user',
  },
  {
    id: 'artist-selection',
    group: 'account-billing',
    surface: 'account-billing',
    path: '/artist-selection',
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['main h1', 'main h2', 'button'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 2800 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1500 },
    ],
    resourceSizes: ACCOUNT_BILLING_RESOURCE_BUDGETS,
    priority: 2,
    seedProfile: 'active-user',
  },
  {
    id: 'billing',
    group: 'account-billing',
    surface: 'account-billing',
    path: '/billing',
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['main h1', 'main h2'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 2000 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1500 },
    ],
    resourceSizes: ACCOUNT_BILLING_RESOURCE_BUDGETS,
    priority: 3,
    seedProfile: 'active-user',
  },
  {
    id: 'billing-cancel',
    group: 'account-billing',
    surface: 'account-billing',
    path: '/billing/cancel',
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['main h1', 'main h2', 'button'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 2000 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1500 },
    ],
    resourceSizes: ACCOUNT_BILLING_RESOURCE_BUDGETS,
    priority: 4,
    seedProfile: 'active-user',
  },
  {
    id: 'billing-success',
    group: 'account-billing',
    surface: 'account-billing',
    path: '/billing/success',
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['main h1', 'main h2', 'button'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 2000 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1500 },
    ],
    resourceSizes: ACCOUNT_BILLING_RESOURCE_BUDGETS,
    priority: 6,
    seedProfile: 'active-user',
  },
  {
    id: 'waitlist',
    group: 'account-billing',
    surface: 'account-billing',
    path: '/waitlist',
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: { content: ['main h1', 'main h2', 'form'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 2600 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 7,
  },
] as const satisfies readonly PerfRouteDefinition[];

const ONBOARDING_ROUTES = [
  {
    id: 'onboarding',
    group: 'onboarding',
    surface: 'onboarding',
    path: APP_ROUTES.START,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: {
      shell: ['[data-app-shell-frame="true"]'],
      content: [
        '[data-testid="onboarding-chat"]',
        '[data-testid="chat-composer-surface"]',
      ],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 900 },
      { metric: 'largest-contentful-paint', budget: 1300 },
      { metric: 'cumulative-layout-shift', budget: 0.02 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1000 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 1,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-checkout',
    group: 'onboarding',
    surface: 'onboarding',
    path: APP_ROUTES.ONBOARDING_CHECKOUT,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['main h1', 'main h2', 'button'] },
    timings: [
      // Gmail rule targets for onboarding checkout
      { metric: 'first-contentful-paint', budget: 1000 },
      { metric: 'largest-contentful-paint', budget: 1500 },
      { metric: 'cumulative-layout-shift', budget: 0.05 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1400 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 2,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-handle',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/start?resume=handle&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: {
      shell: ['[data-app-shell-frame="true"]'],
      content: [
        '[data-testid="onboarding-chat"]',
        '[data-testid="chat-composer-surface"]',
      ],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 900 },
      { metric: 'largest-contentful-paint', budget: 1300 },
      { metric: 'cumulative-layout-shift', budget: 0.02 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1000 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 3,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-spotify',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/start?resume=spotify&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: {
      shell: ['[data-app-shell-frame="true"]'],
      content: [
        '[data-testid="onboarding-chat"]',
        '[data-testid="chat-composer-surface"]',
      ],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 900 },
      { metric: 'largest-contentful-paint', budget: 1300 },
      { metric: 'cumulative-layout-shift', budget: 0.02 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1000 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 4,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-artist-confirm',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/start?resume=artist-confirm&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: {
      shell: ['[data-app-shell-frame="true"]'],
      content: [
        '[data-testid="onboarding-chat"]',
        '[data-testid="chat-composer-surface"]',
      ],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 900 },
      { metric: 'largest-contentful-paint', budget: 1300 },
      { metric: 'cumulative-layout-shift', budget: 0.02 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1000 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 5,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-upgrade',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/start?resume=upgrade&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: {
      shell: ['[data-app-shell-frame="true"]'],
      content: [
        '[data-testid="onboarding-chat"]',
        '[data-testid="chat-composer-surface"]',
      ],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 900 },
      { metric: 'largest-contentful-paint', budget: 1300 },
      { metric: 'cumulative-layout-shift', budget: 0.02 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1000 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 6,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-dsp',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/start?resume=dsp&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: {
      shell: ['[data-app-shell-frame="true"]'],
      content: [
        '[data-testid="onboarding-chat"]',
        '[data-testid="chat-composer-surface"]',
      ],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 900 },
      { metric: 'largest-contentful-paint', budget: 1300 },
      { metric: 'cumulative-layout-shift', budget: 0.02 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1000 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 7,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-social',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/start?resume=social&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: {
      shell: ['[data-app-shell-frame="true"]'],
      content: [
        '[data-testid="onboarding-chat"]',
        '[data-testid="chat-composer-surface"]',
      ],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 900 },
      { metric: 'largest-contentful-paint', budget: 1300 },
      { metric: 'cumulative-layout-shift', budget: 0.02 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1000 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 8,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-releases',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/start?resume=releases&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: {
      shell: ['[data-app-shell-frame="true"]'],
      content: [
        '[data-testid="onboarding-chat"]',
        '[data-testid="chat-composer-surface"]',
      ],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 900 },
      { metric: 'largest-contentful-paint', budget: 1300 },
      { metric: 'cumulative-layout-shift', budget: 0.02 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1000 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 9,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-late-arrivals',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/start?resume=late-arrivals&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: {
      shell: ['[data-app-shell-frame="true"]'],
      content: [
        '[data-testid="onboarding-chat"]',
        '[data-testid="chat-composer-surface"]',
      ],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 900 },
      { metric: 'largest-contentful-paint', budget: 1300 },
      { metric: 'cumulative-layout-shift', budget: 0.02 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1000 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 10,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-profile-ready',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/start?resume=profile-ready&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: {
      shell: ['[data-app-shell-frame="true"]'],
      content: [
        '[data-testid="onboarding-chat"]',
        '[data-testid="chat-composer-surface"]',
      ],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 900 },
      { metric: 'largest-contentful-paint', budget: 1300 },
      { metric: 'cumulative-layout-shift', budget: 0.02 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1000 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 11,
    seedProfile: 'active-user',
  },
] as const satisfies readonly PerfRouteDefinition[];

const AUTH_ROUTES = [
  {
    id: 'signin',
    group: 'auth',
    surface: 'auth',
    path: APP_ROUTES.SIGNIN,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: {
      content: [
        'form',
        'input[name="identifier"]',
        'input[type="email"]',
        '[data-clerk-component]',
      ],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1600 },
      { metric: 'largest-contentful-paint', budget: 2200 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: AUTH_RESOURCE_BUDGETS,
    priority: 1,
  },
  {
    id: 'signup',
    group: 'auth',
    surface: 'auth',
    path: APP_ROUTES.SIGNUP,
    requiresAuth: false,
    warmupStrategy: 'public-route',
    measureMode: 'page-load',
    readySelectors: {
      content: [
        'form',
        'input[name="identifier"]',
        'input[type="email"]',
        '[data-clerk-component]',
      ],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1600 },
      { metric: 'largest-contentful-paint', budget: 2200 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: AUTH_RESOURCE_BUDGETS,
    priority: 2,
  },
] as const satisfies readonly PerfRouteDefinition[];

export const END_USER_PERF_ROUTE_MANIFEST = [
  HOME_ROUTE,
  ...MARKETING_PUBLIC_ROUTES,
  ...LEGAL_PUBLIC_ROUTES,
  ...PUBLIC_PROFILE_CORE_ROUTES,
  ...PUBLIC_PROFILE_MODE_SHELL_ROUTES,
  ...PUBLIC_PROFILE_DETAIL_ROUTES,
  ...CREATOR_SHELL_ROUTES,
  ...CREATOR_ALIAS_ROUTES,
  ...ACCOUNT_BILLING_ROUTES,
  ...ONBOARDING_ROUTES,
  ...AUTH_ROUTES,
] as const satisfies readonly PerfRouteDefinition[];

const NORMALIZED_END_USER_PERF_ROUTE_MANIFEST =
  END_USER_PERF_ROUTE_MANIFEST.map(route =>
    normalizeRouteDefinition(route)
  ) as readonly PerfRouteDefinition[];

assertValidPerfRouteManifest(NORMALIZED_END_USER_PERF_ROUTE_MANIFEST);

export const END_USER_PERF_GROUP_ORDER = Object.keys(
  GROUP_PRIORITY
) as readonly PerfRouteGroup[];

export function getGroupPriority(group: PerfRouteGroup) {
  return GROUP_PRIORITY[group];
}

export function getEndUserPerfRouteManifest() {
  return [...NORMALIZED_END_USER_PERF_ROUTE_MANIFEST];
}

export function getEndUserPerfRouteById(routeId: string) {
  return NORMALIZED_END_USER_PERF_ROUTE_MANIFEST.find(
    route => route.id === routeId
  );
}

export function sortPerfRoutesDeterministically(
  routes: readonly PerfRouteDefinition[]
) {
  return [...routes].sort((left, right) => {
    const groupDelta =
      getGroupPriority(left.group) - getGroupPriority(right.group);
    if (groupDelta !== 0) {
      return groupDelta;
    }

    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return left.id.localeCompare(right.id);
  });
}

export function selectPerfRoutes(options?: {
  readonly groupIds?: readonly string[];
  readonly routeIds?: readonly string[];
}) {
  const groupIds = new Set(options?.groupIds ?? []);
  const routeIds = new Set(options?.routeIds ?? []);
  const hasGroupFilter = groupIds.size > 0;
  const hasRouteFilter = routeIds.size > 0;

  const selected = NORMALIZED_END_USER_PERF_ROUTE_MANIFEST.filter(route => {
    if (hasRouteFilter && routeIds.has(route.id)) {
      return true;
    }

    if (hasGroupFilter && groupIds.has(route.group)) {
      return true;
    }

    return !hasGroupFilter && !hasRouteFilter;
  });

  if ((hasGroupFilter || hasRouteFilter) && selected.length === 0) {
    throw new TypeError(
      `No performance routes matched selection. Available ids: ${NORMALIZED_END_USER_PERF_ROUTE_MANIFEST.map(route => route.id).join(', ')}`
    );
  }

  return sortPerfRoutesDeterministically(selected);
}

export function getPrimaryTimingMetricName(route: PerfRouteDefinition) {
  const priorityOrder: readonly PerfTimingMetricName[] = [
    'interactive-shell-ready',
    'warm-shell-response',
    'redirect-complete',
    'skeleton-to-content',
    'first-contentful-paint',
    'largest-contentful-paint',
    'time-to-first-byte',
    'cumulative-layout-shift',
    'first-input-delay',
  ];

  const timingBudgets = getRouteTimingBudgets(route);

  for (const candidate of priorityOrder) {
    if (timingBudgets.some(entry => entry.metric === candidate)) {
      return candidate;
    }
  }

  throw new Error(`Route ${route.id} does not define a primary timing metric.`);
}
