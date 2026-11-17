import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildTree, runCrawl, sha } from './fixtures/crawl-harness.mjs';
import { adoptionFixture } from './fixtures/receipt-adoption.mjs';
import { createColdVisit } from './load-reuse.mjs';
import { lookupPublicReceipt } from './receipt-adoption.mjs';
import { producerScope } from './receipt-producer.mjs';
import { readPublicAdoption } from './receipt-reuse.mjs';

test('an exact transported stranger observation avoids a real network load while sessions and discovery stay fresh', async t => {
  const f = adoptionFixture();
  const calls = [],
    received = [];
  const server = createServer((req, res) => {
    received.push(req.url);
    res.end('current fixture');
  });
  await new Promise(resolve =>
    server.listen(0, '127.0.0.1', () => resolve(undefined))
  );
  t.after(() => new Promise(resolve => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const localOrigin = `http://127.0.0.1:${address.port}`;
  const packet = lookupPublicReceipt({ ...f });
  const adoption = readPublicAdoption(
    Buffer.from(JSON.stringify(packet)).toString('base64'),
    { ...f.scope, shard: { index: 1, count: 4 } },
    f.inventory,
    () => f.now
  );
  const loader = createColdVisit(
    async job => {
      calls.push(job);
      await (await fetch(new URL(job.target, localOrigin))).text();
      return { ...job, status: 200 };
    },
    f.scope.target.origin,
    { adoption }
  );
  const job = {
    route: '/pricing',
    target: '/pricing',
    identity: 'stranger',
    viewport: 'desktop',
  };
  const reused = await loader.visit(job);
  await loader.visit({ ...job, identity: 'signed-in' });
  await loader.visit({ ...job, target: '/discovery', collect: true });
  assert.equal(calls.length, 2);
  assert.equal(
    received.length,
    2,
    'the adopted stranger page made no HTTP request'
  );
  assert.equal(reused.measuredAt, '2026-11-17T09:00:00Z');
  assert.equal(reused.measurementAdoption.runId, 10);
});

test('producer scope proves the actual clean checkout and manual invocation without session data', async t => {
  const root = await mkdtemp(join(tmpdir(), 'crawl-producer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = [
    'scripts/product-crawl/crawl.mjs',
    'docs/product/generated/artist-launch-inventory.json',
    '.nvmrc',
    'package.json',
    'pnpm-lock.yaml',
    '.github/workflows/postdeploy-probes.yml',
    'apps/web/scripts/vercel-protected-origin.cjs',
    'apps/web/scripts/vercel-surface-verifier.cjs',
    'apps/web/scripts/lighthouse-vercel-bypass.cjs',
    'scripts/lib/postdeploy-probe-admission.mjs',
    'scripts/lib/golden-path-cert-reuse.mjs',
  ];
  for (const file of files) {
    await mkdir(join(root, file, '..'), { recursive: true });
    await writeFile(join(root, file), 'fixture');
  }
  const git = args =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
      },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  git(['init', '--quiet']);
  git(['add', '.']);
  git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  ]);
  const sourceSha = git(['rev-parse', 'HEAD']).trim();
  const input = {
    origin: 'https://jovie-fixture-jovie.vercel.app',
    sha: sourceSha,
    deploymentId: 'dpl_fixture',
  };
  const env = {
    GITHUB_REPOSITORY: 'JovieInc/Jovie',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF:
      'JovieInc/Jovie/.github/workflows/postdeploy-probes.yml@refs/heads/main',
    GITHUB_SHA: sourceSha,
    GITHUB_RUN_ID: '20',
    GITHUB_RUN_ATTEMPT: '1',
    PRIVATE_SESSION: 'never exported',
  };
  const scope = producerScope(root, input, env);
  assert.equal(scope.sourceSha, sourceSha);
  assert.doesNotMatch(JSON.stringify(scope), /never exported|PRIVATE_SESSION/);
  assert.equal(
    producerScope(root, { ...input, sha: 'f'.repeat(40) }, env),
    null
  );
  assert.equal(
    producerScope(root, input, { ...env, GITHUB_REF: 'refs/heads/foreign' }),
    null
  );
  await writeFile(join(root, files[0]), 'changed producer');
  assert.equal(
    producerScope(root, input, env),
    null,
    'dirty producer source is unknown'
  );
});

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
  assert.equal(receipt.sha, sha);
  assert.equal(receipt.pages.length, opts?.signedIn === false ? 4 : 8);
  const closed = (await readFile(join(root, 'contexts-closed.txt'), 'utf8'))
    .trim()
    .split('\n').length;
  assert.ok(closed >= receipt.pages.length, 'every visit context was closed');
  const headers = (await readFile(join(root, 'continued.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map(line =>
      Object.fromEntries(JSON.parse(line).map(h => [h.name, h.value]))
    );
  assert.ok(headers.length >= receipt.pages.length);
  for (const value of headers)
    assert.deepEqual(value, {
      'x-fixture': 'kept',
      'x-synthetic-monitoring': 'product-crawl',
      'x-jovie-crawl-run': 'fixture-run',
    });
  assert.equal(receipt.traffic.observed.inFlight, 0);
  assert.equal(receipt.traffic.accounting.absoluteAllNetworkCapEnforced, false);
  if (fixture !== 'no-bypass') {
    const jars = (await readFile(join(root, 'cookies.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    assert.ok(jars.length >= receipt.pages.length);
    assert.ok(
      jars.every(
        cookies => cookies.length === 1 && cookies[0].value === 'fixture-only'
      )
    );
    assert.match(
      await readFile(join(root, 'private-cookie-values'), 'utf8'),
      /fixture-only/
    );
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

test('without a bypass secret identity marking remains and signed-in coverage stays missing', async t => {
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

test('discovery supplies one cold measurement without sharing identity or viewport', async t => {
  const root = await buildTree({
    inventory: [{ kind: 'page', route: '/[username]' }],
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await runCrawl(root, 'success');
  assert.equal(result.error, null, result.stderr);
  const loads = (await readFile(join(root, 'loads.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  const cold = loads.filter(load => new URL(load.target).pathname === '/tim');
  assert.equal(
    cold.length,
    4,
    'one cold load for each identity and viewport, including discovery'
  );
  assert.equal(
    cold.filter(load => load.viewport.width === 1440 && !load.storageState)
      .length,
    1
  );
  assert.equal(
    cold.filter(load => load.viewport.width === 1440 && load.storageState)
      .length,
    1
  );
  const receipt = JSON.parse(
    await readFile(join(root, 'out/receipt.json'), 'utf8')
  );
  assert.equal(
    receipt.pages.filter(page => page.route === '/[username]').length,
    6,
    'both fixture handles keep their required coverage'
  );
});

test('route aliases reuse a cold load while preserving every route and fixture observation', async t => {
  const root = await buildTree({
    inventory: [
      { kind: 'page', route: '/[username]' },
      { kind: 'page', route: '/tim' },
    ],
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await runCrawl(root, 'success');
  assert.equal(result.error, null, result.stderr);
  const loads = (await readFile(join(root, 'loads.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  assert.equal(
    loads.filter(load => new URL(load.target).pathname === '/tim').length,
    4
  );
  const receipt = JSON.parse(
    await readFile(join(root, 'out/receipt.json'), 'utf8')
  );
  assert.equal(receipt.pages.length, 10);
  assert.equal(receipt.pages.filter(page => page.route === '/tim').length, 4);
  assert.equal(receipt.pages.filter(page => page.expectClaimBanner).length, 2);
  assert.ok(receipt.measurementReuses >= 5);
});

test('receipt files do not hide a signal-terminated crawl', async t => {
  await assert.rejects(crawl(t, 'signal-exit'), error => {
    assert.ok(error instanceof assert.AssertionError);
    assert.equal(error.code, 'ERR_ASSERTION');
    assert.ok(error.actual instanceof Error);
    assert.ok('code' in error.actual && 'signal' in error.actual);
    assert.equal(error.actual?.code, null);
    assert.equal(error.actual?.signal, 'SIGTERM');
    return true;
  });
});

test('budget exhaustion preserves an incomplete receipt without starting another page', async t => {
  const root = await buildTree();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await runCrawl(root, 'success', { maxRequests: 3 });
  assert.equal(result.error, null, result.stderr);
  const receipt = JSON.parse(
    await readFile(join(root, 'out/receipt.json'), 'utf8')
  );
  const verdict = JSON.parse(
    await readFile(join(root, 'out/verdict.json'), 'utf8')
  );
  assert.equal(
    receipt.traffic.observed.attempted,
    3,
    'two verified bootstrap requests and one sitemap'
  );
  assert.equal(receipt.traffic.admission.admitted, 3);
  assert.ok(receipt.traffic.admission.visitsNotStarted > 0);
  assert.equal(receipt.outOfTime, null, 'budget exhaustion is not a deadline');
  assert.equal(verdict.ready, false);
  assert.match(verdict.reasons.join('; '), /admission budget/);
  assert.equal(
    receipt.traffic.accounting.browserProcessRequests.attempted,
    null
  );
});

test('expired setup leaves no request and still produces deadline evidence', async t => {
  const root = await buildTree();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await runCrawl(root, 'success', { deadline: '1' });
  assert.equal(result.error, null, result.stderr);
  const receipt = JSON.parse(
    await readFile(join(root, 'out/receipt.json'), 'utf8')
  );
  assert.equal(receipt.traffic.observed.attempted, 0);
  assert.ok(receipt.outOfTime.loadsLeft > 0);
});
