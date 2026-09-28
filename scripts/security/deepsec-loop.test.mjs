import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ABSENT_SCANS_TO_CLOSE,
  admitRun,
  applyRun,
  applySuppressions,
  canStartChunk,
  collectRun,
  emptyLedger,
  estimateChunkUsd,
  fingerprint,
  formatIssue,
  frontierModels,
  groupFindings,
  harnessModel,
  hasScannedModel,
  isSensitivePath,
  monthKey,
  monthSpend,
  orderCandidates,
  parseLedger,
  pendingFrontierModels,
  planReconciliation,
  priceFor,
  readMarker,
  redact,
  renderSummary,
  resolveCaps,
  seedLedger,
  selectSensitiveFiles,
  shortHash,
  slugFamily,
  summarizeUsage,
  usageCost,
  validateSuppressions,
  verificationTargets,
  writeMarker,
} from './deepsec-loop.mjs';

const BENCH = [
  {
    modelId: 'openai/gpt-6-sol',
    model: 'gpt-6-sol',
    harness: 'codex',
    reasoning: 'xhigh',
    score: 40,
  },
  {
    modelId: 'openai/gpt-6-sol',
    model: 'gpt-6-sol',
    harness: 'codex',
    reasoning: 'medium',
    score: 29,
  },
  {
    modelId: 'openai/gpt-6-astra',
    model: 'gpt-6-astra',
    harness: 'codex',
    reasoning: 'xhigh',
    score: 37,
  },
  {
    modelId: 'anthropic/claude-opus-5',
    model: 'claude-opus-5',
    harness: 'claude',
    reasoning: 'max',
    score: 32,
  },
  {
    modelId: 'zai/glm-5.3',
    model: 'glm-5.3',
    harness: 'pi',
    reasoning: 'high',
    score: 21,
  },
  { modelId: 'broken', harness: 'pi' },
];
const BILLING = {
  monthlyCapUsd: 200,
  runCapUsd: { pr: 2, weekly: 15, frontier: 75 },
  minRunUsd: 0.25,
};

test('maps DeepSecBench rows to harness model names like deepsec does', () => {
  assert.deepEqual(harnessModel(BENCH[3]), {
    gatewayId: 'anthropic/claude-opus-5',
    agent: 'claude',
    model: 'claude-opus-5',
    reasoning: 'xhigh',
  });
  assert.equal(harnessModel(BENCH[4]).model, 'zai/glm-5.3');
  assert.equal(harnessModel(BENCH[0]).reasoning, 'xhigh');
  assert.equal(harnessModel({ modelId: 'x' }), null);
  assert.equal(harnessModel(null), null);
});

test('frontier models are the best config of each top-N distinct model', () => {
  const top = frontierModels(BENCH, 3);
  assert.deepEqual(
    top.map(model => `${model.gatewayId}@${model.reasoning}`),
    [
      'openai/gpt-6-sol@xhigh',
      'openai/gpt-6-astra@xhigh',
      'anthropic/claude-opus-5@xhigh',
    ]
  );
  assert.deepEqual(frontierModels(undefined, 3), []);
});

test('ledger scans each frontier model exactly once, even when the budget cut it short', () => {
  let ledger = parseLedger('');
  assert.deepEqual(ledger, emptyLedger());
  assert.equal(
    pendingFrontierModels(BENCH, ledger, 3)[0].gatewayId,
    'openai/gpt-6-sol'
  );
  ledger = applyRun(ledger, {
    kind: 'frontier',
    gatewayId: 'openai/gpt-6-sol',
    headSha: 'abc',
    status: 'partial-budget',
    costUsd: 74.5,
    filesAnalyzed: 600,
    finishedAt: '2026-09-27T01:00:00Z',
  });
  assert.equal(hasScannedModel(ledger, 'openai/gpt-6-sol'), true);
  assert.equal(ledger.models['openai/gpt-6-sol'].status, 'partial-budget');
  assert.deepEqual(
    pendingFrontierModels(BENCH, ledger, 3).map(model => model.gatewayId),
    ['openai/gpt-6-astra', 'anthropic/claude-opus-5']
  );
  // A new model entering the top N is the next pending one.
  const released = [
    {
      modelId: 'openai/gpt-7',
      model: 'gpt-7',
      harness: 'codex',
      reasoning: 'xhigh',
      score: 50,
    },
    ...BENCH,
  ];
  assert.equal(
    pendingFrontierModels(released, ledger, 3)[0].gatewayId,
    'openai/gpt-7'
  );
  assert.deepEqual(parseLedger(JSON.stringify(ledger)), ledger);
});

