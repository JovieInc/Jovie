import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

// JOV-7973: closed/invite-entry reconciliation tests for the protected-origin
// probe's public-surface walk. Anonymous /start and /signup intentionally
// redirect to /waitlist while public signup is closed (canon/PRODUCT.md,
// 2026-11-02); the probe follows exactly that one transition and then
// requires a healthy waitlist role form. Every other redirect stays a
// failure. Lives in its own file so the size-baselined probe test does not
// grow.

const require = createRequire(import.meta.url);
const { BYPASS_HEADER, DEPLOY_HEALTH_PATH, verifyPublicDeploymentSurfaces } =
  require('./vercel-protected-origin.cjs') as {
    readonly BYPASS_HEADER: string;
    readonly DEPLOY_HEALTH_PATH: string;
    readonly verifyPublicDeploymentSurfaces: (
      url: string,
      options: {
        readonly cookieHeader: string;
        readonly fetchImpl: ReturnType<typeof vi.fn>;
        readonly attempts?: number;
      }
    ) => Promise<void>;
  };

const DEPLOYMENT_URL = 'https://jovie-5sy8pmjja-jovie.vercel.app/';
const HEALTHY_DEPLOY_PAYLOAD = JSON.stringify({
  status: 'healthy',
  checks: {
    environment: { ok: true },
    database: { ok: true },
  },
});

interface ResponseFixture {
  readonly status: number;
  readonly url?: string;
  readonly location?: string;
  readonly contentType?: string;
  readonly setCookies?: readonly string[];
  readonly body?: string;
}

function responseFixture({
  status,
  url = `${DEPLOYMENT_URL}api/health/build-info`,
  location,
  contentType,
  setCookies = [],
  body = '',
}: ResponseFixture) {
  const headers = new Map<string, string>();
  if (location) headers.set('location', location);
  if (contentType) headers.set('content-type', contentType);

  return {
    status,
    url,
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
      getSetCookie: () => [...setCookies],
    },
    text: vi.fn().mockResolvedValue(body),
  };
}

describe('closed-signup public-surface redirects', () => {
  const html = '<html><body>' + 'healthy'.repeat(200) + '</body></html>';
  const waitlistHtml = html.replace(
    '</body>',
    '<form data-testid="waitlist-role-form"></form></body>'
  );

  function redirectFixture(
    entry: string,
    location = '/waitlist',
    status = 307,
    landing: Partial<ResponseFixture> = {}
  ) {
    return vi.fn(async (rawUrl: URL, _options: unknown) => {
      const url = new URL(rawUrl);
      if (url.pathname === entry) {
        return responseFixture({ status, url: url.href, location });
      }
      return responseFixture({
        status: 200,
        url: url.href,
        contentType:
          url.pathname === DEPLOY_HEALTH_PATH
            ? 'application/json'
            : 'text/html',
        body:
          url.pathname === DEPLOY_HEALTH_PATH
            ? HEALTHY_DEPLOY_PAYLOAD
            : url.pathname === '/waitlist'
              ? waitlistHtml
              : html,
        ...(url.pathname === '/waitlist' ? landing : {}),
      });
    });
  }

  const verify = (fetchImpl: ReturnType<typeof redirectFixture>) =>
    verifyPublicDeploymentSurfaces(DEPLOYMENT_URL, {
      cookieHeader: '__vercel_live_token=opaque-cookie',
      fetchImpl,
      attempts: 1,
    });

  it.each(['/start', '/signup'])(
    'verifies the role form after the intentional %s redirect',
    async entry => {
      const fetchImpl = redirectFixture(entry);
      await expect(verify(fetchImpl)).resolves.toBeUndefined();
      const calls = fetchImpl.mock.calls as unknown as [
        URL,
        { headers: Record<string, string>; redirect: string },
      ][];
      const entryIndex = calls.findIndex(([url]) => url.pathname === entry);
      expect(calls[entryIndex + 1][0].href).toBe(`${DEPLOYMENT_URL}waitlist`);
      for (const [, options] of calls) {
        expect(options.headers.Cookie).toBe(
          '__vercel_live_token=opaque-cookie'
        );
        expect(options.headers).not.toHaveProperty(BYPASS_HEADER);
        expect(options.redirect).toBe('manual');
      }
    }
  );

  it.each<[string, string, number]>([
    ['/start', '/signin', 307],
    ['/start', '/waitlist?next=/start', 307],
    ['/start', '/waitlist#form', 307],
    ['/start', 'https://example.com/waitlist', 307],
    ['/start', '/waitlist', 308],
    ['/signin', '/waitlist', 307],
  ])(
    'rejects %s → %s (%s) before another request',
    async (entry, location, status) => {
      const fetchImpl = redirectFixture(entry, location, status);
      await expect(verify(fetchImpl)).rejects.toThrow();
      expect(fetchImpl.mock.calls.at(-1)?.[0].pathname).toBe(entry);
    }
  );

  it.each([
    { status: 401 },
    { status: 307, location: '/waitlist' },
    { status: 200, body: html },
    {
      status: 200,
      body: html + '<!-- <form data-testid="waitlist-role-form"></form> -->',
    },
    {
      status: 200,
      body:
        html +
        '<script>"<form data-testid=\\"waitlist-role-form\\"></form>"</script>',
    },
    {
      status: 200,
      body: waitlistHtml.replace('healthy', 'Internal server error'),
    },
    { status: 200, url: `${DEPLOYMENT_URL}signin` },
  ])('fails closed on an unhealthy waitlist response %j', async landing => {
    await expect(
      verify(redirectFixture('/start', '/waitlist', 307, landing))
    ).rejects.toThrow();
  });
});
