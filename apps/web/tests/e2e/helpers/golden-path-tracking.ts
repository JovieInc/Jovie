import type { Page } from '@playwright/test';
import {
  NAVIGATION_TELEMETRY_ENDPOINT,
  navigationTelemetryBatchSchema,
  navigationTelemetryPayloadSchema,
} from '@/lib/tracking/navigation-telemetry-contract';

// Match the production endpoint's byte limit without importing server code.
const MAX_NAVIGATION_BODY_BYTES = 8192;

/**
 * Golden Path exercises real auth, claim, catalog and billing. Its isolated
 * server deliberately has no Redis aggregate sink; disposable navigation
 * telemetry uses the production payload contract here instead. Production
 * store failures and browser console errors keep their normal behavior.
 */
export async function interceptGoldenPathTrackingCalls(page: Page) {
  let acceptedNavigationPosts = 0;
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route(
    url => url.pathname === NAVIGATION_TELEMETRY_ENDPOINT,
    async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        request.method() !== 'POST' ||
        !['http:', 'https:'].includes(url.protocol) ||
        url.origin !== new URL(page.url()).origin ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        await route.fallback();
        return;
      }

      const rawBody = request.postDataBuffer();
      if (!rawBody || rawBody.byteLength > MAX_NAVIGATION_BODY_BYTES) {
        throw new Error(
          'Golden Path navigation telemetry body is missing or too large'
        );
      }
      let payload: unknown;
      try {
        payload = JSON.parse(rawBody.toString('utf8'));
      } catch {
        throw new Error('Golden Path navigation telemetry body must be JSON');
      }
      if (
        !navigationTelemetryBatchSchema.safeParse(payload).success &&
        !navigationTelemetryPayloadSchema.safeParse(payload).success
      ) {
        // Do not include rejected content or schema excerpts in test artifacts.
        throw new Error(
          'Golden Path navigation telemetry violates the production payload contract'
        );
      }
      await route.fulfill({ status: 204, body: '' });
      acceptedNavigationPosts += 1;
    }
  );
  return { getAcceptedNavigationPostCount: () => acceptedNavigationPosts };
}
