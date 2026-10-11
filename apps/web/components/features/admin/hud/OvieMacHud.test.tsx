import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DecisionHudView } from '@/lib/hud/decision-signals';
import type { OvieMacHudSnapshot } from '@/lib/hud/ovie-mac-hud';
import { OvieMacHud } from './OvieMacHud';

vi.mock('@/components/organisms/DesktopTitlebar', () => ({
  DesktopTitlebar: () => <div data-testid='desktop-titlebar' />,
}));

vi.mock('@/components/features/admin/hud/OvieInbox', () => ({
  OvieInbox: () => <div data-testid='ovie-inbox' />,
}));

vi.mock('./OperationalTasksPanel', () => ({
  OperationalTasksPanel: () => null,
}));

vi.mock('./OvieLauncherRail', () => ({
  OvieLauncherRail: () => null,
}));

vi.mock('@/components/features/admin/summer-cards', () => ({
  SummerCardReviewPanel: () => <div data-testid='summer-card-review-panel' />,
}));

const snapshot: OvieMacHudSnapshot = {
  alive: {
    cashUsd: null,
    weeklyBurnUsd: null,
    weeklyRevenueUsd: null,
    weeklyRevenueGrowthRate: null,
    available: false,
    status: 'unknown',
    reachesProfitBeforeZero: null,
    detail: '',
  },
  growth: {
    rate: 0,
    source: 'revenue',
    ycBar: 'not-figured-out',
    thisWeek: 0,
    lastWeek: 0,
    available: false,
    showChart: false,
  },
  shipping: {
    shipsThisWeek: 0,
    available: false,
    detail: '',
  },
  inFlightPullRequests: {
    availability: 'not_configured',
    totalOpen: 0,
    items: [],
    truncated: false,
    errorMessage: null,
  },
  generatedAtIso: '2026-09-16T00:00:00.000Z',
};

const decisionHud: DecisionHudView = {
  mode: 'ranked',
  rankingVersion: 1,
  explanation: 'Ranked by decision value',
  items: [
    {
      candidate: {
        id: 'signal-1',
        owner: 'founder',
        source: 'metrics',
        title: 'Weekly revenue flat',
        whyNow: 'Revenue has not moved in 2 weeks',
        currentValue: '$1,200',
        delta: '+0%',
        target: '$1,500',
        confidence: 0.8,
        freshness: 'fresh',
        goalPath: 'revenue',
        causalHypothesis: null,
        nextAction: 'Review pricing experiment',
        expectedImpact: 0.7,
        urgency: 0.6,
        informationGain: 0.5,
        unblockValue: 0.4,
        attentionCost: 0.2,
        summerCanAct: false,
        removalEvent: 'Revenue grows week over week',
      },
      score: 1.2,
      factors: {
        expectedImpact: 0.7,
        actionability: 0.9,
        urgency: 0.6,
        informationGain: 0.5,
        unblockValue: 0.4,
        attentionCost: 0.2,
        stalePenalty: 0,
      },
      rank: 1,
      priorityOverride: false,
      degraded: false,
    },
  ],
  drillDown: [],
  degradedSources: [],
};

describe('OvieMacHud', () => {
  it('exposes a visible Close control back to the canonical shell', () => {
    render(<OvieMacHud snapshot={snapshot} />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('renders the decision queue when decisionHud items are present', () => {
    render(<OvieMacHud snapshot={{ ...snapshot, decisionHud }} />);
    expect(
      screen.getByTestId('ovie-mac-hud-decision-queue')
    ).toBeInTheDocument();
    expect(screen.getByText('Operational signals')).toBeInTheDocument();
    expect(screen.getByText(/Weekly revenue flat/)).toBeInTheDocument();
  });

  it('renders no decision queue when there are no items', () => {
    render(
      <OvieMacHud
        snapshot={{ ...snapshot, decisionHud: { ...decisionHud, items: [] } }}
      />
    );
    expect(
      screen.queryByTestId('ovie-mac-hud-decision-queue')
    ).not.toBeInTheDocument();
  });

  it('renders one canonical Inbox before secondary diagnostics', () => {
    render(<OvieMacHud snapshot={snapshot} />);
    expect(screen.getByTestId('ovie-inbox')).toBeInTheDocument();
  });
});
