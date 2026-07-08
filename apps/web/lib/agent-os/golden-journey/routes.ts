import { APP_ROUTES } from '@/constants/routes';

/**
 * Golden-journey route registry (JOV #11815).
 *
 * Real routes in real states — captured post-deploy and compared against the
 * previous accepted baseline, then run through the design-taste jury. This is
 * the net for jank that component-level Storybook capture cannot see.
 */

export const GOLDEN_JOURNEY_AUTH_STATES = [
  'logged-out',
  'creator',
  'creator-ready',
] as const;

export type GoldenJourneyAuthState =
  (typeof GOLDEN_JOURNEY_AUTH_STATES)[number];

export interface GoldenJourneyRoute {
  /** Stable id, used for screenshot filenames and issue dedupe. */
  readonly id: string;
  /** App-relative path to capture. */
  readonly path: string;
  /**
   * Auth state to capture in. Non-logged-out states bootstrap through the
   * dev test-auth bypass (`/api/dev/test-auth/enter`) which only exists on
   * non-production deploys / local servers.
   */
  readonly authState: GoldenJourneyAuthState;
  /** Human description used in jury prompts and filed issues. */
  readonly description: string;
}

const ROUTE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

export const GOLDEN_JOURNEY_ROUTES: readonly GoldenJourneyRoute[] = [
  {
    id: 'home-logged-out',
    path: '/',
    authState: 'logged-out',
    description: 'Logged-out marketing homepage (hero + first proof beat).',
  },
  {
    id: 'signin',
    path: APP_ROUTES.SIGNIN,
    authState: 'logged-out',
    description: 'Sign-in surface, including Turnstile/SSO placement.',
  },
  {
    id: 'onboarding',
    path: APP_ROUTES.ONBOARDING,
    authState: 'creator',
    description: 'Onboarding entry for a signed-in, incomplete creator.',
  },
  {
    id: 'chat',
    path: APP_ROUTES.CHAT,
    authState: 'creator-ready',
    description: 'Chat home surface for a Pro-entitled creator.',
  },
  {
    id: 'library',
    path: APP_ROUTES.LIBRARY,
    authState: 'creator-ready',
    description: 'Library with the seeded creator fixture data.',
  },
  {
    id: 'releases',
    path: APP_ROUTES.RELEASES,
    authState: 'creator-ready',
    description: 'Releases workspace for the seeded creator.',
  },
  {
    id: 'settings',
    path: APP_ROUTES.SETTINGS,
    authState: 'creator-ready',
    description: 'Settings surface for the seeded creator.',
  },
] as const;

export function assertValidGoldenJourneyRouteId(routeId: string): string {
  const safeRouteId = routeId.trim();
  if (!ROUTE_ID_PATTERN.test(safeRouteId)) {
    throw new Error(`Invalid golden journey route id: ${routeId}`);
  }

  return safeRouteId;
}

export function getGoldenJourneyRoute(
  routeId: string
): GoldenJourneyRoute | null {
  return GOLDEN_JOURNEY_ROUTES.find(route => route.id === routeId) ?? null;
}
