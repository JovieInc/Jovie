import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FINANCE_SENSITIVE_FIELDS } from '@/lib/finance/redaction';

const OWNER_ID = '11111111-2222-3333-4444-555555555555';
const OTHER_ID = '99999999-8888-7777-6666-555555555555';

describe('finance ops alerts (JOV-4621)', () => {
  it('uses a pseudonymous owner reference, never the raw users.id', async () => {
    const { buildFinanceAlert } = await import('@/lib/finance/ops-alerts');
    const alert = buildFinanceAlert('sync_stale', OWNER_ID);
    expect(alert.ownerRef).toMatch(/^fin_[0-9a-f]{16}$/);
    expect(JSON.stringify(alert)).not.toContain(OWNER_ID);
  });

  it('produces stable, owner-distinct references', async () => {
    const { financeOwnerRef } = await import('@/lib/finance/ops-alerts');
    expect(financeOwnerRef(OWNER_ID)).toBe(financeOwnerRef(OWNER_ID));
    expect(financeOwnerRef(OWNER_ID)).not.toBe(financeOwnerRef(OTHER_ID));
  });

  it('derives the reference from the versioned salt and owner id', async () => {
    const { financeOwnerRef } = await import('@/lib/finance/ops-alerts');
    const digest = createHash('sha256')
      .update(`finance-alert-owner-ref:v1:${OWNER_ID}`)
      .digest('hex');
    expect(financeOwnerRef(OWNER_ID)).toBe(`fin_${digest.slice(0, 16)}`);
  });

  it('builds the full alert shape for every known kind', async () => {
    const { buildFinanceAlert, FINANCE_ALERT_KINDS, financeOwnerRef } =
      await import('@/lib/finance/ops-alerts');
    expect(FINANCE_ALERT_KINDS).toEqual([
      'link_failure',
      'sync_stale',
      'reconciliation_anomaly',
      'authorization_denied',
      'metric_job_failure',
      'deletion_failure',
    ]);
    for (const kind of FINANCE_ALERT_KINDS) {
      expect(buildFinanceAlert(kind, OWNER_ID)).toEqual({
        kind,
        ownerRef: financeOwnerRef(OWNER_ID),
        context: {},
      });
    }
  });

  it('preserves arrays, nulls, and nested scalars while stripping', async () => {
    const { buildFinanceAlert } = await import('@/lib/finance/ops-alerts');
    const alert = buildFinanceAlert('reconciliation_anomaly', OWNER_ID, {
      lastError: null,
      steps: ['fetch', 'apply'],
      batches: [{ size: 10, amount: '1.00' }, [{ balance: 3, ok: true }]],
    });
    expect(alert.context).toEqual({
      lastError: null,
      steps: ['fetch', 'apply'],
      batches: [{ size: 10 }, [{ ok: true }]],
    });
    expect(Array.isArray(alert.context.batches)).toBe(true);
  });

  it('rejects invalid owner ids before building the reference', async () => {
    const { buildFinanceAlert } = await import('@/lib/finance/ops-alerts');
    expect(() => buildFinanceAlert('sync_stale', 'creator_1')).toThrow(
      'Invalid financial owner id'
    );
  });

  it('rejects unknown alert kinds', async () => {
    const { buildFinanceAlert } = await import('@/lib/finance/ops-alerts');
    expect(() =>
      // @ts-expect-error — runtime guard for unchecked callers
      buildFinanceAlert('balance_snapshot', OWNER_ID)
    ).toThrow(new TypeError('Unknown finance alert kind: balance_snapshot'));
  });

  it.each(FINANCE_SENSITIVE_FIELDS.map(field => [field] as const))(
    'strips sensitive context key %s at any depth',
    async field => {
      const { buildFinanceAlert } = await import('@/lib/finance/ops-alerts');
      const alert = buildFinanceAlert('link_failure', OWNER_ID, {
        attempts: 3,
        [field]: 'Chase ****1234 $9,999.00',
        provider: {
          status: 'ITEM_LOGIN_REQUIRED',
          nested: { [field]: 'secret value' },
          list: [{ [field]: 'secret value' }, { ok: true }],
        },
      });
      const serialized = JSON.stringify(alert);
      expect(serialized).not.toContain('secret value');
      expect(serialized).not.toContain('Chase ****1234');
      expect(alert.context.attempts).toBe(3);
    }
  );

  it('does not mutate the caller context object', async () => {
    const { buildFinanceAlert } = await import('@/lib/finance/ops-alerts');
    const context = { amount: '42.00', status: 'retrying' };
    buildFinanceAlert('metric_job_failure', OWNER_ID, context);
    expect(context.amount).toBe('42.00');
  });

  it('keeps operational scalars needed for dashboards', async () => {
    const { buildFinanceAlert } = await import('@/lib/finance/ops-alerts');
    const alert = buildFinanceAlert('deletion_failure', OWNER_ID, {
      jobId: 'job_123',
      attempts: 2,
      latencyMs: 812,
      code: 'PROVIDER_TIMEOUT',
    });
    expect(alert.context).toEqual({
      jobId: 'job_123',
      attempts: 2,
      latencyMs: 812,
      code: 'PROVIDER_TIMEOUT',
    });
  });
});