test('ledger accumulates monthly spend for every run kind and bounds history', () => {
  let ledger = emptyLedger();
  for (let i = 0; i < 205; i++)
    ledger = applyRun(ledger, {
      kind: 'pr',
      gatewayId: 'openai/gpt-6-luna',
      costUsd: 0.01,
      status: 'complete',
      finishedAt: '2026-09-27T01:00:00Z',
    });
  ledger = applyRun(ledger, {
    kind: 'weekly',
    costUsd: 3,
    finishedAt: '2026-10-01T00:00:00Z',
  });
  assert.equal(monthSpend(ledger, '2026-09'), 2.05);
  assert.equal(monthSpend(ledger, '2026-10'), 3);
  assert.equal(monthSpend(ledger, '2026-11'), 0);
  assert.equal(ledger.runs.length, 200);
  assert.deepEqual(ledger.models, {});
  assert.equal(monthKey('2026-09-30T23:59:59Z'), '2026-09');
});

test('seeding marks existing models known without spend, except the baseline model', () => {
  const seeded = seedLedger(
    emptyLedger(),
    frontierModels(BENCH, 3),
    'now',
    'openai/gpt-6-sol'
  );
  assert.equal(hasScannedModel(seeded, 'openai/gpt-6-sol'), false);
  assert.equal(seeded.models['openai/gpt-6-astra'].status, 'seeded-skip');
  const again = seedLedger(
    {
      ...seeded,
      models: {
        ...seeded.models,
        'openai/gpt-6-astra': { status: 'complete' },
      },
    },
    [null, harnessModel(BENCH[2])],
    'later'
  );
  assert.equal(again.models['openai/gpt-6-astra'].status, 'complete');
});

test('rejects a ledger with an unknown shape', () => {
  assert.throws(() => parseLedger('{"schemaVersion":2}'), /unsupported shape/);
  assert.throws(
    () => parseLedger('{"schemaVersion":1,"models":{},"spend":{}}'),
    /unsupported shape/
  );
});

test('environment caps may lower but never raise the reviewed policy caps', () => {
  const caps = resolveCaps(BILLING, {
    DEEPSEC_MONTHLY_CAP_USD: '50',
    DEEPSEC_PR_RUN_CAP_USD: '9',
    DEEPSEC_WEEKLY_RUN_CAP_USD: 'nope',
    DEEPSEC_FRONTIER_RUN_CAP_USD: '',
  });
  assert.deepEqual(caps, {
    monthlyCapUsd: 50,
    runCapUsd: { pr: 2, weekly: 15, frontier: 75 },
    minRunUsd: 0.25,
  });
  assert.equal(resolveCaps(BILLING).monthlyCapUsd, 200);
  assert.equal(
    resolveCaps(BILLING, { DEEPSEC_PR_RUN_CAP_USD: '-1' }).runCapUsd.pr,
    2
  );
  assert.equal(
    resolveCaps(BILLING, { DEEPSEC_PR_RUN_CAP_USD: '0' }).runCapUsd.pr,
    0
  );
});

test('budget admission clamps to the month remainder and fails closed when exhausted', () => {
  const caps = resolveCaps(BILLING);
  assert.deepEqual(admitRun({ kind: 'frontier', caps, monthSpentUsd: 10 }), {
    admit: true,
    capUsd: 75,
    reason: 'run cap $75.00',
  });
  assert.equal(
    admitRun({ kind: 'frontier', caps, monthSpentUsd: 180 }).capUsd,
    20
  );
  const exhausted = admitRun({ kind: 'pr', caps, monthSpentUsd: 199.9 });
  assert.equal(exhausted.admit, false);
  assert.equal(exhausted.capUsd, 0);
  assert.match(
    exhausted.reason,
    /monthly budget exhausted: \$199\.90 of \$200\.00/
  );
  assert.equal(
    admitRun({
      kind: 'pr',
      caps: resolveCaps(BILLING, { DEEPSEC_PR_RUN_CAP_USD: '0' }),
      monthSpentUsd: 0,
    }).admit,
    false
  );
});

