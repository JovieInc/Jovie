import {
  chmodSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  BYPASS_HEADER,
  assertAuthorizedDeploymentOrigin,
  assertOriginBoundRedirect,
  bootstrapOriginBoundAccess,
  buildOriginBoundCookieRequest,
  buildOriginBoundProbeRequest,
  maskSensitiveValues,
  parseExactHostCookieJar,
  readExactHostCookieJar,
  resolveAuthorizedVercelDeployment,
  verifyPublicDeploymentSurfaces,
} = require('./vercel-protected-origin.cjs') as {
  readonly BYPASS_HEADER: string;
  readonly assertAuthorizedDeploymentOrigin: (
    candidate: string,
    resolvedOrigin: string
  ) => string;
  readonly assertOriginBoundRedirect: (
    requestedUrl: string,
    location: string
  ) => URL;
  readonly bootstrapOriginBoundAccess: (
    url: string,
    options: {
      readonly fetchImpl: ReturnType<typeof vi.fn>;
      readonly bypassSecret: string;
      readonly expectedCommitSha: string;
      readonly expectedDeploymentOrigin: string;
      readonly expectedEnvironment: 'preview' | 'production';
      readonly timeoutMs?: number;
    }
  ) => Promise<unknown>;
  readonly buildOriginBoundCookieRequest: (
    url: string,
    options: { readonly cookieHeader: string }
  ) => {
    readonly options: {
      readonly headers: Record<string, string>;
      readonly redirect: string;
    };
  };
  readonly buildOriginBoundProbeRequest: (
    url: string,
    options?: {
      readonly bypassSecret?: string;
      readonly expectedDeploymentOrigin?: string;
      readonly setBypassCookie?: boolean;
    }
  ) => {
    readonly url: URL;
    readonly options: {
      readonly headers: Record<string, string>;
      readonly redirect: string;
    };
  };
  readonly parseExactHostCookieJar: (
    contents: string,
    targetUrl: string
  ) => string;
  readonly readExactHostCookieJar: (path: string, targetUrl: string) => string;
  readonly maskSensitiveValues: (
    values: readonly string[],
    writeLine?: (line: string) => void
  ) => readonly string[];
  readonly resolveAuthorizedVercelDeployment: (options: {
    readonly fetchImpl: ReturnType<typeof vi.fn>;
    readonly token: string;
    readonly orgId: string;
    readonly projectId: string;
    readonly commitSha: string;
    readonly candidateUrl?: string;
    readonly candidateId?: string;
    readonly maxPages?: number;
  }) => Promise<{ readonly id: string; readonly url: string }>;
  readonly verifyPublicDeploymentSurfaces: (
    url: string,
    options: {
      readonly cookieHeader: string;
      readonly fetchImpl: ReturnType<typeof vi.fn>;
      readonly attempts?: number;
    }
  ) => Promise<void>;
};
const {
  primeLighthouseVercelAliasBypass,
  primeLighthouseVercelBypass,
  sensitiveCookieValues,
  validateBuildInfo,
  validateCookieOriginBoundaryHeaders,
} = require('./lighthouse-vercel-bypass.cjs') as {
  readonly primeLighthouseVercelAliasBypass: (
    browser: {
      readonly defaultBrowserContext: () => {
        readonly setCookie: (...cookies: unknown[]) => Promise<void>;
      };
      readonly newPage: () => Promise<unknown>;
    },
    context: { readonly url: string },
    options: {
      readonly fetchImpl: ReturnType<typeof vi.fn>;
      readonly bypassSecret?: string;
      readonly expectedCommitSha?: string;
      readonly expectedAliasOrigin?: string;
      readonly expectedEnvironment?: 'preview' | 'production';
      readonly sensitiveValuesPath?: string;
      readonly recordSensitiveValuesImpl?: (
        path: string | undefined,
        values: readonly string[]
      ) => void;
    }
  ) => Promise<void>;
  readonly primeLighthouseVercelBypass: (
    browser: {
      readonly defaultBrowserContext: () => {
        readonly setCookie: (...cookies: unknown[]) => Promise<void>;
      };
      readonly newPage: () => Promise<unknown>;
    },
    context: { readonly url: string },
    options: {
      readonly fetchImpl: ReturnType<typeof vi.fn>;
      readonly bypassSecret?: string;
      readonly expectedCommitSha?: string;
      readonly expectedDeploymentOrigin?: string;
      readonly expectedEnvironment?: 'preview' | 'production';
      readonly sensitiveValuesPath?: string;
      readonly recordSensitiveValuesImpl?: (
        path: string | undefined,
        values: readonly string[]
      ) => void;
    }
  ) => Promise<void>;
  readonly validateCookieOriginBoundaryHeaders: (
    exactHostHeader: string,
    childHostHeader: string,
    cookies: readonly { readonly name: string; readonly value: string }[]
  ) => void;
  readonly validateBuildInfo: (
    payload: unknown,
    expectedSha: string,
    expectedEnvironment: 'preview' | 'production'
  ) => unknown;
  readonly sensitiveCookieValues: (
    cookies: readonly { readonly name: string; readonly value: string }[]
  ) => readonly string[];
};

