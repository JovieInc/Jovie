/* eslint-disable react-hooks/rules-of-hooks */
// ^ Playwright fixtures use "use" as a parameter name, not a React hook
import { test as base } from '@playwright/test';

/**
 * Performance-optimized test fixture
 *
 * Blocks unnecessary resource downloads (images, fonts, media, analytics)
 * to speed up tests and reduce bandwidth usage.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    // Block resource types that aren't needed for functional testing
    await context.route('**/*', route => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();

      // Block images, fonts, media
      if (['image', 'font', 'media'].includes(resourceType)) {
        return route.abort();
      }

      // Block analytics and tracking scripts
      if (
        url.includes('analytics') ||
        url.includes('gtag') ||
        url.includes('ga.js') ||
        url.includes('google-analytics') ||
        url.includes('facebook.com/tr') ||
        url.includes('doubleclick.net')
      ) {
        return route.abort();
      }

      // Continue with other requests
      return route.continue();
    });

    await use(context);
  },
});

export { expect } from '@playwright/test';
