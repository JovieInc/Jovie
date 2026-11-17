import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const origin = 'https://crawl.invalid';

// Dispatch without awaiting the route handler, as Playwright does. A rejected
// continuation must not become a process-level unhandled rejection. Navigation
// outcome is separate: a failed document still needs a red readiness verdict.
const PLAYWRIGHT_STUB = `
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
const fixture = process.env.CRAWL_TEST_FIXTURE;
if (fixture === 'signal-exit')
  process.on('exit', () => process.kill(process.pid, 'SIGTERM'));
const mkCtx = () => {
  const routeHandlers = [];
  let current = '${origin}/';
  return {
    async addInitScript() {},
    async route(match, handler) { routeHandlers.push({ match, handler }); },
    async newPage() {
      return {
        on() {},
        url() { return current; },
        async goto(target) {
          current = target;
          assert.equal(routeHandlers.length, fixture === 'no-bypass' ? 0 : 1);
          for (const { match, handler } of routeHandlers) {
            assert.equal(match(new URL(target)), true);
            assert.equal(match(new URL('https://third-party.invalid/')), false);
            handler({
              request: () => ({ headers: () => ({ 'x-fixture': 'kept' }) }),
              continue(options) {
                appendFileSync('continued.jsonl', JSON.stringify(options.headers) + '\\n');
                if (fixture === 'throw-continue')
                  throw new Error('Request is already handled or aborted');
                return fixture === 'success'
                  ? Promise.resolve()
                  : Promise.reject(new Error('Request is already handled or aborted'));
              },
            });
          }
          if (fixture === 'failed-document')
            throw new Error('page.goto: net::ERR_FAILED at ' + target);
          return { status: () => fixture === 'http-403' ? 403 : 200 };
        },
        async waitForTimeout() {},
        async evaluate() {
          return {
            cls: 0.01, lcp: 900, longest: 50,
            text: 'Welcome to Jovie.', overflow: false,
            paths: [], releaseIds: [], ld: [], keywords: '',
            overlaySurface: { rail: false, hoverables: 0 },
          };
        },
      };
    },
    async close() {
      await appendFile('contexts-closed.txt', 'closed\\n');
    },
  };
};
export const chromium = {
  async launch() {
    return { async newContext() { return mkCtx(); }, async close() {} };
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
async function buildTree() {
  const root = await mkdtemp(join(tmpdir(), 'product-crawl-test-'));
  await cp(here, join(root, 'scripts/product-crawl'), { recursive: true });
  await mkdir(join(root, 'docs/product/generated'), { recursive: true });
  await mkdir(join(root, 'node_modules/playwright'), { recursive: true });
  await writeFile(
    join(root, 'docs/product/generated/artist-launch-inventory.json'),
    JSON.stringify(INVENTORY)
  );
  await writeFile(
    join(root, 'synthetic-state.json'),
    '{"cookies":[],"origins":[]}'
  );
  await writeFile(
    join(root, 'offline.mjs'),
    `globalThis.fetch = async input => {
      if (String(input) !== '${origin}/sitemap.xml')
        throw new Error('Unexpected synthetic fetch');
      return new Response('<urlset></urlset>', { status: 200 });
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

function runCrawl(root, fixture, { signedIn = true } = {}) {
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
        'synthetic-build',
        ...(signedIn ? ['--storage-state', 'synthetic-state.json'] : []),
      ],
      {
        cwd: root,
        timeout: 5000,
        env: {
          PATH: process.env.PATH,
          CRAWL_TEST_FIXTURE: fixture,
          PLAYWRIGHT_VERCEL_BYPASS_SECRET:
            fixture === 'no-bypass' ? '' : 'synthetic-fixture',
        },
      },
      (error, stdout, stderr) => resolve({ error, stdout, stderr })
    );
  });
}

