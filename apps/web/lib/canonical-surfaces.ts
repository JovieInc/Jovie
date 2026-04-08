import { APP_ROUTES } from '@/constants/routes';

export const CANONICAL_SURFACE_IDS = [
  'homepage',
  'public-profile',
  'release-landing',
  'dashboard-releases',
] as const;

export type CanonicalSurfaceId = (typeof CANONICAL_SURFACE_IDS)[number];

export interface CanonicalSurfaceDefinition {
  readonly id: CanonicalSurfaceId;
  readonly label: string;
  readonly liveRoutes: readonly string[];
  readonly reviewRoute: string;
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
    screenshotIds: [
      'dashboard-releases-desktop',
      'dashboard-releases-sidebar-desktop',
      'dashboard-release-sidebar-detail-desktop',
    ],
    routeOwner:
      'app/app/(shell)/dashboard/releases/page.tsx -> ReleasesPageClient',
    componentFamily: 'features/dashboard/organisms/release-provider-matrix',
    description:
      'Canonical authenticated releases workspace and current dashboard review/capture surface.',
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

export function getCanonicalSurface(
  id: CanonicalSurfaceId
): CanonicalSurfaceDefinition {
  return CANONICAL_SURFACES_BY_ID[id];
}
