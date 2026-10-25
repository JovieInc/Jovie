import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCanon, check, loadAll } from '../../capacity-registry.mjs';
import {
  evaluateRegistry,
  routingOrder,
  validateRegistry,
} from '../capacity-registry.mjs';

const NOW = Date.parse('2026-10-25T02:00:00Z');
const base = () => structuredClone(loadAll().registry);
const spend = () => loadAll().spend;
const find = (view, id) => view.providers.find(p => p.id === id);

describe('capacity registry (committed data)', () => {
  it('validates against agent identities and spend ids, and canon is in sync', () => {
    expect(check()).toEqual([]);
  });

  it('stores no secrets or full addresses', () => {
    const raw = readFileSync(
      new URL('../../../ops/registry/capacity.json', import.meta.url),
      'utf8'
    );
    expect(raw).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
    expect(raw).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9]{20,}/);
  });

  it('seeds the facts Tim gave on 2026-10-25', () => {
    const view = evaluateRegistry(base(), { now: NOW, spend: spend() });
    const codex = find(view, 'openai-codex');
    expect(codex.accounts.map(a => a.id)).toEqual([
      'current-login',
      'jovie-pro',
      'lyb-pro',
      'tim-jov-ie',
    ]);
    expect(codex.accounts.find(a => a.id === 'tim-jov-ie').status).toBe(
      'lapsed'
    );
    expect(codex.decision.id).toBe('codex-500-tier');
    const grok = find(view, 'xai-grok').accounts[0];
    expect(grok.plan.listUsdMonthly).toBe(300);
    expect(grok.plan.effectiveUsdMonthly).toBe(99);
    expect(grok.plan.promoActive).toBe(true);
    const hyper = find(view, 'hyperagent');
    expect(hyper.accounts[0].credits.balanceUsd).toBe(4674.34);
    expect(hyper.accounts[0].credits.expiresAt).toBe('2027-06-01T00:00:00Z');
    expect(hyper.limits).toMatchObject({
      softRuns: 24,
      perRunCapUsd: 10,
      perTurnBudgetUsd: 10,
    });
    expect(find(view, 'dots').usageModel).toBe('uncapped-own-model');
    expect(find(view, 'dots').policy.delegation).toMatch(/Codex/);
  });

  it('flags Hyperagent burn that exhausts credits before expiry', () => {
    const view = evaluateRegistry(base(), { now: NOW, spend: spend() });
    const credits = find(view, 'hyperagent').accounts[0].credits;
    expect(credits.burnPerDayUsd).toBe(47.6);
    expect(credits.requiredPerDayUsd).toBeCloseTo(
      4674.34 / credits.daysLeft,
      5
    );
    expect(credits.verdict).toBe('exhausts-before-expiry');
  });
});

describe('evaluation', () => {
  it('computes pace from the window: elapsed versus used', () => {
    const registry = base();
    const view = evaluateRegistry(registry, { now: NOW, spend: spend() });
    const grok = find(view, 'xai-grok').accounts[0].quota;
    expect(grok.usedPercent).toBe(63);
    expect(grok.elapsedPercent).toBeGreaterThan(70);
    expect(grok.verdict).toBe('under-burning');
  });

  it('flags a manual fact older than the threshold as stale and a live fact much sooner', () => {
    const registry = base();
    const later = NOW + 9 * 86_400_000;
    const view = evaluateRegistry(registry, { now: later, spend: spend() });
    expect(find(view, 'vercel-ai-gateway').accounts[0].credits.freshness).toBe(
      'stale'
    );
    expect(view.totals.stale).toContain('openai-codex');
    const dayAfter = evaluateRegistry(registry, {
      now: NOW + 26 * 3_600_000,
      spend: spend(),
    });
    expect(find(dayAfter, 'openai-codex').accounts[0].quota.freshness).toBe(
      'stale'
    );
    expect(find(dayAfter, 'hyperagent').accounts[0].credits.freshness).toBe(
      'fresh'
    );
  });

  it('takes a newer live row over the snapshot and ignores an older one', () => {
    const registry = base();
    const key = 'openai-codex/lyb-pro';
    const newer = {
      accounts: {
        [key]: {
          quota: {
            remainingPercent: 20,
            observedAt: '2026-10-25T01:30:00Z',
            live: 'codex-ledger',
          },
        },
      },
    };
    const older = {
      accounts: {
        [key]: {
          quota: { remainingPercent: 99, observedAt: '2026-10-24T01:30:00Z' },
        },
      },
    };
    const pick = live =>
      find(
        evaluateRegistry(registry, { now: NOW, live, spend: spend() }),
        'openai-codex'
      ).accounts[2].quota.remainingPercent;
    expect(pick(newer)).toBe(20);
    expect(pick(older)).toBe(43);
  });

  it('marks quota-bearing providers with no reading as unread, not fresh', () => {
    const view = evaluateRegistry(base(), { now: NOW, spend: spend() });
    expect(find(view, 'muse').freshness).toBe('unknown');
    expect(find(view, 'anthropic-claude').freshness).toBe('unknown');
    expect(find(view, 'dots').freshness).toBe('fresh');
    expect(find(view, 'kimi').freshness).toBe('fresh');
    expect(view.totals.stale).toEqual(
      expect.arrayContaining(['muse', 'anthropic-claude'])
    );
  });

  it('ends a promo price at promoUntil', () => {
    const registry = base();
    const view = evaluateRegistry(registry, {
      now: Date.parse('2026-12-02T00:00:00Z'),
      spend: spend(),
    });
    const plan = find(view, 'xai-grok').accounts[0].plan;
    expect(plan.promoActive).toBe(false);
    expect(plan.effectiveUsdMonthly).toBe(300);
  });

  it('does not count lapsed or unverified accounts in plan spend', () => {
    const view = evaluateRegistry(base(), { now: NOW, spend: spend() });
    expect(find(view, 'kimi').monthlyUsd).toBe(0);
    expect(find(view, 'openai-codex').monthlyUsd).toBe(600);
  });
});

