const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const {
  updateQuarantine,
  mapToLedgerPath,
  processQuarantine,
} = require('./update-quarantine');
const NOW = Date.parse('2026-10-03T12:00:00Z');
const DAY = 86400000;
const SHA = 'a'.repeat(40);
const HASH = 'b'.repeat(64);
const FILE = 'apps/web/tests/unit/example.test.ts';
const ISSUE = 'https://linear.app/jovie/issue/JOV-6507';
function ledger(entries = []) {
  return {
    schemaVersion: 1,
    retryBudget: {
      unitDefaultRetries: 1,
      quarantineUnitRetries: 2,
      e2eDefaultRetries: 0,
      quarantineE2eRetries: 2,
      maxRetryAttemptsPerCiRun: 160,
      unitShardCount: 6,
    },
    entries,
  };
}
function entry(extra = {}) {
  return {
    id: 'example',
    kind: 'unit',
    path: 'tests/unit/example.test.ts',
    owner: 'platform',
    firstSeenAt: '2026-09-01',
    expiresAt: '2026-11-01',
    reproductionCommand: 'pnpm test',
    fixIssueUrl: ISSUE,
    quarantinedAt: '2026-09-01T00:00:00Z',
    lastSeenFlakyAt: '2026-09-20T00:00:00Z',
    autoManaged: true,
    ...extra,
  };
}
function observation(runId, extra = {}) {
  return {
    repository: 'JovieInc/Jovie',
    file: FILE,
    fileHash: HASH,
    headSha: SHA,
    runId,
    runAttempt: 1,
    event: 'merge_group',
    artifactId: runId + 100,
    artifactVerified: true,
    executedCount: 4,
    skippedCount: 0,
    retryCount: 0,
    outcome: 'clean',
    runAt: new Date(NOW - 3600000 + runId * 1000).toISOString(),
    ...extra,
  };
}
function report(observations = []) {
  return {
    schemaVersion: 1,
    repository: 'JovieInc/Jovie',
    headSha: SHA,
    complete: true,
    generatedAt: new Date(NOW).toISOString(),
    observations,
  };
}
function apply(l, r, issues = { [FILE]: ISSUE }, overrides = {}) {
  return updateQuarantine(l, r, issues, {
    now: NOW,
    headSha: SHA,
    fileHash: () => HASH,
    ...overrides,
  });
}
function flakes(extra = {}) {
  return [1, 2, 3].map(n =>
    observation(n, { outcome: 'flaky', retryCount: 1, ...extra })
  );
}
test('legacy CLI preserves quarantine with only Markdown and missing evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quarantine-legacy-'));
  try {
    fs.mkdirSync(path.join(root, 'apps/web'), { recursive: true });
    const old = JSON.stringify({
      tests: [{ name: 'missing', consecutiveSuccesses: 4 }],
    });
    fs.writeFileSync(path.join(root, 'apps/web/quarantine.json'), old);
    fs.writeFileSync(
      path.join(root, 'flakiness-report.md'),
      '## Flaky Tests (0)'
    );
    const result = spawnSync(
      process.execPath,
      [path.resolve(__dirname, 'auto-unquarantine.js')],
      { cwd: root, encoding: 'utf8' }
    );
    assert.equal(result.status, 0);
    assert.match(result.stdout, /execution-evidence-unavailable/);
    assert.equal(
      fs.readFileSync(path.join(root, 'apps/web/quarantine.json'), 'utf8'),
      old
    );
    assert.equal(processQuarantine({ root }).updated, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('missing observations and old quarantine age never certify clean execution', () => {
  const l = ledger([entry({ consecutiveSuccesses: 49 })]);
  assert.deepEqual(apply(l, report()).ledger, l);
});
test('three distinct verified successful retries admit a tracked unit quarantine', () => {
  const result = apply(ledger(), report(flakes()));
  assert.deepEqual(result.added, [FILE]);
  assert.equal(result.ledger.entries[0].fixIssueUrl, ISSUE);
  assert.equal(result.ledger.entries[0].consecutiveSuccesses, 0);
});
test('deterministic failures, two runs and untracked flakes cannot admit', () => {
  for (const rows of [flakes({ outcome: 'failed' }), flakes().slice(0, 2)])
    assert.equal(apply(ledger(), report(rows)).added.length, 0);
  for (const issues of [
    {},
    { [FILE]: 'https://github.com/JovieInc/Jovie/issues/1' },
  ])
    assert.equal(apply(ledger(), report(flakes()), issues).added.length, 0);
});
test('duplicate shards, including equivalent path spelling, are rejected', () => {
  const a = observation(1);
  const b = observation(1, {
    file: 'tests/unit/example.test.ts',
    artifactId: 999,
  });
  assert.throws(() => apply(ledger(), report([a, b])), /Duplicate execution/);
});
test('foreign, incomplete, stale and future reports fail closed', () => {
  for (const extra of [
    { repository: 'other/repo' },
    { headSha: 'c'.repeat(40) },
    { complete: false },
    { generatedAt: new Date(NOW - 2 * DAY).toISOString() },
    { generatedAt: new Date(NOW + DAY).toISOString() },
  ])
    assert.throws(() => apply(ledger(), { ...report(), ...extra }));
});
test('malformed receipt identities and partial executions fail closed', () => {
  for (const extra of [
    { file: '../a.test.ts' },
    { fileHash: null },
    { headSha: 'unknown' },
    { runId: 0 },
    { runAttempt: 0 },
    { event: 'workflow_dispatch' },
    { repository: 'other/repo' },
    { artifactVerified: false },
    { artifactId: 0 },
    { executedCount: 0 },
    { skippedCount: 1 },
    { retryCount: -1 },
    { outcome: 'skipped' },
    { retryCount: 1 },
    { runAt: 'unknown' },
    { runAt: new Date(NOW + DAY).toISOString() },
  ])
    assert.throws(() => apply(ledger(), report([observation(1, extra)])));
  assert.throws(() =>
    apply(ledger(), report([observation(1, { outcome: 'flaky' })]))
  );
});
test('changed test contents and missing checkout cannot silently release', () => {
  const rows = Array.from({ length: 50 }, (_, i) => observation(i + 1));
  assert.equal(
    apply(
      ledger([entry()]),
      report(rows),
      {},
      { fileHash: () => 'c'.repeat(64) }
    ).released.length,
    0
  );
  assert.throws(
    () => apply(ledger([entry()]), report(rows), {}, { fileHash: () => null }),
    /missing from checkout/
  );
});
test('50 distinct clean executions and seven stable days release an auto entry', () => {
  const result = apply(
    ledger([entry()]),
    report(Array.from({ length: 50 }, (_, i) => observation(i + 1)))
  );
  assert.deepEqual(result.released, [FILE]);
  assert.equal(result.ledger.entries.length, 0);
});
test('replaying a report never accumulates clean windows', () => {
  const r = report([observation(1)]);
  let l = ledger([entry()]);
  for (let i = 0; i < 60; i++) l = apply(l, r).ledger;
  assert.equal(l.entries[0].consecutiveSuccesses, 1);
});
test('a recent failure or insufficient cooldown preserves quarantine', () => {
  const rows = Array.from({ length: 50 }, (_, i) => observation(i + 1));
  assert.equal(
    apply(
      ledger([entry({ lastSeenFlakyAt: new Date(NOW - DAY).toISOString() })]),
      report(rows)
    ).released.length,
    0
  );
  const recurrence = observation(99, {
    outcome: 'failed',
    runAt: new Date(NOW - 10 * 60000).toISOString(),
  });
  const result = apply(ledger([entry()]), report([...rows, recurrence]));
  assert.equal(result.released.length, 0);
  assert.equal(result.ledger.entries[0].consecutiveSuccesses, 0);
});
test('manual entries remain under their original owner', () => {
  const original = entry({ autoManaged: false });
  assert.deepEqual(
    apply(
      ledger([original]),
      report(Array.from({ length: 50 }, (_, i) => observation(i + 1)))
    ).ledger.entries[0],
    original
  );
});
test('malformed ledgers, issue maps and exhausted retry budgets refuse mutation', () => {
  for (const l of [
    null,
    {},
    ledger([null]),
    ledger([entry({ path: '../example.test.ts' })]),
    ledger([entry(), entry()]),
    ledger([entry({ fixIssueUrl: 'http://bad' })]),
    { ...ledger(), retryBudget: {} },
  ])
    assert.throws(() => apply(l, report()));
  assert.throws(() => apply(ledger(), report(), []), /issue map/);
  const l = ledger();
  l.retryBudget.maxRetryAttemptsPerCiRun = 6;
  assert.throws(() => apply(l, report(flakes())), /budget exceeded/);
  assert.equal(l.entries.length, 0);
});
test('e2e paths are canonical and traversal, absolute paths and separators fail', () => {
  assert.deepEqual(mapToLedgerPath('tests/e2e/a.spec.ts'), {
    kind: 'e2e',
    path: 'apps/web/tests/e2e/a.spec.ts',
  });
  for (const file of [
    '/tests/a.test.ts',
    './tests/a.test.ts',
    'tests/../a.test.ts',
    'tests//a.test.ts',
    'tests\\a.test.ts',
    'notes.md',
    null,
  ])
    assert.equal(mapToLedgerPath(file), null);
  const f = 'apps/web/tests/e2e/a.spec.ts';
  const result = apply(ledger(), report(flakes({ file: f })), { [f]: ISSUE });
  assert.equal(result.ledger.entries[0].kind, 'e2e');
  assert.match(
    result.ledger.entries[0].reproductionCommand,
    /tests\/e2e\/a.spec.ts/
  );
});
test('CLI verifies canonical ledger and writes the qualified result', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quarantine-write-'));
  try {
    execFileSync('git', ['init', '-q', root]);
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.com',
        'commit',
        '--allow-empty',
        '-qm',
        'fixture',
      ],
      { cwd: root }
    );
    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    fs.mkdirSync(path.join(root, path.dirname(FILE)), { recursive: true });
    fs.writeFileSync(path.join(root, FILE), 'test source');
    const fileHash = require('node:crypto')
      .createHash('sha256')
      .update('test source')
      .digest('hex');
    const r = { ...report(flakes({ fileHash })), headSha };
    fs.writeFileSync(
      path.join(root, 'apps/web/tests/quarantine.json'),
      JSON.stringify(ledger())
    );
    fs.writeFileSync(
      path.join(root, 'quarantine-evidence.json'),
      JSON.stringify(r)
    );
    fs.writeFileSync(
      path.join(root, 'flake-issues.json'),
      JSON.stringify({ [FILE]: ISSUE })
    );
    const result = processQuarantine({ root, now: NOW });
    assert.equal(result.updated, true);
    assert.equal(
      JSON.parse(
        fs.readFileSync(path.join(root, 'apps/web/tests/quarantine.json'))
      ).entries.length,
      1
    );
    assert.equal(processQuarantine({ root, now: NOW }).updated, false);
    fs.writeFileSync(path.join(root, 'quarantine-evidence.json'), '{');
    const before = fs.readFileSync(
      path.join(root, 'apps/web/tests/quarantine.json'),
      'utf8'
    );
    assert.throws(() => processQuarantine({ root, now: NOW }));
    assert.equal(
      fs.readFileSync(
        path.join(root, 'apps/web/tests/quarantine.json'),
        'utf8'
      ),
      before
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
