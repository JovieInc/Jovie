'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { owningAreaFor, mapToLedgerPath } = require('./update-quarantine.js');

test('owningAreaFor derives area from test path', () => {
  assert.strictEqual(
    owningAreaFor('tests/unit/dashboard/thing.test.ts'),
    'dashboard'
  );
  assert.strictEqual(owningAreaFor('tests/unit/foo.test.ts'), 'unit');
  assert.strictEqual(owningAreaFor('tests/e2e/smoke.spec.ts'), 'e2e');
  assert.strictEqual(
    owningAreaFor('apps/web/tests/contracts/api.test.ts'),
    'contracts'
  );
  assert.strictEqual(owningAreaFor('src/lib/x.test.ts'), 'src');
});

test('mapToLedgerPath maps unit and e2e junit paths to ledger entries', () => {
  assert.deepStrictEqual(mapToLedgerPath('apps/web/tests/unit/a.test.ts'), {
    kind: 'unit',
    path: 'tests/unit/a.test.ts',
  });
  assert.deepStrictEqual(mapToLedgerPath('tests/unit/a.test.ts'), {
    kind: 'unit',
    path: 'tests/unit/a.test.ts',
  });
  assert.deepStrictEqual(mapToLedgerPath('apps/web/tests/e2e/b.spec.ts'), {
    kind: 'e2e',
    path: 'apps/web/tests/e2e/b.spec.ts',
  });
  assert.strictEqual(mapToLedgerPath('apps/web/lib/util.ts'), null);
  assert.strictEqual(mapToLedgerPath(''), null);
});

function runUpdater(dir) {
  return execFileSync(
    process.execPath,
    [path.join(__dirname, 'update-quarantine.js')],
    { cwd: dir, encoding: 'utf8' }
  );
}

function makeRepo(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uq-'));
  fs.mkdirSync(path.join(dir, 'apps/web/tests/unit'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'apps/web/tests/quarantine.json'),
    JSON.stringify({ schemaVersion: 1, retryBudget: {}, entries }, null, 2)
  );
  fs.writeFileSync(path.join(dir, 'apps/web/tests/unit/live.test.ts'), 'x');
  return dir;
}

const candidate = (over = {}) => ({
  signature: 'abc123def4567890',
  file: 'tests/unit/live.test.ts',
  occurrences24h: 4,
  quarantineCandidate: true,
  firstSeenAt: '2026-01-01T00:00:00Z',
  lastSeenAt: '2026-01-02T00:00:00Z',
  errorExcerpt: 'boom',
  runUrls: ['https://example/run/1'],
  ...over,
});

test('quarantines a signature with >=3 occurrences in 24h', () => {
  const dir = makeRepo([]);
  fs.writeFileSync(
    path.join(dir, 'flakiness-clusters.json'),
    JSON.stringify({ clusters: [candidate()] })
  );
  fs.writeFileSync(
    path.join(dir, 'flake-issues.json'),
    JSON.stringify({ abc123def4567890: 'https://linear.app/jovie/issue/JOV-1' })
  );
  runUpdater(dir);
  const q = JSON.parse(
    fs.readFileSync(path.join(dir, 'apps/web/tests/quarantine.json'), 'utf8')
  );
  assert.strictEqual(q.entries.length, 1);
  const e = q.entries[0];
  assert.strictEqual(e.signatureHash, 'abc123def4567890');
  assert.strictEqual(e.fixIssueUrl, 'https://linear.app/jovie/issue/JOV-1');
  assert.strictEqual(e.kind, 'unit');
  assert.ok(e.quarantinedAt);
});

test('un-quarantines an entry stable for 7+ days', () => {
  const stale = new Date(Date.now() - 8 * 86400000).toISOString();
  const dir = makeRepo([
    {
      id: 'auto-deadbeefdeadbeef',
      kind: 'unit',
      path: 'tests/unit/live.test.ts',
      owner: 'unit',
      firstSeenAt: '2026-01-01',
      reproductionCommand: 'x',
      fixIssueUrl: 'https://linear.app/jovie/issue/JOV-2',
      expiresAt: '2099-01-01',
      consecutiveSuccesses: 6,
      signatureHash: 'deadbeefdeadbeef',
      quarantinedAt: '2026-01-01T00:00:00Z',
      lastSeenFlakyAt: stale,
      flakeCount: 3,
    },
  ]);
  fs.writeFileSync(
    path.join(dir, 'flakiness-clusters.json'),
    JSON.stringify({ clusters: [] })
  );
  runUpdater(dir);
  const q = JSON.parse(
    fs.readFileSync(path.join(dir, 'apps/web/tests/quarantine.json'), 'utf8')
  );
  assert.strictEqual(q.entries.length, 0);
  const changes = JSON.parse(
    fs.readFileSync(path.join(dir, 'quarantine-changes.json'), 'utf8')
  );
  assert.deepStrictEqual(
    changes.unquarantined.map(u => u.file),
    ['tests/unit/live.test.ts']
  );
  assert.strictEqual(
    changes.unquarantined[0].issueUrl,
    'https://linear.app/jovie/issue/JOV-2'
  );
});

test('prunes entries whose test file no longer exists', () => {
  const dir = makeRepo([
    {
      id: 'manual-1',
      kind: 'unit',
      path: 'tests/unit/deleted.test.ts',
      owner: 'unit',
      firstSeenAt: '2026-01-01',
      reproductionCommand: 'x',
      fixIssueUrl: '',
      expiresAt: '2099-01-01',
      consecutiveSuccesses: 0,
    },
  ]);
  runUpdater(dir);
  const q = JSON.parse(
    fs.readFileSync(path.join(dir, 'apps/web/tests/quarantine.json'), 'utf8')
  );
  assert.strictEqual(q.entries.length, 0);
});

test('keeps a re-flaking signature quarantined (resets consecutiveSuccesses)', () => {
  const dir = makeRepo([
    {
      id: 'auto-abc123def4567890',
      kind: 'unit',
      path: 'tests/unit/live.test.ts',
      owner: 'unit',
      firstSeenAt: '2026-01-01',
      reproductionCommand: 'x',
      fixIssueUrl: 'https://linear.app/jovie/issue/JOV-3',
      expiresAt: '2099-01-01',
      consecutiveSuccesses: 40,
      signatureHash: 'abc123def4567890',
      quarantinedAt: '2026-01-01T00:00:00Z',
      lastSeenFlakyAt: '2026-01-01T00:00:00Z',
      flakeCount: 3,
    },
  ]);
  fs.writeFileSync(
    path.join(dir, 'flakiness-clusters.json'),
    JSON.stringify({ clusters: [candidate({ quarantineCandidate: true })] })
  );
  runUpdater(dir);
  const q = JSON.parse(
    fs.readFileSync(path.join(dir, 'apps/web/tests/quarantine.json'), 'utf8')
  );
  assert.strictEqual(q.entries.length, 1);
  assert.strictEqual(q.entries[0].consecutiveSuccesses, 0);
  assert.strictEqual(q.entries[0].flakeCount, 7);
});