test('chunks start only while the largest measured chunk still fits under the cap', () => {
  assert.equal(
    canStartChunk({ spentUsd: 0, capUsd: 2, largestChunkUsd: 0 }),
    true
  );
  assert.equal(
    canStartChunk({ spentUsd: 1.5, capUsd: 2, largestChunkUsd: 0.5 }),
    true
  );
  assert.equal(
    canStartChunk({ spentUsd: 1.6, capUsd: 2, largestChunkUsd: 0.5 }),
    false
  );
});

test('prices tokens at gateway list price and fails closed on unknown models', () => {
  const models = {
    data: [
      {
        id: 'openai/gpt-6-luna',
        pricing: {
          input: '0.0000001',
          output: '0.0000005',
          input_cache_read: '0.00000001',
          input_cache_write: '0.000000125',
        },
      },
      { id: 'x/no-cache', pricing: { input: '0.000002', output: '0.00001' } },
      { id: 'x/free-text', pricing: { input: 'n/a', output: '1' } },
    ],
  };
  const luna = priceFor(models, 'openai/gpt-6-luna');
  assert.equal(priceFor(models, 'missing/model'), null);
  assert.equal(priceFor(models, 'x/free-text'), null);
  assert.equal(priceFor(undefined, 'x'), null);
  assert.equal(priceFor(models, 'x/no-cache').cacheRead, 0.000002);
  const usage = {
    inputTokens: 41040,
    outputTokens: 1252,
    cacheReadInputTokens: 104448,
    cacheCreationInputTokens: 0,
  };
  assert.ok(Math.abs(usageCost(usage, luna) - 0.00577448) < 1e-9);
  assert.equal(usageCost({}, luna), 0);
  assert.equal(summarizeUsage([{ usage }], luna, 2).costUsd, 0.0115);
  assert.equal(
    summarizeUsage(
      [{ usage: { inputTokens: 0.4 } }, { usage: { inputTokens: 0.4 } }],
      luna
    ).inputTokens,
    1
  );
  // 20 luna files at the 1.75 safety factor ~ the $0.41 measured on 2026-09-27.
  assert.ok(Math.abs(estimateChunkUsd(luna, 20, 1.75) - 0.413) < 0.001);
  assert.equal(estimateChunkUsd(luna, 0), 0);
  const summary = summarizeUsage([{ usage }, { usage }, {}], luna);
  assert.deepEqual(summary, {
    analyses: 3,
    inputTokens: 82080,
    outputTokens: 2504,
    cacheReadTokens: 208896,
    costUsd: 0.0115,
  });
});

test('PR scans cover only auth/billing/security-sensitive source, capped and sorted', () => {
  const changed = [
    'apps/web/lib/auth/require-auth.ts',
    'apps/web/lib/auth/require-auth.test.ts',
    'apps/web/app/api/stripe/webhooks/route.ts',
    'apps/web/app/(dashboard)/settings/actions.ts',
    'apps/web/components/Button.tsx',
    'apps/web/lib/entitlements/__tests__/x.ts',
    '.github/workflows/ci.yml',
    'apps/web/proxy.ts',
    'apps/web/lib/auth/README.md',
    'packages/auth-core/src/index.ts',
    'apps/web/proxy.ts',
  ];
  const { files, deferred } = selectSensitiveFiles(changed, 4);
  assert.deepEqual(files, [
    '.github/workflows/ci.yml',
    'apps/web/app/(dashboard)/settings/actions.ts',
    'apps/web/app/api/stripe/webhooks/route.ts',
    'apps/web/lib/auth/require-auth.ts',
  ]);
  assert.deepEqual(deferred, [
    'apps/web/proxy.ts',
    'packages/auth-core/src/index.ts',
  ]);
  assert.equal(isSensitivePath('apps/web/components/Button.tsx'), false);
});

