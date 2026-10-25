import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  advisoryFingerprint,
  groupAlerts,
  planAdvisories,
  SLA_HOURS,
  slaDueAt,
} from './lib/security-advisory-policy.mjs';
import { stageMetrics } from './security-advisory-intake.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-10-25T12:00:00Z');
const hoursAgo = h => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function alert(
  n,
  {
    severity = 'high',
    ghsa = 'GHSA-aaaa-bbbb-cccc',
    pkg = 'left-pad',
    state = 'open',
    ageH = 1,
    fixedAgoH = null,
    scope = 'runtime',
  } = {}
) {
  return {
    number: n,
    state,
    created_at: hoursAgo(ageH),
    fixed_at: fixedAgoH == null ? null : hoursAgo(fixedAgoH),
    html_url: `https://github.com/x/y/security/dependabot/${n}`,
    dependency: {
      package: { name: pkg, ecosystem: 'npm' },
      scope,
      manifest_path: 'pnpm-lock.yaml',
    },
    security_advisory: { ghsa_id: ghsa, severity, summary: 'bad thing' },
    security_vulnerability: { first_patched_version: { identifier: '2.0.0' } },
  };
}

test('SLA is critical 48h, high 7d, medium 30d', () => {
  assert.deepEqual(SLA_HOURS, { critical: 48, high: 168, medium: 720 });
});

test('alerts for one advisory+package collapse into one owned unit', () => {
  const groups = groupAlerts([
    alert(1, { ageH: 5 }),
    alert(2, { ageH: 9 }),
    alert(3, { pkg: 'other' }),
  ]);
  assert.equal(groups.length, 2);
  const g = groups.find(x => x.package === 'left-pad');
  assert.equal(g.openCount, 2);
  assert.equal(
    g.detectedAt,
    hoursAgo(9),
    'SLA clock starts at the earliest alert'
  );
  assert.equal(
    slaDueAt(g),
    new Date(Date.parse(hoursAgo(9)) + 168 * 3_600_000).toISOString()
  );
  assert.equal(
    advisoryFingerprint('GHSA-AAAA', '@scope/Pkg.js'),
    'secadv-ghsa-aaaa-scope-pkg-js'
  );
});

test('ratchet: advisories past SLA without an exception are breaches', () => {
  const cases = [
    ['critical', 47, 0],
    ['critical', 49, 1],
    ['high', 167, 0],
    ['high', 169, 1],
    ['medium', 719, 0],
    ['medium', 721, 1],
  ];
  for (const [severity, ageH, breaches] of cases) {
    const plan = planAdvisories({
      alerts: [alert(1, { severity, ageH })],
      now: NOW,
    });
    assert.equal(plan.breaches.length, breaches, `${severity} @ ${ageH}h`);
    assert.equal(plan.upserts.length, 1);
  }
});

test('low severity is tracked by Dependabot only, no SLA or issue', () => {
  const plan = planAdvisories({
    alerts: [alert(1, { severity: 'low', ageH: 9999 })],
    now: NOW,
  });
  assert.equal(plan.upserts.length + plan.breaches.length, 0);
});

test('an unexpired exception with a reason suppresses the breach; an expired one fails', () => {
  const alerts = [alert(1, { severity: 'high', ageH: 400 })];
  const ex = {
    ghsa: 'GHSA-aaaa-bbbb-cccc',
    package: 'left-pad',
    reason: 'unreachable: parser only',
    expires: '2026-11-01T00:00:00Z',
  };
  assert.equal(
    planAdvisories({ alerts, exceptions: [ex], now: NOW }).breaches.length,
    0
  );
  assert.equal(
    planAdvisories({ alerts, exceptions: [{ ...ex, reason: ' ' }], now: NOW })
      .breaches.length,
    1
  );
  const expired = planAdvisories({
    alerts,
    exceptions: [{ ...ex, expires: '2026-10-01T00:00:00Z' }],
    now: NOW,
  });
  assert.equal(expired.breaches.length, 1);
  assert.equal(expired.expiredExceptions.length, 1);
});

test('close only when fixed on main AND a production deploy landed after the fix', () => {
  const alerts = [alert(1, { state: 'fixed', ageH: 30, fixedAgoH: 5 })];
  const before = planAdvisories({ alerts, deployedAt: hoursAgo(6), now: NOW });
  assert.equal(before.closes.length, 0);
  assert.equal(before.awaitingDeploy.length, 1);
  assert.equal(
    planAdvisories({ alerts, deployedAt: null, now: NOW }).closes.length,
    0
  );
  assert.equal(
    planAdvisories({ alerts, deployedAt: hoursAgo(1), now: NOW }).closes.length,
    1
  );
});

test('a still-open sibling alert blocks the close', () => {
  const alerts = [
    alert(1, { state: 'fixed', ageH: 30, fixedAgoH: 5 }),
    alert(2, { state: 'open', ageH: 30 }),
  ];
  const plan = planAdvisories({ alerts, deployedAt: hoursAgo(1), now: NOW });
  assert.equal(plan.closes.length, 0);
  assert.equal(plan.upserts.length, 1);
});

test('stage metrics report detect->fixed p50/p95 from alert history', () => {
  const m = stageMetrics(
    [
      alert(1, { state: 'fixed', ageH: 10, fixedAgoH: 5 }),
      alert(2, { state: 'fixed', ageH: 30, fixedAgoH: 5 }),
      alert(3),
    ],
    '2026-10-25T00:00:00Z'
  );
  assert.equal(m.detectToFixedHours.n, 2);
  assert.equal(m.detectToFixedHours.p50, 5);
  assert.equal(m.detectToFixedHours.p95, 25);
});

test('exceptions file is time-boxed and carries a reachability reason', () => {
  const { exceptions } = JSON.parse(
    readFileSync(
      path.join(ROOT, 'config/security/advisory-exceptions.json'),
      'utf8'
    )
  );
  for (const e of exceptions) {
    assert.match(e.ghsa, /^GHSA-/);
    assert.ok(e.reason.length > 40, 'reason must carry the reachability proof');
    assert.ok(Number.isFinite(Date.parse(e.expires)));
    assert.ok(e.owner);
  }
});

test('loop is wired: workflow runs sync + check on the lanes clock, registry row has the SLA', () => {
  const wf = readFileSync(
    path.join(ROOT, '.github/workflows/security-advisory-loop.yml'),
    'utf8'
  );
  assert.match(wf, /clock_security_advisory_loop/);
  assert.doesNotMatch(wf, /^\s*-\s*cron:/m, 'GitHub crons are frozen');
  assert.match(wf, /security-advisory-intake\.mjs --check/);
  assert.match(wf, /security-advisory-intake\.mjs\s*$/m);
  const rows = readFileSync(
    path.join(ROOT, 'canon/automation-registry.jsonl'),
    'utf8'
  )
    .trim()
    .split('\n')
    .map(l => JSON.parse(l));
  const row = rows.find(r => r.id === 'github:jovie:security-advisory-loop');
  assert.ok(row, 'registry row missing');
  assert.match(row.purpose, /48h/);
  assert.ok(row.maxStalenessMinutes > 0);
});
