import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
} from 'playwright';
import { APP_ROUTES } from '../constants/routes';
import { getAlternativeSlugs } from '../content/alternatives';
import { getComparisonSlugs } from '../content/comparisons';
import {
  getBlogPostSlugs,
  getBlogPosts,
  slugifyCategory,
} from '../lib/blog/getBlogPosts';
import { resolveAppPath } from '../lib/filesystem-paths';
import { getInvestorManifest } from '../lib/investors/manifest';
import {
  resolveChatConversationPerfPath,
  resolveReleaseTasksPerfPath,
  resolveSeededPublicCatchAllPath,
  resolveSeededPublicReleasePath,
  resolveSeededPublicTrackPath,
} from './performance-route-resolvers';

type Lane =
  | 'public-no-auth'
  | 'auth'
  | 'public-profile'
  | 'account-billing-onboarding'
  | 'creator-app'
  | 'admin'
  | 'internal-demo-ui';

type Persona = 'public' | 'creator' | 'admin';
type ResultStatus = 'pass' | 'fail' | 'blocked';

interface RouteCase {
  readonly id: string;
  readonly lane: Lane;
  readonly path: string;
  readonly source: string;
  readonly authPersona: Persona;
  readonly expectedState?: 'ok' | 'not-found' | 'unauthorized' | 'blocked';
  readonly notes?: string;
}

interface RouteResult {
  readonly id: string;
  readonly lane: Lane;
  readonly path: string;
  readonly source: string;
  readonly authPersona: Persona;
  readonly status: ResultStatus;
  readonly finalUrl: string;
  readonly title: string;
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly screenshotPath?: string;
  readonly notes?: string;
}

interface TestAuthAvailability {
  readonly enabled: boolean;
  readonly trustedHost: boolean;
  readonly reason: string | null;
}

const APP_DIR = resolveAppPath('app');
const OUTPUT_SEGMENT = process.env.ROUTE_QA_OUTPUT_DIR?.trim() || 'latest';
const OUTPUT_ROOT = resolveAppPath('test-results', 'route-qa', OUTPUT_SEGMENT);
const SCREENSHOT_DIR = path.join(OUTPUT_ROOT, 'screenshots');
const BASE_URL =
  process.env.ROUTE_QA_BASE_URL?.trim() || 'http://localhost:3000';
const ROUTE_FILTER = process.env.ROUTE_QA_FILTER?.trim().toLowerCase() || null;
const ROUTE_LIMIT = Number.parseInt(process.env.ROUTE_QA_LIMIT || '', 10);
const ROUTE_CASE_TIMEOUT_MS = Number.parseInt(
  process.env.ROUTE_QA_CASE_TIMEOUT_MS || '',
  10
);
const TEST_AUTH_PROBE_TIMEOUT_MS = Number.parseInt(
  process.env.ROUTE_QA_TEST_AUTH_PROBE_TIMEOUT_MS || '',
  10
);
const VALID_PUBLIC_USERNAMES = ['e2e-test-user', 'browse-test-user'] as const;
const MISSING_PUBLIC_USERNAME = 'missing-qa-user';
const ERROR_TEXT_PATTERNS = [
  'application error',
  'internal server error',
  'unhandled runtime error',
  'dashboard failed to load',
  'error: a server-side exception has occurred',
] as const;
const ERROR_SELECTORS = [
  '[data-testid="error-page"]',
  '[data-testid="error-boundary"]',
  '[data-testid="dashboard-error"]',
  '.next-error-h1',
];

interface NotFoundSignalInput {
  readonly responseStatus: number;
  readonly finalUrl: string;
  readonly bodyText: string;
  readonly title: string;
  readonly hasNotFoundTestId: boolean;
}

export function isNotFoundLike({
  responseStatus,
  finalUrl,
  bodyText,
  title,
  hasNotFoundTestId,
}: Readonly<NotFoundSignalInput>) {
  const loweredTitle = title.toLowerCase();

  return (
    responseStatus === 404 ||
    finalUrl.includes('/not-found') ||
    hasNotFoundTestId ||
    loweredTitle.includes('not found') ||
    bodyText.includes('page not found') ||
    bodyText.includes('content not found') ||
    bodyText.includes("doesn't exist") ||
    bodyText.includes("couldn't find")
  );
}

