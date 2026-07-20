import type { BrowserContext, Page } from '@playwright/test';
import primeLighthouseVercelBypassModule from '../../scripts/lighthouse-vercel-bypass.cjs';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export function parseBaseUrl(baseURL?: string): URL | null {
  if (!baseURL) return null;

  try {
    return new URL(baseURL);
  } catch {
    return null;
  }
}

export function isExternalBaseUrl(baseURL?: string): baseURL is string {
  const parsed = parseBaseUrl(baseURL);
  if (!parsed) return false;

  return !LOCAL_HOSTS.has(parsed.hostname);
}

export function requireExactNavigationOrigin(baseURL?: string): string {
  const parsed = parseBaseUrl(baseURL);
  if (
    !parsed ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.pathname !== '/' ||
    parsed.search
  ) {
    throw new Error(
      'Browser smoke requires one exact base origin without credentials, path, query, or fragment.'
    );
  }
  return parsed.origin;
}

export function isExactNavigationUrl(
  rawUrl: string | URL,
  expectedOrigin: string
): boolean {
  try {
    return (
      new URL(rawUrl).origin === requireExactNavigationOrigin(expectedOrigin)
    );
  } catch {
    return false;
  }
}

export function assertExactNavigationUrl(
  rawUrl: string | URL,
  expectedOrigin: string,
  label = 'Browser navigation'
): URL {
  const url = rawUrl instanceof URL ? new URL(rawUrl.href) : new URL(rawUrl);
  if (!isExactNavigationUrl(url, expectedOrigin)) {
    throw new Error(`${label} left the exact deployment origin.`);
  }
  return url;
}

interface OriginBoundCookie {
  readonly name: string;
  readonly value: string;
  readonly url: string;
  readonly secure: boolean;
  readonly httpOnly: boolean;
}

const primeLighthouseVercelBypass = primeLighthouseVercelBypassModule as (
  browser: {
    readonly defaultBrowserContext: () => {
      readonly setCookie: (...cookies: OriginBoundCookie[]) => Promise<void>;
    };
  },
  context: { readonly url: string },
  options: {
    readonly bypassSecret?: string;
    readonly expectedCommitSha?: string;
    readonly expectedDeploymentOrigin?: string;
    readonly expectedEnvironment?: 'preview' | 'production';
    readonly sensitiveValuesPath?: string;
    readonly assertBrowserCookieOriginBoundaryImpl?: (
      browser: unknown,
      targetUrl: URL,
      cookies: readonly OriginBoundCookie[]
    ) => Promise<void>;
  }
) => Promise<void>;

const validateCookieOriginBoundaryHeaders = (
  primeLighthouseVercelBypassModule as {
    readonly validateCookieOriginBoundaryHeaders: (
      exactHostHeader: string,
      childHostHeader: string,
      cookies: readonly OriginBoundCookie[]
    ) => void;
  }
).validateCookieOriginBoundaryHeaders;

const primeLighthouseVercelAliasBypass = (
  primeLighthouseVercelBypassModule as {
    readonly primeLighthouseVercelAliasBypass: (
      browser: {
        readonly defaultBrowserContext: () => {
          readonly setCookie: (
            ...cookies: OriginBoundCookie[]
          ) => Promise<void>;
        };
      },
      context: { readonly url: string },
      options: {
        readonly bypassSecret?: string;
        readonly expectedCommitSha?: string;
        readonly expectedAliasOrigin?: string;
        readonly expectedEnvironment?: 'preview' | 'production';
        readonly sensitiveValuesPath?: string;
        readonly assertBrowserCookieOriginBoundaryImpl?: (
          browser: unknown,
          targetUrl: URL,
          cookies: readonly OriginBoundCookie[]
        ) => Promise<void>;
      }
    ) => Promise<void>;
  }
).primeLighthouseVercelAliasBypass;

export function isSafePreviewBaseUrl(baseURL?: string): baseURL is string {
  const parsed = parseBaseUrl(baseURL);
  if (!parsed) return false;
  return (
    parsed.protocol === 'https:' &&
    parsed.port === '' &&
    /^jovie-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-jovie\.vercel\.app$/i.test(
      parsed.hostname
    )
  );
}