async function crawl(t, fixture, opts) {
  const root = await buildTree();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { error, stderr } = await runCrawl(root, fixture, opts);
  assert.equal(error, null, `crawl died before writing receipts: ${stderr}`);
  const receipt = JSON.parse(
    await readFile(join(root, 'out/receipt.json'), 'utf8')
  );
  const verdict = JSON.parse(
    await readFile(join(root, 'out/verdict.json'), 'utf8')
  );
  const summary = await readFile(join(root, 'out/summary.md'), 'utf8');
  assert.equal(receipt.sha, 'synthetic-build');
  assert.equal(receipt.pages.length, opts?.signedIn === false ? 4 : 8);
  const closed = (await readFile(join(root, 'contexts-closed.txt'), 'utf8'))
    .trim()
    .split('\n').length;
  assert.ok(closed >= receipt.pages.length, 'every visit context was closed');
  if (fixture !== 'no-bypass') {
    const headers = (await readFile(join(root, 'continued.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    assert.ok(headers.length >= receipt.pages.length);
    for (const value of headers)
      assert.deepEqual(value, {
        'x-fixture': 'kept',
        'x-vercel-protection-bypass': 'synthetic-fixture',
      });
  }
  return { receipt, verdict, summary };
}

for (const fixture of ['reject-continue', 'throw-continue', 'success']) {
  test(`${fixture}: completed loads survive continuation handling and write clean receipts`, async t => {
    const { receipt, verdict, summary } = await crawl(t, fixture);
    for (const page of receipt.pages) {
      assert.equal(page.status, 200);
      assert.equal(page.error, undefined);
    }
    assert.deepEqual(verdict, { ready: true, reasons: [], findings: [] });
    assert.match(summary, /^## Product crawl: ready/m);
  });
}

test('a truly failed document writes receipts with unreachable findings', async t => {
  const { receipt, verdict, summary } = await crawl(t, 'failed-document');
  for (const page of receipt.pages) assert.match(page.error, /net::ERR_FAILED/);
  assert.equal(verdict.ready, false);
  assert.equal(verdict.findings.length, 8);
  for (const finding of verdict.findings)
    assert.equal(finding.kind, 'unreachable');
  assert.ok(verdict.reasons.includes('8 findings'));
  assert.match(summary, /^### unreachable \(8\)/m);
});

test('a denied document writes receipts with HTTP 403 broken-route findings', async t => {
  const { receipt, verdict, summary } = await crawl(t, 'http-403');
  for (const page of receipt.pages) {
    assert.equal(page.status, 403);
    assert.equal(page.error, undefined);
  }
  assert.equal(verdict.ready, false);
  assert.equal(verdict.findings.length, 8);
  for (const finding of verdict.findings) {
    assert.equal(finding.kind, 'broken-route');
    assert.equal(finding.detail, 'HTTP 403');
  }
  assert.match(summary, /^### broken-route \(8\)/m);
});

test('without a bypass secret no handler is installed and signed-in coverage stays missing', async t => {
  const { receipt, verdict } = await crawl(t, 'no-bypass', { signedIn: false });
  for (const page of receipt.pages) assert.equal(page.status, 200);
  assert.deepEqual(verdict.reasons, ['not crawled signed in']);
  assert.equal(verdict.findings.length, 0);
});

test('a rejected continuation preserves the original stranger-only receipt assertions', async t => {
  const { receipt, verdict, summary } = await crawl(t, 'reject-continue', {
    signedIn: false,
  });
  assert.equal(receipt.pages.length, 4, 'both viewports of both routes');
  for (const page of receipt.pages)
    assert.equal(page.error, undefined, `${page.route} loaded`);
  assert.deepEqual(verdict.reasons, ['not crawled signed in']);
  assert.equal(verdict.findings.length, 0);
  assert.match(summary, /^## Product crawl: not ready/m);
});

test('receipt files do not hide a signal-terminated crawl', async t => {
  await assert.rejects(crawl(t, 'signal-exit'), error => {
    assert.equal(error.code, 'ERR_ASSERTION');
    assert.equal(error.actual?.code, null);
    assert.equal(error.actual?.signal, 'SIGTERM');
    return true;
  });
});
