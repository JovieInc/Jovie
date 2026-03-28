import type { Page } from '@playwright/test';
import {
  buildAdminGrowthHref,
  buildAdminPeopleHref,
} from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';
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
      '[placeholder*="ask jovie" i], [placeholder*="Ask Jovie" i], button[aria-label="New thread"]',
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
      '[placeholder*="ask jovie" i], [placeholder*="Ask Jovie" i], button[aria-label="New thread"]',
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
      '[placeholder*="ask jovie" i], [placeholder*="Ask Jovie" i], button[aria-label="New thread"]',
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
    name: 'Earnings',
    kind: 'render',
    surface: 'creator',
    authRole: 'user',
    contentSelector:
      'button:has-text("Connect Venmo"), :text-matches("connect venmo|share this link anywhere", "i")',
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
    contentSelector: '[data-testid^="presence-row-"]',
    contentFallbackSelector: ':text-matches("no dsp profiles found", "i")',
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
    contentSelector: ':text-matches("up next|tasks", "i")',
    contentFallbackSelector:
      ':text-matches("set up campaign tasks|no tasks yet", "i")',
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
    contentSelector: 'h2#account-heading',
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SETTINGS_ADMIN,
    name: 'Settings Admin',
    kind: 'render',
    surface: 'settings',
    authRole: 'admin',
    contentSelector: 'h2#admin-heading',
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
    contentSelector: 'h2#analytics-heading',
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
    name: 'Settings Artist Profile',
    kind: 'render',
    surface: 'settings',
    authRole: 'user',
    contentSelector: 'h2#artist-profile-heading',
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SETTINGS_AUDIENCE,
    name: 'Settings Audience',
    kind: 'render',
    surface: 'settings',
    authRole: 'user',
    contentSelector: 'h2#audience-tracking-heading',
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SETTINGS_BILLING,
    name: 'Settings Billing',
    kind: 'render',
    surface: 'settings',
    authRole: 'user',
    contentSelector: 'h2#billing-heading',
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SETTINGS_CONTACTS,
    name: 'Settings Contacts',
    kind: 'render',
    surface: 'settings',
    authRole: 'user',
    contentSelector: 'h2#contacts-heading',
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SETTINGS_DATA_PRIVACY,
    name: 'Settings Data Privacy',
    kind: 'render',
    surface: 'settings',
    authRole: 'user',
    contentSelector: 'h2#data-privacy-heading',
    requiresUserButton: true,
    performanceBudgetMs: SETTINGS_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SETTINGS_PAYMENTS,
    name: 'Settings Payments',
    kind: 'render',
    surface: 'settings',
    authRole: 'user',
    contentSelector: 'h2#payments-heading',
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
    contentSelector: 'h2#touring-heading',
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
    acceptedDestinations: [APP_ROUTES.EARNINGS],
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
  {
    path: APP_ROUTES.ADMIN,
    name: 'Admin Overview',
    kind: 'render',
    surface: 'admin',
    authRole: 'admin',
    contentSelector: '[data-testid="admin-dashboard-content"]',
    acceptedDestinations: [APP_ROUTES.DASHBOARD],
    performanceBudgetMs: ADMIN_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.ADMIN_ACTIVITY,
    name: 'Admin Activity',
    kind: 'render',
    surface: 'admin',
    authRole: 'admin',
    contentSelector: '[data-testid="admin-activity-content"]',
    acceptedDestinations: [APP_ROUTES.DASHBOARD],
    performanceBudgetMs: ADMIN_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.ADMIN_GROWTH,
    name: 'Admin Growth',
    kind: 'render',
    surface: 'admin',
    authRole: 'admin',
    contentSelector: ':text("Growth operations")',
    acceptedDestinations: [APP_ROUTES.DASHBOARD],
    performanceBudgetMs: ADMIN_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.ADMIN_PEOPLE,
    name: 'Admin People',
    kind: 'render',
    surface: 'admin',
    authRole: 'admin',
    contentSelector: ':text("People operations")',
    acceptedDestinations: [APP_ROUTES.DASHBOARD],
    performanceBudgetMs: ADMIN_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.ADMIN_INVESTORS,
    name: 'Admin Investors',
    kind: 'render',
    surface: 'admin',
    authRole: 'admin',
    contentSelector: ':text("Investor pipeline")',
    acceptedDestinations: [APP_ROUTES.DASHBOARD],
    performanceBudgetMs: ADMIN_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.ADMIN_RELEASES,
    name: 'Admin Releases',
    kind: 'render',
    surface: 'admin',
    authRole: 'admin',
    contentSelector:
      ':text-matches("releases|release", "i"), table, [role="table"]',
    acceptedDestinations: [APP_ROUTES.DASHBOARD],
    performanceBudgetMs: ADMIN_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.ADMIN_SCREENSHOTS,
    name: 'Admin Screenshots',
    kind: 'render',
    surface: 'admin',
    authRole: 'admin',
    contentSelector: '[data-testid="admin-screenshots-content"]',
    acceptedDestinations: [APP_ROUTES.DASHBOARD],
    performanceBudgetMs: ADMIN_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.ADMIN_CAMPAIGNS,
    name: 'Admin Campaigns Redirect',
    kind: 'redirect',
    surface: 'admin',
    authRole: 'admin',
    acceptedDestinations: [
      buildAdminGrowthHref('campaigns'),
      APP_ROUTES.DASHBOARD,
    ],
  },
  {
    path: APP_ROUTES.ADMIN_CREATORS,
    name: 'Admin Creators Redirect',
    kind: 'redirect',
    surface: 'admin',
    authRole: 'admin',
    acceptedDestinations: [
      buildAdminPeopleHref('creators'),
      APP_ROUTES.DASHBOARD,
    ],
  },
  {
    path: APP_ROUTES.ADMIN_FEEDBACK,
    name: 'Admin Feedback Redirect',
    kind: 'redirect',
    surface: 'admin',
    authRole: 'admin',
    acceptedDestinations: [
      buildAdminPeopleHref('feedback'),
      APP_ROUTES.DASHBOARD,
    ],
  },
  {
    path: APP_ROUTES.ADMIN_INGEST,
    name: 'Admin Ingest Redirect',
    kind: 'redirect',
    surface: 'admin',
    authRole: 'admin',
    acceptedDestinations: [
      buildAdminGrowthHref('ingest'),
      APP_ROUTES.DASHBOARD,
    ],
  },
  {
    path: APP_ROUTES.ADMIN_LEADS,
    name: 'Admin Leads Redirect',
    kind: 'redirect',
    surface: 'admin',
    authRole: 'admin',
    acceptedDestinations: [buildAdminGrowthHref('leads'), APP_ROUTES.DASHBOARD],
  },
  {
    path: APP_ROUTES.ADMIN_OUTREACH,
    name: 'Admin Outreach Redirect',
    kind: 'redirect',
    surface: 'admin',
    authRole: 'admin',
    acceptedDestinations: [
      buildAdminGrowthHref('outreach'),
      APP_ROUTES.DASHBOARD,
    ],
  },
  {
    path: APP_ROUTES.ADMIN_USERS,
    name: 'Admin Users Redirect',
    kind: 'redirect',
    surface: 'admin',
    authRole: 'admin',
    acceptedDestinations: [buildAdminPeopleHref('users'), APP_ROUTES.DASHBOARD],
  },
  {
    path: APP_ROUTES.ADMIN_WAITLIST,
    name: 'Admin Waitlist Redirect',
    kind: 'redirect',
    surface: 'admin',
    authRole: 'admin',
    acceptedDestinations: [
      buildAdminPeopleHref('waitlist'),
      APP_ROUTES.DASHBOARD,
    ],
  },
] as const satisfies readonly DashboardRouteDescriptor[];

const fastHealthPaths = new Set([
  APP_ROUTES.DASHBOARD,
  APP_ROUTES.CHAT,
  APP_ROUTES.DASHBOARD_AUDIENCE,
  APP_ROUTES.DASHBOARD_RELEASES,
  APP_ROUTES.SETTINGS_ACCOUNT,
  APP_ROUTES.DASHBOARD_OVERVIEW,
]);

const fastAdminPaths = new Set([APP_ROUTES.ADMIN, APP_ROUTES.ADMIN_GROWTH]);

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