test('fingerprints ignore line drift and LLM-invented other-* topics', () => {
  assert.equal(slugFamily('other-timing-leak'), 'other');
  assert.equal(slugFamily(undefined), 'other');
  assert.equal(slugFamily('auth-bypass'), 'auth-bypass');
  const a = fingerprint('apps/web/lib/auth/cached.ts', 'other-foo');
  assert.equal(a, fingerprint('apps/web/lib/auth/cached.ts', 'other-bar'));
  assert.notEqual(a, fingerprint('apps/web/lib/auth/cached.ts', 'auth-bypass'));
  assert.notEqual(a, fingerprint('apps/web/lib/auth/other.ts', 'other-foo'));
  assert.match(a, /^dsec-[0-9a-f]{12}$/);
});

const finding = (over = {}) => ({
  severity: 'HIGH',
  vulnSlug: 'auth-bypass',
  title: 'Session check skipped',
  description: 'desc',
  recommendation: 'fix',
  confidence: 'high',
  lineNumbers: [10, 12],
  producedByRunId: 'r1',
  ...over,
});

test('collects only this run’s findings and analyzed files, dropping revalidated noise', () => {
  const records = [
    {
      filePath: 'a.ts',
      analysisHistory: [
        { runId: 'old', model: 'gpt-6-sol' },
        { runId: 'r1', model: 'gpt-6-luna' },
      ],
      findings: [
        finding(),
        finding({ producedByRunId: 'old', title: 'stale' }),
        finding({ title: 'fp', revalidation: { verdict: 'false-positive' } }),
        finding({ title: 'fixed', revalidation: { verdict: 'fixed' } }),
        finding({
          title: 'weird',
          severity: 'SEVERE',
          producedByRunId: undefined,
          lineNumbers: undefined,
        }),
      ],
    },
    {
      filePath: 'b.ts',
      analysisHistory: [{ runId: 'old', model: 'gpt-6-sol' }],
      findings: [finding()],
    },
    { filePath: 'c.ts', findings: [] },
  ];
  const modelOf = entry => `openai/${entry.model}`;
  const { analyzed, findings } = collectRun(records, ['r1'], modelOf);
  assert.deepEqual(analyzed, [
    { path: 'a.ts', gatewayId: 'openai/gpt-6-luna' },
  ]);
  assert.deepEqual(
    findings.map(item => [
      item.title,
      item.severity,
      item.gatewayId,
      item.lines,
    ]),
    [
      ['Session check skipped', 'HIGH', 'openai/gpt-6-luna', [10, 12]],
      ['weird', 'LOW', 'openai/gpt-6-luna', []],
    ]
  );
});

const normalized = (over = {}) => ({
  path: 'apps/web/lib/auth/cached.ts',
  severity: 'MEDIUM',
  slug: 'auth-bypass',
  title: 'Cache key omits user',
  description: 'The session cache is keyed by cookie only.',
  recommendation: 'Include the user id.',
  confidence: 'high',
  lines: [4, 9],
  gatewayId: 'openai/gpt-6-sol',
  ...over,
});

test('groups findings by fingerprint at the worst severity, worst first', () => {
  const groups = groupFindings([
    normalized({ path: 'z.ts', severity: 'LOW' }),
    normalized(),
    normalized({ severity: 'CRITICAL', title: 'Worse', lines: [20] }),
    normalized({ slug: 'other-x', severity: 'HIGH' }),
    normalized({ slug: 'other-y', severity: 'BUG' }),
  ]);
  assert.deepEqual(
    groups.map(group => [
      group.path,
      group.slug,
      group.severity,
      group.findings.length,
    ]),
    [
      ['apps/web/lib/auth/cached.ts', 'auth-bypass', 'CRITICAL', 2],
      ['apps/web/lib/auth/cached.ts', 'other', 'HIGH', 2],
      ['z.ts', 'auth-bypass', 'LOW', 1],
    ]
  );
  assert.equal(groups[0].findings[0].title, 'Worse');
});

