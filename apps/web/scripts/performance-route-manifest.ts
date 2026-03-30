import { APP_ROUTES } from '../constants/routes';
import {
  resolveActiveProfileOnboardingPath,
  resolveChatConversationPerfPath,
  resolveReleaseTasksPerfPath,
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
  | 'public-profile-core'
  | 'public-profile-detail'
  | 'creator-shell'
  | 'creator-alias'
  | 'account-billing'
  | 'onboarding'
  | 'auth';

export type PerfRouteSurface =
  | 'homepage'
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

const DEFAULT_PUBLIC_RESOURCE_BUDGETS = [
  { resourceType: 'script', budget: 1050 },
  { resourceType: 'image', budget: 500 },
  { resourceType: 'font', budget: 100 },
  { resourceType: 'stylesheet', budget: 100 },
  { resourceType: 'total', budget: 1200 },
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

const ONBOARDING_RESOURCE_BUDGETS = [
  { resourceType: 'script', budget: 2600 },
  { resourceType: 'image', budget: 700 },
  { resourceType: 'font', budget: 100 },
  { resourceType: 'stylesheet', budget: 550 },
  { resourceType: 'total', budget: 3200 },
] as const satisfies readonly PerfResourceBudget[];

const GROUP_PRIORITY: Record<PerfRouteGroup, number> = {
  home: 1,
  'public-profile-core': 2,
  'public-profile-detail': 3,
  'creator-shell': 4,
  'creator-alias': 5,
  'account-billing': 6,
  onboarding: 7,
  auth: 8,
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
    shell: ['[data-testid="homepage-shell"]'],
    content: ['[data-testid="homepage-primary-cta"]'],
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
    measureMode: 'page-load',
    readySelectors: {
      content: ['main h1', '[data-testid="profile-header"]'],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 3000 },
      { metric: 'largest-contentful-paint', budget: 3500 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2500 },
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
    measureMode: 'page-load',
    readySelectors: { content: ['main h1', 'main h2'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 2600 },
      { metric: 'largest-contentful-paint', budget: 3200 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
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
    measureMode: 'page-load',
    readySelectors: { content: ['main h1', 'main h2'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 2600 },
      { metric: 'largest-contentful-paint', budget: 3200 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
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
    measureMode: 'page-load',
    readySelectors: { content: ['main', 'a[href*="spotify"]'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 2800 },
      { metric: 'largest-contentful-paint', budget: 3300 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
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
    measureMode: 'page-load',
    readySelectors: { content: ['main', 'button', 'form'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 2800 },
      { metric: 'largest-contentful-paint', budget: 3300 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
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
    measureMode: 'page-load',
    readySelectors: {
      content: ['main', 'button', '[aria-label="Venmo Tipping"]'],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 2800 },
      { metric: 'largest-contentful-paint', budget: 3300 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
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
    measureMode: 'page-load',
    readySelectors: { content: ['main', 'section'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 2800 },
      { metric: 'largest-contentful-paint', budget: 3300 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 2400 },
    ],
    resourceSizes: DEFAULT_PUBLIC_RESOURCE_BUDGETS,
    priority: 9,
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
      content: [
        'button[aria-label="New thread"]',
        '[placeholder*="ask jovie" i]',
      ],
      loading: ['[data-testid="chat-loading"]'],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1500 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1500 },
      { metric: 'skeleton-to-content', budget: 600 },
    ],
    resourceSizes: CHAT_RESOURCE_BUDGETS,
    priority: 1,
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
      content: [
        'button[aria-label="New thread"]',
        '[placeholder*="ask jovie" i]',
      ],
      loading: ['[data-testid="chat-loading"]'],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1500 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1500 },
      { metric: 'skeleton-to-content', budget: 1200 },
    ],
    resourceSizes: CHAT_RESOURCE_BUDGETS,
    priority: 2,
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
      content: [
        'button[aria-label="New thread"]',
        '[placeholder*="ask jovie" i]',
      ],
      loading: ['[data-testid="chat-loading"]'],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1500 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1500 },
      { metric: 'skeleton-to-content', budget: 1200 },
    ],
    resourceSizes: CHAT_RESOURCE_BUDGETS,
    priority: 3,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-audience',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.DASHBOARD_AUDIENCE,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['[data-testid="dashboard-audience-client"]'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1600 },
      { metric: 'skeleton-to-content', budget: 600 },
    ],
    resourceSizes: CHAT_RESOURCE_BUDGETS,
    priority: 4,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-earnings',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.DASHBOARD_EARNINGS,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: {
      content: [
        'button:has-text("Connect Venmo")',
        ':text-matches("connect venmo|share this link anywhere", "i")',
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
    resourceSizes: ACCOUNT_BILLING_RESOURCE_BUDGETS,
    priority: 5,
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
    priority: 6,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-presence',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.PRESENCE,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['[data-testid="dsp-presence-workspace"]'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 3000 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1600 },
      { metric: 'skeleton-to-content', budget: 600 },
    ],
    resourceSizes: CHAT_RESOURCE_BUDGETS,
    priority: 7,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-releases',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.DASHBOARD_RELEASES,
    requiresAuth: true,
    warmupStrategy: 'authenticated-shell',
    measureMode: 'warm-navigation',
    readySelectors: {
      content: [
        '[data-testid="releases-loading"]',
        '[data-testid="releases-matrix"]',
      ],
      loading: ['[data-testid="releases-loading"]'],
      navTrigger: [
        `a[href="${APP_ROUTES.RELEASES}"]`,
        `a[href="${APP_ROUTES.DASHBOARD_RELEASES}"]`,
      ],
      redirectDestinations: [APP_ROUTES.RELEASES],
    },
    timings: [
      { metric: 'first-contentful-paint', budget: 1500 },
      { metric: 'largest-contentful-paint', budget: 2500 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1500 },
      { metric: 'warm-shell-response', budget: 100 },
      { metric: 'skeleton-to-content', budget: 1000 },
    ],
    resourceSizes: RELEASES_RESOURCE_BUDGETS,
    priority: 8,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-release-tasks',
    group: 'creator-shell',
    surface: 'creator-app',
    path: APP_ROUTES.DASHBOARD_RELEASE_TASKS,
    resolvePath: resolveReleaseTasksPerfPath,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: {
      content: [':text-matches("up next|tasks", "i")'],
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
    priority: 9,
    seedProfile: 'active-user',
  },
] as const satisfies readonly PerfRouteDefinition[];

const CREATOR_ALIAS_ROUTES = [
  {
    id: 'creator-alias-dashboard-overview',
    group: 'creator-alias',
    surface: 'creator-app',
    path: APP_ROUTES.DASHBOARD_OVERVIEW,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'redirect',
    readySelectors: {
      content: [
        'button[aria-label="New thread"]',
        '[placeholder*="ask jovie" i]',
      ],
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
      content: [
        'button[aria-label="New thread"]',
        '[placeholder*="ask jovie" i]',
      ],
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
      content: [
        'button[aria-label="New thread"]',
        '[placeholder*="ask jovie" i]',
      ],
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
    id: 'creator-alias-contacts',
    group: 'creator-alias',
    surface: 'creator-app',
    path: APP_ROUTES.CONTACTS,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['h2#contacts-heading'],
      redirectDestinations: [APP_ROUTES.SETTINGS_CONTACTS],
    },
    timings: [
      { metric: 'redirect-complete', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: ACCOUNT_BILLING_RESOURCE_BUDGETS,
    priority: 4,
    seedProfile: 'active-user',
  },
  {
    id: 'creator-alias-tour-dates',
    group: 'creator-alias',
    surface: 'creator-app',
    path: APP_ROUTES.TOUR_DATES,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'redirect',
    readySelectors: {
      content: ['h2#touring-heading'],
      redirectDestinations: [APP_ROUTES.SETTINGS_TOURING],
    },
    timings: [
      { metric: 'redirect-complete', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
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
      content: [
        'button:has-text("Connect Venmo")',
        ':text-matches("connect venmo|share this link anywhere", "i")',
      ],
      redirectDestinations: [APP_ROUTES.EARNINGS],
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
      content: ['h2#contacts-heading'],
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
      content: ['h2#touring-heading'],
      redirectDestinations: [APP_ROUTES.SETTINGS_TOURING],
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
    id: 'billing-remove-branding',
    group: 'account-billing',
    surface: 'account-billing',
    path: '/billing/remove-branding',
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
    priority: 5,
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
    path: APP_ROUTES.ONBOARDING,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['[data-testid="onboarding-form-wrapper"]'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1700 },
      { metric: 'largest-contentful-paint', budget: 2300 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
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
      { metric: 'first-contentful-paint', budget: 2000 },
      { metric: 'largest-contentful-paint', budget: 2600 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
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
    path: '/onboarding?resume=handle&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['[data-testid="onboarding-form-wrapper"]'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1700 },
      { metric: 'largest-contentful-paint', budget: 2300 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 3,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-spotify',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/onboarding?resume=spotify&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['[data-testid="onboarding-form-wrapper"]'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 2400 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 4,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-artist-confirm',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/onboarding?resume=artist-confirm&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['[data-testid="onboarding-form-wrapper"]'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 2400 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 5,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-upgrade',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/onboarding?resume=upgrade&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['[data-testid="onboarding-form-wrapper"]'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 2400 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 6,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-dsp',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/onboarding?resume=dsp&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['[data-testid="onboarding-form-wrapper"]'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1900 },
      { metric: 'largest-contentful-paint', budget: 2500 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 7,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-social',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/onboarding?resume=social&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['[data-testid="onboarding-form-wrapper"]'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1900 },
      { metric: 'largest-contentful-paint', budget: 2500 },
      { metric: 'cumulative-layout-shift', budget: 0.15 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 8,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-releases',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/onboarding?resume=releases&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['[data-testid="onboarding-form-wrapper"]'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1900 },
      { metric: 'largest-contentful-paint', budget: 2500 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 9,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-late-arrivals',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/onboarding?resume=late-arrivals&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['[data-testid="onboarding-form-wrapper"]'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1900 },
      { metric: 'largest-contentful-paint', budget: 2500 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
    resourceSizes: ONBOARDING_RESOURCE_BUDGETS,
    priority: 10,
    seedProfile: 'active-user',
  },
  {
    id: 'onboarding-resume-profile-ready',
    group: 'onboarding',
    surface: 'onboarding',
    path: '/onboarding?resume=profile-ready&handle=[username]',
    resolvePath: resolveActiveProfileOnboardingPath,
    requiresAuth: true,
    warmupStrategy: 'authenticated-route',
    measureMode: 'page-load',
    readySelectors: { content: ['[data-testid="onboarding-form-wrapper"]'] },
    timings: [
      { metric: 'first-contentful-paint', budget: 1900 },
      { metric: 'largest-contentful-paint', budget: 2500 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
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
  ...PUBLIC_PROFILE_CORE_ROUTES,
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
