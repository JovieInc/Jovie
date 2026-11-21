import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OpportunityInboxReportCard } from './OpportunityInboxReportCard';

const CARD: OpportunityInboxCardViewModel = {
  id: 'report-cert-1',
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
    nextStep: { label: 'Run on 3 more videos', kind: 'experiment.start' },
  },
};

function renderCard(
  card: OpportunityInboxCardViewModel,
  props: { isSubmittingNextStep?: boolean; isDismissing?: boolean } = {}
) {
  const onNextStep = vi.fn();
  const onDismiss = vi.fn();
  const view = render(
    <OpportunityInboxReportCard
      card={card}
      onNextStep={onNextStep}
      onDismiss={onDismiss}
      {...props}
    />
  );
  return { ...view, onNextStep, onDismiss };
}

describe('OpportunityInboxReportCard certificate', () => {
  it('fires the next step and dismiss handlers and stays axe-clean', async () => {
    const user = userEvent.setup();
    const { container, onNextStep, onDismiss } = renderCard(CARD);

    await user.click(screen.getByTestId('opportunity-inbox-report-next-step'));
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onNextStep).toHaveBeenCalledWith('report-cert-1');
    expect(onDismiss).toHaveBeenCalledWith('report-cert-1');
    await expectNoA11yViolations(container);
  });

  it('toggles the breakdown with aria-expanded', async () => {
    const user = userEvent.setup();
    const { container } = renderCard(CARD);
    const toggle = screen.getByRole('button', { expanded: false });

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Challenger A')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('disables every action while the next step is submitting', async () => {
    const user = userEvent.setup();
    const { container, onNextStep } = renderCard(CARD, {
      isSubmittingNextStep: true,
    });

    const next = screen.getByTestId('opportunity-inbox-report-next-step');
    expect(next).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled();
    await user.click(next);
    expect(onNextStep).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('omits the breakdown, trend and next step when the report is partial', async () => {
    const { container } = renderCard({
      ...CARD,
      report: {
        ...CARD.report!,
        items: [],
        series: [],
        nextStep: undefined,
      },
    });

    expect(screen.queryByText('Metric trend')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('opportunity-inbox-report-next-step')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders a long title and an Arabic title without losing actions', async () => {
    const { container } = renderCard({
      ...CARD,
      title:
        'The release-day call to action swap on the pre-save page and every smart link lifted saves across mobile and desktop visitors',
    });
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeVisible();
    await expectNoA11yViolations(container);

    const rtl = render(
      <div dir='rtl' lang='ar'>
        <OpportunityInboxReportCard
          card={{ ...CARD, title: 'تغيير زر الإجراء رفع عمليات الحفظ' }}
          onNextStep={vi.fn()}
          onDismiss={vi.fn()}
        />
      </div>
    );
    expect(rtl.getByText('تغيير زر الإجراء رفع عمليات الحفظ')).toBeVisible();
    await expectNoA11yViolations(rtl.container);
  });
});
