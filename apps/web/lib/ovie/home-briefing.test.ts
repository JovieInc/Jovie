import { describe, expect, it } from 'vitest';
import type { DecisionHudView } from '@/lib/hud/decision-signals';
import type { OvieMacHudSnapshot } from '@/lib/hud/ovie-mac-hud';
import { createOvieHomeBriefing } from './home-briefing';

function snapshot(decisionHud?: DecisionHudView): OvieMacHudSnapshot {
  return {
    alive: {
      cashUsd: 10_000,
      weeklyBurnUsd: 1_000,
      weeklyRevenueUsd: 250,
      weeklyRevenueGrowthRate: 0.12,
      available: true,
      status: 'alive',
      reachesProfitBeforeZero: true,
      detail: 'Revenue reaches burn inside runway.',
    },
    growth: {
      rate: 0.12,
      source: 'revenue',
      ycBar: 'exceptional',
      thisWeek: 250,
      lastWeek: 223,
      available: true,
      showChart: false,
    },
    shipping: {
      shipsThisWeek: 4,
      available: true,
      detail: '4 changes merged this week.',
    },
    inFlightPullRequests: {
      availability: 'available',
      totalOpen: 0,
      items: [],
      truncated: false,
      errorMessage: null,
    },
    ...(decisionHud ? { decisionHud } : {}),
    generatedAtIso: '2026-09-28T12:00:00.000Z',
  };
}

const rankedDecisionHud: DecisionHudView = {
  mode: 'ranked',
  rankingVersion: 1,
  explanation: 'Ranked by decision value.',
  degradedSources: [],
  drillDown: [],
  items: [
    {
      rank: 1,
      score: 0.8,
      priorityOverride: false,
      degraded: false,
      factors: {
        expectedImpact: 1,
        actionability: 1,
        urgency: 1,
        informationGain: 0.8,
        unblockValue: 1,
        attentionCost: 1,
        stalePenalty: 1,
      },
      candidate: {
        id: 'activation.profile-review',
        owner: 'growth',
        source: 'canonical-metrics:founder-funnel',
        title: 'The first complete profile is ready for review',
        whyNow: 'A real creator reached the review milestone this morning.',
        currentValue: '1 profile ready',
        delta: '+1 today',
        target: 'Approve or return with one clear correction',
        confidence: 1,
        freshness: 'fresh',
        goalPath: 'activation',
        causalHypothesis: null,
        nextAction: 'Review the profile before the creator returns.',
        actionKind: 'certification',
        expectedImpact: 1,
        urgency: 1,
        informationGain: 0.8,
        unblockValue: 1,
        attentionCost: 1,
        summerCanAct: false,
        removalEvent: 'The profile is approved or returned with feedback.',
      },
    },
  ],
};

describe('createOvieHomeBriefing', () => {
  it('presents only the highest-value ranked signal with contextual actions', () => {
    const briefing = createOvieHomeBriefing(snapshot(rankedDecisionHud), {
      displayName: 'Tim White',
      now: new Date('2026-09-28T15:00:00.000Z'),
      timeZone: 'America/Los_Angeles',
    });

    expect(briefing.greeting).toBe('Good morning, Tim.');
    expect(briefing.signal).toMatchObject({
      id: 'activation.profile-review',
      title: 'The first complete profile is ready for review',
      currentValue: '1 profile ready',
      sourceLabel: 'Founder Funnel',
    });
    expect(briefing.actions).toHaveLength(3);
    expect(briefing.actions.map(action => action.prompt).join(' ')).toContain(
      'The first complete profile is ready for review'
    );
    expect(briefing.actions[0]?.label).toBe('Frame The Decision');
  });

  it('uses verified momentum instead of generic prompts when no attention item ranks', () => {
    const briefing = createOvieHomeBriefing(snapshot(), {
      displayName: null,
      now: new Date('2026-09-28T02:00:00.000Z'),
      timeZone: 'America/Los_Angeles',
    });

    expect(briefing.greeting).toBe('Good evening, Tim.');
    expect(briefing.signal.title).toBe('Growth reached +12% this week');
    expect(briefing.signal.currentValue).toContain('revenue');
    expect(briefing.actions).toHaveLength(3);
  });

  it('turns missing operating data into an explicit attention item', () => {
    const briefing = createOvieHomeBriefing(null, {
      displayName: 'Tim',
      now: new Date('2026-09-28T20:00:00.000Z'),
      timeZone: 'UTC',
    });

    expect(briefing.signal.title).toBe('The operating picture is incomplete');
    expect(briefing.signal.nextAction).toContain('Restore the missing source');
    expect(briefing.actions).toHaveLength(3);
  });
});
