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
 * Current baseline (2026-02-14):
 * - Script: ~939KB (grew from ~640KB via billing redesign, swipe-to-reveal, UTM tracking)
 * - Stylesheet: ~52KB (Tailwind + custom styles)
 * - Total: ~1084KB
 */
const defaultPublicResourceBudgets = [
  { resourceType: 'script', budget: 1050 },
  { resourceType: 'image', budget: 500 },
  { resourceType: 'font', budget: 100 },
  { resourceType: 'stylesheet', budget: 100 },
  { resourceType: 'total', budget: 1200 },
];

// Dashboard pages carry TanStack table + Radix UI + Clerk auth overhead.
// Baseline (2026-03-19): script 2000KB, stylesheet 457KB, total 2563KB.
// Budgets set ~10% above baseline; tighten as we code-split.
const dashboardResourceBudgets = [
  // Baseline (2026-03-27): script ~2150-2500KB (varies with lazy chunks loaded).
  // Budget set at p95 + 10% headroom.
  { resourceType: 'script', budget: 2750 },
  { resourceType: 'image', budget: 500 },
  { resourceType: 'font', budget: 100 },
  { resourceType: 'stylesheet', budget: 500 },
  { resourceType: 'total', budget: 3100 },
];

const onboardingResourceBudgets = [
  { resourceType: 'script', budget: 2600 },
  { resourceType: 'image', budget: 700 },
  { resourceType: 'font', budget: 100 },
  { resourceType: 'stylesheet', budget: 550 },
  { resourceType: 'total', budget: 3200 },
];

const onboardingStepBudgets = [
  {
    path: '/onboarding?resume=handle&handle=[username]',
    timings: [
      { metric: 'first-contentful-paint', budget: 1700 },
      { metric: 'largest-contentful-paint', budget: 2300 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
  },
  {
    path: '/onboarding?resume=spotify&handle=[username]',
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 2400 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
  },
  {
    path: '/onboarding?resume=artist-confirm&handle=[username]',
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 2400 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
  },
  {
    path: '/onboarding?resume=upgrade&handle=[username]',
    timings: [
      { metric: 'first-contentful-paint', budget: 1800 },
      { metric: 'largest-contentful-paint', budget: 2400 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
  },
  {
    path: '/onboarding?resume=dsp&handle=[username]',
    timings: [
      { metric: 'first-contentful-paint', budget: 1900 },
      { metric: 'largest-contentful-paint', budget: 2500 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
  },
  {
    path: '/onboarding?resume=social&handle=[username]',
    timings: [
      { metric: 'first-contentful-paint', budget: 1900 },
      { metric: 'largest-contentful-paint', budget: 2500 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
  },
  {
    path: '/onboarding?resume=releases&handle=[username]',
    timings: [
      { metric: 'first-contentful-paint', budget: 1900 },
      { metric: 'largest-contentful-paint', budget: 2500 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
  },
  {
    path: '/onboarding?resume=late-arrivals&handle=[username]',
    timings: [
      { metric: 'first-contentful-paint', budget: 1900 },
      { metric: 'largest-contentful-paint', budget: 2500 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
  },
  {
    path: '/onboarding?resume=profile-ready&handle=[username]',
    timings: [
      { metric: 'first-contentful-paint', budget: 1900 },
      { metric: 'largest-contentful-paint', budget: 2500 },
      { metric: 'cumulative-layout-shift', budget: 0.1 },
      { metric: 'first-input-delay', budget: 100 },
      { metric: 'time-to-first-byte', budget: 1200 },
    ],
  },
].map(entry => ({
  ...entry,
  auth: true,
  resourceSizes: onboardingResourceBudgets,
}));

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
        { metric: 'interactive-shell-ready', budget: 100 },
        // TTFB includes Playwright browser overhead, not just server response
        { metric: 'time-to-first-byte', budget: 1800 },
      ],
      resourceSizes: defaultPublicResourceBudgets,
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
      resourceSizes: defaultPublicResourceBudgets,
    },
    {
      path: '/onboarding/checkout',
      auth: true,
      timings: [
        { metric: 'first-contentful-paint', budget: 2000 },
        { metric: 'largest-contentful-paint', budget: 2600 },
        { metric: 'cumulative-layout-shift', budget: 0.1 },
        { metric: 'first-input-delay', budget: 100 },
        { metric: 'time-to-first-byte', budget: 1400 },
      ],
      resourceSizes: onboardingResourceBudgets,
    },
    {
      path: '/app',
      auth: true,
      timings: [
        // Main dashboard (chat-first) — Gmail rule: 100ms perceived, 500ms hard budget.
        // Shell streams via Suspense. Essential data fetch (~3 fast single-row queries)
        // replaces the full 6-query sequential fetch.
        //
        // Warm-cache production numbers: TTFB ~30ms, skeleton-to-content ~130ms.
        // Budgets account for Neon connection variance and Playwright browser overhead.
        // FCP/LCP include ~1s Playwright overhead (real users see ~100ms perceived).
        { metric: 'first-contentful-paint', budget: 1500 },
        { metric: 'largest-contentful-paint', budget: 3000 },
        { metric: 'cumulative-layout-shift', budget: 0.1 },
        { metric: 'first-input-delay', budget: 100 },
        { metric: 'time-to-first-byte', budget: 1500 },
        // Custom: time from navigation to chat content visible
        { metric: 'skeleton-to-content', budget: 2000 },
      ],
      resourceSizes: dashboardResourceBudgets,
    },
    {
      path: '/app/dashboard/releases',
      auth: true,
      timings: [
        // Authenticated dashboard page — must feel instant (Gmail rule)
        { metric: 'first-contentful-paint', budget: 1500 },
        { metric: 'largest-contentful-paint', budget: 2500 },
        { metric: 'cumulative-layout-shift', budget: 0.1 },
        { metric: 'first-input-delay', budget: 100 },
        { metric: 'time-to-first-byte', budget: 1500 },
        // Custom: time from navigation to skeleton disappearing / real content visible
        { metric: 'skeleton-to-content', budget: 500 },
      ],
      resourceSizes: dashboardResourceBudgets,
    },
    ...onboardingStepBudgets,
  ],
};