const DEPLOYMENT_URL = 'https://jovie-5sy8pmjja-jovie.vercel.app/';
const BUILD_INFO_URL = `${DEPLOYMENT_URL}api/health/build-info`;
const EXPECTED_SHA = '5b38bfd2d32ad88d80989cbf2c2bbbbc3140600e';

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
  url = BUILD_INFO_URL,
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

function browserFixture({ leakToChild = false } = {}) {
  const setCookie = vi.fn().mockResolvedValue(undefined);
  const newPage = vi.fn(async () => {
    let requestHandler:
      | ((request: {
          isNavigationRequest: () => boolean;
          headers: () => Record<string, string>;
          abort: () => Promise<void>;
        }) => void)
      | undefined;
    return {
      setRequestInterception: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(
        (event: string, handler: NonNullable<typeof requestHandler>): void => {
          if (event === 'request') requestHandler = handler;
        }
      ),
      goto: vi.fn(async (url: string) => {
        const isChild = new URL(url).hostname.startsWith('cookie-boundary.');
        requestHandler?.({
          isNavigationRequest: () => true,
          headers: () => ({
            cookie:
              !isChild || leakToChild
                ? '__vercel_live_token=opaque-cookie'
                : '',
          }),
          abort: vi.fn().mockResolvedValue(undefined),
        });
        throw new Error('intercepted');
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
  });
  return {
    browser: {
      defaultBrowserContext: () => ({ setCookie }),
      newPage,
    },
    newPage,
    setCookie,
  };
}

describe('origin-bound Vercel protection bypass', () => {
  it('records only non-public probe cookie values', () => {
    expect(
      sensitiveCookieValues([
        { name: 'jv_country', value: 'US' },
        { name: 'jv_cc_required', value: '1' },
        { name: '__vercel_live_token', value: 'opaque-cookie' },
      ])
    ).toEqual(['opaque-cookie']);
  });

  it('never attaches the bypass credential to canonical production', () => {
    const request = buildOriginBoundProbeRequest('https://jov.ie/robots.txt', {
      bypassSecret: 'sentinel-secret',
      setBypassCookie: true,
    });

    expect(request.options.redirect).toBe('manual');
    expect(request.options.headers).not.toHaveProperty(BYPASS_HEADER);
    expect(request.options.headers).not.toHaveProperty(
      'x-vercel-set-bypass-cookie'
    );
  });

  it('fails before probing an immutable deployment without a credential', () => {
    expect(() =>
      buildOriginBoundProbeRequest(`${DEPLOYMENT_URL}robots.txt`, {
        expectedDeploymentOrigin: DEPLOYMENT_URL,
      })
    ).toThrow('VERCEL_AUTOMATION_BYPASS_SECRET is required');
  });

  it('requires an independently authorized exact origin before attaching the credential', () => {
    expect(() =>
      buildOriginBoundProbeRequest(`${DEPLOYMENT_URL}robots.txt`, {
        bypassSecret: 'sentinel-secret',
      })
    ).toThrow('EXPECTED_VERCEL_DEPLOYMENT_ORIGIN is required');

    expect(() =>
      buildOriginBoundProbeRequest(`${DEPLOYMENT_URL}robots.txt`, {
        bypassSecret: 'sentinel-secret',
        expectedDeploymentOrigin: 'https://jovie-otherdeploy-jovie.vercel.app/',
      })
    ).toThrow('does not match the authorized deployment origin');
  });

  it('rejects a caller URL that differs from the project-scoped Vercel result', () => {
    expect(() =>
      assertAuthorizedDeploymentOrigin(
        DEPLOYMENT_URL,
        'https://jovie-otherdeploy-jovie.vercel.app/'
      )
    ).toThrow('does not match the authorized deployment origin');
  });

  it('rejects a malicious bootstrap redirect before a second request', () => {
    expect(() =>
      assertOriginBoundRedirect(
        BUILD_INFO_URL,
        'https://attacker.example/api/health/build-info'
      )
    ).toThrow('Refusing cross-origin protected-probe redirect');
    expect(() =>
      assertOriginBoundRedirect(BUILD_INFO_URL, `${DEPLOYMENT_URL}signin`)
    ).toThrow('left the requested route');
  });

  it('rejects a foreign Vercel tenant before attaching the project credential', () => {
    expect(() =>
      buildOriginBoundProbeRequest(
        'https://foreign-deployment-other.vercel.app/robots.txt',
        { bypassSecret: 'sentinel-secret' }
      )
    ).toThrow('not a trusted Jovie deployment host');
  });

  it('builds an exact cookie-only SEO request from a host-only curl jar', () => {
    const cookieHeader = parseExactHostCookieJar(
      '#HttpOnly_jovie-5sy8pmjja-jovie.vercel.app\tFALSE\t/\tTRUE\t0\t__vercel_live_token\topaque-cookie\n',
      DEPLOYMENT_URL
    );
    const request = buildOriginBoundCookieRequest(
      `${DEPLOYMENT_URL}robots.txt`,
      { cookieHeader }
    );

    expect(request.options.redirect).toBe('manual');
    expect(request.options.headers.Cookie).toBe(
      '__vercel_live_token=opaque-cookie'
    );
    expect(request.options.headers).not.toHaveProperty(BYPASS_HEADER);
  });

  it('rejects a permissive or symlinked exact-host cookie jar', () => {
    const directory = mkdtempSync(join(tmpdir(), 'jovie-cookie-jar-'));
    const jar = join(directory, 'cookie-jar');
    const link = join(directory, 'cookie-link');
    try {
      writeFileSync(
        jar,
        '#HttpOnly_jovie-5sy8pmjja-jovie.vercel.app\tFALSE\t/\tTRUE\t0\t__vercel_live_token\topaque-cookie\n',
        { mode: 0o600 }
      );
      chmodSync(jar, 0o644);
      expect(() => readExactHostCookieJar(jar, DEPLOYMENT_URL)).toThrow(
        'mode-0600 regular file'
      );

      chmodSync(jar, 0o600);
      symlinkSync(jar, link);
      expect(() => readExactHostCookieJar(link, DEPLOYMENT_URL)).toThrow(
        'mode-0600 regular file'
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it('rejects malformed probe URLs without echoing input credentials', () => {
    expect(() =>
      buildOriginBoundProbeRequest('not a url', {
        bypassSecret: 'sentinel-secret',
      })
    ).toThrow('Probe URL is malformed');
  });

  it('refuses a 302 to Vercel login without following or leaking the secret', async () => {
    const secret = 'sentinel-secret';
    const fetchImpl = vi.fn().mockResolvedValue(
      responseFixture({
        status: 302,
        location: 'https://vercel.com/login?next=%2Fsso-api%3Furl%3Ddeployment',
        setCookies: ['_vercel_jwt=opaque; Path=/; Secure; HttpOnly'],
      })
    );
    const { browser, setCookie } = browserFixture();

    const promise = primeLighthouseVercelBypass(
      browser,
      { url: DEPLOYMENT_URL },
      {
        fetchImpl,
        bypassSecret: secret,
        expectedCommitSha: EXPECTED_SHA,
        expectedDeploymentOrigin: DEPLOYMENT_URL,
        expectedEnvironment: 'production',
      }
    );

    await expect(promise).rejects.toThrow(
      'Refusing cross-origin protected-probe redirect'
    );
    await expect(promise).rejects.not.toThrow(secret);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(setCookie).not.toHaveBeenCalled();
  });

  it('rejects an already-followed HTTP-200 Vercel login response by final URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      responseFixture({
        status: 200,
        url: 'https://vercel.com/login?next=%2Fsso-api%3Furl%3Ddeployment',
        contentType: 'text/html; charset=utf-8',
        setCookies: ['_vercel_jwt=opaque; Path=/; Secure; HttpOnly'],
        body: '<html><title>Log in to Vercel</title></html>',
      })
    );
    const { browser, setCookie } = browserFixture();

    await expect(
      primeLighthouseVercelBypass(
        browser,
        { url: DEPLOYMENT_URL },
        {
          fetchImpl,
          bypassSecret: 'sentinel-secret',
          expectedCommitSha: EXPECTED_SHA,
          expectedDeploymentOrigin: DEPLOYMENT_URL,
          expectedEnvironment: 'production',
        }
      )
    ).rejects.toThrow('resolved outside the requested route');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(setCookie).not.toHaveBeenCalled();
  });

  it('rejects an HTTP-200 login page after origin-bound cookie bootstrap', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        responseFixture({
          status: 307,
          location: BUILD_INFO_URL,
          setCookies: [
            '__vercel_live_token=opaque-cookie; Path=/; Secure; HttpOnly',
          ],
        })
      )
      .mockResolvedValueOnce(
        responseFixture({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: '<html><title>Log in to Vercel</title></html>',
        })
      );
    const { browser } = browserFixture();

    await expect(
      primeLighthouseVercelBypass(
        browser,
        { url: DEPLOYMENT_URL },
        {
          fetchImpl,
          bypassSecret: 'sentinel-secret',
          expectedCommitSha: EXPECTED_SHA,
          expectedDeploymentOrigin: DEPLOYMENT_URL,
          expectedEnvironment: 'production',
        }
      )
    ).rejects.toThrow('did not return JSON build identity');
  });

  it('rejects an exact-host 404 instead of accepting a substantial body', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        responseFixture({
          status: 307,
          location: BUILD_INFO_URL,
          setCookies: [
            '__vercel_live_token=opaque-cookie; Path=/; Secure; HttpOnly',
          ],
        })
      )
      .mockResolvedValueOnce(
        responseFixture({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'not found'.repeat(100) }),
        })
      );
    const { browser } = browserFixture();

    await expect(
      primeLighthouseVercelBypass(
        browser,
        { url: DEPLOYMENT_URL },
        {
          fetchImpl,
          bypassSecret: 'sentinel-secret',
          expectedCommitSha: EXPECTED_SHA,
          expectedDeploymentOrigin: DEPLOYMENT_URL,
          expectedEnvironment: 'production',
        }
      )
    ).rejects.toThrow('returned HTTP 404');
  });

  it('primes an exact-host cookie and verifies the immutable build without forwarding the bypass header', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        responseFixture({
          status: 307,
          location: BUILD_INFO_URL,
          setCookies: [
            '__vercel_live_token=opaque-cookie; Path=/; Secure; HttpOnly',
          ],
        })
      )
      .mockResolvedValueOnce(
        responseFixture({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            buildId: 'gKtEF24TywuvaaRXMU6cg',
            commitSha: '5b38bfd',
            environment: 'production',
          }),
        })
      );
    const { browser, setCookie } = browserFixture();
    const recordSensitiveValuesImpl = vi.fn();

    await primeLighthouseVercelBypass(
      browser,
      { url: `${DEPLOYMENT_URL}tim` },
      {
        fetchImpl,
        bypassSecret: 'sentinel-secret',
        expectedCommitSha: EXPECTED_SHA,
        expectedDeploymentOrigin: DEPLOYMENT_URL,
        expectedEnvironment: 'production',
        sensitiveValuesPath: '/runner-temp/lighthouse-sensitive-values',
        recordSensitiveValuesImpl,
      }
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstOptions = fetchImpl.mock.calls[0]![1] as {
      readonly headers: Record<string, string>;
      readonly redirect: string;
    };
    expect(firstOptions.redirect).toBe('manual');
    expect(firstOptions.headers[BYPASS_HEADER]).toBe('sentinel-secret');
    expect(firstOptions.headers['x-vercel-set-bypass-cookie']).toBe('true');

    const secondOptions = fetchImpl.mock.calls[1]![1] as {
      readonly headers: Record<string, string>;
      readonly redirect: string;
    };
    expect(secondOptions.redirect).toBe('manual');
    expect(secondOptions.headers).not.toHaveProperty(BYPASS_HEADER);
    expect(secondOptions.headers.Cookie).toBe(
      '__vercel_live_token=opaque-cookie'
    );
    expect(setCookie).toHaveBeenCalledWith({
      name: '__vercel_live_token',
      value: 'opaque-cookie',
      url: 'https://jovie-5sy8pmjja-jovie.vercel.app',
      secure: true,
      httpOnly: true,
    });
    expect(recordSensitiveValuesImpl).toHaveBeenCalledWith(
      '/runner-temp/lighthouse-sensitive-values',
      ['opaque-cookie']
    );
  });

  it('primes a host-only staging-alias cookie and verifies the candidate SHA', async () => {
    const aliasOrigin = 'https://staging.jov.ie';
    const aliasBuildInfoUrl = `${aliasOrigin}/api/health/build-info`;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        responseFixture({
          status: 307,
          url: aliasBuildInfoUrl,
          location: aliasBuildInfoUrl,
          setCookies: [
            '__vercel_live_token=opaque-cookie; Path=/; Secure; HttpOnly',
          ],
        })
      )
      .mockResolvedValueOnce(
        responseFixture({
          status: 200,
          url: aliasBuildInfoUrl,
          contentType: 'application/json',
          body: JSON.stringify({
            buildId: 'staging-candidate',
            commitSha: EXPECTED_SHA,
            environment: 'preview',
          }),
        })
      );
    const { browser, setCookie } = browserFixture();

    await primeLighthouseVercelAliasBypass(
      browser,
      { url: aliasOrigin },
      {
        fetchImpl,
        bypassSecret: 'sentinel-secret',
        expectedCommitSha: EXPECTED_SHA,
        expectedAliasOrigin: aliasOrigin,
        expectedEnvironment: 'preview',
      }
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      (fetchImpl.mock.calls[0]![1] as { headers: Record<string, string> })
        .headers[BYPASS_HEADER]
    ).toBe('sentinel-secret');
    const verificationHeaders = (
      fetchImpl.mock.calls[1]![1] as { headers: Record<string, string> }
    ).headers;
    expect(verificationHeaders).not.toHaveProperty(BYPASS_HEADER);
    expect(verificationHeaders.Cookie).toBe(
      '__vercel_live_token=opaque-cookie'
    );
    expect(setCookie).toHaveBeenCalledWith({
      name: '__vercel_live_token',
      value: 'opaque-cookie',
      url: aliasOrigin,
      secure: true,
      httpOnly: true,
    });
  });

  it('fails closed if browser request headers expose the cookie to a child subdomain', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      responseFixture({
        status: 307,
        location: BUILD_INFO_URL,
        setCookies: [
          '__vercel_live_token=opaque-cookie; Path=/; Secure; HttpOnly',
        ],
      })
    );
    const { browser } = browserFixture({ leakToChild: true });

    await expect(
      primeLighthouseVercelBypass(
        browser,
        { url: DEPLOYMENT_URL },
        {
          fetchImpl,
          bypassSecret: 'sentinel-secret',
          expectedCommitSha: EXPECTED_SHA,
          expectedDeploymentOrigin: DEPLOYMENT_URL,
          expectedEnvironment: 'production',
        }
      )
    ).rejects.toThrow('deployment subdomain');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects a domain-scoped bootstrap cookie before browser installation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      responseFixture({
        status: 307,
        location: BUILD_INFO_URL,
        setCookies: [
          '__vercel_live_token=opaque-cookie; Domain=.vercel.app; Path=/; Secure; HttpOnly',
        ],
      })
    );
    const { browser, setCookie } = browserFixture();

    await expect(
      primeLighthouseVercelBypass(
        browser,
        { url: DEPLOYMENT_URL },
        {
          fetchImpl,
          bypassSecret: 'sentinel-secret',
          expectedCommitSha: EXPECTED_SHA,
          expectedDeploymentOrigin: DEPLOYMENT_URL,
          expectedEnvironment: 'production',
        }
      )
    ).rejects.toThrow('domain-scoped authorization cookie');
    expect(setCookie).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'path-scoped',
      cookie: '__vercel_live_token=opaque-cookie; Path=/api; Secure; HttpOnly',
      error: 'outside the root path',
    },
    {
      label: 'insecure',
      cookie: '__vercel_live_token=opaque-cookie; Path=/; HttpOnly',
      error: 'insecure authorization cookie',
    },
  ])('rejects a $label bootstrap cookie', async ({ cookie, error }) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      responseFixture({
        status: 307,
        location: BUILD_INFO_URL,
        setCookies: [cookie],
      })
    );
    const { browser, setCookie } = browserFixture();

    await expect(
      primeLighthouseVercelBypass(
        browser,
        { url: DEPLOYMENT_URL },
        {
          fetchImpl,
          bypassSecret: 'sentinel-secret',
          expectedCommitSha: EXPECTED_SHA,
          expectedDeploymentOrigin: DEPLOYMENT_URL,
          expectedEnvironment: 'production',
        }
      )
    ).rejects.toThrow(error);
    expect(setCookie).not.toHaveBeenCalled();
  });

  it('does not echo cookie state when browser boundary validation fails', () => {
    const cookie = 'opaque-cookie-value';
    expect(() =>
      validateCookieOriginBoundaryHeaders(
        `__vercel_live_token=${cookie}`,
        `__vercel_live_token=${cookie}`,
        [{ name: '__vercel_live_token', value: cookie }]
      )
    ).toThrow('deployment subdomain');
    try {
      validateCookieOriginBoundaryHeaders('', '', [
        { name: '__vercel_live_token', value: cookie },
      ]);
    } catch (error) {
      expect(String(error)).not.toContain(cookie);
    }
  });

  it('requires the caller to distinguish a trusted preview from production', () => {
    const payload = {
      buildId: 'preview-build',
      commitSha: EXPECTED_SHA.slice(0, 7),
      environment: 'preview',
    };

    expect(() =>
      validateBuildInfo(payload, EXPECTED_SHA, 'preview')
    ).not.toThrow();
    expect(() =>
      validateBuildInfo(payload, EXPECTED_SHA, 'production')
    ).toThrow('wrong-environment build identity');
    expect(() =>
      validateBuildInfo(payload, EXPECTED_SHA, undefined as never)
    ).toThrow('must be explicitly set');
  });

  it('uses one aborting absolute deadline for a stalled protected bootstrap', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(
        (_url: URL, options: { readonly signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener(
              'abort',
              () => reject(options.signal.reason),
              { once: true }
            );
          })
      );
      const verification = bootstrapOriginBoundAccess(DEPLOYMENT_URL, {
        fetchImpl,
        bypassSecret: 'sentinel-secret',
        expectedCommitSha: EXPECTED_SHA,
        expectedDeploymentOrigin: DEPLOYMENT_URL,
        expectedEnvironment: 'production',
        timeoutMs: 1_000,
      });
      const deadlineFailure =
        expect(verification).rejects.toThrow('absolute deadline');

      await vi.advanceTimersByTimeAsync(1_000);

      await deadlineFailure;
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(fetchImpl.mock.calls[0]?.[1].signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves the absolute-deadline failure when a response body stalls', async () => {
    vi.useFakeTimers();
    try {
      const stalledBody = responseFixture({
        status: 200,
        contentType: 'application/json',
      });
      stalledBody.text.mockImplementation(() => new Promise(() => {}));
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(
          responseFixture({
            status: 307,
            location: BUILD_INFO_URL,
            setCookies: [
              '__vercel_live_token=opaque-cookie; Path=/; Secure; HttpOnly',
            ],
          })
        )
        .mockResolvedValueOnce(stalledBody);

      const verification = bootstrapOriginBoundAccess(DEPLOYMENT_URL, {
        fetchImpl,
        bypassSecret: 'sentinel-secret',
        expectedCommitSha: EXPECTED_SHA,
        expectedDeploymentOrigin: DEPLOYMENT_URL,
        expectedEnvironment: 'production',
        timeoutMs: 1_000,
      });
      const deadlineFailure =
        expect(verification).rejects.toThrow('absolute deadline');

      await vi.advanceTimersByTimeAsync(1_000);

      await deadlineFailure;
      await expect(verification).rejects.not.toThrow('invalid JSON');
    } finally {
      vi.useRealTimers();
    }
  });

  it('masks dynamically returned cookie values before any downstream logging', () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    try {
      const lines: string[] = [];
      expect(
        maskSensitiveValues(['opaque%cookie-value'], line => lines.push(line))
      ).toEqual(['opaque%cookie-value']);
      expect(lines).toEqual(['::add-mask::opaque%25cookie-value']);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('paginates until the exact caller URL and deployment ID are both bound', async () => {
    const otherUrl = 'https://jovie-otherbuild-jovie.vercel.app';
    const apiResponse = (payload: unknown) => ({
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify(payload)),
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        apiResponse({
          deployments: [
            {
              uid: 'dpl_wrong',
              url: otherUrl,
              projectId: 'prj_jovie',
              readyState: 'READY',
              meta: { githubCommitSha: EXPECTED_SHA },
            },
          ],
          pagination: { next: 1234 },
        })
      )
      .mockResolvedValueOnce(
        apiResponse({
          deployments: [
            {
              uid: 'dpl_exact',
              url: DEPLOYMENT_URL,
              projectId: 'prj_jovie',
              readyState: 'READY',
              meta: { githubCommitSha: EXPECTED_SHA },
            },
          ],
          pagination: { next: null },
        })
      );

    await expect(
      resolveAuthorizedVercelDeployment({
        fetchImpl,
        token: 'sentinel-vercel-token',
        orgId: 'team_jovie',
        projectId: 'prj_jovie',
        commitSha: EXPECTED_SHA,
        candidateUrl: DEPLOYMENT_URL,
        candidateId: 'dpl_exact',
      })
    ).resolves.toEqual({ id: 'dpl_exact', url: DEPLOYMENT_URL.slice(0, -1) });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain('until=1234');
    expect(String(fetchImpl.mock.calls[0]?.[0])).not.toContain(
      'sentinel-vercel-token'
    );
  });

  it('polls bounded list lag and transient deployment states until the exact deployment is READY', async () => {
    const apiResponse = (deployments: unknown[]) => ({
      status: 200,
      text: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({ deployments, pagination: { next: null } })
        ),
    });
    const deployment = (
      readyState: string,
      githubCommitSha = EXPECTED_SHA
    ) => ({
      uid: 'dpl_exact',
      url: DEPLOYMENT_URL,
      projectId: 'prj_jovie',
      readyState,
      meta: { githubCommitSha },
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(apiResponse([]))
      .mockResolvedValueOnce(apiResponse([deployment('BUILDING', '')]))
      .mockResolvedValueOnce(apiResponse([deployment('QUEUED')]))
      .mockResolvedValueOnce(apiResponse([deployment('INITIALIZING')]))
      .mockResolvedValueOnce(apiResponse([deployment('READY')]));

    await expect(
      resolveAuthorizedVercelDeployment({
        fetchImpl,
        token: 'sentinel-vercel-token',
        orgId: 'team_jovie',
        projectId: 'prj_jovie',
        commitSha: EXPECTED_SHA,
        candidateUrl: DEPLOYMENT_URL,
        candidateId: 'dpl_exact',
        timeoutMs: 2_000,
        pollIntervalMs: 1,
      })
    ).resolves.toEqual({ id: 'dpl_exact', url: DEPLOYMENT_URL.slice(0, -1) });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    for (const [url] of fetchImpl.mock.calls) {
      expect(String(url)).not.toContain('state=READY');
    }
  });

  it('treats an exact deployment ID with a not-yet-indexed URL as transient', async () => {
    const apiResponse = (deployments: unknown[]) => ({
      status: 200,
      text: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({ deployments, pagination: { next: null } })
        ),
    });
    const exact = {
      uid: 'dpl_exact',
      projectId: 'prj_jovie',
      readyState: 'READY',
      meta: { githubCommitSha: EXPECTED_SHA },
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(apiResponse([exact]))
      .mockResolvedValueOnce(apiResponse([{ ...exact, url: DEPLOYMENT_URL }]));

    await expect(
      resolveAuthorizedVercelDeployment({
        fetchImpl,
        token: 'sentinel-vercel-token',
        orgId: 'team_jovie',
        projectId: 'prj_jovie',
        commitSha: EXPECTED_SHA,
        candidateUrl: DEPLOYMENT_URL,
        candidateId: 'dpl_exact',
        timeoutMs: 2_000,
        pollIntervalMs: 1,
      })
    ).resolves.toEqual({ id: 'dpl_exact', url: DEPLOYMENT_URL.slice(0, -1) });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('treats READY without a commit SHA as transient until full identity converges', async () => {
    const apiResponse = (githubCommitSha?: string) => ({
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          deployments: [
            {
              uid: 'dpl_exact',
              url: DEPLOYMENT_URL,
              projectId: 'prj_jovie',
              readyState: 'READY',
              meta: githubCommitSha ? { githubCommitSha } : {},
            },
          ],
          pagination: { next: null },
        })
      ),
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(apiResponse())
      .mockResolvedValueOnce(apiResponse(EXPECTED_SHA));

    await expect(
      resolveAuthorizedVercelDeployment({
        fetchImpl,
        token: 'sentinel-vercel-token',
        orgId: 'team_jovie',
        projectId: 'prj_jovie',
        commitSha: EXPECTED_SHA,
        candidateUrl: DEPLOYMENT_URL,
        candidateId: 'dpl_exact',
        timeoutMs: 2_000,
        pollIntervalMs: 1,
      })
    ).resolves.toEqual({ id: 'dpl_exact', url: DEPLOYMENT_URL.slice(0, -1) });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries bounded transport failures and transient Vercel 5xx responses', async () => {
    const readyResponse = {
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          deployments: [
            {
              uid: 'dpl_exact',
              url: DEPLOYMENT_URL,
              projectId: 'prj_jovie',
              readyState: 'READY',
              meta: { githubCommitSha: EXPECTED_SHA },
            },
          ],
          pagination: { next: null },
        })
      ),
    };
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('socket reset'))
      .mockResolvedValueOnce({
        status: 503,
        text: vi.fn().mockResolvedValue('temporarily unavailable'),
      })
      .mockResolvedValueOnce(readyResponse);

    await expect(
      resolveAuthorizedVercelDeployment({
        fetchImpl,
        token: 'sentinel-vercel-token',
        orgId: 'team_jovie',
        projectId: 'prj_jovie',
        commitSha: EXPECTED_SHA,
        candidateUrl: DEPLOYMENT_URL,
        candidateId: 'dpl_exact',
        timeoutMs: 2_000,
        pollIntervalMs: 1,
      })
    ).resolves.toEqual({ id: 'dpl_exact', url: DEPLOYMENT_URL.slice(0, -1) });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('fails closed immediately on present malformed exact identity', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          deployments: [
            {
              uid: 'malformed-id',
              url: DEPLOYMENT_URL,
              projectId: 'prj_jovie',
              readyState: 'READY',
              meta: { githubCommitSha: EXPECTED_SHA },
            },
          ],
          pagination: { next: null },
        })
      ),
    });

    await expect(
      resolveAuthorizedVercelDeployment({
        fetchImpl,
        token: 'sentinel-vercel-token',
        orgId: 'team_jovie',
        projectId: 'prj_jovie',
        commitSha: EXPECTED_SHA,
        candidateUrl: DEPLOYMENT_URL,
        candidateId: 'dpl_exact',
        timeoutMs: 1_000,
        pollIntervalMs: 1,
      })
    ).rejects.toThrow('malformed deployment ID');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejects an exact READY deployment whose full commit SHA differs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          deployments: [
            {
              uid: 'dpl_exact',
              url: DEPLOYMENT_URL,
              projectId: 'prj_jovie',
              readyState: 'READY',
              meta: { githubCommitSha: 'b'.repeat(40) },
            },
          ],
          pagination: { next: null },
        })
      ),
    });

    await expect(
      resolveAuthorizedVercelDeployment({
        fetchImpl,
        token: 'sentinel-vercel-token',
        orgId: 'team_jovie',
        projectId: 'prj_jovie',
        commitSha: EXPECTED_SHA,
        candidateUrl: DEPLOYMENT_URL,
        candidateId: 'dpl_exact',
        timeoutMs: 1_000,
        pollIntervalMs: 1,
      })
    ).rejects.toThrow('full expected commit SHA');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejects an ambiguous commit-only deployment fallback', async () => {
    const apiResponse = {
      status: 200,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          deployments: ['one', 'two'].map((suffix, index) => ({
            uid: `dpl_${suffix}`,
            url: `https://jovie-${suffix}-jovie.vercel.app`,
            projectId: 'prj_jovie',
            readyState: 'READY',
            meta: { githubCommitSha: EXPECTED_SHA },
            createdAt: index,
          })),
          pagination: { next: null },
        })
      ),
    };

    await expect(
      resolveAuthorizedVercelDeployment({
        fetchImpl: vi.fn().mockResolvedValue(apiResponse),
        token: 'sentinel-vercel-token',
        orgId: 'team_jovie',
        projectId: 'prj_jovie',
        commitSha: EXPECTED_SHA,
      })
    ).rejects.toThrow('missing or ambiguous');
  });

  it.each([
    {
      label: 'not-found profile',
      failingPath: '/tim',
      status: 200,
      body:
        '<html><body>Profile not found' + 'x'.repeat(600) + '</body></html>',
      error: 'error or not-found content',
    },
    {
      label: 'empty successful critical page',
      failingPath: '/signup',
      status: 204,
      body: '',
      error: 'Signup returned HTTP 204',
    },
  ])('rejects a $label in the shared semantic public-surface verifier', async ({
    failingPath,
    status,
    body,
    error,
  }) => {
    const html = '<html><body>' + 'healthy'.repeat(200) + '</body></html>';
    const fetchImpl = vi.fn(async (rawUrl: URL, _options: unknown) => {
      const url = new URL(rawUrl);
      const isFailure = url.pathname === failingPath;
      const isHealth = url.pathname === '/api/health';
      const responseBody = isFailure
        ? body
        : isHealth
          ? JSON.stringify({ status: 'ok', database: 'ok' })
          : html;
      return {
        status: isFailure ? status : 200,
        url: url.href,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'content-type'
              ? isHealth
                ? 'application/json'
                : 'text/html; charset=utf-8'
              : null,
        },
        text: vi.fn().mockResolvedValue(responseBody),
      };
    });

    await expect(
      verifyPublicDeploymentSurfaces(DEPLOYMENT_URL, {
        cookieHeader: '__vercel_live_token=opaque-cookie',
        fetchImpl,
        attempts: 1,
      })
    ).rejects.toThrow(error);
  });

  it('accepts a healthy profile whose inline flight payload serializes the not-found boundary', async () => {
    // Next.js embeds the route's not-found template inside the RSC flight
    // payload of every HEALTHY page render. The error-content scan must not
    // treat that serialized script text as rendered error content.
    const healthyProfile =
      '<html><body><h1>Tim White</h1>' +
      'healthy'.repeat(200) +
      '<script>self.__next_f.push([1,"{\\"className\\":\\"system-b-public-profile-not-found-title\\",\\"children\\":\\"Profile not found\\"}"])</script>' +
      '<script type="application/json">{"message":"Something went wrong"}</script>' +
      '</body></html>';
    const html = '<html><body>' + 'healthy'.repeat(200) + '</body></html>';
    const fetchImpl = vi.fn(async (rawUrl: URL, _options: unknown) => {
      const url = new URL(rawUrl);
      const isHealth = url.pathname === '/api/health';
      const isProfile = url.pathname === '/tim';
      return {
        status: 200,
        url: url.href,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'content-type'
              ? isHealth
                ? 'application/json'
                : 'text/html; charset=utf-8'
              : null,
        },
        text: vi
          .fn()
          .mockResolvedValue(
            isHealth
              ? JSON.stringify({ status: 'ok', database: 'ok' })
              : isProfile
                ? healthyProfile
                : html
          ),
      };
    });

    await verifyPublicDeploymentSurfaces(DEPLOYMENT_URL, {
      cookieHeader: '__vercel_live_token=opaque-cookie',
      fetchImpl,
      attempts: 1,
    });
    expect(
      fetchImpl.mock.calls.some(([url]) => new URL(url).pathname === '/tim')
    ).toBe(true);
  });

  it('still rejects rendered error content outside inline scripts', async () => {
    const renderedError =
      '<html><body><script>self.__next_f.push([1,"ok"])</script>' +
      '<h1>Profile not found</h1>' +
      'x'.repeat(600) +
      '</body></html>';
    const html = '<html><body>' + 'healthy'.repeat(200) + '</body></html>';
    const fetchImpl = vi.fn(async (rawUrl: URL, _options: unknown) => {
      const url = new URL(rawUrl);
      const isHealth = url.pathname === '/api/health';
      return {
        status: 200,
        url: url.href,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'content-type'
              ? isHealth
                ? 'application/json'
                : 'text/html; charset=utf-8'
              : null,
        },
        text: vi
          .fn()
          .mockResolvedValue(
            isHealth
              ? JSON.stringify({ status: 'ok', database: 'ok' })
              : url.pathname === '/tim'
                ? renderedError
                : html
          ),
      };
    });

    await expect(
      verifyPublicDeploymentSurfaces(DEPLOYMENT_URL, {
        cookieHeader: '__vercel_live_token=opaque-cookie',
        fetchImpl,
        attempts: 1,
      })
    ).rejects.toThrow('Public profile returned error or not-found content.');
  });

  it('checks the complete public-surface set with cookie-only exact-route requests', async () => {
    const html = '<html><body>' + 'healthy'.repeat(200) + '</body></html>';
    const fetchImpl = vi.fn(async (rawUrl: URL, _options: unknown) => {
      const url = new URL(rawUrl);
      const isHealth = url.pathname === '/api/health';
      return {
        status: 200,
        url: url.href,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'content-type'
              ? isHealth
                ? 'application/json'
                : 'text/html; charset=utf-8'
              : null,
        },
        text: vi
          .fn()
          .mockResolvedValue(
            isHealth ? JSON.stringify({ status: 'ok' }) : html
          ),
      };
    });

    await verifyPublicDeploymentSurfaces(DEPLOYMENT_URL, {
      cookieHeader: '__vercel_live_token=opaque-cookie',
      fetchImpl,
      attempts: 1,
    });

    expect(fetchImpl.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      '/api/health',
      '/',
      '/tim',
      '/signup',
      '/signin',
      '/start',
      '/pricing',
    ]);
    for (const [, rawOptions] of fetchImpl.mock.calls) {
      const options = rawOptions as {
        readonly headers: Record<string, string>;
        readonly redirect: string;
      };
      expect(options.headers.Cookie).toBe('__vercel_live_token=opaque-cookie');
      expect(options.headers).not.toHaveProperty(BYPASS_HEADER);
      expect(options.redirect).toBe('manual');
    }
  });
});
