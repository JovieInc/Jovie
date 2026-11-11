import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  analyzePolicy,
  CONTROL_REGISTRY,
  cleanControlSnapshot,
  evaluate,
  RULES,
  runControls,
  vendorFor,
} from './privacy-rules.mjs';
import {
  approved,
  compileCatalog,
  scanFile,
  scanRepo,
  selectPaths,
  syncCatalog,
} from './tracker-signature-scan.mjs';

const registry = JSON.parse(
  readFileSync(
    new URL('../../canon/privacy/tracker-registry.json', import.meta.url),
    'utf8'
  )
);

test('clean control snapshot passes every rule', () => {
  const fails = evaluate(cleanControlSnapshot(), CONTROL_REGISTRY).filter(
    r => r.status === 'fail'
  );
  assert.deepEqual(fails, []);
});

test('a crawl with no successful page, or no analysable policy, fails instead of passing vacuously', () => {
  const clean = cleanControlSnapshot();
  const noPages = evaluate({ ...clean, pages: [] }, CONTROL_REGISTRY);
  assert.ok(
    noPages.some(r => r.rule === 'crawl' && r.status === 'fail'),
    'an empty crawl must fail'
  );
  const allErrored = evaluate(
    { ...clean, pages: clean.pages.map(p => ({ ...p, error: 'HTTP 503' })) },
    CONTROL_REGISTRY
  );
  assert.ok(allErrored.some(r => r.rule === 'crawl' && r.status === 'fail'));
  const noPolicy = evaluate(
    {
      ...clean,
      policy_versions: { privacy: { url: 'x', error: 'fetch failed' } },
    },
    CONTROL_REGISTRY
  );
  assert.ok(
    noPolicy.some(r => r.rule === 'claims-truthful' && r.status === 'fail')
  );
});

test('every rule has a seeded violation that fails it and only it', () => {
  const outcomes = runControls();
  assert.equal(outcomes.length, Object.keys(RULES).length + 1);
  for (const o of outcomes) assert.ok(o.ok, `${o.control}: ${o.detail}`);
});

test('controls catch a rule that stops biting', () => {
  // A broken evaluator that never fails anything must fail the controls.
  const outcomes = runControls(() => []);
  assert.ok(outcomes.filter(o => o.control !== 'clean').every(o => !o.ok));
});

test('analyzePolicy finds banned claims and named vendors in HTML', () => {
  const html =
    '<p>We don&#x27;t track you.</p><p>We use <b>Meta</b> pixels.</p>';
  const a = analyzePolicy(html, CONTROL_REGISTRY);
  assert.equal(a.banned_claim_hits.length, 1);
  assert.deepEqual(a.named_vendors, ['meta']);
});

test('registry: every vendor has an id, category, hosts and rationale', () => {
  const categories = new Set([
    'pixel',
    'analytics',
    'replay',
    'chat-widget',
    'ads',
    'processor',
    'content',
  ]);
  const ids = new Set();
  for (const v of registry.vendors) {
    assert.ok(v.id && !ids.has(v.id), `duplicate or missing id ${v.id}`);
    ids.add(v.id);
    assert.ok(
      categories.has(v.category),
      `${v.id}: bad category ${v.category}`
    );
    assert.ok(Array.isArray(v.hosts) && v.hosts.length, `${v.id}: no hosts`);
    assert.ok(
      v.rationale && v.approved,
      `${v.id}: needs rationale and approved date`
    );
  }
  for (const s of registry.surfaces) assert.match(s.url, /^https:\/\//);
});

test('vendorFor matches subdomains, not lookalikes', () => {
  const reg = { vendors: [{ id: 'meta', hosts: ['facebook.net'] }] };
  assert.equal(vendorFor('connect.facebook.net', reg)?.id, 'meta');
  assert.equal(vendorFor('evilfacebook.net', reg), null);
});

test('eu: a missing bar fails only where something consent-gated runs', () => {
  const snap = cleanControlSnapshot();
  snap.pages[3].consent_banner = { visible: false, accept: 0, reject: 0 };
  const fails = evaluate(snap, CONTROL_REGISTRY).filter(
    r => r.status === 'fail'
  );
  assert.deepEqual(
    fails.map(r => r.rule),
    ['eu-consent-first']
  );
  // Same page on a surface that loads nothing gated: no bar is owed.
  const quiet = cleanControlSnapshot();
  quiet.pages = quiet.pages.filter(
    p => p.surface !== 'home' || p.scenario === 'eu'
  );
  quiet.pages.find(p => p.scenario === 'eu').consent_banner = {
    visible: false,
    accept: 0,
    reject: 0,
  };
  quiet.pages.push({
    ...quiet.pages.find(p => p.scenario === 'eu'),
    scenario: 'us-default',
  });
  assert.equal(
    evaluate(quiet, CONTROL_REGISTRY).filter(
      r => r.rule === 'eu-consent-first' && r.status === 'fail'
    ).length,
    0
  );
});

const catalog = JSON.parse(
  readFileSync(new URL('./company-trackers.pin.json', import.meta.url), 'utf8')
);
const signatures = compileCatalog(catalog);

test('tracker signatures: a comment that quotes a loader call is unapproved', () => {
  const hits = scanFile(
    'apps/web/lib/ingestion/strategies/linktree/config.ts',
    ' * records ttq.load() for a creator id\n',
    signatures,
    { vendors: [] }
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'tiktok');
});

test('tracker signatures: tests and stories are not scanned', () => {
  assert.deepEqual(
    selectPaths([
      'apps/web/tests/unit/pixels.test.ts',
      'apps/web/lib/ingestion/strategies/linktree/config.ts',
    ]),
    ['apps/web/lib/ingestion/strategies/linktree/config.ts']
  );
});

test('tracker signatures: the session replay call is approved by vendor id', () => {
  const source = 'clientSentry.replayIntegration({ maskAllText: true })\n';
  const path = 'apps/web/lib/sentry/client-full.ts';
  assert.equal(scanFile(path, source, signatures, { vendors: [] }).length, 1);
  const replay = registry.vendors.find(vendor => vendor.id === 'sentry-replay');
  assert.equal(
    approved(
      signatures.find(sig => sig.id === 'sentry-replay'),
      registry
    ),
    true
  );
  assert.deepEqual(scanFile(path, source, signatures, registry), []);
  assert.equal(replay.category, 'replay');
  assert.ok(replay.rationale && replay.hosts.length);
  assert.equal(vendorFor('sentry.io', registry)?.id, 'sentry-replay');
});

test('tracker signatures: this repo has no unapproved company-catalog hit', () => {
  assert.deepEqual(scanRepo(), []);
});

test('tracker catalog pin matches the company-guards workflow pin', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/company-guards.yml', import.meta.url),
    'utf8'
  );
  const pin = workflow.match(/^# ci-ref: ([0-9a-f]{40})$/m)?.[1];
  assert.equal(pin, catalog.pin);
});

