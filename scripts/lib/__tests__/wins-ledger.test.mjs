import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { load } from 'js-yaml';
import {
  clusters,
  dueMeasurements,
  holds,
  metricDelta,
  notifyLine,
  parseWinSection,
  readLedger,
  requiredWinErrors,
  requiresWin,
  validateLedger,
  validateWin,
  weeklyMetrics,
  weeklyRollup,
  winFromPr,
  winSectionErrors,
  winStatus,
} from '../wins-ledger.mjs';

const base = () => ({
  schema: 'jovie.win/v1',
  id: 'win-2026-10-29-x',
  date: '2026-10-29',
  area: 'queue',
  theme: 't',
  claim: 'Faster gate',
  prs: [{ repo: 'a/b', number: 1, mergedAt: '2026-10-29T00:00:00Z' }],
  metrics: [
    {
      name: 'wait',
      unit: 's',
      better: 'lower',
      before: 100,
      after: 10,
      source: 'gh',
      query: 'q',
    },
  ],
  verifyLink: 'https://example.com',
  receipts: [],
});

test('the committed ledger is valid and ids are unique', () => {
  assert.deepEqual(validateLedger(readLedger()), []);
});

test('status: claimed until a post-merge receipt keeps the gain', () => {
  const w = base();
  assert.equal(winStatus(w), 'claimed');
  w.receipts = [
    { metric: 'wait', value: 12, at: '2026-10-30T00:00:00Z', evidence: 'e' },
  ];
  assert.equal(winStatus(w), 'verified');
  w.receipts[0].value = 90;
  assert.equal(winStatus(w), 'not-reproduced');
  w.receipts[0].at = '2026-10-28T00:00:00Z'; // before merge: ignored
  assert.equal(winStatus(w), 'claimed');
});

test('status: open PR is pending-merge, no numbers is unverified', () => {
  const w = base();
  w.prs[0].mergedAt = null;
  assert.equal(winStatus(w), 'pending-merge');
  const n = base();
  n.metrics = [];
  assert.equal(winStatus(n), 'unverified');
});

test('holds: unclaimed after needs 20% gain', () => {
  const m = { before: 141, after: null, better: 'lower' };
  assert.equal(holds(m, 116.5), false);
  assert.equal(holds(m, 100), true);
});

test('validation rejects missing source, bad area and empty prs', () => {
  const w = base();
  w.area = 'nope';
  w.prs = [];
  w.metrics[0].source = '';
  const p = validateWin(w);
  assert.ok(p.some(x => x.startsWith('area')));
  assert.ok(p.some(x => x.startsWith('prs')));
  assert.ok(p.some(x => x.includes('source')));
});

const body = `## Win
- Claim: Gate jobs start 10x sooner
- Area: queue
- Theme: merge-throughput
- Metric: gate wait p50 | s | lower | 141 | 3 | gh jobs api | gh api actions/runs/ID/jobs
- Verify: https://github.com/JovieInc/Jovie/pull/1

## Other`;

test('PR Win section parses into a ledger record', () => {
  const win = winFromPr(
    { repo: 'JovieInc/Jovie', number: 9, mergedAt: '2026-10-29T10:00:00Z' },
    parseWinSection(body)
  );
  assert.equal(win.id, 'win-2026-10-29-gate-jobs-start-10x-sooner');
  assert.equal(win.metrics[0].before, 141);
  assert.deepEqual(validateWin(win), []);
  assert.deepEqual(winSectionErrors(body), []);
});

test('n/a declines; malformed section errors; absent is silent', () => {
  assert.equal(parseWinSection('## Win\nn/a\n').declined, true);
  assert.deepEqual(winSectionErrors('## Summary\nx'), []);
  assert.ok(winSectionErrors('## Win\n- Claim: only a claim\n').length > 0);
});

