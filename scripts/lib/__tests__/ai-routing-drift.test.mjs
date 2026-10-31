import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  declaredCeilings,
  declaredGatewayModels,
  evaluateRouting,
  OIDC_KEY,
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
      modelRows: [model('moonshotai/kimi-k3.1-pro', 1)],
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
    expect(runwayDays).toBe(1.4);
    expect(findings).toEqual([
      expect.objectContaining({ type: 'gateway-runway', severity: 'critical' }),
    ]);
    expect(
      evaluateRouting({ ...calm, credits: { balanceUsd: 20 } }).findings
    ).toEqual([]);
  });
});
