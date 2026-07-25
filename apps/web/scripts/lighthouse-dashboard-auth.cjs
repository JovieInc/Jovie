const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync } = require('node:fs');
const path = require('node:path');

// Keep these literals synchronized with lib/auth/test-mode-constants.ts and
// the session-cookie matcher in performance-auth.ts. LHCI loads this hook as
// plain CommonJS, so it cannot import those TypeScript modules directly.
const TEST_MODE_COOKIE = '__e2e_test_mode';
const TEST_USER_ID_COOKIE = '__e2e_test_user_id';
const TEST_PERSONA_COOKIE = '__e2e_test_persona';
const BETTER_AUTH_SESSION_COOKIE_PATTERN =
  /^(?:__Secure-|__Host-)?better-auth\.session_token(?:_\d+)?$/;
const DEV_TOOLBAR_OPEN_KEY = '__dev_toolbar_open';
const DEV_TOOLBAR_HIDDEN_KEY = '__dev_toolbar_hidden';
const ALLOWED_PERSONAS = new Set(['creator', 'creator-ready', 'admin']);
const DEFAULT_PERSONA = 'creator-ready';

const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '..', '..');
const defaultAuthStatePath = path.resolve(
  repoRoot,
  '.context',
  'perf',
  'auth',
  'lighthouse-user.json'
);

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