// Execute the committed workflow shells and real ledger CLI with real Git.
// Only the remote API, push, and origin emitter are local fixtures: no network
// or credentials are available to this replay.
function ingestWorkflow(mode) {
  const root = resolve(import.meta.dirname, '../../..');
  const dir = mkdtempSync(join(tmpdir(), 'wins-workflow-'));
  const workflow =
    /** @type {{ jobs: { ingest: { steps: { name: string, run?: string }[] } } }} */ (
      load(
        readFileSync(join(root, '.github/workflows/wins-ledger.yml'), 'utf8')
      )
    );
  const env = {
    PATH: `${dir}/bin:${process.env.PATH}`,
    NODE_OPTIONS: '--v8-pool-size=1',
    UV_THREADPOOL_SIZE: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    PR_NUMBER: '23835',
    GH_TOKEN: 'fixture',
  };
  const run = (command, args = []) => {
    const result = spawnSync(command, args, {
      cwd: dir,
      env,
      encoding: 'utf8',
      timeout: 15_000,
    });
    assert.ifError(result.error);
    return result;
  };
  const initialMetrics = '{"at":"2026-10-29T00:00:00Z"}\n';
  const prBody =
    mode === 'new' || mode === 'duplicate'
      ? body
      : mode === 'declined'
        ? '## Win\nn/a\n'
        : 'Refs JOV-6783.\n\nAppends the Win section of #23830 to canon/wins/wins.jsonl. Status starts as claimed; it becomes verified only when a post-deploy receipt keeps the gain.';
  const win = winFromPr(
    {
      repo: 'JovieInc/Jovie',
      number: 23835,
      mergedAt: '2026-10-29T10:00:00Z',
    },
    parseWinSection(body)
  );
  const initialLedger = `# fixture ledger\n${
    mode === 'duplicate'
      ? `${JSON.stringify(win)}\n`
      : mode === 'invalid'
        ? `${JSON.stringify({ ...win, id: 'invalid' })}\n`
        : ''
  }`;
  try {
    for (const path of [
      'bin',
      'scripts/lib',
      'packages/api-client',
      'canon/wins',
      'docs/metrics',
    ])
      mkdirSync(join(dir, path), { recursive: true });
    for (const path of [
      'scripts/wins-ledger.mjs',
      'scripts/lib/wins-ledger.mjs',
      'scripts/lib/format-biome-json.mjs',
    ])
      cpSync(join(root, path), join(dir, path));
    writeFileSync(join(dir, 'canon/wins/wins.jsonl'), initialLedger);
    for (const name of ['wins-latest.json', 'wins-weekly.json'])
      writeFileSync(join(dir, 'docs/metrics', name), initialMetrics);
    writeFileSync(
      join(dir, 'packages/api-client/gh.ts'),
      `export async function runGh(args) {
        if (args[0] === 'api' && args[1] === 'repos/JovieInc/Jovie/pulls/23835')
          return {code: 0, stdout: ${JSON.stringify(JSON.stringify({ body: prBody, merged_at: '2026-10-29T10:00:00Z' }))}};
        if (args[0] === 'pr' && args[1] === 'list')
          return {code: 0, stdout: '[]'};
        throw new Error('Unexpected remote read: ' + JSON.stringify(args));
      }`
    );
    writeFileSync(
      join(dir, 'packages/api-client/cli.ts'),
      'console.log(23839);'
    );
    const realGit = run('bash', ['-c', 'command -v git']).stdout.trim();
    assert.equal(run(realGit, ['init', '-q']).status, 0);
    for (const [key, value] of [
      ['user.name', 'Fixture'],
      ['user.email', 'fixture@example.invalid'],
      ['commit.gpgsign', 'false'],
      ['core.hooksPath', '/dev/null'],
    ])
      assert.equal(run(realGit, ['config', key, value]).status, 0);
    assert.equal(run(realGit, ['add', 'canon', 'docs']).status, 0);
    assert.equal(run(realGit, ['commit', '-qm', 'fixture']).status, 0);
    assert.equal(run(realGit, ['remote', 'add', 'origin', dir]).status, 0);
    const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
    const stub = (name, script) =>
      writeFileSync(join(dir, 'bin', name), `#!/bin/bash\n${script}\n`, {
        mode: 0o755,
      });
    stub(
      'node',
      `printf '%s\\n' "node $*" >> calls\nexec ${shellQuote(process.execPath)} "$@"`
    );
    stub(
      'git',
      `if [ "$1" = push ]; then echo push >> calls; exit 0; fi\nexec ${shellQuote(realGit)} -c core.preloadIndex=false -c index.threads=1 "$@"`
    );
    stub('python3', 'echo origin-emitter >> calls');
    let result;
    for (const name of ['Ingest the Win section', 'Open ledger PR']) {
      const step = workflow.jobs.ingest.steps.find(step => step.name === name);
      assert.ok(step?.run, `missing workflow step ${name}`);
      const script = step.run
        .replaceAll('${{ github.run_id }}', '123')
        .replaceAll('${{ github.repository }}', 'JovieInc/Jovie');
      assert.equal(script.includes('${{'), false);
      result = run('bash', ['-c', script]);
      if (result.status !== 0) break;
    }
    return {
      status: result.status,
      stderr: result.stderr,
      calls: readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n'),
      ledger: readFileSync(join(dir, 'canon/wins/wins.jsonl'), 'utf8'),
      metrics: ['wins-latest.json', 'wins-weekly.json'].map(name =>
        readFileSync(join(dir, 'docs/metrics', name), 'utf8')
      ),
      initialLedger,
      initialMetrics,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const mode of ['absent', 'duplicate', 'declined']) {
  test(`workflow leaves metrics unchanged and opens no PR for ${mode} win`, () => {
    const result = ingestWorkflow(mode);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.calls, [
      'node scripts/wins-ledger.mjs ingest --pr 23835',
      'node scripts/wins-ledger.mjs validate',
    ]);
    assert.equal(result.ledger, result.initialLedger);
    assert.deepEqual(result.metrics, Array(2).fill(result.initialMetrics));
  });
}

test('workflow still derives, notifies and opens a PR for a new valid win', () => {
  const result = ingestWorkflow('new');
  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(result.ledger, result.initialLedger);
  assert.equal(JSON.parse(result.metrics[0]).winsTotal, 1);
  assert.notEqual(result.metrics[1], result.initialMetrics);
  assert.deepEqual(result.calls.slice(0, 6), [
    'node scripts/wins-ledger.mjs ingest --pr 23835',
    'node scripts/wins-ledger.mjs validate',
    'node scripts/wins-ledger.mjs summary --write',
    'node scripts/wins-ledger.mjs rollup --write',
    'node scripts/wins-ledger.mjs notify',
    'push',
  ]);
  assert.ok(result.calls.some(call => call.includes('-- pr create --repo')));
  assert.equal(result.calls.at(-1), 'origin-emitter');
});

test('workflow blocks an invalid unchanged ledger before deriving or publishing', () => {
  const result = ingestWorkflow('invalid');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /id must look like/);
  assert.deepEqual(result.calls, [
    'node scripts/wins-ledger.mjs ingest --pr 23835',
    'node scripts/wins-ledger.mjs validate',
  ]);
  assert.equal(result.ledger, result.initialLedger);
  assert.deepEqual(result.metrics, Array(2).fill(result.initialMetrics));
});

