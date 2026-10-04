import {
  ADMIN_LEGACY_REDIRECT_MAP,
  ADMIN_NAV_REGISTRY,
  buildAdminGrowthHref,
  buildAdminPeopleHref,
} from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';

export interface AdminSurfaceDescriptor {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly rootTestId: string;
  readonly snapshotSlug: string;
  readonly primaryWorkspace: boolean;
  readonly utilityRoot: boolean;
  readonly includeInFastHealth: boolean;
}

export interface AdminRedirectDescriptor {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly destination: string;
}

const FILTERED_SEARCH = 'E2E Admin';
const ADMIN_PATH_PREFIX = `${APP_ROUTES.ADMIN}/`;

function selectorForTestId(testId: string): string {
  return `[data-testid="${testId}"]`;
}

function toTitleCase(segment: string): string {
  if (segment === 'yc') {
    return 'YC';
  }

  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function getRedirectId(path: string): string {
  const slug = path
    .replace(ADMIN_PATH_PREFIX, '')
    .replaceAll('/', '-')
    .replace(/\[|\]/g, '');

  return `${slug}-redirect`;
}

function getRedirectName(path: string): string {
  const label = path
    .replace(ADMIN_PATH_PREFIX, '')
    .split('/')
    .flatMap(segment => segment.split('-'))
    .map(toTitleCase)
    .join(' ');

  return `Admin ${label} Redirect`;
}

const renderSurfaces = [
  {
    id: 'ops',
    name: 'Admin Now',
    path: APP_ROUTES.HUD,
    rootTestId: 'hud-admin-page',
    snapshotSlug: 'admin-ops',
    utilityRoot: false,
    includeInFastHealth: true,
  },
  {
    id: 'product',
    name: 'Admin Product',
    path: APP_ROUTES.ADMIN_PRODUCT,
    rootTestId: 'founder-product-page',
    snapshotSlug: 'admin-product',
    utilityRoot: false,
    includeInFastHealth: true,
  },
  {
    id: 'operations',
    name: 'Admin Operations',
    path: APP_ROUTES.ADMIN_OPERATIONS,
    rootTestId: 'founder-operations-page',
    snapshotSlug: 'admin-operations',
    utilityRoot: false,
    includeInFastHealth: true,
  },
  {
    id: 'needs-you',
    name: 'Admin Needs You',
    path: APP_ROUTES.ADMIN_NEEDS_YOU,
    rootTestId: 'founder-needs-you-page',
    snapshotSlug: 'admin-needs-you',
    utilityRoot: false,
    includeInFastHealth: true,
  },
  {
    id: 'people-contacts',
    name: 'Admin People Customers',
    path: buildAdminPeopleHref('contacts'),
    rootTestId: 'admin-people-view-contacts',
    snapshotSlug: 'admin-people-contacts',
    utilityRoot: true,
    includeInFastHealth: true,
  },
  {
    id: 'people-waitlist',
    name: 'Admin People Waitlist',
    path: buildAdminPeopleHref('waitlist'),
    rootTestId: 'admin-people-view-waitlist',
    snapshotSlug: 'admin-people-waitlist',
    utilityRoot: false,
    includeInFastHealth: true,
  },
  {
    id: 'people-creators',
    name: 'Admin People Creators',
    path: buildAdminPeopleHref(
      'creators',
      new URLSearchParams({ q: FILTERED_SEARCH })
    ),
    rootTestId: 'admin-people-view-creators',
    snapshotSlug: 'admin-people-creators',
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'people-users',
    name: 'Admin People Users',
    path: buildAdminPeopleHref(
      'users',
      new URLSearchParams({ q: FILTERED_SEARCH })
    ),
    rootTestId: 'admin-people-view-users',
    snapshotSlug: 'admin-people-users',
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'people-releases',
    name: 'Admin People Releases',
    path: buildAdminPeopleHref(
      'releases',
      new URLSearchParams({ q: FILTERED_SEARCH })
    ),
    rootTestId: 'admin-people-view-releases',
    snapshotSlug: 'admin-people-releases',
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'people-assets',
    name: 'Admin People Assets',
    path: buildAdminPeopleHref('assets'),
    rootTestId: 'admin-people-view-assets',
    snapshotSlug: 'admin-people-assets',
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'people-feedback',
    name: 'Admin People Feedback',
    path: buildAdminPeopleHref('feedback'),
    rootTestId: 'admin-people-view-feedback',
    snapshotSlug: 'admin-people-feedback',
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'people-recovery',
    name: 'Admin People Recovery',
    path: buildAdminPeopleHref('recovery'),
    rootTestId: 'admin-people-view-recovery',
    snapshotSlug: 'admin-people-recovery',
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'growth',
    name: 'Admin Growth',
    path: APP_ROUTES.ADMIN_GROWTH,
    rootTestId: 'admin-growth-page',
    snapshotSlug: 'admin-growth',
    utilityRoot: false,
    includeInFastHealth: true,
  },
  {
    id: 'growth-leads',
    name: 'Admin Growth Leads',
    path: buildAdminGrowthHref(
      'leads',
      new URLSearchParams({ q: FILTERED_SEARCH })
    ),
    rootTestId: 'admin-growth-view-leads',
    snapshotSlug: 'admin-growth-leads',
    utilityRoot: false,
    includeInFastHealth: true,
  },
  {
    // The growth page now consolidates outreach + campaigns into a single
    // "Outreach & Campaigns" accordion (GtmCollapsibles) that auto-opens via
    // ?view=outreach; the per-queue views and their dedicated testids no
    // longer exist (JOV-4326). The page shell is the stable render contract.
    id: 'growth-outreach',
    name: 'Admin Growth Outreach',
    path: buildAdminGrowthHref('outreach'),
    rootTestId: 'admin-growth-page',
    snapshotSlug: 'admin-growth-outreach',
    utilityRoot: false,
    includeInFastHealth: true,
  },
  {
    id: 'growth-campaigns',
    name: 'Admin Growth Campaigns',
    path: buildAdminGrowthHref('campaigns'),
    rootTestId: 'admin-growth-page',
    snapshotSlug: 'admin-growth-campaigns',
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'growth-ingest',
    name: 'Admin Growth Ingest',
    path: buildAdminGrowthHref('ingest'),
    // Ingest is an accordion in Growth, not a separate view root.
    rootTestId: 'admin-growth-page',
    snapshotSlug: 'admin-growth-ingest',
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'activity',
    name: 'Admin Activity',
    path: APP_ROUTES.ADMIN_ACTIVITY,
    rootTestId: 'admin-activity-page',
    snapshotSlug: 'admin-activity',
    utilityRoot: true,
    includeInFastHealth: true,
  },
  {
    id: 'investors',
    name: 'Admin Investors',
    path: APP_ROUTES.ADMIN_INVESTORS,
    rootTestId: 'admin-investors-page',
    snapshotSlug: 'admin-investors',
    utilityRoot: true,
    includeInFastHealth: true,
  },
  {
    id: 'investors-links',
    name: 'Admin Investor Links',
    path: APP_ROUTES.ADMIN_INVESTORS_LINKS,
    rootTestId: 'admin-investors-links-page',
    snapshotSlug: 'admin-investors-links',
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'investor-updates',
    name: 'Admin Investor Updates',
    path: APP_ROUTES.ADMIN_INVESTOR_UPDATES,
    rootTestId: 'admin-investor-updates-page',
    snapshotSlug: 'admin-investor-updates',
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'investors-settings',
    name: 'Admin Investor Settings',
    path: APP_ROUTES.ADMIN_INVESTORS_SETTINGS,
    rootTestId: 'admin-investors-settings-page',
    snapshotSlug: 'admin-investors-settings',
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'screenshots',
    name: 'Admin Screenshots',
    path: APP_ROUTES.ADMIN_SCREENSHOTS,
    rootTestId: 'admin-screenshots-page',
    snapshotSlug: 'admin-screenshots',
    utilityRoot: true,
    includeInFastHealth: true,
  },
  {
    id: 'share-studio',
    name: 'Admin Share Studio',
    path: APP_ROUTES.ADMIN_SHARE_STUDIO,
    rootTestId: 'admin-share-studio-page',
    snapshotSlug: 'admin-share-studio',
    utilityRoot: true,
    includeInFastHealth: false,
  },
] as const;

// Navigation owns primary membership. A filtered subview must not masquerade
// as another primary workspace in navigation or narrow-window coverage.
const primaryPaths = new Set(
  ADMIN_NAV_REGISTRY.filter(item => item.section === 'workspaces').map(
    item => item.href
  )
);

export const ADMIN_RENDER_SURFACES: readonly AdminSurfaceDescriptor[] =
  renderSurfaces.map(surface => ({
    ...surface,
    primaryWorkspace: primaryPaths.has(surface.path),
  }));

export const ADMIN_REDIRECT_SURFACES: readonly AdminRedirectDescriptor[] =
  Object.entries(ADMIN_LEGACY_REDIRECT_MAP).map(([path, redirect]) => ({
    id: getRedirectId(path),
    name: getRedirectName(path),
    path,
    destination: redirect.href,
  }));

export const ADMIN_PRIMARY_NAV_SURFACES = ADMIN_NAV_REGISTRY.filter(
  item => item.section === 'workspaces'
).map(item => {
  const surface = ADMIN_RENDER_SURFACES.find(entry => entry.path === item.href);
  if (!surface) {
    throw new Error(`Missing primary admin surface for "${item.id}"`);
  }
  return surface;
});

export const ADMIN_FAST_HEALTH_SURFACES = ADMIN_RENDER_SURFACES.filter(
  surface => surface.includeInFastHealth
);

export const ADMIN_MOBILE_SNAPSHOT_SURFACES = ADMIN_RENDER_SURFACES.filter(
  surface => surface.primaryWorkspace || surface.utilityRoot
);

export function getAdminSurfaceSelector(
  surface: AdminSurfaceDescriptor
): string {
  return selectorForTestId(surface.rootTestId);
}

export function getAdminSurfaceById(id: string): AdminSurfaceDescriptor {
  const surface = ADMIN_RENDER_SURFACES.find(entry => entry.id === id);

  if (!surface) {
    throw new Error(`Unknown admin surface "${id}"`);
  }

  return surface;
}
