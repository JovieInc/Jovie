import { describe, expect, it, vi } from 'vitest';
import { runLoop } from '../../loop-health.mjs';
import billing from '../../loops/billing-health.mjs';

const ok = body => async () => ({
  ok: true,
  status: 200,
  json: async () => body,
});
const base = {
  invoiceAttempts30d: 0,
  failedInvoices30d: 0,
  failureRatePct: null,
  maturedFailed: 0,
  recoveredOfMatured: 0,
  recoveryRatePct: null,
  dunningStalledInvoices: 0,
  truncated: false,
};
const run = async body => {
  const upsertImpl = vi.fn().mockResolvedValue({ ok: true });
  const closeImpl = vi.fn().mockResolvedValue({ ok: true });
  const out = await runLoop(billing, {
    env: { CRON_SECRET: 's' },
    fetchImpl: ok(body),
    upsertImpl,
    closeImpl,
  });
  return { ...out, upsertImpl, closeImpl };
};

describe('billing-health loop', () => {
  it('holds at zero volume: neither files nor closes', async () => {
    const r = await run(base);
    expect(r.plan.action).toBe('hold');
    expect(r.upsertImpl).not.toHaveBeenCalled();
    expect(r.closeImpl).not.toHaveBeenCalled();
  });

  it('holds on a thin sample even with a terrible rate', async () => {
    const r = await run({
      ...base,
      invoiceAttempts30d: 3,
      failedInvoices30d: 3,
      failureRatePct: 100,
    });
    expect(r.plan.action).toBe('hold');
  });

  it('breaches on a high failure rate with enough invoices', async () => {
    const r = await run({
      ...base,
      invoiceAttempts30d: 20,
      failedInvoices30d: 5,
      failureRatePct: 25,
    });
    expect(r.plan.action).toBe('upsert');
  });

  it('breaches on any stalled dunning regardless of volume', async () => {
    const r = await run({ ...base, dunningStalledInvoices: 1 });
    expect(r.plan.action).toBe('upsert');
  });

  it('breaches on low recovery and resolves only when all rules are judged ok', async () => {
    const low = await run({
      ...base,
      maturedFailed: 6,
      recoveredOfMatured: 1,
      recoveryRatePct: 16.667,
    });
    expect(low.plan.action).toBe('upsert');
    const healthy = await run({
      ...base,
      invoiceAttempts30d: 40,
      failedInvoices30d: 2,
      failureRatePct: 5,
      maturedFailed: 6,
      recoveredOfMatured: 5,
      recoveryRatePct: 83.333,
    });
    expect(healthy.plan.action).toBe('resolve');
    expect(healthy.closeImpl).toHaveBeenCalledOnce();
  });

  it('errors (never closes) when the read is truncated', async () => {
    const r = await run({ ...base, truncated: true });
    expect(r.receipt.status).toBe('error');
    expect(r.closeImpl).not.toHaveBeenCalled();
  });
});