test('clusters trigger at ten verified wins only', () => {
  const wins = Array.from({ length: 10 }, (_, i) => {
    const w = base();
    w.id = `win-2026-10-29-w${i}`;
    w.receipts = [
      { metric: 'wait', value: 12, at: '2026-10-30T00:00:00Z', evidence: 'e' },
    ];
    return w;
  });
  assert.equal(clusters(wins)[0].ready, true);
  assert.equal(clusters(wins.slice(1))[0].ready, false);
  assert.equal(weeklyMetrics(wins).winsVerified, 10);
});

const merged = '2026-10-20T00:00:00Z';
const sample = (over = {}) => ({
  schema: 'jovie.win/v1',
  id: 'win-2026-10-20-sample',
  date: '2026-10-20',
  area: 'ci',
  theme: 'merge-throughput',
  claim: 'Sample',
  prs: [{ repo: 'a/b', number: 1, mergedAt: merged }],
  metrics: [
    {
      name: 'wait',
      unit: 's',
      better: 'lower',
      before: 120,
      after: 3,
      perMerge: true,
      source: 'x run',
      query: 'q query',
    },
  ],
  verifyLink: 'https://example.com/run',
  receipts: [],
  ...over,
});

test('compounding label and ci/perf titles require a win; others do not', () => {
  assert.equal(
    requiresWin({ title: 'feat(x): y', labels: ['compounding'] }),
    true
  );
  assert.equal(
    requiresWin({ title: 'ci(queue): run on hosted', labels: [] }),
    true
  );
  assert.equal(requiresWin({ title: 'perf: faster', labels: [] }), true);
  assert.equal(requiresWin({ title: 'fix(billing): copy', labels: [] }), false);
});

