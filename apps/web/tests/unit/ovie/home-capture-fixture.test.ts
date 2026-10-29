import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CompanyFunnelInput } from '@/lib/ovie/home/company-hud';
import {
  buildOvieAsks,
  buildUpcomingDefaults,
} from '@/lib/ovie/home/shipping-home';
import type { OvieInbox } from '@/lib/ovie/inbox';
import { INTERACTION_CASE_CONTRACT } from '@/lib/ovie/interaction-case';
import { unknownProjection } from '@/lib/ovie/shipping-state';
import { parseShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import {
  emptyDeliverySummary,
  OPERATIONAL_TASK_SYNC_STATES,
} from '@/lib/ovie/shipping-state/contract';
import { parseShippingStateProjection } from '@/lib/ovie/shipping-state-client';
import type { HudMetrics } from '@/types/hud';

/**
 * Deterministic, populated Ovie Home data for the visual-review capture
 * (the capture environment has no database). Timestamps are tokens the
 * capture script re-stamps per request (2000-01-01THH:MM:SS.000Z becomes
 * now plus that offset), so the fixture never goes stale.
 * Run with OVIE_HOME_FIXTURE_OUT=<path> to write it; the test itself always
 * proves the payloads parse with the real parsers, so the fixture cannot rot
 * when the contracts change.
 */
const NOW = '2000-01-01T00:00:00.000Z';
const DEADLINE = '2000-01-01T00:00:30.000Z';
const measured = (value: number) =>
  value === 0
    ? ({ state: 'measured-zero', value: 0 } as const)
    : ({ state: 'measured-nonzero', value } as const);

const TASK_TITLES: [string, string][] = [
  ['running', 'feat(ovie): add the office display session'],
  ['running', 'fix(lanes): recover Hyperagent lane PRs'],
  ['in-review', 'feat(auth): read-only operator role for Ovie admin'],
  ['in-review', 'fix(ovie): make Summer turn failures visible'],
  ['merge-queued', 'fix(ci): capture Ovie Home at its own route'],
  ['running', 'feat(dogfood): Ovie admin journeys with an observer'],
  ['blocked', 'fix(onboarding): Spotify artist confirmation'],
  ['in-review', 'feat(ovie): fast streaming Summer in the composer'],
];

function inFlightTasks() {
  return TASK_TITLES.map(([workflowState, title], index) => ({
    id: `linear:JOV-${9100 + index}`,
    linearIdentifier: `JOV-${9100 + index}`,
    linearUrl: `https://linear.app/jovie/issue/JOV-${9100 + index}`,
    title,
    workflowState,
    priority: 'medium' as const,
    attempt: null,
    retryAt: null,
    sourceRevision: null,
    updatedAt: NOW,
    pullRequest: {
      number: 23200 - index,
      url: `https://github.com/JovieInc/Jovie/pull/${23200 - index}`,
      branch: null,
      agent: null,
      isDraft: false,
      checks: { rollup: 'pending' as const, failing: [] },
      queuePosition: null,
      queueState: null,
      createdAt: NOW,
    },
  }));
}

function shippingPayload() {
  const base = unknownProjection({
    sequence: 12,
    observationTimestamp: NOW,
    emissionTimestamp: NOW,
    latencyMs: 40,
    publishing: true,
    lastError: null,
  });
  const delivery = emptyDeliverySummary();
  const repo = (n: number) => `https://github.com/JovieInc/Jovie/pull/${n}`;
  const payload = {
    ...base,
    state: 'fresh',
    freshnessDeadline: DEADLINE,
    operationalTasks: {
      ...base.operationalTasks,
      syncState: OPERATIONAL_TASK_SYNC_STATES.find(s => s !== 'syncing'),
      observedAt: NOW,
      lastSyncedAt: NOW,
      freshnessDeadline: DEADLINE,
      tasks: inFlightTasks(),
    },
    delivery: {
      ...delivery,
      lanes: {
        ...delivery.lanes,
        running: measured(3),
        slots: measured(4),
        idle: measured(1),
        pool: measured(4),
        lastLandingAgeSeconds: measured(540),
        diskFreePct: 18.3,
        lanes: [
          { name: 'codex', running: 2, slots: 2 },
          { name: 'grok', running: 1, slots: 2 },
        ],
        publishedAt: NOW,
      },
      merges: {
        since: NOW,
        today: measured(96),
        byRepo: {
          Jovie: measured(88),
          LogYourBody: measured(6),
          'summer-config': measured(2),
        },
        last7Days: measured(412),
        prior7Days: measured(330),
        recent: [
          {
            repo: 'JovieInc/Jovie',
            number: 23101,
            title: 'fix(ovie): show every agent lane',
            url: repo(23101),
            mergedAt: NOW,
          },
          {
            repo: 'JovieInc/Jovie',
            number: 23098,
            title: 'feat(lanes): keep the status feed under the cap',
            url: repo(23098),
            mergedAt: NOW,
          },
          {
            repo: 'JovieInc/Jovie',
            number: 23094,
            title: 'fix(onboarding): retain typed email',
            url: repo(23094),
            mergedAt: NOW,
          },
          {
            repo: 'JovieInc/Jovie',
            number: 23090,
            title: 'feat(auth): read-only operator role',
            url: repo(23090),
            mergedAt: NOW,
          },
          {
            repo: 'JovieInc/Jovie',
            number: 23087,
            title: 'fix(ci): capture Ovie Home at its own route',
            url: repo(23087),
            mergedAt: NOW,
          },
          {
            repo: 'JovieInc/Jovie',
            number: 23083,
            title: 'feat(ovie): fast streaming Summer',
            url: repo(23083),
            mergedAt: NOW,
          },
          {
            repo: 'JovieInc/Jovie',
            number: 23080,
            title: 'fix(lanes): recover Hyperagent lane PRs',
            url: repo(23080),
            mergedAt: NOW,
          },
          {
            repo: 'JovieInc/Jovie',
            number: 23077,
            title: 'feat(dogfood): Ovie admin journeys',
            url: repo(23077),
            mergedAt: NOW,
          },
          {
            repo: 'JovieInc/Jovie',
            number: 23074,
            title: 'fix(ovie): make Summer turn failures visible',
            url: repo(23074),
            mergedAt: NOW,
          },
          {
            repo: 'JovieInc/Jovie',
            number: 23070,
            title: 'fix(spotify): rank the artist search',
            url: repo(23070),
            mergedAt: NOW,
          },
          {
            repo: 'JovieInc/Jovie',
            number: 23066,
            title: 'feat(share): one menu for every share',
            url: repo(23066),
            mergedAt: NOW,
          },
          {
            repo: 'JovieInc/Jovie',
            number: 23061,
            title: 'fix(billing): checkout success state',
            url: repo(23061),
            mergedAt: NOW,
          },
        ],
      },
      mergeQueueDepth: measured(5),
      inFlight: measured(14),
      production: {
        sha: 'a'.repeat(40),
        version: '26.10.25',
        deployedAt: NOW,
        behindMain: measured(2),
      },
      summer: { availability: 'up' },
    },
  };
  return payload;
}

const metrics = (): Partial<HudMetrics> => ({
  accessMode: 'admin',
  overview: {
    mrrUsd: 1240,
    activeSubscribers: 31,
    balanceUsd: 18400,
    burnRateUsd: 6100,
    runwayMonths: 3,
    defaultStatus: 'alive',
    defaultStatusDetail: 'Revenue growth is on track to outpace burn.',
    financialDataAvailable: true,
    weekAgo: { mrrUsd: 1100, activeSubscribers: 28 },
  },
  reliability: {
    errorRatePercent: 0.2,
    reliabilityScorePercent: 99.8,
    p95LatencyMs: 410,
    incidents24h: 0,
    lastIncidentAtIso: null,
    unresolvedSentryIssues24h: 0,
  },
  generatedAtIso: NOW,
});

const funnel: CompanyFunnelInput = {
  stages: [
    {
      key: 'chats',
      label: 'Onboarding chats',
      count: 142,
      conversionRate: null,
      dropOff: null,
    },
    {
      key: 'accounts',
      label: 'Accounts created',
      count: 61,
      conversionRate: 0.43,
      dropOff: 81,
    },
    {
      key: 'releases',
      label: 'First release',
      count: 24,
      conversionRate: 0.39,
      dropOff: 37,
    },
    { key: 'paid', label: 'Paid', count: 7, conversionRate: 0.29, dropOff: 17 },
  ],
  biggestDropOffKey: 'accounts',
};

const inbox: OvieInbox = {
  issues: [],
  cases: [
    {
      contract: INTERACTION_CASE_CONTRACT,
      id: 'summer:vercel-concurrency',
      kind: 'spend',
      source: { system: 'summer', id: 'vercel-concurrency', revision: null },
      title: 'Vercel on-demand concurrency for Jovie',
      recommendation: 'About $6 a month, at most $44. Recommended.',
      owner: null,
      state: 'needs_you',
      priority: 1,
      createdAt: '2026-10-20T18:00:00.000Z',
      nextAction: null,
      waitingUntil: null,
      confidence: null,
      evidence: [],
      body: 'Gives production and staging their own lane so preview floods cannot stall production.',
      decisionTarget: { kind: 'summer', id: 'vercel-concurrency' },
    },
    {
      contract: INTERACTION_CASE_CONTRACT,
      id: 'summer:share-menu-copy',
      kind: 'design',
      source: { system: 'summer', id: 'share-menu-copy', revision: null },
      title: 'Share menu copy: shorter labels',
      recommendation: 'Ship the shorter labels.',
      owner: null,
      state: 'waiting',
      priority: 2,
      createdAt: '2026-10-25T04:00:00.000Z',
      nextAction: null,
      waitingUntil: '2000-01-01T03:00:00.000Z',
      confidence: null,
      evidence: [],
      body: 'Ships its declared default unless you answer first.',
      decisionTarget: { kind: 'summer', id: 'share-menu-copy' },
      decisionDefault: {
        contract: 'jovie.decision-default/v1',
        decision: 'approve',
        summary: 'Ship the shorter labels.',
        deadline: '2000-01-01T03:00:00.000Z',
        declared: true,
      },
    },
    {
      contract: INTERACTION_CASE_CONTRACT,
      id: 'summer:empty-state-art',
      kind: 'design',
      source: { system: 'summer', id: 'empty-state-art', revision: null },
      title: 'Empty state artwork for releases',
      recommendation: 'Ship the illustrated empty state.',
      owner: null,
      state: 'waiting',
      priority: 2,
      createdAt: '2026-10-25T04:00:00.000Z',
      nextAction: null,
      waitingUntil: '2000-01-01T07:30:00.000Z',
      confidence: null,
      evidence: [],
      body: 'Ships its declared default unless you answer first.',
      decisionTarget: { kind: 'summer', id: 'empty-state-art' },
      decisionDefault: {
        contract: 'jovie.decision-default/v1',
        decision: 'approve',
        summary: 'Ship the illustrated empty state.',
        deadline: '2000-01-01T07:30:00.000Z',
        declared: true,
      },
    },
    {
      contract: INTERACTION_CASE_CONTRACT,
      id: 'summer:onboarding-greeting',
      kind: 'design',
      source: { system: 'summer', id: 'onboarding-greeting', revision: null },
      title: 'Onboarding greeting tone',
      recommendation: 'Ship the warmer greeting.',
      owner: null,
      state: 'waiting',
      priority: 2,
      createdAt: '2026-10-25T04:00:00.000Z',
      nextAction: null,
      waitingUntil: '2000-01-01T22:00:00.000Z',
      confidence: null,
      evidence: [],
      body: 'Ships its declared default unless you answer first.',
      decisionTarget: { kind: 'summer', id: 'onboarding-greeting' },
      decisionDefault: {
        contract: 'jovie.decision-default/v1',
        decision: 'approve',
        summary: 'Ship the warmer greeting.',
        deadline: '2000-01-01T22:00:00.000Z',
        declared: true,
      },
    },
  ],
};

export function homeCaptureFixture() {
  return {
    '/api/hud/shipping-state': shippingPayload(),
    '/api/hud/metrics': metrics(),
    '/api/admin/hud/founder-funnel': funnel,
    '/api/ovie/inbox': inbox,
  };
}

describe('Ovie Home capture fixture', () => {
  it('parses with the real shipping, cockpit, tile and inbox contracts', () => {
    const fixture = homeCaptureFixture();
    const stamped = JSON.parse(
      JSON.stringify(fixture['/api/hud/shipping-state']).replace(
        /2000-01-01T(\d\d):(\d\d):(\d\d)\.000Z/g,
        (_m, hh, mm, ss) =>
          new Date(
            Date.now() +
              (Number(hh) * 3600 + Number(mm) * 60 + Number(ss)) * 1000
          ).toISOString()
      )
    );
    const view = parseShippingStateProjection(stamped);
    expect(view.ok).toBe(true);
    if (view.ok) {
      expect(view.projection.truth).toBe('fresh');
      expect(view.projection.delivery.merges.today.value).toBe(96);
    }
    expect(parseShippingCockpitProjection(stamped)).not.toBeNull();
    const inboxFixture = fixture['/api/ovie/inbox'];
    expect(buildOvieAsks(inboxFixture)).toHaveLength(1);
    const upcoming = buildUpcomingDefaults(
      JSON.parse(
        JSON.stringify(inboxFixture).replace(
          /2000-01-01T(\d\d):(\d\d):(\d\d)\.000Z/g,
          (_m, hh, mm, ss) =>
            new Date(
              Date.now() +
                (Number(hh) * 3600 + Number(mm) * 60 + Number(ss)) * 1000
            ).toISOString()
        )
      ),
      Date.now()
    );
    expect(upcoming.map(item => item.line)).toEqual([
      'ships default in 3h',
      'ships default in 8h',
      'ships default in 22h',
    ]);
    expect(
      fixture['/api/hud/shipping-state'].delivery.merges.recent
    ).toHaveLength(12);
  });

  it('writes the fixture for the capture lane when asked', () => {
    const out = process.env.OVIE_HOME_FIXTURE_OUT;
    if (!out) return;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(homeCaptureFixture(), null, 2));
    expect(out).toBeTruthy();
  });
});
