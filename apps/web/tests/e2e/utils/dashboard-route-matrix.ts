import type { Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  ADMIN_FAST_HEALTH_SURFACES,
  ADMIN_REDIRECT_SURFACES,
  ADMIN_RENDER_SURFACES,
  getAdminSurfaceSelector,
} from './admin-surface-manifest';
import {
  resolveChatConversationPath,
  resolveReleaseTasksPathFromPage,
} from './dashboard-route-resolvers';

export type DashboardRouteKind = 'render' | 'redirect' | 'dynamic';
export type DashboardRouteSurface = 'creator' | 'settings' | 'admin' | 'alias';
export type DashboardRouteAuthRole = 'user' | 'admin';

export type DashboardRouteResolver = (page: Page) => Promise<string>;

export interface DashboardRouteDescriptor {
  readonly name: string;
  readonly path: string;
  readonly kind: DashboardRouteKind;
  readonly surface: DashboardRouteSurface;
  readonly authRole: DashboardRouteAuthRole;
  readonly contentSelector?: string;
  readonly contentFallbackSelector?: string;
  readonly acceptedDestinations?: readonly string[];
  readonly resolver?: DashboardRouteResolver;
  readonly requiresUserButton?: boolean;
  readonly performanceBudgetMs?: number;
  readonly skipReason?: string;
}

interface DashboardRouteGroup {
  readonly full: readonly DashboardRouteDescriptor[];
  readonly fast: readonly DashboardRouteDescriptor[];
}

const CREATOR_DEFAULT_BUDGET_MS = 12_000;
const SETTINGS_DEFAULT_BUDGET_MS = 12_000;
const ADMIN_DEFAULT_BUDGET_MS = 15_000;
const DASHBOARD_RELEASE_TASKS_ROUTE = `${APP_ROUTES.DASHBOARD_RELEASES}/[releaseId]/tasks`;
const DASHBOARD_TIPPING_ROUTE = `${APP_ROUTES.DASHBOARD}/tipping`;
const DASHBOARD_CONTACTS_ROUTE = `${APP_ROUTES.DASHBOARD}/contacts`;
const DASHBOARD_TOUR_DATES_ROUTE = `${APP_ROUTES.DASHBOARD}/tour-dates`;

const creatorRoutes = [
  {
    path: APP_ROUTES.DASHBOARD,
    name: 'App Home',
    kind: 'render',
    surface: 'creator',
    authRole: 'user',
    contentSelector:
      '[placeholder*="ask jovie" i], [placeholder*="Ask Jovie" i], button[aria-label="New thread"], textarea, [contenteditable="true"], main',
    requiresUserButton: true,
    performanceBudgetMs: 8_000,
  },
  {
    path: APP_ROUTES.CHAT,
    name: 'Chat',
    kind: 'render',
    surface: 'creator',
    authRole: 'user',
    contentSelector:
      '[placeholder*="ask jovie" i], [placeholder*="Ask Jovie" i], button[aria-label="New thread"], textarea, [contenteditable="true"], main',
    requiresUserButton: true,
    performanceBudgetMs: 8_000,
  },
  {
    path: '/app/chat/[id]',
    name: 'Chat Thread',
    kind: 'dynamic',
    surface: 'creator',
    authRole: 'user',
    contentSelector:
      '[placeholder*="ask jovie" i], [placeholder*="Ask Jovie" i], button[aria-label="New thread"], textarea, [contenteditable="true"], main',
    requiresUserButton: true,
    performanceBudgetMs: 8_000,
    resolver: resolveChatConversationPath,
  },
  {
    path: APP_ROUTES.DASHBOARD_AUDIENCE,
    name: 'Audience',
    kind: 'render',
    surface: 'creator',
    authRole: 'user',
    contentSelector: '[data-testid="dashboard-audience-client"]',
    requiresUserButton: true,
    performanceBudgetMs: CREATOR_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.DASHBOARD_EARNINGS,
    name: 'Legacy Earnings Redirect',
    kind: 'redirect',
    surface: 'creator',
    authRole: 'user',
    acceptedDestinations: [`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn`],
    requiresUserButton: true,
    performanceBudgetMs: CREATOR_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.INSIGHTS,
    name: 'Insights',
    kind: 'render',
    surface: 'creator',
    authRole: 'user',
    contentSelector:
      'h2:has-text("AI Insights"), button[aria-label*="Generate insights" i]',
    contentFallbackSelector:
      ':text-matches("ai-powered analytics recommendations|failed to load insights", "i")',
    requiresUserButton: true,
    performanceBudgetMs: CREATOR_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.PRESENCE,
    name: 'Presence',
    kind: 'render',
    surface: 'creator',
    authRole: 'user',
    contentSelector:
      '[data-testid="dsp-presence-workspace"], [data-testid="dsp-presence-content-panel"]',
    contentFallbackSelector: '[data-testid="presence-empty-state"]',
    requiresUserButton: true,
    performanceBudgetMs: CREATOR_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.DASHBOARD_RELEASES,
    name: 'Releases',
    kind: 'render',
    surface: 'creator',
    authRole: 'user',
    contentSelector: '[data-testid="releases-matrix"]',
    contentFallbackSelector:
      '[data-testid="releases-empty-state-enriching"], :text-matches("connect spotify|finding your music|no releases", "i")',
    requiresUserButton: true,
    performanceBudgetMs: CREATOR_DEFAULT_BUDGET_MS,
  },
  {
    path: DASHBOARD_RELEASE_TASKS_ROUTE,
    name: 'Release Tasks',
    kind: 'dynamic',
    surface: 'creator',
    authRole: 'user',
    contentSelector:
      '[data-testid="release-task-page"], [data-testid="release-task-checklist"], [data-testid="release-task-empty-state"]',
    contentFallbackSelector:
      ':text-matches("set up campaign tasks|set up tasks anyway|release playbook|no tasks yet", "i")',
    requiresUserButton: true,
    performanceBudgetMs: CREATOR_DEFAULT_BUDGET_MS,
    resolver: resolveReleaseTasksPathFromPage,
  },
] as const satisfies readonly DashboardRouteDescriptor[];