test('suppressions need a reason, owner and review date, and surface when review is due', () => {
  const fp = fingerprint('a.ts', 'xss');
  const entry = {
    fingerprint: fp,
    path: 'a.ts',
    reason: 'Escaped by React; no raw HTML sink here.',
    owner: 'security',
    reviewBy: '2026-10-27',
  };
  assert.deepEqual(
    validateSuppressions({ schemaVersion: 1, suppressions: [entry] }),
    [entry]
  );
  assert.throws(
    () => validateSuppressions({ suppressions: [] }),
    /schemaVersion/
  );
  for (const bad of [
    { ...entry, reason: 'fp' },
    { ...entry, reviewBy: 'soon' },
    { ...entry, fingerprint: 'x' },
    { ...entry, owner: 1 },
    { ...entry, path: null },
    null,
  ])
    assert.throws(
      () => validateSuppressions({ schemaVersion: 1, suppressions: [bad] }),
      /needs fingerprint/
    );
  const groups = groupFindings([
    normalized({ path: 'a.ts', slug: 'xss' }),
    normalized(),
  ]);
  const early = applySuppressions(groups, [entry], '2026-10-01T00:00:00Z');
  assert.equal(early.kept.length, 1);
  assert.equal(early.suppressed[0].fingerprint, fp);
  assert.deepEqual(early.reviewDue, []);
  assert.deepEqual(
    applySuppressions(groups, [entry], '2026-10-27T00:00:00Z').reviewDue,
    [entry]
  );
});

test('markers round-trip and rewrite only the marker line', () => {
  assert.equal(readMarker('no marker'), null);
  assert.equal(readMarker(undefined), null);
  assert.equal(readMarker('<!-- deepsec-loop:{broken -->'), null);
  assert.equal(readMarker('<!-- deepsec-loop:{"fp":1}'), null);
  const first = writeMarker('Body\n\nhuman note', { fp: 'dsec-1', absent: 0 });
  assert.deepEqual(readMarker(first), { fp: 'dsec-1', absent: 0 });
  const second = writeMarker(`${first}\nagent workpad`, {
    fp: 'dsec-1',
    absent: 1,
  });
  assert.deepEqual(readMarker(second), { fp: 'dsec-1', absent: 1 });
  assert.match(second, /human note/);
  assert.match(second, /agent workpad/);
  assert.equal(second.match(/deepsec-loop:/g).length, 1);
  assert.match(writeMarker(undefined, { fp: 'x' }), /^\n\n<!-- deepsec-loop:/);
});

const CTX = {
  kind: 'weekly',
  headSha: '0123456789abcdef',
  runUrl: 'https://github.com/run/1',
};

test('formats critical/high issues for the guarded lane with evidence, lines and fix', () => {
  const [group] = groupFindings([
    normalized({
      severity: 'CRITICAL',
      description: 'Leaks vck_abcdefghijklmnop to logs',
      title: 'x'.repeat(200),
    }),
    normalized({ lines: [], recommendation: undefined, confidence: undefined }),
  ]);
  const issue = formatIssue(group, CTX);
  assert.match(
    issue.title,
    /^\[security\]\[CRITICAL\] x+… \(dsec-[0-9a-f]{12}\)$/
  );
  assert.ok(issue.title.length <= 131);
  assert.equal(issue.priority, 1);
  assert.equal(issue.guarded, true);
  assert.deepEqual(issue.labels, [
    'security',
    'Bug',
    'area:security',
    'severity:P0-blocker',
    'risk:high',
  ]);
  assert.match(
    issue.description,
    /blob\/0123456789abcdef\/apps\/web\/lib\/auth\/cached\.ts#L4-L9/
  );
  assert.match(issue.description, /lines n\/a/);
  assert.match(issue.description, /confidence: unknown/);
  assert.match(
    issue.description,
    /\*\*Suggested fix:\*\* Include the user id\./
  );
  assert.match(issue.description, /JOV-6696/);
  assert.doesNotMatch(issue.description, /vck_abcdefghijklmnop/);
  assert.deepEqual(readMarker(issue.description), {
    fp: group.fingerprint,
    path: group.path,
    slug: 'auth-bypass',
    model: 'openai/gpt-6-sol',
    severity: 'CRITICAL',
    absent: 0,
  });
});

test('formats lower severities as advisory bug intake with mapped priority', () => {
  const medium = formatIssue(groupFindings([normalized()])[0], CTX);
  assert.equal(medium.priority, 3);
  assert.equal(medium.guarded, false);
  assert.deepEqual(medium.labels, [
    'security',
    'Bug',
    'area:security',
    'severity:P2',
  ]);
  assert.match(medium.description, /Summer prioritizes/);
  const low = formatIssue(
    groupFindings([normalized({ severity: 'LOW' })])[0],
    CTX
  );
  assert.equal(low.priority, 4);
  assert.deepEqual(low.labels, ['security', 'Bug', 'area:security']);
  assert.equal(
    formatIssue(
      groupFindings([normalized({ severity: 'HIGH' })])[0],
      CTX
    ).labels.at(-1),
    'risk:high'
  );
});

