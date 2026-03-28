const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync } = require('node:fs');
const path = require('node:path');

const TEST_MODE_COOKIE = '__e2e_test_mode';
const TEST_USER_ID_COOKIE = '__e2e_test_user_id';
const TEST_AUTH_BYPASS_MODE = 'bypass-auth';

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

function ensureAuthState(baseUrl) {
  const testUserId = process.env.E2E_CLERK_USER_ID?.trim();
  if (testUserId) {
    return null;
  }

  const authStatePath = resolveAuthStatePath();
  if (existsSync(authStatePath)) {
    return authStatePath;
  }

  mkdirSync(path.dirname(defaultAuthStatePath), { recursive: true });

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
      path.relative(repoRoot, defaultAuthStatePath),
    ],
    {
      cwd: webRoot,
      env: authEnv,
      stdio: 'inherit',
    }
  );

  assertSuccess(result, 'Dashboard Lighthouse auth bootstrap failed.');
  return defaultAuthStatePath;
}

async function seedDashboardAuth(browser, { url }) {
  const origin = new URL(url).origin;
  const page = await browser.newPage();
  const browserContext =
    typeof browser.defaultBrowserContext === 'function'
      ? browser.defaultBrowserContext()
      : typeof page.browserContext === 'function'
        ? page.browserContext()
        : null;
  const testUserId = process.env.E2E_CLERK_USER_ID?.trim();

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
    ];
    if (browserContext?.setCookie) {
      await browserContext.setCookie(...authCookies);
    } else {
      await page.setCookie(...authCookies);
    }
    await page.close();
    return;
  }

  const authStatePath = resolveAuthStatePath();
  if (!existsSync(authStatePath)) {
    throw new Error(
      `Missing Lighthouse auth storage state at ${authStatePath}. Run perf:auth or set E2E_CLERK_USER_ID for bypass mode.`
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
  await page.close();
}

function main() {
  const baseUrl = resolveBaseUrl();
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
      '--config=.lighthouserc.dashboard.pr.json',
      `--collect.url=${baseUrl}/app`,
      `--collect.url=${baseUrl}/app/dashboard/releases`,
      `--healthcheck.chromePath=${chromePath}`,
      `--collect.chromePath=${chromePath}`,
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
