import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  blindEntry,
  computeMetrics,
  fromCodeScanning,
  fromCoverage,
  fromDependabot,
  fromMutation,
  fromSecretScanning,
  fromSonar,
  fromWaste,
  ownerFor,
  planDispatch,
  publicSafeStats,
  ratchetReport,
  sloState,
} from './lib/findings-ledger.mjs';

const NOW = new Date('2026-10-29T18:00:00Z');
const alert = (n, over = {}) => ({
  number: n,
  state: 'open',
  created_at: '2026-10-20T00:00:00Z',
  html_url: `https://github.com/x/${n}`,
  tool: { name: 'Semgrep OSS' },
  rule: { id: 'r1', security_severity_level: 'high', description: 'bad' },
  most_recent_instance: {
    location: { path: 'apps/web/lib/auth/x.ts', start_line: 3 },
  },
  ...over,
});

test('code-scanning alerts dedupe by tool+rule+file and keep the worst severity and earliest first-seen', () => {
  const out = fromCodeScanning([
    alert(1),
    alert(2, {
      created_at: '2026-10-10T00:00:00Z',
      rule: { id: 'r1', security_severity_level: 'critical' },
    }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].count, 2);
  assert.equal(out[0].severity, 'critical');
  assert.equal(out[0].firstSeen, '2026-10-10T00:00:00Z');
  assert.equal(out[0].owner, 'auth');
});

test('a group stays open while any alert is open and is fixed when all are', () => {
  const fixed = alert(3, { state: 'fixed', fixed_at: '2026-10-21T00:00:00Z' });
  assert.equal(fromCodeScanning([fixed])[0].state, 'fixed');
  assert.equal(fromCodeScanning([fixed, alert(4)])[0].state, 'open');
});

test('secret findings carry no secret value, only type and location, and need Tim', () => {
  const [f] = fromSecretScanning([
    {
      number: 7,
      state: 'open',
      created_at: '2026-10-29T00:00:00Z',
      secret: 'sk_live_DO_NOT_LEAK',
      secret_type: 'stripe_api_key',
      html_url: 'u',
    },
  ]);
  assert.equal(JSON.stringify(f).includes('DO_NOT_LEAK'), false);
  assert.equal(f.severity, 'critical');
  assert.equal(f.needsTim, true);
});

test('dependabot reuses the advisory-loop fingerprint so the Linear card is shared', () => {
  const [f] = fromDependabot([
    {
      number: 1,
      state: 'open',
      created_at: '2026-10-28T00:00:00Z',
      security_advisory: {
        ghsa_id: 'GHSA-aaaa-bbbb-cccc',
        severity: 'high',
        summary: 's',
      },
      dependency: {
        package: { name: 'node-forge' },
        manifest_path: 'pnpm-lock.yaml',
      },
    },
  ]);
  assert.equal(f.fingerprint, 'secadv-ghsa-aaaa-bbbb-cccc-node-forge');
});

test('sonar groups by rule with counts, and failing gate conditions are findings', () => {
  const { entries } = fromSonar({
    rules: [{ rule: 'typescript:S3776', severity: 'BLOCKER', count: 8 }],
    gate: {
      observedAt: NOW.toISOString(),
      conditions: [
        {
          status: 'ERROR',
          metricKey: 'new_security_rating',
          actualValue: '4',
          errorThreshold: '1',
        },
        { status: 'OK', metricKey: 'x' },
      ],
    },
  });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].count, 8);
  assert.equal(entries[1].severity, 'high');
});

test('coverage gaps only on RED surfaces under the floor; critical paths rank high', () => {
  const out = fromCoverage({
    generated_at: 'x',
    surfaces: {
      'rls-access-control': {
        status: 'RED',
        coverage_pct: 77.6,
        branch_pct: 0,
      },
      proxy: { status: 'RED', coverage_pct: 96.1, branch_pct: 92.6 },
      docs: { status: 'GREEN', coverage_pct: 10, branch_pct: 0 },
    },
  });
  assert.deepEqual(
    out.map(f => [f.rule, f.severity]),
    [['rls-access-control', 'high']]
  );
});

test('knip and mutation map to ledger entries; a passing mutation run is clean', () => {
  assert.equal(
    fromWaste({ knip: { unusedFiles: 269, unusedExports: 0 } }).length,
    1
  );
  assert.equal(fromWaste({}).length, 0);
  assert.equal(fromMutation({ conclusion: 'success' }).length, 0);
  assert.equal(
    fromMutation({ conclusion: 'failure', created_at: 'x' })[0].severity,
    'high'
  );
});