const settingsRoutes = [
  {
    path: APP_ROUTES.SETTINGS_ACCOUNT,
    name: 'Settings Account',
    kind: 'render',
    surface: 'settings',
    authRole: 'user',
    contentSelector: 'section#account',
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SETTINGS_ADMIN,
    name: 'Settings Admin',
    kind: 'render',
    surface: 'settings',
    authRole: 'admin',
    contentSelector: 'section#admin',
    acceptedDestinations: [APP_ROUTES.SETTINGS_ARTIST_PROFILE],
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SETTINGS_ANALYTICS,
    name: 'Settings Analytics',
    kind: 'render',
    surface: 'settings',
    authRole: 'user',
    contentSelector: 'section#analytics',
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
    name: 'Settings Artist Profile',
    kind: 'render',
    surface: 'settings',
    authRole: 'user',
    contentSelector: 'section#artist-profile',
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SETTINGS_AUDIENCE,
    name: 'Settings Audience',
    kind: 'render',
    surface: 'settings',
    authRole: 'user',
    contentSelector: 'section#audience-tracking',
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SETTINGS_BILLING,
    name: 'Settings Billing',
    kind: 'render',
    surface: 'settings',
    authRole: 'user',
    contentSelector: 'section#billing',
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SETTINGS_CONTACTS,
    name: 'Settings Contacts',
    kind: 'render',
    surface: 'settings',
    authRole: 'user',
    contentSelector: 'section#contacts',
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SETTINGS_DATA_PRIVACY,
    name: 'Settings Data Privacy',
    kind: 'render',
    surface: 'settings',
    authRole: 'user',
    contentSelector: 'section#data-privacy',
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SETTINGS_PAYMENTS,
    name: 'Settings Payments',
    kind: 'render',
    surface: 'settings',
    authRole: 'user',
    contentSelector: 'section#payments',
    acceptedDestinations: [APP_ROUTES.SETTINGS_BILLING],
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SETTINGS_TOURING,
    name: 'Settings Touring',
    kind: 'render',
    surface: 'settings',
    authRole: 'user',
    contentSelector: 'section#touring',
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
] as const satisfies readonly DashboardRouteDescriptor[];

const aliasRoutes = [
  {
    path: APP_ROUTES.DASHBOARD_OVERVIEW,
    name: 'Legacy Dashboard Redirect',
    kind: 'redirect',
    surface: 'alias',
    authRole: 'user',
    acceptedDestinations: [APP_ROUTES.DASHBOARD],
  },
  {
    path: APP_ROUTES.DASHBOARD_PROFILE,
    name: 'Legacy Profile Redirect',
    kind: 'redirect',
    surface: 'alias',
    authRole: 'user',
    acceptedDestinations: [`${APP_ROUTES.CHAT}?panel=profile`, APP_ROUTES.CHAT],
  },
  {
    path: APP_ROUTES.DASHBOARD_LINKS,
    name: 'Legacy Links Redirect',
    kind: 'redirect',
    surface: 'alias',
    authRole: 'user',
    acceptedDestinations: [`${APP_ROUTES.CHAT}?panel=profile`, APP_ROUTES.CHAT],
  },
  {
    path: APP_ROUTES.CONTACTS,
    name: 'Legacy Contacts Redirect',
    kind: 'redirect',
    surface: 'alias',
    authRole: 'user',
    acceptedDestinations: [APP_ROUTES.SETTINGS_CONTACTS],
  },
  {
    path: APP_ROUTES.TOUR_DATES,
    name: 'Legacy Touring Redirect',
    kind: 'redirect',
    surface: 'alias',
    authRole: 'user',
    acceptedDestinations: [APP_ROUTES.SETTINGS_TOURING],
  },
  {
    path: DASHBOARD_TIPPING_ROUTE,
    name: 'Legacy Tipping Redirect',
    kind: 'redirect',
    surface: 'alias',
    authRole: 'user',
    acceptedDestinations: [
      `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn`,
      APP_ROUTES.EARNINGS,
    ],
  },
  {
    path: DASHBOARD_CONTACTS_ROUTE,
    name: 'Legacy Dashboard Contacts Redirect',
    kind: 'redirect',
    surface: 'alias',
    authRole: 'user',
    acceptedDestinations: [APP_ROUTES.SETTINGS_CONTACTS],
  },
  {
    path: DASHBOARD_TOUR_DATES_ROUTE,
    name: 'Legacy Dashboard Touring Redirect',
    kind: 'redirect',
    surface: 'alias',
    authRole: 'user',
    acceptedDestinations: [APP_ROUTES.SETTINGS_TOURING],
  },
] as const satisfies readonly DashboardRouteDescriptor[];

const adminRoutes = [
  ...ADMIN_RENDER_SURFACES.map(surface => ({
    path: surface.path,
    name: surface.name,
    kind: 'render' as const,
    surface: 'admin' as const,
    authRole: 'admin' as const,
    contentSelector: getAdminSurfaceSelector(surface),
    acceptedDestinations: [APP_ROUTES.DASHBOARD],
    performanceBudgetMs: ADMIN_DEFAULT_BUDGET_MS,
  })),
  ...ADMIN_REDIRECT_SURFACES.map(redirect => ({
    path: redirect.path,
    name: redirect.name,
    kind: 'redirect' as const,
    surface: 'admin' as const,
    authRole: 'admin' as const,
    acceptedDestinations: [redirect.destination, APP_ROUTES.DASHBOARD],
  })),
] as const satisfies readonly DashboardRouteDescriptor[];

const fastHealthPaths = new Set([
  APP_ROUTES.DASHBOARD,
  APP_ROUTES.CHAT,
  APP_ROUTES.DASHBOARD_AUDIENCE,
  APP_ROUTES.DASHBOARD_RELEASES,
  APP_ROUTES.SETTINGS_ACCOUNT,
  APP_ROUTES.DASHBOARD_OVERVIEW,
]);

const fastAdminPaths = new Set(
  ADMIN_FAST_HEALTH_SURFACES.map(surface => surface.path)
);

function selectFastRoutes(
  routes: readonly DashboardRouteDescriptor[],
  fastPaths: ReadonlySet<string>
): readonly DashboardRouteDescriptor[] {
  return routes.filter(route => fastPaths.has(route.path));
}

export const DASHBOARD_ROUTE_MATRIX = {
  health: {
    full: [...creatorRoutes, ...settingsRoutes, ...aliasRoutes],
    fast: selectFastRoutes(
      [...creatorRoutes, ...settingsRoutes, ...aliasRoutes],
      fastHealthPaths
    ),
  },
  dashboard: {
    full: creatorRoutes,
    fast: selectFastRoutes(creatorRoutes, fastHealthPaths),
  },
  settings: {
    full: settingsRoutes,
    fast: selectFastRoutes(settingsRoutes, fastHealthPaths),
  },
  alias: {
    full: aliasRoutes,
    fast: selectFastRoutes(aliasRoutes, fastHealthPaths),
  },
  admin: {
    full: adminRoutes,
    fast: selectFastRoutes(adminRoutes, fastAdminPaths),
  },
} as const satisfies Record<string, DashboardRouteGroup>;

export function getRoutePaths(
  routes: readonly DashboardRouteDescriptor[]
): string[] {
  return routes.map(route => route.path);
}
