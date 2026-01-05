/**
 * Performance budgets configuration
 * Used to set thresholds for performance metrics
 *
 * Note: Resource size budgets are set to current production values + 10% headroom.
 * These should be periodically reviewed and optimized.
 * Current baseline (2025-12-23):
 * - Script: ~1455KB (includes Clerk, Statsig, Next.js runtime)
 * - Stylesheet: ~203KB (Tailwind + custom styles)
 * - Total: ~1750KB
 */
module.exports = {
  budgets: [
    {
      path: '/',
      timings: [
        { metric: 'first-contentful-paint', budget: 1000 },
        { metric: 'largest-contentful-paint', budget: 1200 },
        { metric: 'cumulative-layout-shift', budget: 0.1 },
        { metric: 'first-input-delay', budget: 100 },
        { metric: 'time-to-first-byte', budget: 300 },
      ],
      resourceSizes: [
        { resourceType: 'script', budget: 1600 },
        { resourceType: 'image', budget: 500 },
        { resourceType: 'font', budget: 100 },
        { resourceType: 'stylesheet', budget: 250 },
        { resourceType: 'total', budget: 2000 },
      ],
    },
    {
      path: '/[username]',
      timings: [
        { metric: 'first-contentful-paint', budget: 1000 },
        { metric: 'largest-contentful-paint', budget: 1200 },
        { metric: 'cumulative-layout-shift', budget: 0.1 },
        { metric: 'first-input-delay', budget: 100 },
        { metric: 'time-to-first-byte', budget: 300 },
      ],
      resourceSizes: [
        { resourceType: 'script', budget: 1600 },
        { resourceType: 'image', budget: 500 },
        { resourceType: 'font', budget: 100 },
        { resourceType: 'stylesheet', budget: 250 },
        { resourceType: 'total', budget: 2000 },
      ],
    },
    {
      path: '/dashboard',
      timings: [
        { metric: 'first-contentful-paint', budget: 1200 },
        { metric: 'largest-contentful-paint', budget: 1500 },
        { metric: 'cumulative-layout-shift', budget: 0.1 },
        { metric: 'first-input-delay', budget: 100 },
        { metric: 'time-to-first-byte', budget: 300 },
      ],
      resourceSizes: [
        { resourceType: 'script', budget: 1600 },
        { resourceType: 'image', budget: 300 },
        { resourceType: 'font', budget: 100 },
        { resourceType: 'stylesheet', budget: 250 },
        { resourceType: 'total', budget: 2000 },
      ],
    },
  ],
};
