import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  declaredCeilings,
  declaredGatewayModels,
  evaluateRouting,
  evaluateSubsidyPools,
  OIDC_KEY,
  profilesFromDropIns,
  workersAiUsdByDay,
} from '../ai-routing-drift.mjs';

const routing = JSON.parse(
  readFileSync(
    new URL('../../../apps/web/lib/ai/routing.json', import.meta.url),
    'utf8'
  )
);
const row = (key, cost) => ({ api_key_name: key, total_cost: cost });
const model = (name, cost) => ({ model: name, total_cost: cost });

describe('routing.json shape', () => {
  it('declares a ceiling for every Gateway-key caller and never routes banned providers', () => {
    const ceilings = declaredCeilings(routing);
    expect(ceilings.Jovie_Production).toBeCloseTo(0.8);
    expect(ceilings['jovie-golden-path-review']).toBe(0.1);
    expect(ceilings[OIDC_KEY]).toBeGreaterThan(0);
    for (const m of declaredGatewayModels(routing))
      expect(m).not.toMatch(/^(openai|anthropic)\//u);
  });
});

describe('workersAiUsdByDay', () => {
  it('prices neurons at list and sums per day', () => {
    const usd = workersAiUsdByDay([
      { dimensions: { date: '2026-10-29' }, sum: { totalNeurons: 500_000 } },
      { dimensions: { date: '2026-10-29' }, sum: { totalNeurons: 300_000 } },
      { dimensions: { date: '2026-10-30' }, sum: { totalNeurons: 100_000 } },
    ]);
    expect(usd['2026-10-29']).toBeCloseTo(8.8);
    expect(usd['2026-10-30']).toBeCloseTo(1.1);
    expect(workersAiUsdByDay(undefined)).toEqual({});
  });
});

describe('evaluateRouting', () => {
  const calm = {
    routing,
    days: 2,
    keyRows: [
      row('Jovie_Production', 0.2),
      row('jovie-golden-path-review', 0.1),
      row(null, 0.4),
    ],
    modelRows: [model('zai/glm-5.3-flash', 0.7)],
    health: { 'jovie-workers-ai': 'ok', 'summer-workers-ai': 'ok' },
  };

  it('is quiet when spend matches the documented routing', () => {
    expect(evaluateRouting(calm).findings).toEqual([]);
  });

  it('reports Workers AI spend next to the Gateway so both providers are measured', () => {
    const result = evaluateRouting({
      ...calm,
      workersAiByDay: { '2026-10-30': 1.2, '2026-10-31': 0.4 },
    });
    expect(result.gatewayUsdPerDay).toBe(0.35);
    expect(result.workersAiUsdPerDay).toBe(0.8);
  });

  it('flags a workers-first caller whose key still spends like the Gateway is primary', () => {
    const { findings } = evaluateRouting({
      ...calm,
      keyRows: [row('jovie-golden-path-review', 2.8)],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      type: 'gateway-over-ceiling',
      severity: 'high',
      subject: 'jovie-golden-path-review',
      usdPerDay: 1.4,
    });
  });

  it('flags undeclared keys and models, and an unhealthy relay', () => {
    const { findings } = evaluateRouting({
      ...calm,
      keyRows: [row('mystery-key', 1)],
      modelRows: [model('google/gemini-3-flash', 1)],
      health: { 'jovie-workers-ai': 'http-503' },
    });
    expect(findings.map(f => f.type).sort()).toEqual([
      'relay-unhealthy',
      'undeclared-gateway-key',
      'undeclared-gateway-model',
    ]);
  });

  it('flags a route documented as Workers-first whose Vercel flag is missing', () => {
    const { findings } = evaluateRouting({
      ...calm,
      envNames: { 'jovie-eve-shadow': ['SUMMER_WORKERS_AI_BASE_URL'] },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      type: 'live-flag-missing',
      subject: 'summer.agent-turns',
      missing: ['SUMMER_WORKERS_AI_PRIMARY_ENABLED', 'SUMMER_WORKERS_AI_TOKEN'],
    });
  });

  it('pages when Gateway credits last under 3 days', () => {
    const { findings, runwayDays } = evaluateRouting({
      ...calm,
      credits: { balanceUsd: 1 },
    });
    expect(runwayDays).toBe(2.9);
    expect(findings).toEqual([
      expect.objectContaining({ type: 'gateway-runway', severity: 'critical' }),
    ]);
    expect(
      evaluateRouting({ ...calm, credits: { balanceUsd: 20 } }).findings
    ).toEqual([]);
  });
});

describe('subsidy pool ledger', () => {
  const sha = c => c.repeat(64);
  const hostProfiles = {
    'current-login': { home: '/h/.codex', slots: 5, emailSha256: sha('a') },
    'lyb-pro': { home: '/h/lyb', slots: 1, emailSha256: sha('b') },
    'jovie-pro': { home: '/h/jovie', slots: 2, emailSha256: sha('c') },
  };
  const clone = value => JSON.parse(JSON.stringify(value));

  it("carries Tim's burn policy: 1% floor, proposals only at the floor, no auto-redeem, no paid fallback", () => {
    expect(routing.subsidyPools.policy).toMatchObject({
      floorPercent: 1,
      floorScope: 'new-dispatch',
      burnOrder: 'use-it-or-lose-it',
      resetProposal: 'only-when-every-pool-at-floor',
      autoRedeemResets: false,
      paidFallback: 'never-without-tim',
      newAccounts: 'never',
      apiKeysInWorkers: 'never',
      targets: { windowUsedBeforeResetPercent: 90 },
    });
    expect(evaluateSubsidyPools({ routing })).toEqual([]);
  });

  it('matches the aliases signed in on the host, with no drift either way', () => {
    expect(evaluateSubsidyPools({ routing, profiles: hostProfiles })).toEqual(
      []
    );
    const extra = {
      ...hostProfiles,
      'new-pro': { home: '/h/new', slots: 1, emailSha256: sha('d') },
    };
    const missing = clone(hostProfiles);
    delete missing['lyb-pro'];
    expect(
      evaluateSubsidyPools({ routing, profiles: extra }).map(f => [
        f.type,
        f.subject,
        f.severity,
      ])
    ).toEqual([['subsidy-pool-unledgered', 'new-pro', 'high']]);
    expect(
      evaluateSubsidyPools({ routing, profiles: missing }).map(f => [
        f.type,
        f.subject,
      ])
    ).toEqual([['subsidy-pool-not-signed-in', 'lyb-pro']]);
  });

  it('fails a policy that pauses early, auto-redeems or pays, and any identity in the ledger', () => {
    const bad = clone(routing);
    bad.subsidyPools.policy.floorPercent = 15;
    bad.subsidyPools.policy.autoRedeemResets = true;
    bad.subsidyPools.policy.paidFallback = 'gateway';
    bad.subsidyPools.pools[0].note = 'someone@example.com';
    const findings = evaluateSubsidyPools({ routing: bad });
    expect(findings.map(f => [f.type, f.subject])).toEqual([
      ['subsidy-policy-invalid', 'floorPercent'],
      ['subsidy-policy-invalid', 'autoRedeemResets'],
      ['subsidy-policy-invalid', 'paidFallback'],
      ['subsidy-pool-identity', 'codex:current-login'],
    ]);
    const withSecret = clone(hostProfiles);
    withSecret['lyb-pro'].apiKey = 'x';
    expect(evaluateSubsidyPools({ routing, profiles: withSecret })).toEqual([
      expect.objectContaining({
        type: 'subsidy-profile-fields',
        severity: 'critical',
      }),
    ]);
    const none = clone(routing);
    delete none.subsidyPools;
    expect(evaluateSubsidyPools({ routing: none })[0]).toMatchObject({
      type: 'subsidy-policy-invalid',
      severity: 'high',
    });
  });

  it('pages through evaluateRouting so the cost gate fails on ledger drift', () => {
    const { findings } = evaluateRouting({
      routing,
      profiles: { ...hostProfiles, stray: hostProfiles['lyb-pro'] },
    });
    expect(findings.map(f => f.type)).toEqual(['subsidy-pool-unledgered']);
  });

  it('reads the profiles from systemd drop-ins, last assignment wins', () => {
    const quoted = JSON.stringify(hostProfiles).replaceAll('"', '\\"');
    const older =
      '[Service]\nEnvironment="CODEX_LANE_SUBSCRIPTION_PROFILES={}"\n';
    const live = `[Service]\nEnvironment=CODEX_LANE_AUTH_MODE=subscription-pool\nEnvironment="CODEX_LANE_SUBSCRIPTION_PROFILES=${quoted}"\n`;
    expect(profilesFromDropIns([older, live])).toEqual(hostProfiles);
    expect(profilesFromDropIns(['[Service]\nEnvironment=A=1\n'])).toBeNull();
  });
});