describe('alerts and value metrics', () => {
  it('alarms when credits burn past the lasting pace while use-or-lose quota is under pace', () => {
    const view = evaluateRegistry(base(), { now: NOW, spend: spend() });
    expect(view.alerts).toHaveLength(1);
    expect(view.alerts[0]).toMatchObject({
      severity: 'alarm',
      provider: 'hyperagent',
    });
    expect(view.alerts[0].message).toMatch(
      /\$47\.6\/day against \$21\.35\/day/
    );
    expect(view.alerts[0].message).toMatch(/Grok/);
  });

  it('downgrades to a note when cheaper quota is at pace or its reading is stale', () => {
    const registry = base();
    registry.providers.find(
      p => p.id === 'xai-grok'
    ).accounts[0].quota.usedPercent = 74;
    const onPace = evaluateRegistry(registry, { now: NOW, spend: spend() });
    expect(onPace.alerts.map(a => a.severity)).toEqual(['info']);
    const stale = evaluateRegistry(base(), {
      now: NOW + 3 * 86_400_000,
      spend: spend(),
    });
    expect(stale.alerts.every(a => a.severity === 'info')).toBe(true);
  });

  it('carries live cost-per-merge metrics to the provider and flags an incomplete window', () => {
    const live = {
      metrics: {
        windowDays: 7,
        mergedInWindow: 619,
        readAt: '2026-10-25T01:27:44Z',
        providers: {
          'openai-codex': {
            windowDays: 7,
            runs: 10,
            prsCreated: 5,
            mergedCreated: 4,
            mergedRepaired: 1,
            costUsd: 138,
            costBasis: 'amortized-plan',
            costPerMergedUsd: 34.5,
          },
        },
      },
    };
    const view = evaluateRegistry(base(), { now: NOW, spend: spend(), live });
    expect(find(view, 'openai-codex').metrics.costPerMergedUsd).toBe(34.5);
    expect(find(view, 'xai-grok').metrics).toBeNull();
    expect(view.metricsMeta.mergedInWindow).toBe(619);
    const incomplete = evaluateRegistry(base(), {
      now: NOW,
      spend: spend(),
      live: { metrics: { incomplete: 'max_pages_reached' } },
    });
    expect(incomplete.metricsMeta.incomplete).toBe('max_pages_reached');
    expect(
      evaluateRegistry(base(), { now: NOW, spend: spend() }).metricsMeta
    ).toBeNull();
  });
});

describe('routing order', () => {
  it('puts uncapped own models first, then under-pace capped quota, then the pool, and skips unavailable lanes', () => {
    const view = evaluateRegistry(base(), { now: NOW, spend: spend() });
    const order = routingOrder(view).map(r => r.id);
    expect(order.slice(0, 2).sort()).toEqual(['dots', 'instinct']);
    expect(order.indexOf('xai-grok')).toBeLessThan(
      order.indexOf('openai-codex')
    );
    expect(order.indexOf('openai-codex')).toBeLessThan(
      order.indexOf('hyperagent')
    );
    expect(order).not.toContain('devin');
    expect(order).not.toContain('kimi');
  });
});

describe('validation', () => {
  const ids = { agentIds: ['dots'], spendIds: [] };
  it('rejects unknown agents, bad hashes, undated facts and unknown policies', () => {
    const registry = base();
    registry.providers[0].agents.push('nobody');
    registry.providers[0].accounts[0].emailSha256 = 'user@example.com';
    delete registry.providers[0].accounts[0].quota.observedAt;
    registry.providers[1].policy.id = 'nope';
    const errors = validateRegistry(registry, {
      agentIds:
        loadAll().identities && Object.keys(loadAll().identities.identities),
      spendIds: loadAll().spend.providers.map(p => p.id),
    });
    expect(errors.join('\n')).toMatch(/agent nobody/);
    expect(errors.join('\n')).toMatch(/12-hex/);
    expect(errors.join('\n')).toMatch(/needs source and observedAt/);
    expect(errors.join('\n')).toMatch(/policy.id nope/);
    expect(validateRegistry({ schema: 'x' }, ids)).toHaveLength(1);
  });

  it('detects canon drift', () => {
    const inputs = loadAll();
    inputs.registry.providers[0].accounts[0].quota.remainingPercent = 1;
    expect(buildCanon(inputs)).toContain('1% left');
  });
});
