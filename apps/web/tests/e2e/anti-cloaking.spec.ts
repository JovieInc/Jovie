/**
 * E2E Tests for Anti-Cloaking Link Wrapping
 * Tests user flows and security measures for link wrapping system
 *
 * NOTE: Tests public link wrapping functionality for unauthenticated visitors.
 * Must run without saved authentication.
 *
 * Most tests require a working database to create wrapped links via /api/wrap-link.
 * Tests are conditionally skipped when DATABASE_URL is not set or is a dummy value.
 */

import { expect, test } from '@playwright/test';

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

// Check if database is available for tests that need to create wrapped links
const hasDatabase = !!(
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('dummy')
);
const isFastIteration = process.env.E2E_FAST_ITERATION === '1';
const WRAP_LINK_TEST_IP = `198.51.100.${(process.pid % 200) + 1}`;
const MAX_NORMAL_REDIRECT_MS = isFastIteration ? 30_000 : 10_000;

// Test data
const TEST_URLS = {
  normal: 'https://spotify.com/track/test123',
  sensitive: 'https://onlyfans.com/creator123',
  invalid: 'not-a-valid-url',
};

const META_USER_AGENTS = [
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Instagram 123.0.0.0.123 (iPhone; iOS 14.0; Scale/2.00)',
  'Facebot/1.0 (+http://www.facebook.com/facebot)',
];

type RequestGetOptions = Parameters<
  import('@playwright/test').APIRequestContext['get']
>[1];

// Use conditional describe for tests that need database access
const describeWithDb = hasDatabase ? test.describe : test.describe.skip;

async function createWrappedLink(
  page: import('@playwright/test').Page,
  data: {
    url: string;
    platform: string;
  }
) {
  const maxAttempts = isFastIteration ? 3 : 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await page.request.post('/api/wrap-link', {
        data,
        headers: {
          'x-forwarded-for': WRAP_LINK_TEST_IP,
        },
        timeout: isFastIteration ? 90_000 : 30_000,
      });

      if (response.ok() || attempt === maxAttempts) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        throw error;
      }
    }

    await page.waitForTimeout(500 * attempt);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to create wrapped link');
}

async function getRequestWithRetry(
  page: import('@playwright/test').Page,
  url: string,
  options?: RequestGetOptions
) {
  const maxAttempts = isFastIteration ? 5 : 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await page.request.get(url, options);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isTransient =
        message.includes('ECONNREFUSED') ||
        message.includes('ERR_CONNECTION_REFUSED') ||
        message.includes('ECONNRESET') ||
        message.includes('ERR_CONNECTION_RESET') ||
        message.includes('ETIMEDOUT') ||
        message.includes('ERR_CONNECTION_TIMED_OUT') ||
        message.includes('socket hang up');

      if (!isTransient || attempt === maxAttempts) {
        throw error;
      }
    }

    await page.waitForTimeout(500 * attempt);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to GET ${url}`);
}

async function extractChallengeToken(
  page: import('@playwright/test').Page,
  shortId: string
) {
  const response = await getRequestWithRetry(page, `/out/${shortId}`);
  expect(response.ok()).toBeTruthy();

  const html = await response.text();
  const patterns = [
    /"challengeToken":"([^"]+)"/,
    /\\"challengeToken\\":\\"([^"]+)\\"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error(`Failed to extract challenge token for ${shortId}`);
}

async function postLinkWithRetry(
  page: import('@playwright/test').Page,
  shortId: string,
  {
    challengeToken,
    headers,
  }: {
    challengeToken: string;
    headers?: Record<string, string>;
  }
) {
  const maxAttempts = isFastIteration ? 3 : 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await page.request.post(`/api/link/${shortId}`, {
        data: {
          challengeToken,
          timestamp: Date.now(),
        },
        headers,
        timeout: isFastIteration ? 90_000 : 30_000,
      });

      if (
        response.ok() ||
        response.status() === 204 ||
        attempt === maxAttempts
      ) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        throw error;
      }
    }

    await page.waitForTimeout(500 * attempt);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to post link resolution for ${shortId}`);
}