export async function captureOutgoingCookieHeader(
  context: BrowserContext,
  url: URL
): Promise<string> {
  const page = await context.newPage();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    let resolveHeader: (header: string) => void = () => {};
    let rejectHeader: (error: unknown) => void = () => {};
    const headerPromise = new Promise<string>((resolve, reject) => {
      resolveHeader = resolve;
      rejectHeader = reject;
      timeout = setTimeout(
        () => reject(new Error('Browser cookie-boundary probe timed out.')),
        5_000
      );
    });
    await page.route('**/*', async route => {
      if (!route.request().isNavigationRequest()) {
        await route.abort().catch(() => {});
        return;
      }
      try {
        const headers = await route.request().allHeaders();
        resolveHeader(headers.cookie ?? '');
      } catch (error) {
        rejectHeader(error);
      } finally {
        await route.abort().catch(() => {});
      }
    });
    const navigation = page
      .goto(url.href, { waitUntil: 'domcontentloaded', timeout: 5_000 })
      .catch(() => undefined);
    const header = await headerPromise;
    await navigation;
    return header;
  } finally {
    if (timeout) clearTimeout(timeout);
    await page.close();
  }
}

export async function assertPlaywrightCookieOriginBoundary(
  context: BrowserContext,
  targetUrl: URL,
  cookies: readonly OriginBoundCookie[]
): Promise<void> {
  const exactProbe = new URL('/__jovie_cookie_scope_probe__', targetUrl.origin);
  const childProbe = new URL(exactProbe);
  childProbe.hostname = `cookie-boundary.${targetUrl.hostname}`;
  const [exactHostHeader, childHostHeader] = await Promise.all([
    captureOutgoingCookieHeader(context, exactProbe),
    captureOutgoingCookieHeader(context, childProbe),
  ]);
  validateCookieOriginBoundaryHeaders(
    exactHostHeader,
    childHostHeader,
    cookies
  );
}

export async function primeOriginBoundVercelBypass(
  context: BrowserContext,
  baseURL: string,
  {
    bypassSecret = process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET,
    expectedCommitSha = process.env.EXPECTED_COMMIT_SHA ??
      process.env.GITHUB_SHA,
    expectedDeploymentOrigin = process.env.EXPECTED_VERCEL_DEPLOYMENT_ORIGIN,
    expectedEnvironment = process.env.EXPECTED_VERCEL_ENVIRONMENT as
      | 'preview'
      | 'production'
      | undefined,
    sensitiveValuesPath = process.env.PLAYWRIGHT_DYNAMIC_SECRETS_FILE,
  }: {
    readonly bypassSecret?: string;
    readonly expectedCommitSha?: string;
    readonly expectedDeploymentOrigin?: string;
    readonly expectedEnvironment?: 'preview' | 'production';
    readonly sensitiveValuesPath?: string;
  } = {}
): Promise<void> {
  await primeLighthouseVercelBypass(
    {
      defaultBrowserContext: () => ({
        setCookie: (...cookies) => context.addCookies(cookies),
      }),
    },
    { url: baseURL },
    {
      bypassSecret,
      expectedCommitSha,
      expectedDeploymentOrigin,
      expectedEnvironment,
      sensitiveValuesPath,
      assertBrowserCookieOriginBoundaryImpl: (_browser, targetUrl, cookies) =>
        assertPlaywrightCookieOriginBoundary(context, targetUrl, cookies),
    }
  );
}

export async function primeAuthorizedVercelAliasBypass(
  context: BrowserContext,
  baseURL: string,
  {
    bypassSecret = process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET,
    expectedCommitSha = process.env.EXPECTED_COMMIT_SHA ??
      process.env.GITHUB_SHA,
    expectedAliasOrigin = process.env.EXPECTED_VERCEL_ALIAS_ORIGIN,
    expectedEnvironment = process.env.EXPECTED_VERCEL_ENVIRONMENT as
      | 'preview'
      | 'production'
      | undefined,
    sensitiveValuesPath = process.env.PLAYWRIGHT_DYNAMIC_SECRETS_FILE,
  }: {
    readonly bypassSecret?: string;
    readonly expectedCommitSha?: string;
    readonly expectedAliasOrigin?: string;
    readonly expectedEnvironment?: 'preview' | 'production';
    readonly sensitiveValuesPath?: string;
  } = {}
): Promise<void> {
  await primeLighthouseVercelAliasBypass(
    {
      defaultBrowserContext: () => ({
        setCookie: (...cookies) => context.addCookies(cookies),
      }),
    },
    { url: baseURL },
    {
      bypassSecret,
      expectedCommitSha,
      expectedAliasOrigin,
      expectedEnvironment,
      sensitiveValuesPath,
      assertBrowserCookieOriginBoundaryImpl: (_browser, targetUrl, cookies) =>
        assertPlaywrightCookieOriginBoundary(context, targetUrl, cookies),
    }
  );
}

export async function primeVercelBypassCookie(
  page: Page,
  baseURL: string | undefined,
  pathname: string = '/'
): Promise<boolean> {
  if (
    !baseURL ||
    !process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET ||
    !isSafePreviewBaseUrl(baseURL)
  ) {
    return false;
  }
  void pathname;
  await primeOriginBoundVercelBypass(page.context(), baseURL);

  return true;
}
