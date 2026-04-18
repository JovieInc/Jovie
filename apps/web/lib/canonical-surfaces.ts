import { APP_ROUTES } from '@/constants/routes';

export const CANONICAL_SURFACE_IDS = [
  'homepage',
  'public-profile',
  'release-landing',
  'dashboard-releases',
  'dashboard-audience',
  'dashboard-insights',
  'dashboard-earnings',
  'settings-artist-profile',
  'settings-links',
] as const;

export type CanonicalSurfaceId = (typeof CANONICAL_SURFACE_IDS)[number];

export interface CanonicalSurfaceDefinition {
  readonly id: CanonicalSurfaceId;
  readonly label: string;
  readonly liveRoutes: readonly string[];
  readonly reviewRoute: string;
  readonly sourceRoute: string;
  readonly sourceComponent: string;
  readonly demoRoute: string;
  readonly fixtureSetId: string;
  readonly screenshotIds: readonly string[];
  readonly routeOwner: string;
  readonly componentFamily: string;
  readonly description: string;
}

export const CANONICAL_SURFACES = [
  {
    id: 'homepage',
    label: 'Homepage',
    liveRoutes: ['/'],
    reviewRoute: '/',
    sourceRoute: '/',
    sourceComponent: 'app/(home)/page.tsx -> HomePageNarrative',
    demoRoute: '/',
    fixtureSetId: 'marketing-static',
    screenshotIds: ['marketing-home-desktop'],
    routeOwner: 'app/(home)/page.tsx -> HomePageNarrative',
    componentFamily: 'features/home',
    description: 'Primary marketing homepage and current live review surface.',
  },
  {
    id: 'public-profile',
    label: 'Public Profile',
    liveRoutes: ['/[username]'],
    reviewRoute: '/demo/showcase/public-profile',
    sourceRoute: '/[username]',
    sourceComponent: 'app/[username]/page.tsx -> StaticArtistPage',
    demoRoute: '/demo/showcase/public-profile',
    fixtureSetId: 'public-profile-demo',
    screenshotIds: ['public-profile-desktop', 'public-profile-mobile'],
    routeOwner: 'app/[username]/page.tsx -> StaticArtistPage',
    componentFamily: 'features/profile',
    description:
      'Canonical public artist profile surface rendered from StaticArtistPage and ProfileCompactTemplate.',
  },
  {
    id: 'release-landing',
    label: 'Release Landing',
    liveRoutes: ['/r/[slug]', '/[username]/[slug]'],
    reviewRoute: '/demo/showcase/release-landing',
    sourceRoute: '/r/[slug]',
    sourceComponent:
      'app/r/[slug]/ReleaseLandingPage.tsx -> ReleaseLandingPage',
    demoRoute: '/demo/showcase/release-landing',
    fixtureSetId: 'release-landing-demo',
    screenshotIds: ['release-landing-desktop', 'release-landing-mobile'],
    routeOwner: 'app/r/[slug]/ReleaseLandingPage.tsx -> ReleaseLandingPage',
    componentFamily: 'features/release',
    description:
      'Canonical smart-link release destination sharing the public shell direction.',
  },
  {
    id: 'dashboard-releases',
    label: 'Dashboard Releases',
    liveRoutes: [APP_ROUTES.DASHBOARD_RELEASES],
    reviewRoute: '/demo',
    sourceRoute: APP_ROUTES.DASHBOARD_RELEASES,
    sourceComponent:
      'features/dashboard/organisms/release-provider-matrix/ReleasesExperience',
    demoRoute: '/demo',
    fixtureSetId: 'dashboard-releases-demo',
    screenshotIds: [
      'dashboard-releases-desktop',
      'dashboard-releases-sidebar-desktop',
      'dashboard-release-sidebar-detail-desktop',
      'dashboard-release-sidebar-platforms-desktop',
    ],
    routeOwner:
      'app/app/(shell)/dashboard/releases/page.tsx -> ReleasesPageClient',
    componentFamily: 'features/dashboard/organisms/release-provider-matrix',
    description:
      'Canonical authenticated releases workspace and current dashboard review/capture surface.',
  },
  {
    id: 'dashboard-audience',
    label: 'Dashboard Audience',
    liveRoutes: [APP_ROUTES.DASHBOARD_AUDIENCE],
    reviewRoute: '/demo/audience',
    sourceRoute: APP_ROUTES.DASHBOARD_AUDIENCE,
    sourceComponent: 'features/dashboard/organisms/DashboardAudienceWorkspace',
    demoRoute: '/demo/audience',
    fixtureSetId: 'dashboard-audience-demo',
    screenshotIds: ['dashboard-audience-desktop'],
    routeOwner:
      'app/app/(shell)/dashboard/audience/page.tsx -> DashboardAudienceClient',
    componentFamily: 'features/dashboard/organisms',
    description:
      'Canonical authenticated audience CRM workspace mirrored by the public /demo/audience route.',
  },
  {
    id: 'dashboard-insights',
    label: 'Dashboard Insights',
    liveRoutes: [APP_ROUTES.INSIGHTS],
    reviewRoute: '/demo/showcase/analytics',
    sourceRoute: APP_ROUTES.INSIGHTS,
    sourceComponent: 'features/dashboard/insights/InsightsPanelView',
    demoRoute: '/demo/showcase/analytics',
    fixtureSetId: 'dashboard-insights-demo',
    screenshotIds: ['dashboard-analytics-desktop'],
    routeOwner: 'app/app/(shell)/dashboard/insights/page.tsx -> InsightsPanel',
    componentFamily: 'features/dashboard/insights',
    description:
      'Canonical insights workspace rendered through the shared InsightsPanelView.',
  },
  {
    id: 'dashboard-earnings',
    label: 'Dashboard Earnings',
    liveRoutes: [APP_ROUTES.SETTINGS_ARTIST_PROFILE],
    reviewRoute: '/demo/showcase/earnings',
    sourceRoute: `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=earn#pay`,
    sourceComponent:
      'features/dashboard/dashboard-pay/DashboardPay.tsx -> DashboardPay',
    demoRoute: '/demo/showcase/earnings',
    fixtureSetId: 'settings-earnings-demo',
    screenshotIds: ['dashboard-earnings-desktop'],
    routeOwner:
      'app/app/(shell)/settings/artist-profile/page.tsx -> ArtistProfileContent',
    componentFamily: 'features/dashboard/dashboard-pay',
    description:
      'Canonical pay and earnings workspace rendered inside the artist profile settings route and mirrored by the demo showcase.',
  },
  {
    id: 'settings-artist-profile',
    label: 'Settings Artist Profile',
    liveRoutes: [APP_ROUTES.SETTINGS_ARTIST_PROFILE],
    reviewRoute: '/demo/showcase/settings',
    sourceRoute: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
    sourceComponent:
      'app/app/(shell)/settings/artist-profile/ArtistProfileContent.tsx -> ArtistProfileContent',
    demoRoute: '/demo/showcase/settings',
    fixtureSetId: 'settings-artist-profile-demo',
    screenshotIds: ['settings-profile-desktop'],
    routeOwner:
      'app/app/(shell)/settings/artist-profile/page.tsx -> ArtistProfileContent',
    componentFamily: 'features/dashboard/organisms/settings-profile-section',
    description:
      'Canonical artist profile settings surface mirrored by the demo showcase route.',
  },
  {
    id: 'settings-links',
    label: 'Settings Links',
    liveRoutes: [APP_ROUTES.SETTINGS_ARTIST_PROFILE],
    reviewRoute: '/demo/showcase/links',
    sourceRoute: `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?tab=links#preview`,
    sourceComponent:
      'features/dashboard/organisms/grouped-links/GroupedLinksManager.tsx -> GroupedLinksManager',
    demoRoute: '/demo/showcase/links',
    fixtureSetId: 'settings-links-demo',
    screenshotIds: ['settings-links-desktop'],
    routeOwner:
      'app/app/(shell)/settings/artist-profile/page.tsx -> ArtistProfileContent',
    componentFamily: 'features/dashboard/organisms/grouped-links',
    description:
      'Canonical links manager workspace rendered from the artist profile settings route and mirrored by the demo showcase.',
  },
] as const satisfies readonly CanonicalSurfaceDefinition[];

export const CANONICAL_SURFACES_BY_ID = CANONICAL_SURFACES.reduce<
  Record<CanonicalSurfaceId, CanonicalSurfaceDefinition>
>(
  (accumulator, surface) => {
    accumulator[surface.id] = surface;
    return accumulator;
  },
  {} as Record<CanonicalSurfaceId, CanonicalSurfaceDefinition>
);

const CANONICAL_SURFACES_BY_SCREENSHOT_ID = CANONICAL_SURFACES.reduce<
  Partial<Record<string, CanonicalSurfaceDefinition>>
>((accumulator, surface) => {
  for (const screenshotId of surface.screenshotIds) {
    accumulator[screenshotId] = surface;
  }

  return accumulator;
}, {});

export function getCanonicalSurface(
  id: CanonicalSurfaceId
): CanonicalSurfaceDefinition {
  return CANONICAL_SURFACES_BY_ID[id];
}

export function getCanonicalSurfaceForScreenshotId(
  screenshotId: string
): CanonicalSurfaceDefinition | null {
  return CANONICAL_SURFACES_BY_SCREENSHOT_ID[screenshotId] ?? null;
}
