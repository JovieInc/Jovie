import { describe, expect, it, vi } from 'vitest';
import { runLoop } from '../../loop-health.mjs';
import emailLoop from '../../loops/email-deliverability.mjs';

const def = {
  key: 'demo',
  title: 'Demo loop breach',
  owner: 'jovie-web',
  source: 'demo',
  summary: 's',
  whyItMatters: 'w',
  remeasure: 'r',
  dwellSloMinutes: 60,
  rules: [{ id: 'm', metric: 'm', op: 'max', threshold: 1 }],
};
const make = collect => ({ ...def, collect });
const env = { REMEDIATION_TRIGGERS_DISABLED: 'false' };

function harness(collect) {
  const upsertImpl = vi.fn().mockResolvedValue({ ok: true, action: 'created' });
  const closeImpl = vi.fn().mockResolvedValue({ ok: true, action: 'resolved' });
  const run = () =>
    runLoop(make(collect), { env, upsertImpl, closeImpl, fetchImpl: vi.fn() });
  return { upsertImpl, closeImpl, run };
}

describe('runLoop', () => {
  it('files an issue on breach with a stable label key', async () => {
    const h = harness(async () => ({ metrics: { m: 5 } }));
    const { plan } = await h.run();
    expect(plan.action).toBe('upsert');
    expect(h.upsertImpl).toHaveBeenCalledOnce();
    expect(h.upsertImpl.mock.calls[0][0]).toMatchObject({
      labelKey: 'loop-health-demo',
      createStateName: 'Todo',
      reopenTerminal: true,
    });
    expect(h.closeImpl).not.toHaveBeenCalled();
  });

  it('closes only after a within-threshold re-measure', async () => {
    const h = harness(async () => ({ metrics: { m: 0.5 } }));
    const { plan } = await h.run();
    expect(plan.action).toBe('resolve');
    expect(h.closeImpl).toHaveBeenCalledOnce();
    expect(h.upsertImpl).not.toHaveBeenCalled();
  });

  it('holds (touches nothing) when the metric is unreadable', async () => {
    const h = harness(async () => ({ metrics: {} }));
    const { plan } = await h.run();
    expect(plan.action).toBe('hold');
    expect(h.closeImpl).not.toHaveBeenCalled();
    expect(h.upsertImpl).not.toHaveBeenCalled();
  });

  it('reports a collect failure as error and never closes', async () => {
    const h = harness(async () => {
      throw new Error('route 500');
    });
    const { receipt } = await h.run();
    expect(receipt.status).toBe('error');
    expect(receipt.collectError).toBe('route 500');
    expect(h.closeImpl).not.toHaveBeenCalled();
  });

  it('dry-runs instead of filing when remediation triggers are disabled', async () => {
    const upsertImpl = vi.fn();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { intake } = await runLoop(
      make(async () => ({ metrics: { m: 5 } })),
      {
        env: { REMEDIATION_TRIGGERS_DISABLED: 'true' },
        upsertImpl,
      }
    );
    const logged = log.mock.calls.flat().join('\n');
    log.mockRestore();
    expect(logged).toContain('remediation dry-run upsert key=loop-health-demo');
    expect(intake.ok).toBe(true);
    expect(upsertImpl).not.toHaveBeenCalled();
  });
});

describe('email-deliverability collect', () => {
  const zone = {
    async resolveTxt(name) {
      const map = {
        'jov.ie': ['v=spf1 ~all'],
        'resend._domainkey.jov.ie': ['p=ABC'],
        '_dmarc.jov.ie': ['v=DMARC1; p=none'],
        'send.jov.ie': ['v=spf1 ~all'],
        'resend._domainkey.send.jov.ie': ['p=ABC'],
      };
      if (!map[name]) throw Object.assign(new Error('x'), { code: 'ENODATA' });
      return map[name].map(v => [v]);
    },
    async resolveMx() {
      return [{ priority: 10, exchange: 'mx.example' }];
    },
  };
  const fetchImpl = body => async (url, init) => {
    expect(url).toBe(
      'https://jov.ie/api/cron/loop-health/email-deliverability'
    );
    expect(init.headers.Authorization).toBe('Bearer s3cret');
    return { ok: true, status: 200, json: async () => body };
  };
  const app = {
    attempts7d: 400,
    bounced7d: 4,
    complaints7d: 0,
    bounceRatePct: 1,
    complaintRatePct: 0,
    deliveryLatencyP95Sec: 8,
    latencySamples7d: 30,
  };

  it('requires CRON_SECRET', async () => {
    await expect(
      emailLoop.collect({ env: {}, fetchImpl: fetchImpl(app), resolver: zone })
    ).rejects.toThrow('CRON_SECRET');
  });

  it('merges app metrics with DNS findings', async () => {
    const out = await emailLoop.collect({
      env: { CRON_SECRET: 's3cret' },
      fetchImpl: fetchImpl(app),
      resolver: zone,
    });
    expect(out.metrics.dnsFailures).toBe(0);
    expect(out.metrics.bounceRatePct).toBe(1);
  });

  it('breaches on a high bounce rate with enough sample', async () => {
    const out = await emailLoop.collect({
      env: { CRON_SECRET: 's3cret' },
      fetchImpl: fetchImpl({ ...app, bounceRatePct: 6, bounced7d: 24 }),
      resolver: zone,
    });
    const upsertImpl = vi.fn().mockResolvedValue({ ok: true });
    const { plan } = await runLoop(
      { ...emailLoop, collect: async () => out },
      { env: {}, upsertImpl }
    );
    expect(plan.action).toBe('upsert');
  });
});
