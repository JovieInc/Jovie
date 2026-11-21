/**
 * Smooth phase-1 surface catalog.
 *
 * Maps Tim's Smooth surfaces onto existing end-user perf route ids so the
 * budgets guard remains the measurement controller. Viewports and Smooth
 * targets live here; route paths, auth, and ready selectors stay owned by
 * `performance-route-manifest.ts`.
 */
import { APP_ROUTES } from '../constants/routes';
import {
  getEndUserPerfRouteById,
  type PerfMeasureMode,
  type PerfRouteDefinition,
  type PerfViewport,
} from './performance-route-manifest';

export type SmoothPlatform = 'desktop' | 'mobile';

export type SmoothSurfaceId =
  | 'homepage'
  | 'artist-profile'
  | 'onboarding-start'
  | 'inbox'
  | 'chat'
  | 'work-library'
  | 'audience'
  | 'identity'
  | 'settings';

export interface SmoothTargets {
  readonly cls: number;
  readonly lcpMs: number;
  readonly inpMs: number;
  readonly fullPageReloads: number;
  readonly duplicateFetches: number;
  readonly flickerEvents: number;
  readonly hydrationWarnings: number;
}

export interface SmoothSurfaceDefinition {
  readonly id: SmoothSurfaceId;
  readonly label: string;
  readonly routeId: string;
  /** Prefer cold page-load CWV even when the route also has warm probes. */
  readonly measureMode: PerfMeasureMode;
  readonly interactionSelector?: string;
  readonly requiresAuth: boolean;
}

export const SMOOTH_DESKTOP_VIEWPORT = {
  width: 1512,
  height: 944,
} as const satisfies PerfViewport;

export const SMOOTH_MOBILE_VIEWPORT = {
  width: 390,
  height: 844,
} as const satisfies PerfViewport;

export const SMOOTH_RUNS = 3;
export const SMOOTH_MOBILE_CPU_RATE = 4;

export const SMOOTH_TARGETS = {
  cls: 0.02,
  inpMs: 150,
  fullPageReloads: 0,
  duplicateFetches: 0,
  flickerEvents: 0,
  hydrationWarnings: 0,
  lcpDesktopMs: 2000,
  lcpMobileMs: 2500,
} as const;

export function smoothTargetsFor(platform: SmoothPlatform): SmoothTargets {
  return {
    cls: SMOOTH_TARGETS.cls,
    lcpMs:
      platform === 'desktop'
        ? SMOOTH_TARGETS.lcpDesktopMs
        : SMOOTH_TARGETS.lcpMobileMs,
    inpMs: SMOOTH_TARGETS.inpMs,
    fullPageReloads: SMOOTH_TARGETS.fullPageReloads,
    duplicateFetches: SMOOTH_TARGETS.duplicateFetches,
    flickerEvents: SMOOTH_TARGETS.flickerEvents,
    hydrationWarnings: SMOOTH_TARGETS.hydrationWarnings,
  };
}

export const SMOOTH_SURFACES = [
  {
    id: 'homepage',
    label: 'Homepage',
    routeId: 'home',
    measureMode: 'page-load',
    interactionSelector: '[data-testid="homepage-primary-cta"]',
    requiresAuth: false,
  },
  {
    id: 'artist-profile',
    label: 'Artist profile',
    routeId: 'public-profile-main',
    measureMode: 'page-load',
    interactionSelector: '[data-testid="profile-header"]',
    requiresAuth: false,
  },
  {
    id: 'onboarding-start',
    label: '/start onboarding',
    routeId: 'onboarding',
    measureMode: 'page-load',
    interactionSelector: '[data-testid="chat-composer-surface"]',
    requiresAuth: false,
  },
  {
    id: 'inbox',
    label: '/app Inbox',
    routeId: 'creator-app-home',
    measureMode: 'page-load',
    interactionSelector: '[data-testid="opportunity-inbox-page"]',
    requiresAuth: true,
  },
  {
    id: 'chat',
    label: '/app/chat',
    routeId: 'creator-chat',
    measureMode: 'page-load',
    interactionSelector: '[data-testid="chat-content"]',
    requiresAuth: true,
  },
  {
    id: 'work-library',
    label: 'Work library',
    routeId: 'creator-library-cold',
    measureMode: 'page-load',
    interactionSelector: '[data-testid="library-surface"]',
    requiresAuth: true,
  },
  {
    id: 'audience',
    label: 'Audience',
    routeId: 'creator-audience',
    measureMode: 'page-load',
    interactionSelector:
      '[data-testid="dashboard-audience-client"], [data-testid="dashboard-audience-empty-state"]',
    requiresAuth: true,
  },
  {
    id: 'identity',
    label: 'Identity',
    routeId: 'creator-presence',
    measureMode: 'page-load',
    interactionSelector: '[data-testid="profiles-workspace"]',
    requiresAuth: true,
  },
  {
    id: 'settings',
    label: 'Settings',
    routeId: 'creator-settings',
    measureMode: 'page-load',
    interactionSelector: '[data-testid="account-settings-section"]',
    requiresAuth: true,
  },
] as const satisfies readonly SmoothSurfaceDefinition[];

