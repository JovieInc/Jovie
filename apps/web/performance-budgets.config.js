/**
 * Performance budgets configuration
 * Used to set thresholds for performance metrics
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
        { resourceType: 'script', budget: 200 },
        { resourceType: 'image', budget: 500 },
        { resourceType: 'font', budget: 100 },
        { resourceType: 'stylesheet', budget: 50 },
        { resourceType: 'total', budget: 800 },
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
        { resourceType: 'script', budget: 200 },
        { resourceType: 'image', budget: 500 },
        { resourceType: 'font', budget: 100 },
        { resourceType: 'stylesheet', budget: 50 },
        { resourceType: 'total', budget: 800 },
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
        { resourceType: 'script', budget: 250 },
        { resourceType: 'image', budget: 300 },
        { resourceType: 'font', budget: 100 },
        { resourceType: 'stylesheet', budget: 50 },
        { resourceType: 'total', budget: 900 },
      ],
    },
  ],
};
