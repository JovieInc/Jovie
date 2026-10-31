import { describe, expect, it } from 'vitest';
import type { HudOverviewMetrics } from '@/types/hud';
import {
  buildCompanyTiles,
  type OvieCompanyMetricsInput,
} from './company-tiles';

const OVERVIEW: HudOverviewMetrics = {
  mrrUsd: 0,
  activeSubscribers: 0,
  balanceUsd: 22.96,
  burnRateUsd: 110,
  runwayMonths: 0.2087,
  defaultStatus: 'dead',
  defaultStatusDetail: '',
  financialDataAvailable: true,
  excludedInternal: { mrrUsd: 199, subscribers: 1 },
  weekAgo: { mrrUsd: 0, activeSubscribers: 0 },
};

const OK: OvieCompanyMetricsInput = {
  overview: OVERVIEW,
  sources: { stripe: { state: 'ok' }, mercury: { state: 'ok' } },
};

const flow = (state: string, tiers: Record<string, string>) => ({
  domain: 'flows',
  state,
  tiers,
});

const byKey = (input: Parameters<typeof buildCompanyTiles>[0]) =>
  Object.fromEntries(buildCompanyTiles(input).map(tile => [tile.key, tile]));

describe('buildCompanyTiles', () => {
  it('shows verified cash and never a runway built on partial burn', () => {
    const cash = byKey({ metrics: OK, funnel: null, goldenPath: null }).cash;
    expect(cash).toMatchObject({
      value: '$23',
      measured: true,
      tone: 'neutral',
      target: 'Runway not measured: card spend not in burn',
    });
    expect(cash?.value).not.toMatch(/day|mo/);
  });

  it('says Connect Mercury when the bank source is not ok', () => {
    const cash = byKey({
      metrics: {
        ...OK,
        sources: { ...OK.sources, mercury: { state: 'unavailable' } },
      },
      funnel: null,
      goldenPath: null,
    }).cash;
    expect(cash).toMatchObject({
      value: 'Not measured',
      measured: false,
      target: 'Connect Mercury',
    });
  });

  it('reports customer MRR and names internal subscriptions it left out (JOV-7362)', () => {
    expect(
      byKey({ metrics: OK, funnel: null, goldenPath: null }).mrr
    ).toMatchObject({
      label: 'Customer MRR',
      value: '$0',
      tone: 'bad',
      target: '0 paying · excl. $199 internal',
    });
  });

  it('counts the golden path as certified only on a certification verdict', () => {
    // Production checks passing is not certification (false-green, 2026-10-31).
    const passingTests = flow('working', {
      runtime_dogfood: 'passed',
      visual_proof: 'missing',
    });
    const tile = byKey({
      metrics: null,
      funnel: null,
      goldenPath: [passingTests, passingTests],
    })['golden-path'];
    expect(tile).toMatchObject({
      value: '0 of 2 certified',
      tone: 'bad',
      target: '0 of 2 video-judged',
    });
    const certified = byKey({
      metrics: null,
      funnel: null,
      goldenPath: [
        flow('monitored', {
          runtime_dogfood: 'passed',
          visual_proof: 'passed',
        }),
        flow('working', { runtime_dogfood: 'failed', visual_proof: 'passed' }),
      ],
    })['golden-path'];
    expect(certified).toMatchObject({
      value: '1 of 2 certified',
      tone: 'bad',
      target: '1 failing a check · 2 video-judged',
    });
  });

  it('reads new accounts and first value from the funnel', () => {
    expect(
      byKey({
        metrics: null,
        funnel: {
          stages: [
            { key: 'accounts_created', count: 4, drillDownHref: '/x' },
            { key: 'onboarding_complete', count: 1, drillDownHref: null },
          ],
        },
        goldenPath: null,
      }).users
    ).toMatchObject({
      value: '4',
      target: '1 reached first value',
      href: '/x',
    });
  });

  it('never shows a missing source as a number', () => {
    for (const tile of buildCompanyTiles({
      metrics: null,
      funnel: null,
      goldenPath: null,
    })) {
      expect(tile.measured).toBe(false);
      expect(tile.value).toBe('Not measured');
      expect(tile.target).toBeTruthy();
    }
  });
});
