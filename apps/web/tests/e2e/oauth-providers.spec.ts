import { expect, type Page, test } from '@playwright/test';
import expected from '@/lib/auth/oauth-redirect-uris.expected.json';
import {
  assertExactNavigationUrl,
  primeAuthorizedVercelAliasBypass,
  requireExactNavigationOrigin,
} from '../helpers/vercel-preview';

/**
 * Candidate-bound Better Auth OAuth runtime proof (@production-smoke).
 *
 * The test starts from the deployed `/signin` UI, clicks each stable provider
 * button, observes the real same-origin Better Auth catch-all POST, and aborts
 * the first provider navigation before credentials or provider UI are loaded.
 * This proves the running generation constructed the provider URL; static
 * callback configuration and `/api/auth/ok` cannot substitute for this path.
 */

test.use({ storageState: { cookies: [], origins: [] } });

const CONFIRMED_RUNTIME_CONTRACT = 'CONFIRMED_OAUTH_RUNTIME_CONTRACT';
const ALLOWED_ORIGINS = new Set(['https://jov.ie', 'https://staging.jov.ie']);

const PROVIDERS = [
  {
    provider: 'google',
    host: 'accounts.google.com',
    registeredRedirects: expected.google.requiredRedirectUris,
  },
  {
    provider: 'apple',
    host: 'appleid.apple.com',
    registeredRedirects: expected.apple.requiredReturnUrls,
  },
] as const;

function runtimeOrigin(): string {
  const origin = requireExactNavigationOrigin(process.env.BASE_URL);
  if (!ALLOWED_ORIGINS.has(origin)) {
    throw new Error(
      'OAuth runtime proof must target exactly staging.jov.ie or jov.ie.'
    );
  }
  return origin;
}

async function primeCandidateBoundOrigin(page: Page, origin: string) {
  if (origin !== 'https://staging.jov.ie') return;
  await primeAuthorizedVercelAliasBypass(page.context(), origin);
}

test.describe('candidate-bound Better Auth OAuth runtime @production-smoke', () => {
  test.setTimeout(60_000);

  for (const contract of PROVIDERS) {
    test(`${contract.provider} UI starts the exact Better Auth provider redirect`, async ({
      page,
    }) => {
      const origin = runtimeOrigin();
      const expectedRedirectUri = `${origin}/api/auth/callback/${contract.provider}`;
      expect(
        contract.registeredRedirects,
        `${CONFIRMED_RUNTIME_CONTRACT}: ${contract.provider} callback is absent from the provider-console contract`
      ).toContain(expectedRedirectUri);

      await primeCandidateBoundOrigin(page, origin);
      await page.goto(`${origin}/signin`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      assertExactNavigationUrl(
        page.url(),
        origin,
        `${contract.provider} OAuth UI entry`
      );

      const button = page.locator(
        `button[data-auth-provider-slot="${contract.provider}"]`
      );
      await expect(
        button,
        `${CONFIRMED_RUNTIME_CONTRACT}: ${contract.provider} provider button is not rendered`
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        button,
        `${CONFIRMED_RUNTIME_CONTRACT}: ${contract.provider} provider button is disabled`
      ).toBeEnabled();

      let navigationTimer: ReturnType<typeof setTimeout> | undefined;
      let resolveProviderNavigation: (url: URL) => void = () => {};
      let rejectProviderNavigation: (error: Error) => void = () => {};
      let capturedProviderNavigation = false;
      const providerNavigation = new Promise<URL>((resolve, reject) => {
        resolveProviderNavigation = resolve;
        rejectProviderNavigation = reject;
        navigationTimer = setTimeout(
          () =>
            reject(
              new Error(
                `${CONFIRMED_RUNTIME_CONTRACT}: ${contract.provider} provider navigation was not emitted`
              )
            ),
          20_000
        );
      });

      await page.route(`https://${contract.host}/**`, async route => {
        const request = route.request();
        if (!request.isNavigationRequest()) {
          await route.continue();
          return;
        }
        if (!capturedProviderNavigation) {
          capturedProviderNavigation = true;
          try {
            resolveProviderNavigation(new URL(request.url()));
          } catch {
            rejectProviderNavigation(
              new Error(
                `${CONFIRMED_RUNTIME_CONTRACT}: ${contract.provider} emitted a malformed provider URL`
              )
            );
          }
        }
        await route.abort('aborted');
      });

      const socialPost = page.waitForRequest(
        request => {
          const url = new URL(request.url());
          return (
            request.method() === 'POST' &&
            url.origin === origin &&
            url.pathname === '/api/auth/sign-in/social'
          );
        },
        { timeout: 20_000 }
      );

      try {
        await button.click({ noWaitAfter: true });
        const [request, providerUrl] = await Promise.all([
          socialPost,
          providerNavigation,
        ]);
        const requestUrl = new URL(request.url());
        expect(
          requestUrl.search,
          `${CONFIRMED_RUNTIME_CONTRACT}: Better Auth social POST must use the exact catch-all route`
        ).toBe('');
        expect(
          request.postDataJSON(),
          `${CONFIRMED_RUNTIME_CONTRACT}: Better Auth social POST used the wrong provider`
        ).toEqual(expect.objectContaining({ provider: contract.provider }));
        expect(
          providerUrl.protocol,
          `${CONFIRMED_RUNTIME_CONTRACT}: ${contract.provider} navigation must use HTTPS`
        ).toBe('https:');
        expect(
          providerUrl.hostname,
          `${CONFIRMED_RUNTIME_CONTRACT}: ${contract.provider} navigation used the wrong provider host`
        ).toBe(contract.host);
        expect(
          providerUrl.searchParams.get('redirect_uri'),
          `${CONFIRMED_RUNTIME_CONTRACT}: ${contract.provider} runtime redirect_uri drifted`
        ).toBe(expectedRedirectUri);
      } finally {
        if (navigationTimer) clearTimeout(navigationTimer);
      }
    });
  }
});
