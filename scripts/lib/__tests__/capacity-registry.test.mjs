import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCanon, check, loadAll } from '../../capacity-registry.mjs';
import { apiListUsd, subscriptionMarginal } from '../capacity-pricing.mjs';
import {
  evaluateRegistry,
  laneRoutingOrder,
  priceModel,
  resolveRole,
  routingOrder,
  validateRegistry,
} from '../capacity-registry.mjs';

const NOW = Date.parse('2026-10-25T02:00:00Z');
const base = () => structuredClone(loadAll().registry);
const spend = () => loadAll().spend;
// The concrete id comes from the family registry (modelFamilies), never a literal.
const LUNA = loadAll().registry.modelFamilies.families['openai:luna'].latest;
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

describe('access-path pricing', () => {
  const { models } = loadAll();
  const vectors = JSON.parse(
    readFileSync(
      new URL(
        '../../tests/fixtures/capacity-pricing-vectors.json',
        import.meta.url
      ),
      'utf8'
    )
  );
  const withQuota = usd => {
    const registry = base();
    for (const row of registry.pricing.paths) {
      if (row.accessPath === 'subscription') row.usableQuotaApiUsd = usd;
    }
    return registry;
  };
  const task = {
    inputTokens: 1_000_000,
    outputTokens: 100_000,
    cachedTokens: 0,
  };

  it('matches the shared vectors (the Python port asserts the same file)', () => {
    expect(apiListUsd(vectors.listPrice, vectors.task)).toBeCloseTo(
      vectors.apiUsd,
      9
    );
    for (const seat of vectors.seats) {
      const r = subscriptionMarginal(vectors.apiUsd, {
        usedPercent: seat.usedPercent,
        elapsedPercent: seat.elapsedPercent,
        usableQuotaApiUsd: vectors.usableQuotaApiUsd,
        planWindowUsd: vectors.planWindowUsd,
        status: seat.status,
      });
      expect(r.usd, seat.name).toBeCloseTo(seat.usd, 5);
      expect(r.class, seat.name).toBe(seat.class);
      expect(r.routable, seat.name).toBe(seat.routable);
    }
  });

  it('prices the same luna task on a Pro seat versus the API, subscription far cheaper while it has headroom', () => {
    const registry = withQuota(400);
    const view = evaluateRegistry(registry, {
      now: NOW,
      spend: spend(),
      models,
    });
    const rows = priceModel(registry, models, view, LUNA, task);
    const api = rows.find(r => r.accessPath === 'api');
    const seats = rows.filter(r => r.accessPath === 'subscription');
    const price = models.models.find(
      m => m.model === LUNA && m.provider === 'codex'
    );
    // 1M input + 100k output tokens at the family's current list price.
    expect(api.usd).toBeCloseTo(
      price.list_price_in + 0.1 * price.list_price_out,
      9
    );
    expect(seats).toHaveLength(3);
    for (const seat of seats) expect(seat.usd).toBeLessThan(api.usd);
    const byAccount = Object.fromEntries(seats.map(r => [r.account, r]));
    expect(byAccount['jovie-pro'].usd).toBeLessThan(
      byAccount['current-login'].usd
    );
    expect(byAccount['current-login'].usd).toBeLessThan(
      byAccount['lyb-pro'].usd
    );
    expect(byAccount['lyb-pro'].class).toBe('ahead-of-pace');
  });

  it('routes to the subsidized seat while it has headroom and to the API once seats are spent', () => {
    const registry = withQuota(400);
    const view = evaluateRegistry(registry, {
      now: NOW,
      spend: spend(),
      models,
    });
    expect(priceModel(registry, models, view, LUNA, task)[0].accessPath).toBe(
      'subscription'
    );
    for (const provider of view.providers) {
      if (provider.id !== 'openai-codex') continue;
      for (const a of provider.accounts)
        if (a.quota)
          Object.assign(a, { quota: { ...a.quota, usedPercent: 100 } });
    }
    const spent = priceModel(registry, models, view, LUNA, task);
    expect(spent[0].accessPath).toBe('api');
    expect(
      spent.filter(r => r.accessPath === 'subscription').every(r => !r.routable)
    ).toBe(true);
  });

  it('without a measured usable quota it has no USD for a seat but still ranks by pace', () => {
    const registry = base();
    const view = evaluateRegistry(registry, {
      now: NOW,
      spend: spend(),
      models,
    });
    const rows = priceModel(registry, models, view, LUNA, task);
    const seat = rows.find(r => r.account === 'jovie-pro');
    expect(seat.usd).toBeNull();
    expect(seat.reason).toBe('usable-quota-unmeasured');
    expect(rows[0].accessPath).toBe('subscription');
    expect(rows.findIndex(r => r.account === 'lyb-pro')).toBeGreaterThan(
      rows.findIndex(r => r.accessPath === 'api')
    );
  });

  it('keeps the same model on two paths as two rows with their own list prices', () => {
    const view = evaluateRegistry(base(), { now: NOW, spend: spend(), models });
    const glm = view.paths.filter(r => r.model === 'glm-5.3');
    expect(glm.map(r => r.accessPath).sort()).toEqual(['api', 'credits']);
    expect(glm.find(r => r.accessPath === 'credits').list.inUsdPerMTok).toBe(
      0.3
    );
    expect(glm.find(r => r.accessPath === 'api').list.inUsdPerMTok).toBe(
      0.5625
    );
  });
});