const issueFor = (group, state, marker = {}) => ({
  id: `id-${group.fingerprint}-${state}`,
  identifier: 'JOV-1',
  description: writeMarker('body', {
    fp: group.fingerprint,
    path: group.path,
    model: 'openai/gpt-6-sol',
    absent: 0,
    ...marker,
  }),
  state: { type: state },
});

test('reconciles findings: create, defer past the limit, reopen regressions, skip canceled', () => {
  const groups = groupFindings([
    normalized({ path: 'new1.ts' }),
    normalized({ path: 'new2.ts' }),
    normalized({ path: 'open.ts' }),
    normalized({ path: 'done.ts' }),
    normalized({ path: 'canceled.ts' }),
  ]);
  const by = path => groups.find(group => group.path === path);
  const issues = [
    issueFor(by('open.ts'), 'started', { absent: 1 }),
    issueFor(by('done.ts'), 'completed'),
    issueFor(by('done.ts'), 'canceled'),
    issueFor(by('canceled.ts'), 'canceled'),
    { id: 'unmarked', description: 'no marker', state: { type: 'started' } },
  ];
  const actions = planReconciliation({
    groups,
    issues,
    analyzed: [],
    maxNew: 1,
  });
  const summary = actions
    .map(action =>
      `${action.type}:${(action.group ?? {}).path}`.replace(/new\d/, 'new')
    )
    .sort();
  assert.deepEqual(summary, [
    'create:new.ts',
    'defer:new.ts',
    'reopen:done.ts',
    'seen:open.ts',
    'skip-canceled:canceled.ts',
  ]);
  const reopen = actions.find(action => action.type === 'reopen');
  assert.equal(reopen.issue.state.type, 'completed');
});

test('closes only on verified absence: same model, same file, and two clean scans for open issues', () => {
  const [a, b, c, d, e] = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'].map(
    path => groupFindings([normalized({ path })])[0]
  );
  const issues = [
    issueFor(a, 'completed'), // fix merged, re-scanned clean -> verify
    issueFor(b, 'started'), // open, first clean scan -> count
    issueFor(c, 'started', { absent: ABSENT_SCANS_TO_CLOSE - 1 }), // second clean -> close
    issueFor(d, 'completed'), // not re-scanned by its model -> no claim
    issueFor(e, 'completed', { verifiedAt: '2026-09-01' }), // already verified
    issueFor(e, 'canceled'),
  ];
  const analyzed = [
    { path: 'a.ts', gatewayId: 'openai/gpt-6-sol' },
    { path: 'b.ts', gatewayId: 'openai/gpt-6-sol' },
    { path: 'c.ts', gatewayId: 'openai/gpt-6-sol' },
    { path: 'd.ts', gatewayId: 'openai/gpt-6-luna' },
    { path: 'e.ts', gatewayId: 'openai/gpt-6-sol' },
  ];
  const actions = planReconciliation({
    groups: [],
    issues,
    analyzed,
    maxNew: 5,
  });
  assert.deepEqual(
    actions.map(action => `${action.type}:${action.marker.path}`),
    ['verify-fixed:a.ts', 'mark-absent:b.ts', 'close-fixed:c.ts']
  );
});

test('verification targets group unverified, uncanceled issue files by their finding model', () => {
  const [a, b, c] = ['a.ts', 'b.ts', 'c.ts'].map(
    path => groupFindings([normalized({ path })])[0]
  );
  const targets = verificationTargets([
    issueFor(a, 'completed'),
    issueFor(b, 'started', { model: 'openai/gpt-6-luna' }),
    issueFor(a, 'started'),
    issueFor(c, 'canceled'),
    issueFor(c, 'completed', { verifiedAt: 'x' }),
    { description: 'none', state: { type: 'started' } },
    {
      description: writeMarker('', { fp: 'dsec-x', path: 'z.ts', model: 'm' }),
    },
  ]);
  assert.deepEqual(targets, [
    { gatewayId: 'openai/gpt-6-sol', files: ['a.ts'] },
    { gatewayId: 'openai/gpt-6-luna', files: ['b.ts'] },
    { gatewayId: 'm', files: ['z.ts'] },
  ]);
});