function toRouteTemplate(filePath: string): string {
  const relativePath = path.relative(APP_DIR, filePath);
  const withoutPage = relativePath
    .replace(/\/page\.tsx$/, '')
    .replace(/^page\.tsx$/, '');
  const segments = withoutPage
    .split(path.sep)
    .filter(Boolean)
    .filter(segment => !/^\(.+\)$/.test(segment));

  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

async function walkPageFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async entry => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return walkPageFiles(fullPath);
      }
      return entry.name === 'page.tsx' ? [fullPath] : [];
    })
  );
  return files.flat();
}

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function inferLane(route: string): Lane {
  if (route.startsWith('/signin') || route.startsWith('/signup')) return 'auth';
  if (route.startsWith(APP_ROUTES.ADMIN)) return 'admin';
  if (route.startsWith('/app')) return 'creator-app';
  if (
    route.startsWith('/account') ||
    route.startsWith('/billing') ||
    route.startsWith('/artist-selection') ||
    route.startsWith('/claim/') ||
    route.startsWith('/onboarding') ||
    route.startsWith('/waitlist') ||
    route.startsWith('/sso-callback')
  ) {
    return 'account-billing-onboarding';
  }
  if (
    route.startsWith('/demo') ||
    route.startsWith('/hud') ||
    route.startsWith('/sandbox') ||
    route.startsWith('/spinner-test') ||
    route.startsWith('/sentry-example-page') ||
    route.startsWith('/ui')
  ) {
    return 'internal-demo-ui';
  }
  if (route === '/[username]' || route.startsWith('/[username]/')) {
    return 'public-profile';
  }
  return 'public-no-auth';
}

function inferPersona(route: string): Persona {
  if (route.startsWith(APP_ROUTES.ADMIN)) return 'admin';
  if (
    route.startsWith('/app') ||
    route.startsWith('/account') ||
    route.startsWith('/billing') ||
    route.startsWith('/artist-selection') ||
    route.startsWith('/onboarding')
  ) {
    return 'creator';
  }
  return 'public';
}

function routeIdFromPath(route: string) {
  return route === '/'
    ? 'root'
    : route.replaceAll('/', '__').replaceAll(/[^a-zA-Z0-9_[\]-]/g, '_');
}

function routeCaseKey(routeCase: Readonly<RouteCase>) {
  return [routeCase.authPersona, routeCase.path].join('::');
}

function buildStaticCase(route: string, source: string): RouteCase {
  return {
    id: routeIdFromPath(route),
    lane: inferLane(route),
    path: route,
    source,
    authPersona: inferPersona(route),
    expectedState: route === '/hud' ? 'unauthorized' : 'ok',
    notes:
      route === '/hud'
        ? 'HUD may intentionally render an unauthorized state without a kiosk token.'
        : undefined,
  };
}

function buildDynamicCase(
  pathValue: string,
  source: string,
  route: string,
  overrides?: Partial<RouteCase>
): RouteCase {
  return {
    id: routeIdFromPath(pathValue),
    lane: inferLane(route),
    path: pathValue,
    source,
    authPersona: inferPersona(route),
    expectedState: 'ok',
    ...overrides,
  };
}

