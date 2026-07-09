import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { OpportunityInboxReportCard } from './OpportunityInboxReportCard';

const REPORT_CARD: OpportunityInboxCardViewModel = {
  id: 'report-1',
  signalType: 'other',
  typeLabel: 'Report',
  createdAt: '2026-07-04T10:00:00.000Z',
  title: 'Thumbnail experiment finished',
  why: 'Jovie measured the results of your experiment.',
  primaryActionLabel: 'Run on 3 more videos',
  status: 'pending',
  category: 'report',
  report: {
    metricLabel: 'views',
    deltaPercent: 5.4,
    deltaDisplay: '+5.4%',
    direction: 'up',
    series: [120, 132, 128, 150, 171],
    items: [
      { label: 'Challenger A', deltaPercent: 5.4, detail: 'promoted' },
      { label: 'Baseline', deltaPercent: 0 },
    ],
    experimentId: 'exp-42',
    nextStep: {
      label: 'Run on 3 more videos',
      kind: 'experiment.start',
    },
  },
};

describe('OpportunityInboxReportCard', () => {
  it('renders metric delta, sparkline, and next-step CTA', () => {
    render(
      <OpportunityInboxReportCard
        card={REPORT_CARD}
        onNextStep={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(
      screen.getByText('Thumbnail experiment finished')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('opportunity-inbox-report-delta')
    ).toHaveTextContent('+5.4%');
    expect(screen.getByText('views')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Metric trend' })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('opportunity-inbox-report-next-step')
    ).toHaveTextContent('Run on 3 more videos');
  });

  it('reveals the per-item breakdown on expand', () => {
    render(
      <OpportunityInboxReportCard
        card={REPORT_CARD}
        onNextStep={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(
      screen.queryByTestId('opportunity-inbox-report-breakdown')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show Breakdown/ }));

    expect(
      screen.getByTestId('opportunity-inbox-report-breakdown')
    ).toBeInTheDocument();
    expect(screen.getByText('Challenger A')).toBeInTheDocument();
    expect(screen.getByText('promoted')).toBeInTheDocument();
  });

  it('fires next-step and dismiss handlers', () => {
    const onNextStep = vi.fn();
    const onDismiss = vi.fn();

    render(
      <OpportunityInboxReportCard
        card={REPORT_CARD}
        onNextStep={onNextStep}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByTestId('opportunity-inbox-report-next-step'));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onNextStep).toHaveBeenCalledWith('report-1');
    expect(onDismiss).toHaveBeenCalledWith('report-1');
  });

  it('renders nothing when report data is missing', () => {
    const { container } = render(
      <OpportunityInboxReportCard
        card={{ ...REPORT_CARD, report: undefined }}
        onNextStep={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
