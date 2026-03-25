import { APP_ROUTES } from '@/constants/routes';

export interface DashboardRouteDescriptor {
  readonly name: string;
  readonly path: string;
  /** Primary content selector — must be visible for health check to pass */
  readonly contentSelector?: string;
  /** Fallback selector — empty/alternate state that's also acceptable */
  readonly contentFallbackSelector?: string;
}

interface DashboardRouteGroup {
  readonly full: readonly DashboardRouteDescriptor[];
  readonly fast: readonly DashboardRouteDescriptor[];
}

const ACCOUNT_ROUTE = '/account';

const creatorDashboardRoutes = [
  {
    path: APP_ROUTES.AUDIENCE,
    name: 'Audience',
    contentSelector: '[data-testid="dashboard-audience-client"]',
  },
  {
    path: APP_ROUTES.CHAT,
    name: 'Chat',
    contentSelector:
      '[placeholder*="ask jovie" i], [placeholder*="Ask Jovie" i]',
  },
  {
    path: APP_ROUTES.EARNINGS,
    name: 'Earnings',
    contentSelector:
      'button:has-text("Connect Venmo"), :text-matches("connect venmo|share this link anywhere", "i")',
  },
  {
    path: APP_ROUTES.PRESENCE,
    name: 'Presence',
    contentSelector: '[data-testid^="presence-card-"]',
    contentFallbackSelector: ':text-matches("no dsp profiles found", "i")',
  },
  {
    path: APP_ROUTES.RELEASES,
    name: 'Releases',
    contentSelector: '[data-testid="releases-matrix"] h1',
    contentFallbackSelector:
      '[data-testid="releases-empty-state-enriching"], :text-matches("connect spotify|finding your music|no releases", "i")',
  },
] as const satisfies readonly DashboardRouteDescriptor[];

const creatorSettingsRoutes = [
  { path: APP_ROUTES.SETTINGS_ACCOUNT, name: 'Account Settings' },
  { path: APP_ROUTES.SETTINGS_BILLING, name: 'Settings Billing' },
  { path: APP_ROUTES.SETTINGS_ARTIST_PROFILE, name: 'Artist Profile' },
  { path: APP_ROUTES.SETTINGS_CONTACTS, name: 'Contacts' },
  { path: APP_ROUTES.SETTINGS_TOURING, name: 'Touring' },
  { path: APP_ROUTES.SETTINGS_AUDIENCE, name: 'Audience & Tracking' },
] as const satisfies readonly DashboardRouteDescriptor[];

const adminRoutes = [
  { path: APP_ROUTES.ADMIN, name: 'Admin Dashboard' },
  { path: APP_ROUTES.ADMIN_ACTIVITY, name: 'Admin Activity' },
  { path: APP_ROUTES.ADMIN_CAMPAIGNS, name: 'Admin Campaigns' },
  { path: APP_ROUTES.ADMIN_CREATORS, name: 'Admin Creators' },
  { path: APP_ROUTES.ADMIN_USERS, name: 'Admin Users' },
] as const satisfies readonly DashboardRouteDescriptor[];

export const DASHBOARD_ROUTE_MATRIX = {
  health: {
    full: [
      ...creatorDashboardRoutes,
      { path: APP_ROUTES.BILLING, name: 'Billing' },
      { path: ACCOUNT_ROUTE, name: 'Account' },
      { path: APP_ROUTES.SETTINGS_BILLING, name: 'Settings Billing' },
      { path: APP_ROUTES.SETTINGS_CONTACTS, name: 'Contacts' },
      { path: APP_ROUTES.SETTINGS_TOURING, name: 'Touring' },
    ],
    fast: [
      { path: APP_ROUTES.AUDIENCE, name: 'Audience' },
      { path: APP_ROUTES.CHAT, name: 'Chat' },
      { path: APP_ROUTES.RELEASES, name: 'Releases' },
    ],
  },
  dashboard: {
    full: creatorDashboardRoutes,
    fast: [{ path: APP_ROUTES.AUDIENCE, name: 'Audience' }],
  },
  settings: {
    full: creatorSettingsRoutes,
    fast: [{ path: APP_ROUTES.SETTINGS_ACCOUNT, name: 'Account Settings' }],
  },
  admin: {
    full: adminRoutes,
    fast: [{ path: APP_ROUTES.ADMIN, name: 'Admin Dashboard' }],
  },
} as const satisfies Record<string, DashboardRouteGroup>;

export function getRoutePaths(
  routes: readonly DashboardRouteDescriptor[]
): string[] {
  return routes.map(route => route.path);
}
