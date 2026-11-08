import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// playwright's channel dispatches route events fire-and-forget (verified in
// playwright-core 1.60: the channel EventEmitter rethrows handler rejections
// with no rejection handler installed), so a route handler that returns a
// rejected `continue()` promise surfaces as an unhandled promise rejection
// that kills the process. The stub below reproduces exactly that dispatch so
// the regression test exercises the same seam as the landed-production crawl.
const PLAYWRIGHT_STUB = `
const mkPage = target => ({
  on() {},
  url() { return new URL(target, 'https://jov.ie').href; },
  async goto() {
    for (const handler of routeHandlers) {
      // Fire-and-forget, like playwright's own route dispatch: the handler's
      // promise is never awaited and never caught here.
      handler({
        request: () => ({ headers: () => ({}) }),
        continue: () =>
          Promise.reject(new Error('Request is already handled or aborted')),
      });
    }
    return { status: () => 200 };
  },
  async waitForTimeout() {},
  async evaluate() {
    return {
      cls: 0.01,
      lcp: 900,
      longest: 50,
      text: 'Welcome to Jovie. Control how the world sees you.',
      overflow: false,
    };
  },
});
const routeHandlers = [];
const mkCtx = target => ({
  async addInitScript() {},
  async route(match, handler) { routeHandlers.push(handler); },
  async newPage() { return mkPage(target); },
  async close() {},
});
export const chromium = {
  async launch() {
    return {
      async newContext() { return mkCtx('https://jov.ie/'); },
      async close() {},
    };
  },
};
`;

const INVENTORY = {
  inventory: [
    { kind: 'page', route: '/' },
    { kind: 'page', route: '/pricing' },
  ],
};

/** A throwaway tree with the real crawl bytes and a playwright stub. */
async function buildTree() {
  const root = await mkdtemp(join(tmpdir(), 'product-crawl-test-'));
  await mkdir(join(root, 'scripts/product-crawl'), { recursive: true });
  await mkdir(join(root, 'docs/product/generated'), { recursive: true });
  await mkdir(join(root, 'node_modules/playwright'), { recursive: true });
  await cp(
    join(here, 'crawl.mjs'),
    join(root, 'scripts/product-crawl/crawl.mjs')
  );
  await cp(
    join(here, 'ready-gate.mjs'),
    join(root, 'scripts/product-crawl/ready-gate.mjs')
  );
  await cp(
    join(here, 'closed-in-production.json'),
    join(root, 'scripts/product-crawl/closed-in-production.json')
  );
  await writeFile(
    join(root, 'docs/product/generated/artist-launch-inventory.json'),
    JSON.stringify(INVENTORY)
  );
  await writeFile(
    join(root, 'node_modules/playwright/package.json'),
    JSON.stringify({
      name: 'playwright',
      version: '0.0.0-stub',
      type: 'module',
      main: 'index.mjs',
    })
  );
  await writeFile(
    join(root, 'node_modules/playwright/index.mjs'),
    PLAYWRIGHT_STUB
  );
  return root;
}

function runCrawl(root, { bypass }) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [
        'scripts/product-crawl/crawl.mjs',
        '--origin',
        'https://jov.ie',
        '--out',
        'out',
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          ...(bypass
            ? { PLAYWRIGHT_VERCEL_BYPASS_SECRET: 'stub-bypass-secret' }
            : {}),
        },
      },
      (error, stdout, stderr) => resolve({ error, stdout, stderr })
    );
  });
}

test('a rejected bypass continuation must not kill the crawl before the receipt is written', async () => {
  const root = await buildTree();
  try {
    const { error, stderr } = await runCrawl(root, { bypass: true });
    assert.equal(
      error?.code ?? 0,
      0,
      `the crawl died before writing its receipt: ${stderr}`
    );
    const receipt = JSON.parse(
      await readFile(join(root, 'out/receipt.json'), 'utf8')
    );
    assert.equal(receipt.pages.length, 4, 'both viewports of both routes');
    for (const page of receipt.pages)
      assert.equal(page.error, undefined, `${page.route} loaded`);
    const verdict = JSON.parse(
      await readFile(join(root, 'out/verdict.json'), 'utf8')
    );
    // The stub crawl is stranger-only, so the only not-ready reason is the
    // missing signed-in identity: no findings, nothing killed the run.
    assert.deepEqual(verdict.reasons, ['not crawled signed in']);
    assert.equal(verdict.findings.length, 0);
    const summary = await readFile(join(root, 'out/summary.md'), 'utf8');
    assert.match(summary, /^## Product crawl: not ready/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('without a bypass secret the crawl still reports and never fails the job', async () => {
  const root = await buildTree();
  try {
    const { error, stderr } = await runCrawl(root, { bypass: false });
    assert.equal(
      error?.code ?? 0,
      0,
      `the crawl died before writing its receipt: ${stderr}`
    );
    const receipt = JSON.parse(
      await readFile(join(root, 'out/receipt.json'), 'utf8')
    );
    assert.equal(receipt.pages.length, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
