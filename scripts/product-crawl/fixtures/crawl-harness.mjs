import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(dirname(fileURLToPath(import.meta.url)));
export const origin = 'https://jovie-fixture-jovie.vercel.app';
export const sha = 'a'.repeat(40);

// Dispatch without awaiting the route handler, as Playwright does. A rejected
// continuation must not become a process-level unhandled rejection. Navigation
// outcome is separate: a failed document still needs a red readiness verdict.
const PLAYWRIGHT_STUB = `
import { appendFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
const fixture = process.env.CRAWL_TEST_FIXTURE;
if (fixture === 'signal-exit') process.on('exit', () => process.kill(process.pid, 'SIGTERM'));
const mkCtx = options => {
  const listeners = {}; let paused;
  let current = '${origin}/';
  return {
    on(event, fn) { listeners[event] = fn; },
    async addInitScript() {},
    async addCookies(cookies) { appendFileSync('cookies.jsonl', JSON.stringify(cookies) + '\\n'); },
    async newCDPSession() {
      return {
        on(event, handler) { if (event === 'Fetch.requestPaused') paused = handler; },
        async send(method, options) {
          if (method !== 'Fetch.continueRequest') return {};
          appendFileSync('continued.jsonl', JSON.stringify(options.headers ?? []) + '\\n');
          if (fixture === 'throw-continue') throw new Error('Request is already handled or aborted');
          if (fixture === 'reject-continue') return Promise.reject(new Error('Request is already handled or aborted'));
          return {};
        },
      };
    },
    async newPage() {
      return {
        on() {}, url() { return current; },
        async goto(target) {
          current = target;
          appendFileSync('loads.jsonl', JSON.stringify({ target, ...options }) + '\\n');
          const request = { url: () => target, resourceType: () => 'document' };
          listeners.request?.(request);
          // Real Playwright dispatches handlers without awaiting them. A rejected
          // continuation is separate from the navigation outcome under test.
          paused?.({ requestId: target, request: { url: target, headers: { 'x-fixture': 'kept' } } });
          if (fixture === 'failed-document') {
            listeners.requestfailed?.(request);
            throw new Error('page.goto: net::ERR_FAILED at ' + target);
          }
          const status = fixture === 'http-403' ? 403 : 200;
          listeners.response?.({ request: () => request, status: () => status, fromServiceWorker: () => false });
          listeners.requestfinished?.(request);
          return { status: () => status };
        },
        async waitForTimeout() {},
        async evaluate() {
          return { cls: 0.01, lcp: 900, longest: 50,
            text: 'Welcome to Jovie.', overflow: false,
            paths: [], releaseIds: [], ld: [], keywords: '',
            overlaySurface: { rail: false, hoverables: 0 } };
        },
      };
    },
    async close() { await appendFile('contexts-closed.txt', 'closed\\n'); },
  };
};
export const chromium = {
  async launch() {
    return { async newContext(options) { return mkCtx(options); },
      async newBrowserCDPSession() { return { async send() { return { userAgent: 'FixtureChrome/1.0' }; } }; },
      async close() {} };
  },
};
`;

const INVENTORY = {
  inventory: [
    { kind: 'page', route: '/' },
    { kind: 'page', route: '/pricing' },
  ],
};

// Copy real crawl modules, including current-main helpers after reconciliation.
// All browser work is synthetic and fetch is intercepted before crawl imports.
export async function buildTree(inventory = INVENTORY) {
  const root = await mkdtemp(join(tmpdir(), 'product-crawl-test-'));
  await cp(here, join(root, 'scripts/product-crawl'), { recursive: true });
  await mkdir(join(root, 'docs/product/generated'), { recursive: true });
  await mkdir(join(root, 'apps/web/scripts'), { recursive: true });
  for (const file of [
    'vercel-protected-origin.cjs',
    'vercel-surface-verifier.cjs',
    'lighthouse-vercel-bypass.cjs',
  ])
    await cp(
      join(here, '../../apps/web/scripts', file),
      join(root, 'apps/web/scripts', file)
    );
  await mkdir(join(root, 'node_modules/playwright'), { recursive: true });
  await writeFile(
    join(root, 'docs/product/generated/artist-launch-inventory.json'),
    JSON.stringify(inventory)
  );
  await writeFile(
    join(root, 'synthetic-state.json'),
    '{"cookies":[],"origins":[]}'
  );
  await writeFile(
    join(root, 'offline.mjs'),
    `globalThis.fetch = async input => {
      const url = String(input);
      if (url !== '${origin}/sitemap.xml' && url !== '${origin}/api/health/build-info')
        throw new Error('Unexpected synthetic fetch');
      const response = new Response(url.endsWith('/sitemap.xml') ? '<urlset></urlset>' : JSON.stringify({
        commitSha: '${sha}', buildId: 'fixture', environment: 'production' }), { status: 200,
        headers: { 'content-type': url.endsWith('/sitemap.xml') ? 'text/xml' : 'application/json',
          'set-cookie': 'fixture-protection=fixture-only; Path=/; Secure; HttpOnly' } });
      Object.defineProperty(response, 'url', { value: url });
      return response;
    };`
  );
  await writeFile(
    join(root, 'node_modules/playwright/package.json'),
    JSON.stringify({ name: 'playwright', type: 'module', main: 'index.mjs' })
  );
  await writeFile(
    join(root, 'node_modules/playwright/index.mjs'),
    PLAYWRIGHT_STUB
  );
  return root;
}

export function runCrawl(
  root,
  fixture,
  { signedIn = true, maxRequests = 20000, deadline = '' } = {}
) {
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [
        '--unhandled-rejections=strict',
        '--import',
        './offline.mjs',
        'scripts/product-crawl/crawl.mjs',
        '--origin',
        origin,
        '--out',
        'out',
        '--sha',
        sha,
        ...(signedIn ? ['--storage-state', 'synthetic-state.json'] : []),
      ],
      {
        cwd: root,
        timeout: 5000,
        env: {
          PATH: process.env.PATH,
          CRAWL_TEST_FIXTURE: fixture,
          CRAWL_PAGE_INTERVAL_MS: '0',
          CRAWL_MAX_INTERCEPTED_REQUESTS: String(maxRequests),
          CRAWL_DEADLINE_EPOCH_MS: String(deadline),
          GITHUB_RUN_ID: 'fixture-run',
          PLAYWRIGHT_DYNAMIC_SECRETS_FILE: join(root, 'private-cookie-values'),
          PLAYWRIGHT_VERCEL_BYPASS_SECRET:
            fixture === 'no-bypass' ? '' : 'synthetic-fixture',
        },
      },
      (error, stdout, stderr) => resolve({ error, stdout, stderr })
    );
  });
}
