import type { PerfRouteDefinition } from '../performance-route-manifest';

export const END_USER_PERF_ROUTE_MANIFEST = [
  {
    id: 'invalid-warm-nav-fixture',
    group: 'creator-shell',
    surface: 'creator-app',
    path: '/app/library',
    warmNavigationStartPath: '/app',
    requiresAuth: true,
    warmupStrategy: 'authenticated-shell',
    measureMode: 'warm-navigation',
    readySelectors: {
      content: ['main'],
      navTrigger: [''],
    },
    timings: [{ metric: 'warm-shell-response', budget: 100 }],
    resourceSizes: [{ resourceType: 'total', budget: 100 }],
    priority: 1,
  },
] as const satisfies readonly PerfRouteDefinition[];
