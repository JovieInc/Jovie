import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DetectionCoverageSnapshot } from '@/lib/hud/detection-coverage';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HudDetectionCoveragePanel } from './HudDetectionCoveragePanel';

const snapshot: DetectionCoverageSnapshot = {
  covered: 2,
  total: 4,
  blindSpots: [
    { capability: 'Checkout health', summary: 'No declined-card control.' },
  ],
  recentFounderRescues: [
    {
      id: 'JOV-7207',
      occurredAt: '2026-10-12T09:00:00.000Z',
      source: 'founder',
      summary: 'Founder caught a stalled deploy.',
    },
  ],
  founderRescueRate: 0.25,
  founderRescueRatePrevious: 0.4,
  founderRescueTrend: 'down',
  medianDetectionMinutes: 95,
  medianDetectionMinutesPrevious: 120,
  medianDetectionTrend: 'up',
  nextCapability: {
    id: 'checkout-health',
    title: 'Checkout health next',
    score: 87,
    nextExpansion: 'Add a declined-card control case.',
  },
};

describe('HudDetectionCoveragePanel certificate', () => {
  it('renders measured coverage, trends and both lists axe-clean', async () => {
    const { container } = render(
      <HudDetectionCoveragePanel snapshot={snapshot} />
    );

    expect(screen.getByText('2 / 4')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('Down from 40%')).toBeInTheDocument();
    expect(screen.getByText('1h 35m')).toBeInTheDocument();
    expect(screen.getByText('Up from 2h')).toBeInTheDocument();
    expect(screen.getByText('Checkout health next')).toBeInTheDocument();
    expect(screen.getByText('Score 87')).toBeInTheDocument();
    const lists = screen.getAllByRole('list');
    expect(lists).toHaveLength(2);
    expect(within(lists[0]).getByText('Checkout health')).toBeInTheDocument();
    expect(within(lists[1]).getByText('JOV-7207')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the empty, unmeasured snapshot axe-clean', async () => {
    const { container } = render(
      <HudDetectionCoveragePanel
        snapshot={{
          ...snapshot,
          covered: 4,
          blindSpots: [],
          recentFounderRescues: [],
          founderRescueRate: null,
          founderRescueRatePrevious: null,
          founderRescueTrend: 'unknown',
          medianDetectionMinutes: null,
          medianDetectionMinutesPrevious: null,
          medianDetectionTrend: 'unknown',
          nextCapability: null,
        }}
      />
    );

    expect(screen.getByText('4 / 4')).toBeInTheDocument();
    expect(screen.getAllByText('Not measured')).toHaveLength(2);
    expect(
      screen.getAllByText('Awaiting a second measured window')
    ).toHaveLength(2);
    expect(
      screen.getByText('Every registered capability is live-verified.')
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });
});
