import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DOGFOOD_TRUTH_KEYS,
  planDogfoodTruthIntake,
  runDogfoodTruthIntake,
} from './dogfood-truth-intake.mjs';

const report = findings => ({
  ok: findings.length === 0,
  checkedAt: '2026-11-21T07:47:00Z',
  creatorUsername: 'tim',
  checks: ['design-partner', 'apple-catalog', 'catalog-cycle'],
  findings,
});
const finding = key => ({ key, title: key, detail: 'd', evidence: {} });

describe('planDogfoodTruthIntake', () => {
  it('files red keys and resolves every other known key', () => {
    const plan = planDogfoodTruthIntake(
      report([finding('dogfood-catalog-hidden')])
    );
    assert.equal(plan.verdict, 'red');
    assert.deepEqual(
      plan.upserts.map(f => f.key),
      ['dogfood-catalog-hidden']
    );
    assert.ok(!plan.resolves.includes('dogfood-catalog-hidden'));
    assert.ok(plan.resolves.includes('dogfood-cycle-not-running'));
  });

  it('resolves everything on a clean run', () => {
    const plan = planDogfoodTruthIntake(report([]));
    assert.equal(plan.verdict, 'green');
    assert.deepEqual(plan.resolves, [...DOGFOOD_TRUTH_KEYS]);
  });

  it('does not resolve catalog keys whose check was skipped', () => {
    const plan = planDogfoodTruthIntake(
      report([finding('dogfood-apple-unbound')])
    );
    for (const key of [
      'dogfood-apple-scan-stale',
      'dogfood-catalog-missing',
      'dogfood-catalog-hidden',
    ])
      assert.ok(!plan.resolves.includes(key), key);
    assert.ok(plan.resolves.includes('dogfood-cycle-failed'));
  });

  it('resolves nothing when the partner does not resolve', () => {
    const plan = planDogfoodTruthIntake(
      report([finding('dogfood-design-partner-missing')])
    );
    assert.deepEqual(plan.resolves, []);
  });

  it('treats a failed probe as unmeasured, never green', () => {
    assert.equal(
      planDogfoodTruthIntake({ ok: false, code: 'probe_failed' }).verdict,
      'unmeasured'
    );
    assert.equal(planDogfoodTruthIntake(null).verdict, 'unmeasured');
  });

  it('refuses keys it does not know, so none is silently never resolved', () => {
    assert.throws(
      () => planDogfoodTruthIntake(report([finding('dogfood-new-thing')])),
      /Unknown dogfood truth keys/
    );
  });
});

describe('runDogfoodTruthIntake', () => {
  it('throws on an unmeasured probe instead of resolving', async () => {
    await assert.rejects(
      runDogfoodTruthIntake({ env: { DOGFOOD_TRUTH_JSON: '{"ok":false}' } }),
      /no report/
    );
  });

  it('dry-runs when remediation triggers are disabled', async () => {
    const prev = process.env.REMEDIATION_TRIGGERS_DISABLED;
    process.env.REMEDIATION_TRIGGERS_DISABLED = 'true';
    try {
      const { plan, summary } = await runDogfoodTruthIntake({
        env: {
          DOGFOOD_TRUTH_JSON: JSON.stringify(
            report([finding('dogfood-catalog-hidden')])
          ),
        },
      });
      assert.equal(plan.verdict, 'red');
      assert.match(summary, /red dogfood-catalog-hidden/);
    } finally {
      if (prev === undefined) delete process.env.REMEDIATION_TRIGGERS_DISABLED;
      else process.env.REMEDIATION_TRIGGERS_DISABLED = prev;
    }
  });
});
