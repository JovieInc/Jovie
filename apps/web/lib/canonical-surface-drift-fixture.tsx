import { REDIRECT_ONLY_PUBLIC_ROUTES } from '@/lib/canonical-surface-drift';
import type { CanonicalSurfaceDefinition } from '@/lib/canonical-surfaces';

export const CANONICAL_SURFACE_REDIRECT_FIXTURE_TEST_ID =
  'canonical-surface-redirect-fixture';

export const CANONICAL_SURFACE_REDIRECT_FIXTURE_RED_STYLE = {
  outline: '2px solid #ff0000',
} as const;

/**
 * Deliberate-red canonical-surface drift fixture.
 *
 * Treats redirect-only public routes as designed review surfaces. Production
 * registries must never match this shape. The red outline exists so a visual
 * sweep can see the forbidden promotion immediately.
 */
export const CANONICAL_SURFACE_REDIRECT_DRIFT_DEFINITION = {
  id: 'homepage',
  label: 'Redirect Surfaces',
  liveRoutes: [...REDIRECT_ONLY_PUBLIC_ROUTES],
  reviewRoute: '/ai',
  sourceRoute: '/ai',
  sourceComponent: 'app/(home)/page.tsx -> HomePageNarrative',
  demoRoute: '/investors',
  fixtureSetId: 'redirect-only-drift',
  screenshotIds: ['missing-screenshot-id'],
  routeOwner: 'app/(home)/page.tsx -> HomePageNarrative',
  componentFamily: 'features/home',
  description:
    'Forbidden promotion of redirect-only routes into the review set.',
} as const satisfies CanonicalSurfaceDefinition;

export function CanonicalSurfaceRedirectDriftFixture() {
  return (
    <div
      data-testid={CANONICAL_SURFACE_REDIRECT_FIXTURE_TEST_ID}
      data-canonical-surface-drift-fixture=''
      data-deliberate-red=''
      className='flex flex-col gap-1'
      style={CANONICAL_SURFACE_REDIRECT_FIXTURE_RED_STYLE}
    >
      {REDIRECT_ONLY_PUBLIC_ROUTES.map(route => (
        <a key={route} href={route}>
          {route}
        </a>
      ))}
    </div>
  );
}
