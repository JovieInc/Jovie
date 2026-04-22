const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync } = require('node:fs');
const path = require('node:path');

// Keep these aligned with the canonical definitions in
// apps/web/lib/auth/test-mode.ts. This script runs under plain `node`,
// so importing the TypeScript source directly is not a safe option here.
const TEST_MODE_COOKIE = '__e2e_test_mode';
const TEST_USER_ID_COOKIE = '__e2e_test_user_id';
const TEST_PERSONA_COOKIE = '__e2e_test_persona';
const TEST_AUTH_BYPASS_MODE = 'bypass-auth';

// Mirrors DevTestAuthPersona in apps/web/lib/auth/dev-test-auth-types.ts.
const ALLOWED_PERSONAS = new Set(['creator', 'creator-ready', 'admin']);
const DEFAULT_PERSONA = 'creator-ready';

function resolveTestPersona() {
  const configured = process.env.LIGHTHOUSE_TEST_PERSONA?.trim();
  if (!configured) return DEFAULT_PERSONA;
  if (!ALLOWED_PERSONAS.has(configured)) {
    throw new Error(
      `LIGHTHOUSE_TEST_PERSONA must be one of ${[...ALLOWED_PERSONAS].join(', ')}; got "${configured}"`
    );
  }
  return configured;
}

const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '..', '..');
const defaultBaseUrl = process.env.BASE_URL || 'http://localhost:3000';
const defaultAuthStatePath = path.resolve(
  repoRoot,
  '.context',
  'perf',
  'auth',
  'lighthouse-user.json'
);

function resolveBaseUrl() {
  return process.env.BASE_URL || defaultBaseUrl;
}

function resolveCollectUrls(baseUrl) {
  const configured = process.env.LIGHTHOUSE_DASHBOARD_URLS?.trim();
  const paths = configured
    ? configured
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
    : ['/app', '/app/dashboard/releases'];

  return paths.map(path => new URL(path, `${baseUrl}/`).toString());
}

function resolveAuthStatePath() {
  const explicitPath = process.env.LIGHTHOUSE_AUTH_STATE_PATH?.trim();
  if (explicitPath) {
    return path.isAbsolute(explicitPath)
      ? explicitPath
      : path.resolve(repoRoot, explicitPath);
  }

  if (existsSync(defaultAuthStatePath)) {
    return defaultAuthStatePath;
  }

  const playwrightAuthPath = path.resolve(
    webRoot,
    'tests',
    '.auth',
    'user.json'
  );
  return existsSync(playwrightAuthPath)
    ? playwrightAuthPath
    : defaultAuthStatePath;
}

function readStorageStateCookies(filePath) {
  const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed.cookies) ? parsed.cookies : [];
}

function buildCookieForOrigin(cookie, origin) {
  const normalized = {
    ...cookie,
    path: cookie.path || '/',
  };

  if (!normalized.url && !normalized.domain) {
    normalized.url = origin;
  }

  return normalized;
}

function cookieMatchesBaseUrl(cookie, baseUrl) {
  const hostname = new URL(baseUrl).hostname.toLowerCase();

  if (typeof cookie.domain === 'string' && cookie.domain.trim()) {
    return cookie.domain.replace(/^\./, '').toLowerCase() === hostname;
  }

  if (typeof cookie.url === 'string' && cookie.url.trim()) {
    try {
      return new URL(cookie.url).hostname.toLowerCase() === hostname;
    } catch {
      return false;
    }
  }

  return false;
}

function authStateMatchesBaseUrl(filePath, baseUrl) {
  return readStorageStateCookies(filePath).some(cookie =>
    cookieMatchesBaseUrl(cookie, baseUrl)
  );
}

function ensureChromiumPath() {
  const chromePath = require('playwright').chromium.executablePath();
  if (!chromePath || !existsSync(chromePath)) {
    throw new Error(
      'Playwright Chromium is not installed. Run `pnpm --filter=@jovie/web exec playwright install chromium` before running dashboard Lighthouse.'
    );
  }

  return chromePath;
}

