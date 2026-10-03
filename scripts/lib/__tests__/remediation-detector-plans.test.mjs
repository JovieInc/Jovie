import { describe, expect, it } from 'vitest';
import { planBillingHealthPublic } from '../../billing-health-public-intake.mjs';
import { planBillingSyncIntake } from '../../billing-sync-intake.mjs';
import { docsShaOnMain, planDocsDeploy } from '../../docs-deploy-intake.mjs';

const NOW = Date.parse('2026-10-02T00:00:00.000Z');

describe('billing detector plans', () => {
  it('files anonymous 200 and resolves 401 or 403', () => {
    expect(planBillingHealthPublic(200).action).toBe('upsert');
    expect(planBillingHealthPublic(401).action).toBe('resolve');
    expect(planBillingHealthPublic(403).action).toBe('resolve');
    expect(planBillingHealthPublic(503).action).toBe('skip');
  });

  it('files stale reconciliation or webhooks older than an hour', () => {
    expect(
      planBillingSyncIntake({
        lastReconciliationAt: new Date(NOW - 27 * 60 * 60 * 1000).toISOString(),
        now: NOW,
      }).action
    ).toBe('upsert');
    expect(
      planBillingSyncIntake({
        lastReconciliationAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
        unprocessedWebhooks: 2,
        oldestUnprocessedAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
        now: NOW,
      }).action
    ).toBe('upsert');
    expect(
      planBillingSyncIntake({
        lastReconciliationAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
        unprocessedWebhooks: 2,
        oldestUnprocessedAt: null,
        now: NOW,
      }).action
    ).toBe('resolve');
    expect(
      planBillingSyncIntake({
        lastReconciliationAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
        unprocessedWebhooks: 0,
        now: NOW,
      }).action
    ).toBe('resolve');
  });
});

describe('docs deploy plan', () => {
  it('files a failed main deployment and resolves the next success', () => {
    expect(docsShaOnMain('ahead')).toBe(true);
    expect(docsShaOnMain('identical')).toBe(true);
    expect(docsShaOnMain('behind')).toBe(false);
    expect(planDocsDeploy({ status: 'error', onMain: true }).action).toBe(
      'upsert'
    );
    expect(planDocsDeploy({ status: 'failure', onMain: false }).action).toBe(
      'skip'
    );
    expect(planDocsDeploy({ status: 'success', onMain: true }).action).toBe(
      'resolve'
    );
  });
});