test('job summary reports tokens, dollars, caps and the top findings', () => {
  const groups = groupFindings([
    normalized({ title: 'a | b', severity: 'HIGH' }),
    normalized({ path: 'x.ts' }),
  ]);
  const base = {
    kind: 'pr',
    status: 'complete',
    gatewayId: 'openai/gpt-6-luna',
    agent: 'codex',
    reasoning: 'xhigh',
    headSha: '0123456789abcdef',
    usage: {
      analyses: 3,
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 5,
      costUsd: 0.0123,
    },
    capUsd: 2,
    monthSpentUsd: 12.5,
  };
  const text = renderSummary({ ...base, groups, note: 'Deferred 2 files.' });
  assert.match(text, /## DeepSec pr scan: complete/);
  assert.match(
    text,
    /\| 3 \| 100 \| 20 \| 5 \| \$0\.0123 \| \$2\.00 \| \$12\.50 \|/
  );
  assert.match(text, /CRITICAL 0 · HIGH 1 · HIGH_BUG 0 · MEDIUM 1/);
  assert.match(text, /a \/ b/);
  assert.match(text, /Deferred 2 files\./);
  const clean = renderSummary({ ...base, groups: [], note: null });
  assert.doesNotMatch(clean, /\| Severity \|/);
});

test('redacts gateway, OpenAI, Linear and GitHub tokens from any text', () => {
  assert.equal(
    redact(
      'k=vck_12345678abc sk-abcdefghijklmnopqrstu lin_api_abcdefghijklmnopq ghp_abcdefghijklmnopqrstuvwx ok'
    ),
    'k=[redacted] [redacted] [redacted] [redacted] ok'
  );
  assert.equal(redact(null), '');
});

test('weekly coverage continues the backlog and re-queues changed files', () => {
  const record = (
    filePath,
    hits,
    fileHash = `${filePath}-hash-0123456789`
  ) => ({
    filePath,
    fileHash,
    candidates: Array.from({ length: hits }, () => ({})),
  });
  const records = [
    record('apps/web/components/Card.tsx', 9),
    record('scripts/tool.ts', 1),
    record('apps/web/lib/utils/format.ts', 2),
    record('apps/web/lib/utils/strings.ts', 2),
    record('apps/web/app/api/tips/route.ts', 1),
    record('apps/web/lib/auth/cached.ts', 1),
    record('apps/web/lib/auth/x.test.ts', 5),
    record('apps/web/lib/empty.ts', 0),
    record('.env.example', 23),
    { filePath: 'no-candidates.ts', fileHash: 'h' },
  ];
  const targets = ['apps/web/lib/auth/cached.ts'];
  assert.deepEqual(orderCandidates(records, { targets }), [
    'apps/web/lib/auth/cached.ts',
    'apps/web/app/api/tips/route.ts',
    'apps/web/lib/utils/format.ts',
    'apps/web/lib/utils/strings.ts',
    'apps/web/components/Card.tsx',
    'scripts/tool.ts',
  ]);
  let ledger = applyRun(emptyLedger(), {
    kind: 'weekly',
    costUsd: 1,
    finishedAt: '2026-09-28T00:00:00Z',
    coverage: {
      'apps/web/lib/auth/cached.ts': shortHash(
        'apps/web/lib/auth/cached.ts-hash-0123456789'
      ),
      'apps/web/app/api/tips/route.ts': shortHash('stale-content-hash'),
    },
  });
  assert.equal(ledger.runs[0].coverage, undefined);
  ledger = parseLedger(JSON.stringify(ledger));
  assert.deepEqual(
    orderCandidates(records, { targets, coverage: ledger.coverage }).slice(
      0,
      2
    ),
    ['apps/web/app/api/tips/route.ts', 'apps/web/lib/utils/format.ts']
  );
  const legacy = parseLedger(
    '{"schemaVersion":1,"models":{},"spend":{},"runs":[]}'
  );
  assert.deepEqual(legacy.coverage, {});
  assert.equal(shortHash(undefined), '');
});
