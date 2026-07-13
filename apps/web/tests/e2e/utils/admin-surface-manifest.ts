import {
  ADMIN_LEGACY_REDIRECT_MAP,
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

export const ADMIN_RENDER_SURFACES: readonly AdminSurfaceDescriptor[] = [
  {
    id: 'overview',
    name: 'Admin Overview',
    path: APP_ROUTES.ADMIN,
    rootTestId: 'admin-overview-page',
    snapshotSlug: 'admin-overview',
    primaryWorkspace: true,
    utilityRoot: false,
    includeInFastHealth: true,
  },
  {
    id: 'people-waitlist',
    name: 'Admin People Waitlist',
    path: buildAdminPeopleHref('waitlist'),
    rootTestId: 'admin-people-view-waitlist',
    snapshotSlug: 'admin-people-waitlist',
    primaryWorkspace: true,
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
    primaryWorkspace: false,
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
    primaryWorkspace: false,
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
    primaryWorkspace: false,
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'people-feedback',
    name: 'Admin People Feedback',
    path: buildAdminPeopleHref('feedback'),
    rootTestId: 'admin-people-view-feedback',
    snapshotSlug: 'admin-people-feedback',
    primaryWorkspace: false,
    utilityRoot: false,
    includeInFastHealth: false,
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
    primaryWorkspace: true,
    utilityRoot: false,
    includeInFastHealth: true,
  },
  {
    id: 'growth-outreach-all',
    name: 'Admin Growth Outreach All',
    path: buildAdminGrowthHref(
      'outreach',
      new URLSearchParams({ queue: 'all' })
    ),
    rootTestId: 'admin-growth-view-outreach-all',
    snapshotSlug: 'admin-growth-outreach-all',
    primaryWorkspace: false,
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'growth-outreach-email',
    name: 'Admin Growth Outreach Email',
    path: buildAdminGrowthHref(
      'outreach',
      new URLSearchParams({ queue: 'email' })
    ),
    rootTestId: 'admin-growth-view-outreach-email',
    snapshotSlug: 'admin-growth-outreach-email',
    primaryWorkspace: false,
    utilityRoot: false,
    includeInFastHealth: true,
  },
  {
    id: 'growth-outreach-dm',
    name: 'Admin Growth Outreach DM',
    path: buildAdminGrowthHref(
      'outreach',
      new URLSearchParams({ queue: 'dm' })
    ),
    rootTestId: 'admin-growth-view-outreach-dm',
    snapshotSlug: 'admin-growth-outreach-dm',
    primaryWorkspace: false,
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'growth-outreach-review',
    name: 'Admin Growth Outreach Review',
    path: buildAdminGrowthHref(
      'outreach',
      new URLSearchParams({ queue: 'review' })
    ),
    rootTestId: 'admin-growth-view-outreach-review',
    snapshotSlug: 'admin-growth-outreach-review',
    primaryWorkspace: false,
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'growth-campaigns',
    name: 'Admin Growth Campaigns',
    path: buildAdminGrowthHref('campaigns'),
    rootTestId: 'admin-growth-view-campaigns',
    snapshotSlug: 'admin-growth-campaigns',
    primaryWorkspace: false,
    utilityRoot: false,
    includeInFastHealth: true,
  },
  {
    id: 'growth-ingest',
    name: 'Admin Growth Ingest',
    path: buildAdminGrowthHref('ingest'),
    rootTestId: 'admin-growth-view-ingest',
    snapshotSlug: 'admin-growth-ingest',
    primaryWorkspace: false,
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'activity',
    name: 'Admin Activity',
    path: APP_ROUTES.ADMIN_ACTIVITY,
    rootTestId: 'admin-activity-page',
    snapshotSlug: 'admin-activity',
    primaryWorkspace: true,
    utilityRoot: false,
    includeInFastHealth: true,
  },
  {
    id: 'investors',
    name: 'Admin Investors',
    path: APP_ROUTES.ADMIN_INVESTORS,
    rootTestId: 'admin-investors-page',
    snapshotSlug: 'admin-investors',
    primaryWorkspace: false,
    utilityRoot: true,
    includeInFastHealth: true,
  },
  {
    id: 'investors-links',
    name: 'Admin Investor Links',
    path: APP_ROUTES.ADMIN_INVESTORS_LINKS,
    rootTestId: 'admin-investors-links-page',
    snapshotSlug: 'admin-investors-links',
    primaryWorkspace: false,
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'investors-settings',
    name: 'Admin Investor Settings',
    path: APP_ROUTES.ADMIN_INVESTORS_SETTINGS,
    rootTestId: 'admin-investors-settings-page',
    snapshotSlug: 'admin-investors-settings',
    primaryWorkspace: false,
    utilityRoot: false,
    includeInFastHealth: false,
  },
  {
    id: 'screenshots',
    name: 'Admin Screenshots',
    path: APP_ROUTES.ADMIN_SCREENSHOTS,
    rootTestId: 'admin-screenshots-page',
    snapshotSlug: 'admin-screenshots',
    primaryWorkspace: false,
    utilityRoot: true,
    includeInFastHealth: true,
  },
  {
    id: 'share-studio',
    name: 'Admin Share Studio',
    path: APP_ROUTES.ADMIN_SHARE_STUDIO,
    rootTestId: 'admin-share-studio-page',
    snapshotSlug: 'admin-share-studio',
    primaryWorkspace: false,
    utilityRoot: true,
    includeInFastHealth: false,
  },
] as const;

export const ADMIN_REDIRECT_SURFACES: readonly AdminRedirectDescriptor[] =
  Object.entries(ADMIN_LEGACY_REDIRECT_MAP).map(([path, redirect]) => ({
    id: getRedirectId(path),
    name: getRedirectName(path),
    path,
    destination: redirect.href,
  }));

export const ADMIN_PRIMARY_NAV_SURFACES = ADMIN_RENDER_SURFACES.filter(
  surface => surface.primaryWorkspace
);

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