describe('roles', () => {
  it('uses Kimi K3 as planner today and flips to K3.1 Pro only when the watcher confirms it', () => {
    const registry = base();
    expect(resolveRole(registry, 'planner').chosen.model).toBe(
      'moonshotai/kimi-k3'
    );
    expect(
      resolveRole(registry, 'planner', {
        'moonshotai/kimi-k3.1-pro': { available: false },
      }).chosen.model
    ).toBe('moonshotai/kimi-k3');
    const flipped = resolveRole(registry, 'planner', {
      'moonshotai/kimi-k3.1-pro': { available: true, via: 'hyperagent-agent' },
    });
    expect(flipped.chosen).toMatchObject({
      model: 'moonshotai/kimi-k3.1-pro',
      pathId: 'kimi-k3.1-pro@credits:hyperagent',
    });
    expect(resolveRole(registry, 'nobody')).toBeNull();
  });

  it('rejects a role whose path or a path whose list price does not exist', () => {
    const registry = base();
    registry.roles.planner.candidates[0].pathId = 'missing@path';
    registry.pricing.paths[0].modelRegistryId = 'nope';
    const { identities, spend: sp, models } = loadAll();
    const errors = validateRegistry(registry, {
      agentIds: Object.keys(identities.identities),
      spendIds: sp.providers.map(p => p.id),
      modelIds: models.models.map(m => m.id),
    });
    expect(errors.join('\n')).toMatch(
      /pathId missing@path not in pricing.paths/
    );
    expect(errors.join('\n')).toMatch(
      /modelRegistryId nope not in the model registry/
    );
  });
});

describe('lane routing (Tim 2026-10-25)', () => {
  const view = codexVerdicts => ({
    providers: [
      {
        id: 'openai-codex',
        metrics: { costPerMergedUsd: 2.71 },
        accounts: codexVerdicts.map(verdict => ({ quota: { verdict } })),
      },
      { id: 'hyperagent', metrics: { costPerMergedUsd: 4.76 }, accounts: [] },
    ],
  });

  it('prefers a Codex account behind pace', () => {
    expect(
      laneRoutingOrder(view(['under-burning', 'over-burning'])).order[0]
    ).toBe('openai-codex');
  });

  it('falls to Hyperagent when every Codex account is ahead of pace', () => {
    expect(
      laneRoutingOrder(view(['over-burning', 'over-burning'])).order[0]
    ).toBe('hyperagent');
  });

  it('uses Hyperagent for a model Codex lacks and for launch-critical work while gem is loaded', () => {
    const v = view(['under-burning']);
    expect(laneRoutingOrder(v, { needsModelCodexLacks: true }).order[0]).toBe(
      'hyperagent'
    );
    expect(
      laneRoutingOrder(v, { launchCritical: true, gemLoaded: true }).order[0]
    ).toBe('hyperagent');
    expect(laneRoutingOrder(v, { launchCritical: true }).order[0]).toBe(
      'openai-codex'
    );
  });

  it('breaks on-pace ties by measured cost per merge and never claims codex cloud without an environment', () => {
    const result = laneRoutingOrder(view(['on-pace']), { gemLoaded: true });
    expect(result.order[0]).toBe('openai-codex');
    expect(result.codexWhere).toBe('gem-throttled');
  });
});

describe('Hyperagent slot cap', () => {
  it('reports the one-slot cap when Hyperagent is first', () => {
    const view = {
      providers: [
        {
          id: 'openai-codex',
          accounts: [{ quota: { verdict: 'over-burning' } }],
        },
        {
          id: 'hyperagent',
          accounts: [],
          limits: { laneSlots: { value: 1 } },
        },
      ],
    };
    const result = laneRoutingOrder(view);
    expect(result.order[0]).toBe('hyperagent');
    expect(result.hyperagentSlots).toBe(1);
    expect(result.reasons.join(' ')).toContain('capped at 1 slot');
  });

  it('is recorded in the committed registry', () => {
    const { registry } = loadAll();
    const hyper = registry.providers.find(p => p.id === 'hyperagent');
    expect(hyper.limits.laneSlots).toMatchObject({ value: 1, previous: 10 });
  });
});