function resolveBaseUrl() {
  return (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function resolveCollectUrls(baseUrl) {
  const configured = process.env.LIGHTHOUSE_DASHBOARD_URLS?.trim();
  const paths = configured
    ? configured
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
    : ['/app', '/app/releases'];
  return paths.map(routePath => new URL(routePath, `${baseUrl}/`).toString());
}

function resolveAuthStatePath() {
  const configured = process.env.LIGHTHOUSE_AUTH_STATE_PATH?.trim();
  if (!configured) return defaultAuthStatePath;
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(repoRoot, configured);
}

function readStorageState(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing Lighthouse auth storage state at ${filePath}.`);
  }
  const state = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!Array.isArray(state.cookies) || state.cookies.length === 0) {
    throw new Error(
      `Lighthouse auth storage state at ${filePath} has no cookies.`
    );
  }
  return state;
}

function validateStorageState(filePath, persona) {
  const state = readStorageState(filePath);
  const cookie = name =>
    state.cookies.find(candidate => candidate.name === name);
  if (cookie(TEST_MODE_COOKIE)) {
    throw new Error(
      `Lighthouse Better Auth state must not contain bypass cookie ${TEST_MODE_COOKIE}.`
    );
  }
  if (!cookie(TEST_USER_ID_COOKIE)?.value?.trim()) {
    throw new Error(`Lighthouse auth state is missing ${TEST_USER_ID_COOKIE}.`);
  }
  if (cookie(TEST_PERSONA_COOKIE)?.value !== persona) {
    throw new Error(`Lighthouse auth state does not match persona ${persona}.`);
  }
  if (
    !state.cookies.some(
      candidate =>
        BETTER_AUTH_SESSION_COOKIE_PATTERN.test(candidate.name) &&
        candidate.value?.trim()
    )
  ) {
    throw new Error(
      'Lighthouse auth state is missing a signed Better Auth session cookie.'
    );
  }
  return state;
}

function cookieMatchesOrigin(cookie, origin) {
  const hostname = new URL(origin).hostname.toLowerCase();
  if (typeof cookie.domain === 'string' && cookie.domain.trim()) {
    return cookie.domain.replace(/^\./, '').toLowerCase() === hostname;
  }
  if (typeof cookie.url === 'string' && cookie.url.trim()) {
    return new URL(cookie.url).hostname.toLowerCase() === hostname;
  }
  return false;
}

function buildCookieForOrigin(cookie, origin) {
  const normalized = { ...cookie, path: cookie.path || '/' };
  if (!normalized.url && !normalized.domain) normalized.url = origin;
  return normalized;
}

function ensureAuthState(baseUrl) {
  const authStatePath = resolveAuthStatePath();
  mkdirSync(path.dirname(authStatePath), { recursive: true });
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
      '--persona',
      resolveTestPersona(),
      '--json',
    ],
    { cwd: webRoot, env: process.env, encoding: 'utf8' }
  );
  if ((result.status ?? 1) !== 0) {
    throw new Error(
      [
        'Dashboard Lighthouse Better Auth bootstrap failed.',
        result.error?.message,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
  validateStorageState(authStatePath, resolveTestPersona());
  return authStatePath;
}

function ensureChromiumPath() {
  const executablePath = require('playwright').chromium.executablePath();
  if (!executablePath || !existsSync(executablePath)) {
    throw new Error(
      'Playwright Chromium is not installed. Run `pnpm --filter=@jovie/web exec playwright install chromium`.'
    );
  }
  return executablePath;
}

function buildNodePath() {
  const workspaceModules = path.resolve(
    repoRoot,
    'node_modules',
    '.pnpm',
    'node_modules'
  );
  return process.env.NODE_PATH
    ? `${process.env.NODE_PATH}:${workspaceModules}`
    : workspaceModules;
}

async function seedDashboardAuth(browser, { url }) {
  const target = new URL(url);
  const origin = target.origin;
  const page = await browser.newPage();
  try {
    const state = validateStorageState(
      resolveAuthStatePath(),
      resolveTestPersona()
    );
    const cookies = state.cookies
      .filter(cookie => cookieMatchesOrigin(cookie, origin))
      .map(cookie => buildCookieForOrigin(cookie, origin));
    if (cookies.length === 0) {
      throw new Error(
        `Lighthouse auth storage state has no cookies for ${origin}.`
      );
    }

    const browserContext =
      typeof browser.defaultBrowserContext === 'function'
        ? browser.defaultBrowserContext()
        : typeof page.browserContext === 'function'
          ? page.browserContext()
          : null;
    if (browserContext?.setCookie) {
      await browserContext.setCookie(...cookies);
    } else {
      await page.setCookie(...cookies);
    }

    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.evaluate(
      ({ hiddenKey, openKey }) => {
        localStorage.setItem(hiddenKey, '1');
        localStorage.setItem(openKey, '0');
        document.documentElement.style.setProperty(
          '--dev-toolbar-height',
          '0px'
        );
      },
      { hiddenKey: DEV_TOOLBAR_HIDDEN_KEY, openKey: DEV_TOOLBAR_OPEN_KEY }
    );
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const landed = new URL(page.url());
    if (landed.pathname !== target.pathname) {
      throw new Error(
        `Lighthouse Better Auth state redirected ${target.pathname} to ${landed.pathname}.`
      );
    }
    const expectedUserId = state.cookies
      .find(cookie => cookie.name === TEST_USER_ID_COOKIE)
      ?.value.trim();
    const betterAuthUserId = await page.evaluate(async () => {
      const response = await fetch('/api/auth/get-session', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) return null;
      const session = await response.json().catch(() => null);
      return typeof session?.user?.id === 'string' ? session.user.id : null;
    });
    if (!betterAuthUserId || betterAuthUserId !== expectedUserId) {
      throw new Error(
        `Lighthouse Better Auth session resolved ${betterAuthUserId || 'no user'} instead of ${expectedUserId}.`
      );
    }
    await page.waitForSelector('main', { timeout: 30_000 });
    await page
      .waitForNetworkIdle({ idleTime: 500, timeout: 10_000 })
      .catch(() => undefined);
  } finally {
    await page.close();
  }
}

function main() {
  const baseUrl = resolveBaseUrl();
  const authStatePath = ensureAuthState(baseUrl);
  const chromePath = ensureChromiumPath();
  const collectUrls = resolveCollectUrls(baseUrl);
  const env = {
    ...process.env,
    BASE_URL: baseUrl,
    LIGHTHOUSE_AUTH_STATE_PATH: authStatePath,
    NODE_PATH: buildNodePath(),
  };
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
    { cwd: webRoot, env, stdio: 'inherit' }
  );
  process.exit(result.status ?? 1);
}

if (require.main === module) {
  main();
} else {
  module.exports = seedDashboardAuth;
}