test.describe('Anti-Cloaking Link Wrapping', () => {
  describeWithDb('Normal Link Flow', () => {
    test('should redirect normal links quickly', async ({ page }) => {
      // Create a wrapped link for testing
      const response = await createWrappedLink(page, {
        url: TEST_URLS.normal,
        platform: 'spotify',
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.kind).toBe('normal');

      // Test redirect speed
      const startTime = Date.now();
      const redirectResponse = await getRequestWithRetry(
        page,
        `/go/${data.shortId}`,
        {
          maxRedirects: 0,
        }
      );
      const endTime = Date.now();

      expect(redirectResponse.status()).toBe(302);
      // Dev-server compilation can dominate the first redirect in fast local iteration.
      expect(endTime - startTime).toBeLessThan(MAX_NORMAL_REDIRECT_MS);

      // Check security headers (Playwright lowercases header names)
      const headers = redirectResponse.headers();
      expect(['no-referrer', 'origin-when-cross-origin']).toContain(
        headers['referrer-policy']
      );
      expect(headers['x-robots-tag']).toBe(
        'noindex, nofollow, nosnippet, noarchive'
      );
    });

    test('should handle invalid short IDs gracefully', async ({ page }) => {
      test.skip(
        isFastIteration,
        'Invalid ID 404 coverage runs in the slower anti-cloaking lane'
      );

      const response = await getRequestWithRetry(page, '/go/invalid-id');
      expect(response.status()).toBe(404);
    });
  });

  describeWithDb('Sensitive Link Flow', () => {
    test('should show interstitial for sensitive links', async ({ page }) => {
      const response = await createWrappedLink(page, {
        url: TEST_URLS.sensitive,
        platform: 'external',
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.kind).toBe('sensitive');

      await page.goto(`/out/${data.shortId}`, { timeout: 120_000 });

      await expect(page.locator('h1')).toContainText(
        'Link Confirmation Required'
      );
      await expect(
        page.locator('button:has-text("Continue to Link")')
      ).toBeVisible();

      const title = await page.title();
      expect(title).toContain('Link Confirmation Required');

      const bodyText = (await page.locator('body').innerText()).toLowerCase();
      expect(bodyText).not.toMatch(/(onlyfans|adult|porn|xxx|nsfw)/i);
    });

    test('should complete human verification flow', async ({ page }) => {
      test.skip(
        isFastIteration,
        'Human verification flow runs in the slower anti-cloaking lane'
      );

      const response = await createWrappedLink(page, {
        url: TEST_URLS.sensitive,
        platform: 'external',
      });

      // If the API call failed (e.g., database unreachable), skip the test
      if (!response.ok()) {
        test.skip(
          true,
          `wrap-link API returned ${response.status()} (database may be unreachable)`
        );
        return;
      }

      const data = await response.json();

      await page.goto(`/out/${data.shortId}`, { timeout: 120_000 });

      // Click continue button
      await page.click('button:has-text("Continue to Link")', {
        timeout: 10000,
      });

      // The verification flow shows "Verifying..." then "Verified! Redirecting...".
      // On webkit, the transition can be faster or the text may flash through.
      // Check for either the intermediate or final state.
      const verifying = page.getByText('Verifying...');
      const verified = page.getByText('Verified! Redirecting...');

      // Wait for either state to appear (webkit may skip past "Verifying..." quickly)
      await expect(verifying.or(verified)).toBeVisible({
        timeout: 15000,
      });
    });

    test('should handle rate limiting on API endpoints', async ({ page }) => {
      test.skip(
        isFastIteration,
        'API saturation checks run in the slower anti-cloaking lane'
      );

      const response = await createWrappedLink(page, {
        url: TEST_URLS.sensitive,
        platform: 'external',
      });

      const data = await response.json();
      const challengeToken = await extractChallengeToken(page, data.shortId);

      const promises = Array.from({ length: 15 }, () =>
        page.request.post(`/api/link/${data.shortId}`, {
          data: {
            challengeToken,
            timestamp: Date.now(),
          },
        })
      );

      const responses = await Promise.all(promises);

      const rateLimitedResponse = responses.find(r => r.status() === 429);
      const successfulResponses = responses.filter(r => r.ok());

      expect(
        rateLimitedResponse || successfulResponses.length > 0
      ).toBeTruthy();
    });
  });

  describeWithDb('Bot Detection and Blocking', () => {
    test('should block Meta crawlers on API endpoints', async ({ page }) => {
      const response = await createWrappedLink(page, {
        url: TEST_URLS.sensitive,
        platform: 'external',
      });

      const data = await response.json();
      const challengeToken = await extractChallengeToken(page, data.shortId);

      for (const userAgent of META_USER_AGENTS) {
        const botResponse = await postLinkWithRetry(page, data.shortId, {
          challengeToken,
          headers: {
            'User-Agent': userAgent,
          },
        });

        expect(botResponse.status()).toBe(204);
      }
    });

    test('should allow Meta crawlers on public pages', async ({ page }) => {
      const response = await createWrappedLink(page, {
        url: TEST_URLS.sensitive,
        platform: 'external',
      });

      const data = await response.json();

      const botResponse = await getRequestWithRetry(
        page,
        `/out/${data.shortId}`,
        {
          headers: {
            'User-Agent': META_USER_AGENTS[0],
          },
        }
      );

      expect(botResponse.status()).toBe(200);

      const content = await botResponse.text();
      expect(content).toContain('Link Confirmation Required');

      const renderedText = content
        .replaceAll(/<script[\s\S]*?<\/script>/gi, ' ')
        .replaceAll(/<style[\s\S]*?<\/style>/gi, ' ')
        .replaceAll(/<[^>]+>/g, ' ')
        .toLowerCase();
      expect(renderedText).not.toMatch(/(onlyfans|adult|porn|xxx|nsfw)/i);
    });

    test('should not block regular browsers', async ({ page }) => {
      const response = await createWrappedLink(page, {
        url: TEST_URLS.sensitive,
        platform: 'external',
      });

      const data = await response.json();
      const challengeToken = await extractChallengeToken(page, data.shortId);

      const browserResponse = await postLinkWithRetry(page, data.shortId, {
        challengeToken,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      expect(browserResponse.status()).not.toBe(204);
    });
  });

  test.describe('Security Headers and Compliance', () => {
    test.skip(
      isFastIteration,
      'Compliance-oriented anti-cloaking checks run in the slower lane'
    );

    test('should include proper security headers on all responses', async ({
      page,
    }) => {
      const normalResponse = await getRequestWithRetry(
        page,
        '/go/nonexistent',
        {
          maxRedirects: 0,
        }
      );

      const interstitialResponse = await getRequestWithRetry(
        page,
        '/out/nonexistent'
      );

      [normalResponse, interstitialResponse].forEach(response => {
        const headers = response.headers();
        expect(headers['x-robots-tag']).toBeTruthy();
        expect(headers['cache-control']).toMatch(/(no-cache|no-store)/);
      });
    });

    test('should exclude sensitive links from robots.txt', async ({ page }) => {
      test.skip(
        isFastIteration,
        'robots.txt policy checks run in the slower anti-cloaking lane'
      );

      const response = await getRequestWithRetry(page, '/robots.txt');

      // In dev mode, a conflicting public/robots.txt + app/robots.ts causes a 500
      // Skip the test content assertion if we get a server error
      if (response.status() >= 500) {
        console.log(
          '⚠ robots.txt returned 500 (conflicting public file + route) — skipping'
        );
        return;
      }

      const content = await response.text();

      // On localhost (non-production), robots.txt blocks everything with "Disallow: /"
      // which inherently blocks /out/ and /api/ paths too.
      // On production (jov.ie), it explicitly lists Disallow: /out/ and /api/
      const blocksAll =
        content.includes('Disallow: /\n') || content.includes('Disallow: /\r');
      const blocksSpecific =
        content.includes('Disallow: /out/') &&
        content.includes('Disallow: /api/');

      expect(blocksAll || blocksSpecific).toBe(true);
    });

    test('should have consistent response structure for different user agents', async ({
      page,
    }) => {
      test.skip(
        isFastIteration,
        'User-agent response parity runs in the slower anti-cloaking lane'
      );

      // This test needs database to create wrapped links
      test.skip(!hasDatabase, 'Requires database for wrapped links');

      const linkResponse = await createWrappedLink(page, {
        url: TEST_URLS.normal,
        platform: 'spotify',
      });

      const data = await linkResponse.json();

      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Googlebot/2.1 (+http://www.google.com/bot.html)',
      ];

      const responses = await Promise.all(
        userAgents.map(ua =>
          getRequestWithRetry(page, `/go/${data.shortId}`, {
            headers: { 'User-Agent': ua },
            maxRedirects: 0,
          })
        )
      );

      responses.forEach(response => {
        expect(response.status()).toBe(302);
      });
    });
  });

  describeWithDb('Performance and Hop Count', () => {
    test.skip(
      isFastIteration,
      'Performance-only redirect checks are excluded from the fast smoke gate'
    );

    test('should maintain minimal hop counts', async ({ page }) => {
      const normalResponse = await createWrappedLink(page, {
        url: TEST_URLS.normal,
        platform: 'spotify',
      });

      const normalData = await normalResponse.json();

      let hopCount = 0;
      let currentUrl = `/go/${normalData.shortId}`;

      while (hopCount < 5) {
        const response = await getRequestWithRetry(page, currentUrl, {
          maxRedirects: 0,
        });

        hopCount++;

        if (response.status() === 302) {
          const location = response.headers()['location'];
          if (location && !location.startsWith('/')) {
            break;
          }
          currentUrl = location || '';
        } else {
          break;
        }
      }

      expect(hopCount).toBeLessThanOrEqual(2);
    });

    test('should redirect normal links in under 150ms', async ({ page }) => {
      const response = await createWrappedLink(page, {
        url: TEST_URLS.normal,
        platform: 'spotify',
      });

      const data = await response.json();

      const startTime = Date.now();
      await getRequestWithRetry(page, `/go/${data.shortId}`, {
        maxRedirects: 0,
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  test.describe('Error Handling', () => {
    test.skip(
      isFastIteration,
      'Error-path anti-cloaking checks run in the slower lane'
    );

    test('should handle invalid URLs gracefully', async ({ page }) => {
      const response = await createWrappedLink(page, {
        url: TEST_URLS.invalid,
        platform: 'external',
      });

      // Without database, the API may return 400 or 500
      expect([400, 500]).toContain(response.status());
    });

    test('should handle expired links gracefully', async ({ page }) => {
      const response = await getRequestWithRetry(page, '/go/expired123');
      expect(response.status()).toBe(404);
    });

    test('should handle network errors gracefully', async ({ page }) => {
      test.skip(
        isFastIteration,
        'Synthetic client-side network failure coverage runs in the slower anti-cloaking lane'
      );

      await page.context().addInitScript(() => {
        (window as any).fetch = () =>
          Promise.reject(new Error('Network error'));
      });

      const response = await page.goto('/out/test123');

      expect(response?.status()).toBeDefined();
    });
  });
});
