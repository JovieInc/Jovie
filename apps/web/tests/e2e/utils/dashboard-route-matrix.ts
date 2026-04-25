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
export type DashboardRouteSurface =
  | 'creator'
  | 'settings'
  | 'admin'
  | 'alias'
  | 'marketing'
  | 'public-profile'
  | 'billing'
  | 'onboarding'
  | 'legal';
export type DashboardRouteAuthRole = 'user' | 'admin' | 'anonymous';

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
const PUBLIC_DEFAULT_BUDGET_MS = 15_000;

const CHAT_CONTENT_SELECTOR =
  '[placeholder*="ask jovie" i], [placeholder*="Ask Jovie" i], button[aria-label="New thread"], textarea, [contenteditable="true"], main';
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
    contentSelector: CHAT_CONTENT_SELECTOR,
    requiresUserButton: true,
    performanceBudgetMs: 8_000,
  },
  {
    path: APP_ROUTES.CHAT,
    name: 'Chat',
    kind: 'render',
    surface: 'creator',
    authRole: 'user',
    contentSelector: CHAT_CONTENT_SELECTOR,
    requiresUserButton: true,
    performanceBudgetMs: 8_000,
  },
  {
    path: '/app/chat/[id]',
    name: 'Chat Thread',
    kind: 'dynamic',
    surface: 'creator',
    authRole: 'user',
    contentSelector: CHAT_CONTENT_SELECTOR,
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
    path: APP_ROUTES.LEGACY_DASHBOARD,
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

const onboardingRoutes = [
  {
    path: APP_ROUTES.ONBOARDING,
    name: 'Onboarding',
    kind: 'render',
    surface: 'onboarding',
    authRole: 'user',
    contentSelector: 'main',
    requiresUserButton: true,
    performanceBudgetMs: CREATOR_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.ONBOARDING_CHECKOUT,
    name: 'Onboarding Checkout',
    kind: 'render',
    surface: 'onboarding',
    authRole: 'user',
    contentSelector: 'main',
    requiresUserButton: true,
    performanceBudgetMs: CREATOR_DEFAULT_BUDGET_MS,
  },
] as const satisfies readonly DashboardRouteDescriptor[];

const billingRoutes = [
  {
    path: APP_ROUTES.BILLING,
    name: 'Billing',
    kind: 'render',
    surface: 'billing',
    authRole: 'user',
    contentSelector: 'main',
    requiresUserButton: true,
    performanceBudgetMs: CREATOR_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.BILLING_SUCCESS,
    name: 'Billing Success',
    kind: 'render',
    surface: 'billing',
    authRole: 'user',
    contentSelector: 'main',
    requiresUserButton: true,
    performanceBudgetMs: CREATOR_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.BILLING_CANCEL,
    name: 'Billing Cancel',
    kind: 'render',
    surface: 'billing',
    authRole: 'user',
    contentSelector: 'main',
    requiresUserButton: true,
    performanceBudgetMs: CREATOR_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.PRICING,
    name: 'Billing Remove Branding',
    kind: 'render',
    surface: 'billing',
    authRole: 'user',
    contentSelector: 'main',
    requiresUserButton: true,
    performanceBudgetMs: CREATOR_DEFAULT_BUDGET_MS,
  },
] as const satisfies readonly DashboardRouteDescriptor[];

const marketingRoutes = [
  {
    path: APP_ROUTES.HOME,
    name: 'Homepage',
    kind: 'render',
    surface: 'marketing',
    authRole: 'anonymous',
    contentSelector: 'h1',
    performanceBudgetMs: PUBLIC_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.PRICING,
    name: 'Pricing',
    kind: 'render',
    surface: 'marketing',
    authRole: 'anonymous',
    contentSelector: 'h1, h2',
    performanceBudgetMs: PUBLIC_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.ABOUT,
    name: 'About',
    kind: 'render',
    surface: 'marketing',
    authRole: 'anonymous',
    contentSelector: 'main',
    performanceBudgetMs: PUBLIC_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.CHANGELOG,
    name: 'Changelog',
    kind: 'render',
    surface: 'marketing',
    authRole: 'anonymous',
    contentSelector: 'main',
    performanceBudgetMs: PUBLIC_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.SUPPORT,
    name: 'Support',
    kind: 'render',
    surface: 'marketing',
    authRole: 'anonymous',
    contentSelector: 'main',
    performanceBudgetMs: PUBLIC_DEFAULT_BUDGET_MS,
  },
] as const satisfies readonly DashboardRouteDescriptor[];

const legalRoutes = [
  {
    path: APP_ROUTES.LEGAL_PRIVACY,
    name: 'Privacy Policy',
    kind: 'render',
    surface: 'legal',
    authRole: 'anonymous',
    contentSelector: 'main',
    performanceBudgetMs: PUBLIC_DEFAULT_BUDGET_MS,
  },
  {
    path: APP_ROUTES.LEGAL_TERMS,
    name: 'Terms of Service',
    kind: 'render',
    surface: 'legal',
    authRole: 'anonymous',
    contentSelector: 'main',
    performanceBudgetMs: PUBLIC_DEFAULT_BUDGET_MS,
  },
] as const satisfies readonly DashboardRouteDescriptor[];

const publicProfileRoutes = [
  {
    path: '/[username]',
    name: 'Public Profile',
    kind: 'dynamic',
    surface: 'public-profile',
    authRole: 'anonymous',
    contentSelector: 'main',
    performanceBudgetMs: PUBLIC_DEFAULT_BUDGET_MS,
  },
  {
    path: '/[username]/about',
    name: 'Public Profile About',
    kind: 'dynamic',
    surface: 'public-profile',
    authRole: 'anonymous',
    contentSelector: 'main',
    performanceBudgetMs: PUBLIC_DEFAULT_BUDGET_MS,
  },
  {
    path: '/[username]/listen',
    name: 'Public Profile Listen',
    kind: 'dynamic',
    surface: 'public-profile',
    authRole: 'anonymous',
    contentSelector: 'main',
    performanceBudgetMs: PUBLIC_DEFAULT_BUDGET_MS,
  },
  {
    path: '/[username]/tour',
    name: 'Public Profile Tour',
    kind: 'dynamic',
    surface: 'public-profile',
    authRole: 'anonymous',
    contentSelector: 'main',
    performanceBudgetMs: PUBLIC_DEFAULT_BUDGET_MS,
  },
  {
    path: '/[username]/shop',
    name: 'Public Profile Shop',
    kind: 'dynamic',
    surface: 'public-profile',
    authRole: 'anonymous',
    contentSelector: 'main',
    performanceBudgetMs: PUBLIC_DEFAULT_BUDGET_MS,
  },
  {
    path: '/[username]/subscribe',
    name: 'Public Profile Subscribe',
    kind: 'dynamic',
    surface: 'public-profile',
    authRole: 'anonymous',
    contentSelector: 'main',
    performanceBudgetMs: PUBLIC_DEFAULT_BUDGET_MS,
  },
] as const satisfies readonly DashboardRouteDescriptor[];

/**
 * Routes intentionally excluded from coverage tracking.
 * These are internal, dev-only, or redirect-only pages.
 */
export const EXCLUDED_ROUTES: Record<string, string> = {
  '/sso-callback': 'Clerk internal redirect',
  '/sentry-example-page': 'Sentry test page',
  '/spinner-test': 'Dev utility',
  '/sandbox': 'Dev sandbox',
  '/hud': 'Dev HUD',
  '/ui': 'Component showcase root',
  '/ui/avatars': 'Component showcase',
  '/ui/badges': 'Component showcase',
  '/ui/buttons': 'Component showcase',
  '/ui/checkboxes': 'Component showcase',
  '/ui/dialogs': 'Component showcase',
  '/ui/dropdowns': 'Component showcase',
  '/ui/inputs': 'Component showcase',
  '/ui/selects': 'Component showcase',
  '/ui/switches': 'Component showcase',
  '/ui/tooltips': 'Component showcase',
  '/demo': 'Internal demo root',
  '/demo/audience': 'Internal demo',
  '/demo/dropdowns': 'Internal demo',
  '/demo/onboarding': 'Internal demo',
  '/demo/showcase/:surface': 'Internal demo',
  '/demo/video': 'Internal demo (marketing)',
  '/error/user-creation-failed': 'Error page (covered by error.tsx)',
  '/artist-selection': 'Internal flow',
  '/artists': 'Internal listing',
  '/claim/:token': 'One-time claim flow',
  '/out/:id': 'Redirect-only',
  '/r/:slug': 'Redirect-only',
  '/waitlist': 'Legacy',
  '/unavailable': 'Error state',
  '/signin': 'Covered by visual-regression.spec.ts',
  '/signup': 'Covered by visual-regression.spec.ts',
  '/signin/sso-callback': 'Clerk internal',
  '/signup/sso-callback': 'Clerk internal',
  '/account': 'Clerk account page',
  '/investor-portal': 'Investor portal (admin-managed)',
  '/investor-portal/:slug': 'Investor portal detail',
  '/investor-portal/respond': 'Investor portal response',
  '/:username/contact': 'Profile contact form',
  '/:username/notifications': 'Profile notifications',
  '/:username/tip': 'Profile tipping',
  '/:username/claim': 'Profile claim flow',
  '/:username/:slug': 'Release page (dynamic)',
  '/:username/:slug/sounds': 'Release sounds (dynamic)',
  '/:username/:slug/:trackSlug': 'Track page (dynamic)',
  '/:username/...slug': 'Catch-all profile route',
};

const fastHealthPaths = new Set([
  APP_ROUTES.DASHBOARD,
  APP_ROUTES.CHAT,
  APP_ROUTES.DASHBOARD_AUDIENCE,
  APP_ROUTES.DASHBOARD_RELEASES,
  APP_ROUTES.SETTINGS_ACCOUNT,
  APP_ROUTES.LEGACY_DASHBOARD,
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
  onboarding: {
    full: onboardingRoutes,
    fast: onboardingRoutes,
  },
  billing: {
    full: billingRoutes,
    fast: billingRoutes,
  },
  marketing: {
    full: marketingRoutes,
    fast: marketingRoutes,
  },
  legal: {
    full: legalRoutes,
    fast: legalRoutes,
  },
  'public-profile': {
    full: publicProfileRoutes,
    fast: publicProfileRoutes,
  },
} as const satisfies Record<string, DashboardRouteGroup>;

export function getRoutePaths(
  routes: readonly DashboardRouteDescriptor[]
): string[] {
  return routes.map(route => route.path);
}