export function smoothViewportFor(platform: SmoothPlatform): PerfViewport {
  return platform === 'desktop'
    ? SMOOTH_DESKTOP_VIEWPORT
    : SMOOTH_MOBILE_VIEWPORT;
}

/**
 * Clone an existing end-user route into a Smooth measurement route: cold
 * page-load, Smooth viewport, and Smooth CWV budgets. Paths / resolvers /
 * auth / ready selectors stay with the source route.
 */
export function buildSmoothRouteDefinition(
  surface: SmoothSurfaceDefinition,
  platform: SmoothPlatform
): PerfRouteDefinition {
  const source = getEndUserPerfRouteById(surface.routeId);
  if (!source) {
    throw new Error(
      `Smooth surface "${surface.id}" references missing route id "${surface.routeId}".`
    );
  }

  const targets = smoothTargetsFor(platform);
  const viewport = smoothViewportFor(platform);

  // Desktop Smooth viewport uses ProfileDesktopSurface; mobile keeps the
  // compact rail. Accept either ready marker so cold-load waits succeed.
  const readySelectors =
    surface.routeId === 'public-profile-main'
      ? {
          shell: [
            '[data-testid="profile-header"]',
            '[data-testid="profile-desktop-shell"]',
          ],
          content: [
            '[data-testid="profile-home-rail"]',
            '[data-testid="profile-desktop-home-overview"]',
          ],
        }
      : source.readySelectors;

  return {
    ...source,
    id: `smooth-${surface.id}-${platform}`,
    measureMode: surface.measureMode,
    warmupStrategy: source.requiresAuth
      ? 'authenticated-route'
      : 'public-route',
    // Drop warm-nav / profile-transition wiring so CWV is a cold load.
    navigationItemId: undefined,
    interactionStartPath: undefined,
    warmNavigationStartPath: undefined,
    readySelectors,
    viewport,
    timings: [
      { metric: 'first-contentful-paint', budget: targets.lcpMs },
      { metric: 'largest-contentful-paint', budget: targets.lcpMs },
      { metric: 'cumulative-layout-shift', budget: targets.cls },
      { metric: 'first-input-delay', budget: targets.inpMs },
      { metric: 'time-to-first-byte', budget: targets.lcpMs },
    ],
    timingBudgets: [
      { metric: 'first-contentful-paint', budget: targets.lcpMs },
      { metric: 'largest-contentful-paint', budget: targets.lcpMs },
      { metric: 'cumulative-layout-shift', budget: targets.cls },
      { metric: 'first-input-delay', budget: targets.inpMs },
      { metric: 'time-to-first-byte', budget: targets.lcpMs },
    ],
  };
}

export function buildSmoothRouteManifest(
  platform: SmoothPlatform
): readonly PerfRouteDefinition[] {
  return SMOOTH_SURFACES.map(surface =>
    buildSmoothRouteDefinition(surface, platform)
  );
}

export function smoothBaselineFileName(
  surfaceId: SmoothSurfaceId,
  platform: SmoothPlatform
) {
  return `${surfaceId}.${platform}.json`;
}

/** Canonical Settings destination after `/app/settings` redirects. */
export const SMOOTH_SETTINGS_PATH = APP_ROUTES.SETTINGS_ACCOUNT;