export async function expandDynamicRoute(
  route: string,
  source: string
): Promise<RouteCase[]> {
  if (route === '/(dynamic)/legal/[slug]') {
    return [];
  }

  if (route === '/alternatives/[slug]') {
    return getAlternativeSlugs().map(slug =>
      buildDynamicCase(
        `/alternatives/${slug}`,
        `${source} -> alternatives/${slug}`,
        route
      )
    );
  }

  if (route === '/compare/[slug]') {
    return getComparisonSlugs().map(slug =>
      buildDynamicCase(
        `/compare/${slug}`,
        `${source} -> compare/${slug}`,
        route
      )
    );
  }

  if (route === '/blog/[slug]') {
    const postSlugs = await getBlogPostSlugs();
    return postSlugs.map(slug =>
      buildDynamicCase(`/blog/${slug}`, `${source} -> blog/${slug}`, route)
    );
  }

  if (route === '/blog/authors/[username]') {
    const posts = await getBlogPosts();
    const usernames = dedupeStrings(
      posts
        .map(post => post.authorUsername)
        .filter((value): value is string => Boolean(value))
    );
    return usernames.map(username =>
      buildDynamicCase(
        `/blog/authors/${username}`,
        `${source} -> blog/authors/${username}`,
        route
      )
    );
  }

  if (route === '/blog/category/[slug]') {
    const posts = await getBlogPosts();
    const categories = dedupeStrings(
      posts
        .map(post => post.category)
        .filter((value): value is string => Boolean(value))
    ).map(slugifyCategory);
    return categories.map(category =>
      buildDynamicCase(
        `/blog/category/${category}`,
        `${source} -> blog/category/${category}`,
        route
      )
    );
  }

  if (route === '/investor-portal/[slug]') {
    try {
      const manifest = await getInvestorManifest();
      return manifest.pages.map(page =>
        buildDynamicCase(
          `/investor-portal/${page.slug}`,
          `${source} -> investor-portal/${page.slug}`,
          route
        )
      );
    } catch (error) {
      return [
        buildDynamicCase('/investor-portal/missing-manifest', source, route, {
          expectedState: 'blocked',
          notes: `Investor manifest unavailable: ${(error as Error).message}`,
        }),
      ];
    }
  }

  if (route === '/app/chat/[id]') {
    const resolvedPath = await resolveChatConversationPerfPath(
      {
        id: 'route-qa-chat-thread',
        path: route,
      } as never,
      { authCookies: [], baseUrl: BASE_URL } as never
    ).catch(() => null);
    if (!resolvedPath || resolvedPath === APP_ROUTES.CHAT) {
      return [
        buildDynamicCase(
          APP_ROUTES.CHAT,
          `${source} -> missing chat thread`,
          route,
          {
            authPersona: 'creator',
            expectedState: 'blocked',
            notes:
              'Seeded chat conversation was unavailable, so route QA could not verify the detail route.',
          }
        ),
      ];
    }
    return [
      buildDynamicCase(resolvedPath, `${source} -> chat thread`, route, {
        authPersona: 'creator',
      }),
    ];
  }

  if (route === APP_ROUTES.DASHBOARD_RELEASE_TASKS) {
    const resolvedPath = await resolveReleaseTasksPerfPath(
      {
        id: 'route-qa-release-tasks',
        path: route,
      } as never,
      { authCookies: [], baseUrl: BASE_URL } as never
    ).catch(() => null);
    if (
      !resolvedPath ||
      resolvedPath === APP_ROUTES.DASHBOARD_RELEASES ||
      resolvedPath === APP_ROUTES.DASHBOARD_TASKS
    ) {
      return [
        buildDynamicCase(
          APP_ROUTES.DASHBOARD_RELEASE_TASKS,
          `${source} -> missing release task fixture`,
          route,
          {
            authPersona: 'creator',
            expectedState: 'blocked',
            notes:
              'Seeded release task route was unavailable, so route QA could not verify the detail workspace.',
          }
        ),
      ];
    }
    return [
      buildDynamicCase(resolvedPath, `${source} -> release tasks`, route, {
        authPersona: 'creator',
      }),
    ];
  }

  if (route === '/claim/[token]') {
    return [
      buildDynamicCase(
        '/claim/invalid-token',
        `${source} -> invalid claim token`,
        route,
        {
          expectedState: 'not-found',
        }
      ),
    ];
  }

  if (route === '/out/[id]') {
    return [
      buildDynamicCase(
        '/out/invalid-link',
        `${source} -> invalid outbound id`,
        route,
        {
          expectedState: 'not-found',
        }
      ),
    ];
  }

  if (route === '/r/[slug]') {
    return [
      buildDynamicCase(
        '/r/invalid-link',
        `${source} -> invalid shortlink`,
        route,
        {
          expectedState: 'not-found',
        }
      ),
    ];
  }

  if (route === '/[username]') {
    return [
      ...VALID_PUBLIC_USERNAMES.map(username =>
        buildDynamicCase(
          `/${username}`,
          `${source} -> profile ${username}`,
          route
        )
      ),
      buildDynamicCase(
        `/${MISSING_PUBLIC_USERNAME}`,
        `${source} -> missing profile`,
        route,
        {
          expectedState: 'not-found',
        }
      ),
    ];
  }

  if (
    route === '/[username]/about' ||
    route === '/[username]/claim' ||
    route === '/[username]/contact' ||
    route === '/[username]/listen' ||
    route === '/[username]/notifications' ||
    route === '/[username]/shop' ||
    route === '/[username]/subscribe' ||
    route === '/[username]/tip' ||
    route === '/[username]/tour'
  ) {
    const suffix = route.replace('/[username]', '');
    return [
      ...VALID_PUBLIC_USERNAMES.map(username =>
        buildDynamicCase(
          `/${username}${suffix}`,
          `${source} -> ${username}${suffix}`,
          route
        )
      ),
      buildDynamicCase(
        `/${MISSING_PUBLIC_USERNAME}${suffix}`,
        `${source} -> missing${suffix}`,
        route,
        {
          expectedState: 'not-found',
        }
      ),
    ];
  }

  if (route === '/[username]/[slug]') {
    const resolvedPath = await resolveSeededPublicReleasePath({
      path: route,
      seedProfile: 'e2e-test-user',
    } as never);
    return [
      buildDynamicCase(
        resolvedPath,
        `${source} -> seeded public release`,
        route
      ),
      buildDynamicCase(
        `/${MISSING_PUBLIC_USERNAME}/missing-release`,
        `${source} -> missing public release`,
        route,
        {
          expectedState: 'not-found',
        }
      ),
    ];
  }

  if (route === '/[username]/[slug]/[trackSlug]') {
    const resolvedPath = await resolveSeededPublicTrackPath({
      path: route,
      seedProfile: 'e2e-test-user',
    } as never);
    return [
      buildDynamicCase(resolvedPath, `${source} -> seeded public track`, route),
      buildDynamicCase(
        `/${MISSING_PUBLIC_USERNAME}/missing-release/missing-track`,
        `${source} -> missing public track`,
        route,
        {
          expectedState: 'not-found',
        }
      ),
    ];
  }

  if (route === '/[username]/[slug]/sounds') {
    const resolvedPath = await resolveSeededPublicReleasePath({
      path: '/[username]/[slug]',
      seedProfile: 'e2e-test-user',
    } as never);
    return [
      buildDynamicCase(
        `${resolvedPath}/sounds`,
        `${source} -> seeded release sounds`,
        route
      ),
      buildDynamicCase(
        `/${MISSING_PUBLIC_USERNAME}/missing-release/sounds`,
        `${source} -> missing release sounds`,
        route,
        {
          expectedState: 'not-found',
        }
      ),
    ];
  }

  if (route === '/[username]/[slug]/download') {
    const resolvedPath = await resolveSeededPublicReleasePath({
      path: '/[username]/[slug]',
      seedProfile: 'e2e-test-user',
    } as never);
    return [
      buildDynamicCase(
        `${resolvedPath}/download`,
        `${source} -> seeded release download`,
        route
      ),
      buildDynamicCase(
        `/${MISSING_PUBLIC_USERNAME}/missing-release/download`,
        `${source} -> missing release download`,
        route,
        {
          expectedState: 'not-found',
        }
      ),
    ];
  }

  if (route === '/[username]/[...slug]') {
    const resolvedPath = await resolveSeededPublicCatchAllPath({
      path: route,
      seedProfile: 'e2e-test-user',
    } as never);
    return [
      buildDynamicCase(
        resolvedPath,
        `${source} -> seeded catch-all page`,
        route
      ),
      buildDynamicCase(
        `/${MISSING_PUBLIC_USERNAME}/missing/path`,
        `${source} -> missing catch-all page`,
        route,
        {
          expectedState: 'not-found',
        }
      ),
    ];
  }

  return [
    buildDynamicCase(route, `${source} -> unresolved dynamic route`, route, {
      expectedState: 'blocked',
      notes: 'No dynamic expansion rule was defined for this route template.',
    }),
  ];
}