test('a blind source is a finding, never a silent zero', () => {
  const b = blindEntry('dependabot', 'HTTP 403', NOW.toISOString());
  assert.equal(b.severity, 'high');
  assert.equal(b.state, 'open');
});

test('SLO: critical 48h, high 7d; low has none', () => {
  const f = sev => ({
    severity: sev,
    state: 'open',
    firstSeen: '2026-10-27T00:00:00Z',
  });
  assert.equal(sloState(f('critical'), NOW).breached, true);
  assert.equal(sloState(f('high'), NOW).breached, false);
  assert.equal(sloState(f('low'), NOW).breached, false);
  assert.equal(
    sloState({ severity: 'high', state: 'open', firstSeen: null }, NOW)
      .breached,
    false
  );
});

test('dispatch: critical -> incident, high -> issue, medium/low batched per source+tool, fixed -> close', () => {
  const mk = (fingerprint, severity, state = 'open') => ({
    fingerprint,
    source: 'code-scanning',
    tool: 'Semgrep OSS',
    severity,
    state,
    count: 2,
    title: 't',
    firstSeen: null,
  });
  const plan = planDispatch([
    mk('a', 'critical'),
    mk('b', 'high'),
    mk('c', 'medium'),
    mk('d', 'low'),
    mk('e', 'high', 'fixed'),
  ]);
  assert.equal(plan.incidents.length, 1);
  assert.equal(plan.issues.length, 1);
  assert.equal(plan.batches.length, 1);
  assert.equal(plan.batches[0].total, 4);
  assert.deepEqual(plan.closes, ['e']);
});

test('metrics: open by source/severity, time to remediation, breaches; public stats are aggregates only', () => {
  const findings = [
    {
      fingerprint: 'a',
      source: 'code-scanning',
      severity: 'critical',
      state: 'open',
      count: 1,
      firstSeen: '2026-10-20T00:00:00Z',
    },
    {
      fingerprint: 'b',
      source: 'dependabot',
      severity: 'high',
      state: 'open',
      count: 2,
      firstSeen: '2026-10-29T00:00:00Z',
    },
    {
      fingerprint: 'c',
      source: 'dependabot',
      severity: 'high',
      state: 'fixed',
      count: 1,
      firstSeen: '2026-10-20T00:00:00Z',
      fixedAt: '2026-10-21T00:00:00Z',
    },
  ];
  const m = computeMetrics(findings, NOW);
  assert.equal(m.openBySource['dependabot'], 2);
  assert.equal(m.sloBreaches, 1);
  assert.equal(m.timeToRemediationHours.p50, 24);
  const pub = publicSafeStats(m);
  assert.deepEqual(Object.keys(pub).sort(), [
    'openCriticalHigh',
    'remediationP50Hours',
    'remediationP95Hours',
    'sloBreaches',
    'sourcesMonitored',
  ]);
  assert.equal(pub.openCriticalHigh, 3);
});

test('ratchet: growth fails, shrinking passes and proposes a lower baseline', () => {
  const baseline = {
    ratchets: {
      dependabot: {
        schemaVersion: 1,
        dimension: 'd',
        direction: 'lock_down',
        baseline: 3,
        policy: { marginFraction: 0, improveEpsilon: 0, minSampleSize: 0 },
      },
    },
  };
  const up = ratchetReport({ openBySource: { dependabot: 4 } }, baseline);
  assert.equal(up[0].ok, false);
  const down = ratchetReport({ openBySource: { dependabot: 1 } }, baseline);
  assert.equal(down[0].ok, true);
  assert.equal(down[0].proposeNewBaseline, 1);
});

test('owners come from the path, else the source default', () => {
  assert.equal(
    ownerFor('code-scanning', 'apps/web/app/api/stripe/webhooks/route.ts'),
    'billing'
  );
  assert.equal(ownerFor('code-scanning', '.github/workflows/x.yml'), 'ci');
  assert.equal(ownerFor('secret-scanning', null), 'security-human');
});

test('ratchet: a zero baseline passes only at zero', () => {
  const baseline = {
    ratchets: {
      'secret-scanning': {
        schemaVersion: 1,
        dimension: 'd',
        direction: 'lock_down',
        baseline: 0,
      },
    },
  };
  assert.equal(
    ratchetReport({ openBySource: { 'secret-scanning': 0 } }, baseline)[0].ok,
    true
  );
  assert.equal(
    ratchetReport({ openBySource: { 'secret-scanning': 1 } }, baseline)[0].ok,
    false
  );
});