test('catalog sync uses the pinned commit, preserves upstream fields, and fails without modifying the mirror', () => {
  const root = mkdtempSync(join(tmpdir(), 'tracker-catalog-'));
  try {
    const companyRoot = join(root, 'company');
    mkdirSync(join(companyRoot, 'canon'), { recursive: true });
    mkdirSync(join(root, '.github/workflows'), { recursive: true });
    mkdirSync(join(root, 'scripts/compliance'), { recursive: true });
    const upstream = {
      schema: 'company-trackers/v1',
      signatures: [{ id: 'example', code: ['example\\('], hosts: [] }],
      banned_claims: ['example claim'],
      notes: 'Keep upstream metadata',
    };
    const git = args =>
      execFileSync('git', args, { cwd: companyRoot, encoding: 'utf8' }).trim();
    git(['init', '--quiet']);
    writeFileSync(
      join(companyRoot, 'canon/trackers.json'),
      JSON.stringify(upstream)
    );
    git(['add', '.']);
    git([
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'catalog',
    ]);
    const pin = git(['rev-parse', 'HEAD']);
    const workflow = join(root, '.github/workflows/company-guards.yml');
    const mirror = join(root, 'scripts/compliance/company-trackers.pin.json');
    writeFileSync(workflow, `# ci-ref: ${pin}\n`);
    writeFileSync(join(companyRoot, 'canon/trackers.json'), '{}');
    assert.equal(syncCatalog({ root, companyRoot }), pin);
    assert.deepEqual(JSON.parse(readFileSync(mirror, 'utf8')), {
      ...upstream,
      pin,
    });
    const before = readFileSync(mirror, 'utf8');
    syncCatalog({ root, companyRoot });
    assert.equal(readFileSync(mirror, 'utf8'), before);
    writeFileSync(workflow, '# ci-ref: missing\n');
    assert.throws(() => syncCatalog({ root, companyRoot }), /Missing exact/);
    writeFileSync(workflow, `# ci-ref: ${'f'.repeat(40)}\n`);
    assert.throws(() => syncCatalog({ root, companyRoot }));
    assert.equal(readFileSync(mirror, 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('shared Sentry ingestion hosts retain replay input-page restrictions', () => {
  const host = 'o1.ingest.sentry.io';
  assert.equal(vendorFor(host, registry)?.id, 'sentry-replay');
  const snapshot = cleanControlSnapshot();
  snapshot.pages.push({
    ...snapshot.pages[1],
    scenario: 'eu-accept',
    third_party_requests: [{ host, phase: 'after-accept', count: 1 }],
  });
  assert.ok(
    evaluate(snapshot, registry).some(
      r => r.rule === 'no-tracker-on-input-page' && r.status === 'fail'
    )
  );
});