async function buildRouteMatrix(): Promise<RouteCase[]> {
  const pageFiles = await walkPageFiles(APP_DIR);
  const templates = dedupeStrings(pageFiles.map(toRouteTemplate)).sort();
  const cases: RouteCase[] = [];

  for (const route of templates) {
    const source = route;
    if (route.includes('[')) {
      cases.push(...(await expandDynamicRoute(route, source)));
    } else {
      cases.push(buildStaticCase(route, source));
    }
  }

  const filteredCases = cases
    .filter(routeCase => {
      if (!ROUTE_FILTER) return true;
      return (
        routeCase.path.toLowerCase().includes(ROUTE_FILTER) ||
        routeCase.id.toLowerCase().includes(ROUTE_FILTER) ||
        routeCase.lane.toLowerCase().includes(ROUTE_FILTER)
      );
    })
    .slice(0, Number.isFinite(ROUTE_LIMIT) ? ROUTE_LIMIT : undefined);

  const dedupedCases = new Map<string, RouteCase>();
  for (const routeCase of filteredCases) {
    const key = routeCaseKey(routeCase);
    const existingCase = dedupedCases.get(key);

    if (!existingCase) {
      dedupedCases.set(key, routeCase);
      continue;
    }

    const existingBlocked = existingCase.expectedState === 'blocked';
    const nextBlocked = routeCase.expectedState === 'blocked';
    if (existingBlocked && !nextBlocked) {
      dedupedCases.set(key, routeCase);
    }
  }

  return [...dedupedCases.values()];
}