function buildNodePath() {
  const puppeteerNodePath = path.resolve(
    repoRoot,
    'node_modules',
    '.pnpm',
    'node_modules'
  );

  return process.env.NODE_PATH
    ? `${process.env.NODE_PATH}:${puppeteerNodePath}`
    : puppeteerNodePath;
}

function assertSuccess(result, message) {
  if ((result.status ?? 1) === 0) {
    return;
  }

  throw new Error(message);
}

function assertCiUsesSyntheticBypass() {
  if (process.env.CI !== 'true') {
    return;
  }

  if (process.env.E2E_CLERK_USER_ID?.trim()) {
    return;
  }

  throw new Error(
    'Dashboard Lighthouse CI requires E2E_CLERK_USER_ID so authenticated audits never reuse a real session file.'
  );
}

function ensureAuthState(baseUrl) {
  const testUserId = process.env.E2E_CLERK_USER_ID?.trim();
  if (testUserId) {
    return null;
  }

  const authStatePath = resolveAuthStatePath();
  if (
    existsSync(authStatePath) &&
    authStateMatchesBaseUrl(authStatePath, baseUrl)
  ) {
    return authStatePath;
  }

  mkdirSync(path.dirname(authStatePath), { recursive: true });

  const authEnv = { ...process.env };
  delete authEnv.E2E_USE_TEST_AUTH_BYPASS;
  delete authEnv.NEXT_PUBLIC_CLERK_MOCK;
  delete authEnv.NEXT_PUBLIC_CLERK_PROXY_DISABLED;

  const result = spawnSync(
    'pnpm',
    [
      'run',
      'perf:auth',
      '--',
      '--base-url',
      baseUrl,
      '--out',
      path.relative(repoRoot, authStatePath),
    ],
    {
      cwd: webRoot,
      env: authEnv,
      stdio: 'inherit',
    }
  );

  assertSuccess(result, 'Dashboard Lighthouse auth bootstrap failed.');
  return authStatePath;
}

