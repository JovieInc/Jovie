import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildTree, runCrawl, sha } from './fixtures/crawl-harness.mjs';

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