test('a required win prints the paste-ready template; n/a does not satisfy it', () => {
  const errs = requiredWinErrors({
    title: 'ci: x',
    labels: [],
    body: '## Win\n\nn/a',
  });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /- Metric: <name>/);
  assert.deepEqual(
    requiredWinErrors({
      title: 'ci: x',
      labels: [],
      body: '## Win\n- Claim: Faster\n- Area: ci\n- Theme: merge-throughput\n- Metric: wait | s | lower | 120 | 3 | run | q\n- Verify: https://example.com/r',
    }),
    []
  );
});

test('an empty after-value needs Pending: yes and becomes pending-measure', () => {
  const body = pending =>
    `## Win\n- Claim: Faster\n- Area: ci\n- Theme: merge-throughput\n- Metric: wait | s | lower | 120 | ? | run | q query\n- Verify: https://example.com/r${pending ? '\n- Pending: yes' : ''}`;
  assert.ok(winSectionErrors(body(false)).some(e => /Pending: yes/.test(e)));
  assert.deepEqual(winSectionErrors(body(true)), []);
  const win = sample({
    pendingAfter: true,
    metrics: [{ ...sample().metrics[0], after: null }],
  });
  assert.equal(winStatus(win), 'pending-measure');
  assert.equal(
    dueMeasurements([win], Date.parse(merged) + 25 * 3_600_000).length,
    1
  );
  assert.equal(
    dueMeasurements([win], Date.parse(merged) + 3_600_000).length,
    0
  );
});

test('delta, notification and weekly rollup', () => {
  assert.deepEqual(metricDelta(sample().metrics[0]), {
    delta: -117,
    gain: 117,
    gainPct: 97.5,
  });
  assert.equal(notifyLine(sample()), null, 'claimed wins never message');
  const verified = sample({
    receipts: [
      {
        metric: 'wait',
        value: 5,
        at: '2026-10-21T00:00:00Z',
        evidence: 'https://example.com/run/2',
      },
    ],
  });
  assert.match(notifyLine(verified), /^Win \(verified\):/);
  const [row] = weeklyRollup(
    [verified],
    [
      { createdAt: '2026-10-19T00:00:00Z', mergedAt: '2026-10-20T00:00:00Z' },
      { createdAt: '2026-10-20T00:00:00Z', mergedAt: '2026-10-20T06:00:00Z' },
    ]
  );
  assert.equal(row.week, '2026-10-19');
  assert.equal(row.verified, 1);
  assert.equal(row.secondsSavedPerMergeVerified, 117);
  assert.equal(row.mergedPrs, 2);
  assert.equal(row.leadTimeHoursP50, 6);
});
