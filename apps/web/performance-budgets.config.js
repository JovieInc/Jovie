/**
 * Performance budgets configuration
 * Used to set thresholds for performance metrics via Playwright.
 *
 * Note: These budgets are measured using Playwright browser automation, which includes:
 * - Browser launch and navigation overhead
 * - Full page rendering and JavaScript execution
 * - Network round trips
 *
 * Real-world TTFB (measured with curl) is typically much faster:
 * - Static pages: ~15-70ms (warm), ~70-140ms (cold)
 * - Dynamic pages: ~80-150ms (with Redis cache), ~200-500ms (cache miss)
 *
 * Resource size budgets are set to current production values + 10% headroom.
 * Current baseline (2025-02-04):
 * - Script: ~437KB (optimized with code splitting)
 * - Stylesheet: ~45KB (Tailwind + custom styles)
 * - Total: ~535KB
 */
module.exports = {
  budgets: [
    {
      path: '/',
      timings: [
        // Static marketing page - FCP/LCP should be fast after browser setup
        { metric: 'first-contentful-paint', budget: 2000 },
        { metric: 'largest-contentful-paint', budget: 2500 },
        { metric: 'cumulative-layout-shift', budget: 0.1 },
        { metric: 'first-input-delay', budget: 100 },
        // TTFB includes Playwright browser overhead, not just server response
        { metric: 'time-to-first-byte', budget: 1800 },
      ],
      resourceSizes: [
        { resourceType: 'script', budget: 600 },
        { resourceType: 'image', budget: 500 },
        { resourceType: 'font', budget: 100 },
        { resourceType: 'stylesheet', budget: 100 },
        { resourceType: 'total', budget: 1000 },
      ],
    },
    {
      path: '/[username]',
      timings: [
        // Dynamic profile page - has database queries but should be cached
        { metric: 'first-contentful-paint', budget: 3000 },
        { metric: 'largest-contentful-paint', budget: 3500 },
        { metric: 'cumulative-layout-shift', budget: 0.1 },
        { metric: 'first-input-delay', budget: 100 },
        // Higher TTFB budget for dynamic pages (DB queries on cache miss)
        { metric: 'time-to-first-byte', budget: 2500 },
      ],
      resourceSizes: [
        { resourceType: 'script', budget: 600 },
        { resourceType: 'image', budget: 500 },
        { resourceType: 'font', budget: 100 },
        { resourceType: 'stylesheet', budget: 100 },
        { resourceType: 'total', budget: 1000 },
      ],
    },
    // NOTE: /app/dashboard routes require authentication
    // To test authenticated routes, use doppler run with the dev server
    // For now, testing public routes only (/, /[username])
  ],
};
