import { APP_ROUTES } from '@/constants/routes';
import type { OutcomeDogfoodMission } from '@/lib/agent-os/dogfood-mission';

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
  readonly outcomeMission: OutcomeDogfoodMission;
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
    outcomeMission: {
      id: 'outcome:homepage',
      outcome: {
        revision: 1,
        persona: 'artist evaluating Jovie',
        goal: 'Understand what Jovie does, what access costs, and how to start with your own artist identity.',
        successCriteria: [
          'The visitor can explain the offered artist outcome and access conditions',
          'Price and availability agree with current product truth',
          'The start path preserves the intended artist identity',
        ],
        frictionBudget: {
          maxDurationMs: 120000,
          maxRetries: 1,
        },
      },
    },
    label: 'Homepage',
    liveRoutes: ['/'],
    reviewRoute: '/',
    sourceRoute: '/',
    sourceComponent: 'app/(home)/page.tsx -> HomepageArtistHero',
    demoRoute: '/',
    fixtureSetId: 'marketing-static',
    screenshotIds: ['marketing-home-desktop'],
    routeOwner: 'app/(home)/layout.tsx -> PublicPageShell',
    componentFamily: 'components/homepage',
    description: 'Primary marketing homepage and current live review surface.',
  },
  {
    id: 'public-profile',
    outcomeMission: {
      id: 'outcome:public-profile',
      outcome: {
        revision: 1,
        persona: 'fan discovering an artist',
        goal: 'Discover this artist, understand who they are and their latest work, and arrange to hear when they play nearby.',
        successCriteria: [
          'Identity and latest work match the canonical artist',
          'A listening destination reaches the intended work',
          'Nearby notification interest and consent persist for the intended artist',
        ],
        frictionBudget: {
          maxDurationMs: 180000,
          maxRetries: 1,
        },
      },
    },
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
    outcomeMission: {
      id: 'outcome:release-landing',
      outcome: {
        revision: 1,
        persona: 'fan choosing where to listen',
        goal: 'Identify this release and listen on your preferred available service without being sent to another artist or release.',
        successCriteria: [
          'Release identity matches the canonical catalog',
          'The chosen destination contains the intended music',
          'An unavailable service has an understandable recovery path',
        ],
        frictionBudget: {
          maxDurationMs: 120000,
          maxRetries: 1,
        },
      },
    },
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
    outcomeMission: {
      id: 'outcome:dashboard-releases',
      outcome: {
        revision: 1,
        persona: 'artist preparing a release',
        goal: 'Find your latest release, correct its listening destinations, and share a link that reaches the right music.',
        successCriteria: [
          'The release belongs to the intended artist',
          'Saved destinations survive reload',
          'The shared link resolves to the intended release and provider',
        ],
        frictionBudget: {
          maxDurationMs: 180000,
          maxRetries: 1,
        },
      },
    },
    label: 'Dashboard Releases',
    liveRoutes: [APP_ROUTES.RELEASES, APP_ROUTES.DASHBOARD_RELEASES],
    reviewRoute: '/demo',
    sourceRoute: APP_ROUTES.RELEASES,
    sourceComponent:
      'features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleasesView',
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
    outcomeMission: {
      id: 'outcome:dashboard-audience',
      outcome: {
        revision: 1,
        persona: 'artist managing fans',
        goal: 'Find a fan who subscribed, understand their consent and location, and decide whom you can reach for a nearby show.',
        successCriteria: [
          'The intended fan and subscription are present',
          'Consent and location agree with the saved subscription',
          'The artist can identify an eligible nearby audience without exposing another tenant',
        ],
        frictionBudget: {
          maxDurationMs: 180000,
          maxRetries: 1,
        },
      },
    },
    label: 'Dashboard Audience',
    liveRoutes: [APP_ROUTES.AUDIENCE],
    reviewRoute: '/demo/audience',
    sourceRoute: APP_ROUTES.AUDIENCE,
    sourceComponent: 'features/dashboard/organisms/DashboardAudienceWorkspace',
    demoRoute: '/demo/audience',
    fixtureSetId: 'dashboard-audience-demo',
    screenshotIds: ['dashboard-audience-desktop'],
    routeOwner: 'app/app/(shell)/audience/page.tsx -> DashboardAudienceClient',
    componentFamily: 'features/dashboard/organisms',
    description:
      'Canonical authenticated audience CRM workspace mirrored by the public /demo/audience route.',
  },
  {
    id: 'dashboard-insights',
    outcomeMission: {
      id: 'outcome:dashboard-insights',
      outcome: {
        revision: 1,
        persona: 'artist deciding where to promote',
        goal: 'Use recent audience and link activity to decide which release and destination deserve your next promotion.',
        successCriteria: [
          'Displayed period and metrics agree with seeded activity',
          'The artist can identify the release and destination driving activity',
          'Empty data is distinguished from unavailable data',
        ],
        frictionBudget: {
          maxDurationMs: 180000,
          maxRetries: 1,
        },
      },
    },
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
    outcomeMission: {
      id: 'outcome:dashboard-earnings',
      outcome: {
        revision: 1,
        persona: 'artist receiving support',
        goal: 'Understand how fans can support you and verify where a test contribution goes.',
        successCriteria: [
          'The payment destination belongs to the artist',
          'The test contribution and displayed status agree with provider state',
          'The fan receives an accurate success or recoverable failure result',
        ],
        frictionBudget: {
          maxDurationMs: 180000,
          maxRetries: 1,
        },
      },
    },
    label: 'Dashboard Earnings',
    liveRoutes: [APP_ROUTES.SETTINGS_PROFILE],
    reviewRoute: '/demo/showcase/earnings',
    sourceRoute: `${APP_ROUTES.SETTINGS_PROFILE}?tab=earn#pay`,
    sourceComponent:
      'features/dashboard/dashboard-pay/DashboardPay.tsx -> DashboardPay',
    demoRoute: '/demo/showcase/earnings',
    fixtureSetId: 'settings-earnings-demo',
    screenshotIds: ['dashboard-earnings-desktop'],
    routeOwner:
      'app/app/(shell)/settings/profile/page.tsx -> ArtistProfileContent',
    componentFamily: 'features/dashboard/dashboard-pay',
    description:
      'Canonical pay and earnings workspace rendered inside the profile settings route and mirrored by the demo showcase.',
  },
  {
    id: 'settings-artist-profile',
    outcomeMission: {
      id: 'outcome:settings-artist-profile',
      outcome: {
        revision: 1,
        persona: 'artist updating their identity',
        goal: 'Correct your artist bio and verify that a new visitor sees the saved identity on your public profile.',
        successCriteria: [
          'Only the intended artist profile changes',
          'Saved bio survives reload',
          'An anonymous visitor sees the updated identity',
        ],
        frictionBudget: {
          maxDurationMs: 180000,
          maxRetries: 1,
        },
      },
    },
    label: 'Settings Profile',
    liveRoutes: [APP_ROUTES.SETTINGS_PROFILE],
    reviewRoute: '/demo/showcase/settings',
    sourceRoute: APP_ROUTES.SETTINGS_PROFILE,
    sourceComponent:
      'app/app/(shell)/settings/profile/ArtistProfileContent.tsx -> ArtistProfileContent',
    demoRoute: '/demo/showcase/settings',
    fixtureSetId: 'settings-artist-profile-demo',
    screenshotIds: ['settings-profile-desktop'],
    routeOwner:
      'app/app/(shell)/settings/profile/page.tsx -> ArtistProfileContent',
    componentFamily: 'features/dashboard/organisms/settings-profile-section',
    description:
      'Canonical profile settings surface mirrored by the demo showcase route.',
  },
  {
    id: 'settings-links',
    outcomeMission: {
      id: 'outcome:settings-links',
      outcome: {
        revision: 1,
        persona: 'artist sharing destinations',
        goal: 'Add a destination you want fans to find, verify it publicly, and remove it when it is no longer relevant.',
        successCriteria: [
          'The saved destination and label are correct',
          'A visitor can reach the destination',
          'Removal persists and does not remove unrelated links',
        ],
        frictionBudget: {
          maxDurationMs: 180000,
          maxRetries: 1,
        },
      },
    },
    label: 'Settings Links',
    liveRoutes: [APP_ROUTES.SETTINGS_PROFILE],
    reviewRoute: '/demo/showcase/links',
    sourceRoute: `${APP_ROUTES.SETTINGS_PROFILE}?tab=links#preview`,
    sourceComponent:
      'features/dashboard/organisms/grouped-links/GroupedLinksManager.tsx -> GroupedLinksManager',
    demoRoute: '/demo/showcase/links',
    fixtureSetId: 'settings-links-demo',
    screenshotIds: ['settings-links-desktop'],
    routeOwner:
      'app/app/(shell)/settings/profile/page.tsx -> ArtistProfileContent',
    componentFamily: 'features/dashboard/organisms/grouped-links',
    description:
      'Canonical links manager workspace rendered from the profile settings route and mirrored by the demo showcase.',
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
