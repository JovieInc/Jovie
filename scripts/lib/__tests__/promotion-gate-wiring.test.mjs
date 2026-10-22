import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  buildJourneyEvidence,
  stripeModeFromKey,
} from '../journey-evidence-builder.mjs';

const root = resolve(import.meta.dirname, '../../..');
const yaml = f =>
  /** @type {any} */ (
    yamlLoad(readFileSync(resolve(root, '.github/workflows', f), 'utf8'))
  );
const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const NOW = new Date('2026-10-22T12:00:00.000Z');
const range = {
  schema: 'jovie.release-range-risk/v1',
  baseDeployedSha: 'c'.repeat(40),
  candidateSha: SHA,
  unknown: false,
  paths: [{ path: 'apps/web/lib/auth/session.ts', class: 'auth-identity' }],
  affects: { auth: true, billing: false },
};
const report = statuses => ({
  suites: [
    {
      specs: statuses.map(status => ({
        file: 'tests/e2e/golden-path.spec.ts',
        tests: [{ status }],
      })),
    },
  ],
});
const evidence = (statuses, over = {}) =>
  buildJourneyEvidence({
    report: report(statuses),
    candidateSha: SHA,
    runId: '99',
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/99',
    stepOutcome: 'success',
    stripeMode: 'test',
    completedAt: new Date(NOW.getTime() - 60_000),
    ...over,
  });

/** Runs the real gate CLI the way production-release.yml does. */
function gate(rangeDoc, docs) {
  const dir = mkdtempSync(join(tmpdir(), 'promo-gate-'));
  writeFileSync(join(dir, 'range.json'), JSON.stringify(rangeDoc));
  const args = [
    'scripts/promotion-journey-gate.mjs',
    '--range',
    join(dir, 'range.json'),
  ];
  docs.forEach((d, i) => {
    const p = join(dir, `e${i}.json`);
    writeFileSync(p, JSON.stringify(d));
    args.push('--evidence', p);
  });
  args.push('--now', NOW.toISOString());
  const r = spawnSync('node', args, { cwd: root, encoding: 'utf8' });
  return { status: r.status, out: r.stdout };
}

describe('promotion is blocked/passed by real journey evidence (deliberate red)', () => {
  it('blocks with no evidence', () => {
    const r = gate(range, []);
    expect(r.status).toBe(1);
    expect(r.out).toContain('no evidence');
  });
  it('blocks with evidence for another SHA', () => {
    const other = evidence(['expected']).map(d => ({
      ...d,
      candidateSha: OTHER,
      deploymentSha: OTHER,
    }));
    const r = gate(range, other);
    expect(r.status).toBe(1);
    expect(r.out).toContain('not for the exact candidate SHA');
  });
  it('blocks when the journey was skipped', () => {
    const r = gate(range, evidence(['skipped']));
    expect(r.status).toBe(1);
    expect(r.out).toContain('journey has skipped tests');
  });
  it('blocks when the run is red or mocked or Stripe is not test mode', () => {
    expect(
      gate(range, evidence(['unexpected'], { stepOutcome: 'failure' })).status
    ).toBe(1);
    expect(
      gate(range, evidence(['expected'], { stripeMode: 'unknown' })).status
    ).toBe(1);
  });
  it('blocks an unknown or missing range artifact without evidence', () => {
    const unknown = { ...range, unknown: true, affects: {} };
    expect(gate(unknown, []).status).toBe(1);
    expect(gate({}, evidence(['expected'])).status).toBe(1);
  });
  it('passes with valid exact-candidate evidence', () => {
    const r = gate(range, evidence(['expected']));
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('"decision": "pass"');
  });
});

describe('evidence builder', () => {
  it('fails closed without a report', () => {
    const docs = buildJourneyEvidence({
      report: null,
      candidateSha: SHA,
      runId: '1',
      runUrl: 'u',
      stepOutcome: 'success',
      stripeMode: 'test',
    });
    expect(docs.map(d => d.conclusion)).toEqual(['failure', 'failure']);
  });
  it('derives Stripe mode from the key prefix only', () => {
    expect(stripeModeFromKey('sk_test_x')).toBe('test');
    expect(stripeModeFromKey('sk_live_x')).toBe('live');
    expect(stripeModeFromKey('')).toBe('unknown');
  });
});

describe('workflow wiring', () => {
  const job = yaml('production-release.yml').jobs['promote-production'];
  const names = job.steps.map(s => s.name);
  const gateStep = job.steps.find(s => s.id === 'journey-gate');
  const promote = job.steps.find(s => s.id === 'promote');
  it('runs the gate before promotion and promotion requires it to succeed', () => {
    expect(names.indexOf(gateStep.name)).toBeLessThan(
      names.indexOf(promote.name)
    );
    expect(promote.if).toContain(
      "steps.final-current.outputs.is_current == 'true'"
    );
    expect(promote.if).toContain("steps.journey-gate.outcome == 'success'");
    expect(gateStep.run).toContain('promotion-gate-ci.mjs range');
    expect(gateStep.run).toContain('promotion-journey-gate.mjs');
    expect(gateStep['continue-on-error']).toBeUndefined();
    expect(job.permissions.actions).toBe('read');
  });
  it('Golden Path lane uploads exact-SHA evidence on every outcome', () => {
    const steps = yaml('ci.yml').jobs['ci-golden-path'].steps;
    const emit = steps.find(s => s.name?.startsWith('Emit journey evidence'));
    const upload = steps.find(s => s.name === 'Upload journey evidence');
    expect(emit.if).toContain('always()');
    expect(upload.if).toContain('always()');
    expect(upload.with.name).toBe('journey-evidence-${{ github.sha }}');
    expect(upload.with['if-no-files-found']).toBe('error');
  });
});