export async function getTestAuthAvailability(): Promise<TestAuthAvailability | null> {
  const timeoutMs = Number.isFinite(TEST_AUTH_PROBE_TIMEOUT_MS)
    ? TEST_AUTH_PROBE_TIMEOUT_MS
    : 15_000;

  try {
    const response = await fetch(
      new URL('/api/dev/test-auth/session', BASE_URL),
      {
        headers: {
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
      }
    );

    if (!response.ok) {
      return {
        enabled: false,
        trustedHost: false,
        reason: `Auth bootstrap probe failed with HTTP ${response.status}.`,
      };
    }

    const payload = (await response.json()) as Partial<TestAuthAvailability>;
    return {
      enabled: payload.enabled === true,
      trustedHost: payload.trustedHost === true,
      reason: typeof payload.reason === 'string' ? payload.reason : null,
    };
  } catch (error) {
    console.warn(
      `[route-qa] Auth bootstrap probe failed after ${timeoutMs}ms: ${(error as Error).message}`
    );
    return null;
  }
}

function applyAuthAvailability(
  routeCases: readonly RouteCase[],
  availability: TestAuthAvailability | null
): RouteCase[] {
  if (!availability || (availability.enabled && availability.trustedHost)) {
    return [...routeCases];
  }

  const authBlockReason =
    availability.reason ??
    'Local dev test-auth bootstrap is unavailable for authenticated route QA.';

  return routeCases.map(routeCase => {
    if (
      routeCase.authPersona === 'public' ||
      routeCase.expectedState === 'blocked'
    ) {
      return routeCase;
    }

    return {
      ...routeCase,
      expectedState: 'blocked',
      notes: routeCase.notes
        ? `${routeCase.notes} ${authBlockReason}`
        : authBlockReason,
    };
  });
}

async function ensureAuthenticatedPath(
  persona: Exclude<Persona, 'public'>,
  route: string
) {
  const bootstrapUrl = new URL('/api/dev/test-auth/enter', BASE_URL);
  bootstrapUrl.searchParams.set(
    'persona',
    persona === 'admin' ? 'admin' : 'creator'
  );
  bootstrapUrl.searchParams.set('redirect', route);
  return bootstrapUrl.toString();
}

async function waitForStablePage(page: Page) {
  await page
    .waitForLoadState('domcontentloaded', { timeout: 30_000 })
    .catch(() => undefined);
  await page
    .waitForLoadState('networkidle', { timeout: 10_000 })
    .catch(() => undefined);
}

async function collectPageErrors(page: Page): Promise<string[]> {
  const bodyText = (
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  ).toLowerCase();
  const matchedErrors = ERROR_TEXT_PATTERNS.filter(pattern =>
    bodyText.includes(pattern)
  );

  const visibleSelectors: string[] = [];
  for (const selector of ERROR_SELECTORS) {
    const isVisible = await page
      .locator(selector)
      .first()
      .isVisible()
      .catch(() => false);
    if (isVisible) visibleSelectors.push(selector);
  }

  return [
    ...matchedErrors.map(
      pattern => `Body text matched error pattern: ${pattern}`
    ),
    ...visibleSelectors.map(selector => `Visible error selector: ${selector}`),
  ];
}

export function resolveRouteCaseTimeoutMs() {
  return Number.isFinite(ROUTE_CASE_TIMEOUT_MS)
    ? ROUTE_CASE_TIMEOUT_MS
    : 120_000;
}

export async function settleWithTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number
): Promise<
  | { readonly timedOut: false; readonly result: T }
  | { readonly timedOut: true; readonly result?: undefined }
> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation.then(result => ({ timedOut: false as const, result })),
      new Promise<{ readonly timedOut: true }>(resolve => {
        timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function runRouteCase(
  context: BrowserContext,
  routeCase: RouteCase
): Promise<RouteResult> {
  if (routeCase.expectedState === 'blocked') {
    return {
      id: routeCase.id,
      lane: routeCase.lane,
      path: routeCase.path,
      source: routeCase.source,
      authPersona: routeCase.authPersona,
      status: 'blocked',
      finalUrl: routeCase.path,
      title: '',
      consoleErrors: [],
      pageErrors: [
        routeCase.notes ??
          'Route intentionally blocked during matrix generation.',
      ],
      notes: routeCase.notes,
    };
  }

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(45_000);
  page.setDefaultTimeout(15_000);
  const consoleErrors: string[] = [];

  page.on('console', message => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  const targetUrl =
    routeCase.authPersona === 'public'
      ? new URL(routeCase.path, BASE_URL).toString()
      : await ensureAuthenticatedPath(routeCase.authPersona, routeCase.path);

  let finalUrl = targetUrl;
  let title = '';
  let screenshotPath: string | undefined;
  let pageErrors: string[] = [];
  const caseTimeoutMs = resolveRouteCaseTimeoutMs();

  try {
    const routeRun = settleWithTimeout(
      (async () => {
        const response = await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        });
        await waitForStablePage(page);
        finalUrl = page.url();
        title = await page.title().catch(() => '');
        const bodyText = (
          await page
            .locator('body')
            .innerText()
            .catch(() => '')
        ).toLowerCase();
        const hasNotFoundTestId = await page
          .locator('[data-testid="not-found"]')
          .first()
          .isVisible()
          .catch(() => false);
        pageErrors = await collectPageErrors(page);

        const hasMainContent = await page
          .locator('main, body')
          .first()
          .isVisible()
          .catch(() => false);
        const responseStatus = response?.status() ?? 0;
        const notFoundLike = isNotFoundLike({
          responseStatus,
          finalUrl,
          bodyText,
          title,
          hasNotFoundTestId,
        });

        const unauthorizedLike = await page
          .locator('text=/unauthorized|sign in as an admin|valid kiosk token/i')
          .first()
          .isVisible()
          .catch(() => false);

        let status: ResultStatus = 'pass';
        const findings: string[] = [...pageErrors];

        if (!hasMainContent) {
          status = 'fail';
          findings.push('No visible main content');
        }

        if (routeCase.expectedState === 'not-found') {
          if (!notFoundLike) {
            status = 'fail';
            findings.push(
              'Expected a not-found style state but did not observe one.'
            );
          }
        } else if (routeCase.expectedState === 'unauthorized') {
          if (!unauthorizedLike && responseStatus >= 400) {
            status = 'fail';
            findings.push(
              `Expected an unauthorized fallback but received HTTP ${responseStatus}.`
            );
          }
        } else if (responseStatus >= 400) {
          status = 'fail';
          findings.push(`HTTP ${responseStatus}`);
        }

        if (pageErrors.length > 0 && routeCase.expectedState === 'ok') {
          status = 'fail';
        }

        if (status !== 'pass') {
          screenshotPath = path.join(SCREENSHOT_DIR, `${routeCase.id}.png`);
          await page
            .screenshot({ path: screenshotPath, fullPage: true })
            .catch(() => undefined);
        }

        return {
          id: routeCase.id,
          lane: routeCase.lane,
          path: routeCase.path,
          source: routeCase.source,
          authPersona: routeCase.authPersona,
          status,
          finalUrl,
          title,
          consoleErrors,
          pageErrors: findings,
          screenshotPath,
          notes: routeCase.notes,
        } satisfies RouteResult;
      })(),
      caseTimeoutMs
    );
    const settledResult = await routeRun;

    if (settledResult.timedOut) {
      finalUrl = page.url() || finalUrl;
      screenshotPath = path.join(SCREENSHOT_DIR, `${routeCase.id}.png`);
      await page
        .screenshot({ path: screenshotPath, fullPage: true })
        .catch(() => undefined);

      return {
        id: routeCase.id,
        lane: routeCase.lane,
        path: routeCase.path,
        source: routeCase.source,
        authPersona: routeCase.authPersona,
        status: 'fail',
        finalUrl,
        title,
        consoleErrors,
        pageErrors: [
          `Route timed out after ${caseTimeoutMs}ms while waiting for the page to stabilize.`,
        ],
        screenshotPath,
        notes: routeCase.notes,
      };
    }

    return settledResult.result;
  } catch (error) {
    screenshotPath = path.join(SCREENSHOT_DIR, `${routeCase.id}.png`);
    await page
      .screenshot({ path: screenshotPath, fullPage: true })
      .catch(() => undefined);
    return {
      id: routeCase.id,
      lane: routeCase.lane,
      path: routeCase.path,
      source: routeCase.source,
      authPersona: routeCase.authPersona,
      status: routeCase.expectedState === 'blocked' ? 'blocked' : 'fail',
      finalUrl,
      title,
      consoleErrors,
      pageErrors: [(error as Error).message],
      screenshotPath,
      notes: routeCase.notes,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

function summarizeResults(results: readonly RouteResult[]) {
  return results.reduce<Record<ResultStatus, number>>(
    (summary, result) => {
      summary[result.status] += 1;
      return summary;
    },
    { pass: 0, fail: 0, blocked: 0 }
  );
}

async function writeArtifacts(
  routeCases: readonly RouteCase[],
  results: readonly RouteResult[]
) {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  await fs.writeFile(
    path.join(OUTPUT_ROOT, 'route-matrix.json'),
    JSON.stringify(routeCases, null, 2)
  );
  await fs.writeFile(
    path.join(OUTPUT_ROOT, 'findings-ledger.json'),
    JSON.stringify(results, null, 2)
  );

  const summary = summarizeResults(results);
  const markdown = [
    '# Route QA Findings',
    '',
    `Base URL: ${BASE_URL}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    `- Pass: ${summary.pass}`,
    `- Fail: ${summary.fail}`,
    `- Blocked: ${summary.blocked}`,
    '',
    '## Findings',
    '',
    ...results.map(result => {
      const lines = [
        `### ${result.status.toUpperCase()} ${result.path}`,
        `- Lane: ${result.lane}`,
        `- Persona: ${result.authPersona}`,
        `- Final URL: ${result.finalUrl}`,
      ];
      if (result.title) lines.push(`- Title: ${result.title}`);
      if (result.notes) lines.push(`- Notes: ${result.notes}`);
      if (result.consoleErrors.length > 0) {
        lines.push(`- Console errors: ${result.consoleErrors.join(' | ')}`);
      }
      if (result.pageErrors.length > 0) {
        lines.push(`- Page errors: ${result.pageErrors.join(' | ')}`);
      }
      if (result.screenshotPath) {
        lines.push(`- Screenshot: ${result.screenshotPath}`);
      }
      lines.push('');
      return lines.join('\n');
    }),
  ].join('\n');

  await fs.writeFile(path.join(OUTPUT_ROOT, 'findings-ledger.md'), markdown);
}

async function flushStandardStreams() {
  await Promise.all([
    new Promise<void>(resolve => process.stdout.write('', () => resolve())),
    new Promise<void>(resolve => process.stderr.write('', () => resolve())),
  ]);
}

async function main() {
  await fs.rm(OUTPUT_ROOT, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  const authAvailability = await getTestAuthAvailability();
  const routeCases = applyAuthAvailability(
    await buildRouteMatrix(),
    authAvailability
  );

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  const results: RouteResult[] = [];
  let exitCode = 1;
  let fatalError: unknown = null;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      colorScheme: 'dark',
    });

    for (const routeCase of routeCases) {
      const result = await runRouteCase(context, routeCase);
      results.push(result);
      const marker =
        result.status === 'pass'
          ? 'PASS'
          : result.status === 'blocked'
            ? 'BLOCK'
            : 'FAIL';
      console.log(`${marker} ${routeCase.path}`);
    }

    await writeArtifacts(routeCases, results);

    const summary = summarizeResults(results);
    console.log(
      `Route QA complete. Pass=${summary.pass} Fail=${summary.fail} Blocked=${summary.blocked}`
    );
    console.log(`Artifacts: ${OUTPUT_ROOT}`);

    exitCode = summary.fail > 0 ? 1 : 0;
    process.exitCode = exitCode;
  } catch (error) {
    fatalError = error;
    process.exitCode = 1;
    console.error(error);
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }

  await flushStandardStreams();
  process.exit(fatalError ? 1 : exitCode);
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void main();
}
