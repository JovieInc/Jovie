import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createRecoveryOverride,
  evaluatePromotion,
} from '../promotion-journey-evidence.mjs';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const NOW = new Date('2026-10-21T12:00:00.000Z');
const repo = p =>
  readFileSync(resolve(import.meta.dirname, '../../..', p), 'utf8');

const range = (affects = {}, extra = {}) => ({
  schema: 'jovie.release-range-risk/v1',
  baseDeployedSha: 'c'.repeat(40),
  candidateSha: SHA,
  unknown: false,
  paths: [],
  affects: { auth: false, billing: false, ...affects },
  ...extra,
});
const good = journey => ({
  schema: 'jovie.journey-evidence/v1',
  journey,
  candidateSha: SHA,
  deploymentSha: SHA,
  source: 'playwright-run',
  runId: '123',
  runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/123',
  conclusion: 'success',
  completedAt: '2026-10-21T11:00:00.000Z',
  tests: { total: 4, passed: 4, failed: 0, skipped: 0 },
  providers:
    journey === 'billing'
      ? [{ name: 'stripe', mode: 'test' }]
      : [{ name: 'auth', mode: 'real' }],
  quarantinedExclusions: [],
});
const set = (mutate = {}) => [
  { ...good('auth'), ...(mutate.auth ?? {}) },
  { ...good('billing'), ...(mutate.billing ?? {}) },
];
const run = (evidence, r = range({ billing: true }), extra = {}) =>
  evaluatePromotion({ range: r, evidence, now: NOW, ...extra });

describe('promotion journey gate: valid evidence passes', () => {
  it('passes with exact-candidate, fresh, executed auth+billing evidence', () => {
    expect(run(set()).decision).toBe('pass');
  });
  it('requires nothing for a range that provably affects neither', () => {
    const r = run([], range());
    expect(r.decision).toBe('pass');
    expect(r.required).toBe(false);
  });
});

describe('promotion journey gate: deliberate-red failures', () => {
  const cases = {
    'dispatch-only success': { auth: { source: 'dispatch' } },
    'skipped journey': {
      billing: { tests: { total: 4, passed: 3, failed: 0, skipped: 1 } },
    },
    'mocked journey': {
      billing: { mocked: true, providers: [{ name: 'stripe', mode: 'mock' }] },
    },
    'expired quarantine exclusion': {
      auth: {
        quarantinedExclusions: [{ path: 'x.spec.ts', expiresAt: '2026-09-30' }],
      },
    },
    'exit-0 placeholder (no tests executed)': {
      auth: {
        source: 'placeholder',
        tests: { total: 0, passed: 0, failed: 0, skipped: 0 },
      },
    },
    'stale evidence': { billing: { completedAt: '2026-10-20T11:00:00.000Z' } },
    'evidence for a different SHA': {
      auth: { candidateSha: OTHER, deploymentSha: OTHER },
    },
    'failed conclusion': { billing: { conclusion: 'failure' } },
    'billing not on Stripe test mode': {
      billing: { providers: [{ name: 'stripe', mode: 'live' }] },
    },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    it(`blocks: ${name}`, () => {
      const r = run(set(mutate));
      expect(r.decision).toBe('blocked');
      expect(r.reasons.length).toBeGreaterThan(0);
    });
  }
  it('blocks when one journey has no evidence', () => {
    expect(run([good('auth')]).decision).toBe('blocked');
  });
  it('blocks an unknown range and an auth-only range without evidence', () => {
    expect(run([], range({}, { unknown: true })).decision).toBe('blocked');
    expect(run([], range({ auth: true })).decision).toBe('blocked');
  });
  it('blocks a missing or malformed range artifact', () => {
    expect(run(set(), null).decision).toBe('blocked');
  });
  it('a fresh good record next to a bad one still passes only on the good one', () => {
    const r = run([
      { ...good('auth'), source: 'dispatch' },
      good('auth'),
      good('billing'),
    ]);
    expect(r.decision).toBe('pass');
  });
});

describe('manual recovery override', () => {
  const blocked = set({ auth: { source: 'dispatch' } });
  const receipt = () =>
    createRecoveryOverride({
      candidateSha: SHA,
      approver: 'Tim White',
      reason:
        'Rollback of broken release; journey lane is red for unrelated reasons',
      issueRef: 'JOV-5937',
      now: NOW,
    });
  it('is never automatic: blocked without a receipt', () => {
    expect(run(blocked).decision).toBe('blocked');
  });
  it('passes as an audited override with a valid receipt', () => {
    const r = run(blocked, range({ billing: true }), { override: receipt() });
    expect(r.decision).toBe('override');
    expect(r.override.approver).toBe('Tim White');
    expect(r.reasons.length).toBeGreaterThan(0);
  });
  it('rejects bot approvers, short reasons, other SHAs and expired receipts', () => {
    const base = { candidateSha: SHA, now: NOW, reason: 'x'.repeat(30) };
    expect(() =>
      createRecoveryOverride({ ...base, approver: 'github-actions[bot]' })
    ).toThrow();
    expect(() =>
      createRecoveryOverride({ ...base, approver: 'Tim', reason: 'short' })
    ).toThrow();
    const other = { ...receipt(), candidateSha: OTHER };
    expect(
      run(blocked, range({ billing: true }), { override: other }).decision
    ).toBe('blocked');
    const expired = { ...receipt(), expiresAt: '2026-10-21T11:00:00.000Z' };
    expect(
      run(blocked, range({ billing: true }), { override: expired }).decision
    ).toBe('blocked');
    const auto = { ...receipt(), automatic: true };
    expect(
      run(blocked, range({ billing: true }), { override: auto }).decision
    ).toBe('blocked');
  });
});

describe('repairs (a)-(d) stay fixed', () => {
  it('(b) Golden Path Report never remaps a certification failure to success', () => {
    const ci = repo('.github/workflows/ci.yml');
    expect(ci).toContain(
      'GOLDEN_PATH_RESULT: ${{ needs.ci-golden-path.result }}'
    );
    expect(ci).not.toMatch(/certification_outcome == 'failure'[^\n]*'success'/);
  });
  it('(a) the nightly dispatch receipt is documented as non-evidence', () => {
    expect(repo('.github/workflows/golden-path-nightly.yml')).toContain(
      'dispatch receipt only'
    );
  });
  it('(c) the onboarding robot never exits 0 as a pass', () => {
    const wf = repo('.github/workflows/synthetic-monitoring.yml');
    const step = wf.slice(
      wf.indexOf('id: onboarding-robot'),
      wf.indexOf('Run Legacy OTP Signup Canary')
    );
    expect(step).not.toMatch(/^\s*exit 0\s*$/m);
    expect(step).toContain('robot_status=not_implemented');
    expect(wf).toContain(
      "steps.onboarding-robot.outputs.robot_status == 'not_implemented'"
    );
    expect(wf).not.toContain('onboarding robot, signup health');
  });
  it('(d) the auth smoke helper types once and never re-fills after load', () => {
    const src = repo('apps/web/tests/e2e/utils/production-auth-interaction.ts');
    const fn = src.slice(
      src.indexOf('export async function prepareProductionAuthEmailForm'),
      src.indexOf('export async function waitForProductionDashboardContent')
    );
    expect(fn).not.toMatch(/\.fill\(/);
    expect(fn).toContain('pressSequentially(email)');
    expect(fn.indexOf('pressSequentially')).toBeLessThan(
      fn.indexOf("waitForLoadState('load'")
    );
  });
});