async function seedDashboardAuth(browser, { url }) {
  const origin = new URL(url).origin;
  const pathname = new URL(url).pathname;
  const page = await browser.newPage();
  const browserContext =
    typeof browser.defaultBrowserContext === 'function'
      ? browser.defaultBrowserContext()
      : typeof page.browserContext === 'function'
        ? page.browserContext()
        : null;
  const testUserId = process.env.E2E_CLERK_USER_ID?.trim();
  const warmRoute = async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (pathname === '/app/dashboard/releases') {
      await Promise.any([
        page.waitForSelector('[data-testid="releases-matrix"]', {
          timeout: 60_000,
        }),
        page.waitForSelector('[data-testid="release-table-shell"]', {
          timeout: 60_000,
        }),
        page.waitForSelector('[data-testid="spotify-import-progress-banner"]', {
          timeout: 60_000,
        }),
      ]).catch(() => undefined);
    } else if (pathname.startsWith('/onboarding')) {
      await page
        .waitForSelector(
          '[data-testid="onboarding-form-wrapper"], [data-testid="onboarding-experience-shell"]',
          { timeout: 30_000 }
        )
        .catch(() => undefined);
    } else if (pathname.startsWith('/app')) {
      await page
        .waitForSelector('main', { timeout: 30_000 })
        .catch(() => undefined);
    }
    await page
      .waitForNetworkIdle({ idleTime: 500, timeout: 10_000 })
      .catch(() => undefined);
  };

  const warmDashboardShell = async () => {
    if (!pathname.startsWith('/app')) {
      return;
    }

    await page.goto(new URL('/app', origin).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page
      .waitForSelector('main', { timeout: 30_000 })
      .catch(() => undefined);
    await page
      .waitForNetworkIdle({ idleTime: 500, timeout: 10_000 })
      .catch(() => undefined);
  };

  const warmRouteCount = pathname === '/app/dashboard/releases' ? 3 : 1;
  const warmRouteRepeatedly = async () => {
    await warmDashboardShell();
    for (let i = 0; i < warmRouteCount; i += 1) {
      await warmRoute();
    }
    await new Promise(resolve => {
      setTimeout(resolve, pathname === '/app/dashboard/releases' ? 750 : 250);
    });
  };

  if (process.env.E2E_USE_TEST_AUTH_BYPASS === '1' && testUserId) {
    const authCookies = [
      {
        name: TEST_MODE_COOKIE,
        value: TEST_AUTH_BYPASS_MODE,
        url: origin,
        sameSite: 'Lax',
      },
      {
        name: TEST_USER_ID_COOKIE,
        value: testUserId,
        url: origin,
        sameSite: 'Lax',
      },
      {
        name: TEST_PERSONA_COOKIE,
        value: resolveTestPersona(),
        url: origin,
        sameSite: 'Lax',
      },
    ];

    if (browserContext?.setCookie) {
      await browserContext.setCookie(...authCookies);
    } else {
      await page.setCookie(...authCookies);
    }

    if (pathname.startsWith('/app')) {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      const landedPath = new URL(page.url()).pathname;
      if (!landedPath.startsWith('/app')) {
        await page.close();
        throw new Error(
          `Auth bypass bootstrap failed for ${url}; landed on ${landedPath}`
        );
      }
      await warmRouteRepeatedly();
      await page.close();
      return;
    }

    await warmRouteRepeatedly();
    await page.close();
    return;
  }

  try {
    const authStatePath = resolveAuthStatePath();
    if (!existsSync(authStatePath)) {
      throw new Error(
        `Missing Lighthouse auth storage state at ${authStatePath}. Run perf:auth or set E2E_CLERK_USER_ID for bypass mode.`
      );
    }

    if (!authStateMatchesBaseUrl(authStatePath, url)) {
      throw new Error(
        `Lighthouse auth storage state at ${authStatePath} does not match ${origin}. Regenerate it for the target origin before rerunning.`
      );
    }

    const cookies = readStorageStateCookies(authStatePath).map(cookie =>
      buildCookieForOrigin(cookie, origin)
    );
    if (cookies.length === 0) {
      throw new Error(
        `No cookies found in Lighthouse auth storage state at ${authStatePath}.`
      );
    }

    if (browserContext?.setCookie) {
      await browserContext.setCookie(...cookies);
    } else {
      await page.setCookie(...cookies);
    }
    await warmRouteRepeatedly();
  } finally {
    await page.close();
  }
}

function main() {
  const baseUrl = resolveBaseUrl();
  const collectUrls = resolveCollectUrls(baseUrl);
  assertCiUsesSyntheticBypass();
  const authStatePath = ensureAuthState(baseUrl);
  const chromePath = ensureChromiumPath();
  const env = {
    ...process.env,
    BASE_URL: baseUrl,
    LIGHTHOUSE_AUTH_STATE_PATH: authStatePath ?? resolveAuthStatePath(),
    NODE_PATH: buildNodePath(),
  };

  if (process.env.E2E_CLERK_USER_ID?.trim()) {
    env.E2E_USE_TEST_AUTH_BYPASS = '1';
    env.NEXT_PUBLIC_CLERK_MOCK = process.env.NEXT_PUBLIC_CLERK_MOCK || '1';
    env.NEXT_PUBLIC_CLERK_PROXY_DISABLED =
      process.env.NEXT_PUBLIC_CLERK_PROXY_DISABLED || '1';
  } else {
    delete env.E2E_USE_TEST_AUTH_BYPASS;
    delete env.NEXT_PUBLIC_CLERK_MOCK;
    delete env.NEXT_PUBLIC_CLERK_PROXY_DISABLED;
  }

  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'lhci',
      'autorun',
      `--config=${process.env.LIGHTHOUSE_CONFIG || '.lighthouserc.dashboard.pr.json'}`,
      `--healthcheck.chromePath=${chromePath}`,
      `--collect.chromePath=${chromePath}`,
      ...collectUrls.map(url => `--collect.url=${url}`),
    ],
    {
      cwd: webRoot,
      env,
      stdio: 'inherit',
    }
  );

  process.exit(result.status ?? 1);
}

if (require.main === module) {
  main();
} else {
  module.exports = seedDashboardAuth;
}
